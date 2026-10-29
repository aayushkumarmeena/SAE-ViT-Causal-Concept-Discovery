"""
api/service.py: Context and Model Management Service
Manages RunContext lifecycle, caching, and provides high-level APIs
for experiments, features, causal interventions, image analysis, and pipeline execution.
"""
from __future__ import annotations

import base64
import io
import json
import os
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from PIL import Image
import torch
import torch.nn.functional as F

from config import PROJECT_ROOT, ExperimentConfig, get_config
from utils import load_json

# Global process tracker for pipeline runs
pipeline_process: Optional[subprocess.Popen] = None
pipeline_logs: List[str] = []
pipeline_lock = threading.Lock()
pipeline_status: Dict[str, Any] = {
    "status": "idle",  # "idle", "running", "completed", "failed"
    "mode": None,
    "start_time": None,
    "end_time": None,
    "exit_code": None,
    "error": None
}


class ContextManager:
    """Caches and provides RunContext instances."""
    _instance: Optional["ContextManager"] = None
    _contexts: Dict[str, Any] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def get_context(self, run_dir_path: str | Path):
        run_dir_str = str(Path(run_dir_path).resolve())
        if run_dir_str not in self._contexts:
            # Import lazily to ensure environment is ready
            from context import RunContext
            ctx = RunContext.from_run_dir(run_dir_str)
            self._contexts[run_dir_str] = ctx
        return self._contexts[run_dir_str]

    def clear_cache(self):
        self._contexts.clear()


context_manager = ContextManager()


# ------------------------------------------------------------------ Experiment Discovery Helpers
def get_experiments_dir() -> Path:
    return PROJECT_ROOT / "experiments"


def list_experiments() -> List[Dict[str, Any]]:
    exp_dir = get_experiments_dir()
    if not exp_dir.exists():
        return []

    experiments = []
    for d in sorted(exp_dir.iterdir()):
        if not d.is_dir() or d.name.startswith("."):
            continue

        runs = []
        for rd in sorted(d.iterdir()):
            if rd.is_dir() and (rd / "checkpoint.pt").exists() and (rd / "config.json").exists():
                cfg_data = load_json(rd / "config.json")
                results_data = load_json(rd / "results.json") if (rd / "results.json").exists() else {}
                runs.append({
                    "run_id": rd.name,
                    "layer": cfg_data.get("layer"),
                    "sae_type": cfg_data.get("sae", {}).get("sae_type"),
                    "width": cfg_data.get("sae", {}).get("width"),
                    "k": cfg_data.get("sae", {}).get("k"),
                    "metrics": results_data.get("metrics", {})
                })

        has_comparison = (d / "comparison.csv").exists()
        has_hypotheses = (d / "hypotheses.json").exists()

        experiments.append({
            "name": d.name,
            "path": str(d),
            "runs_count": len(runs),
            "runs": runs,
            "has_comparison": has_comparison,
            "has_hypotheses": has_hypotheses
        })

    return experiments


def get_run_details(exp_name: str, run_id: str) -> Dict[str, Any]:
    run_dir = get_experiments_dir() / exp_name / run_id
    if not run_dir.exists():
        raise FileNotFoundError(f"Run {exp_name}/{run_id} not found.")

    cfg = load_json(run_dir / "config.json")
    results = load_json(run_dir / "results.json") if (run_dir / "results.json").exists() else {}
    warnings = load_json(run_dir / "warnings.json") if (run_dir / "warnings.json").exists() else []
    layer_summary = load_json(run_dir / "layer_summary.json") if (run_dir / "layer_summary.json").exists() else {}

    plots = []
    plot_dir = run_dir / "plots"
    if plot_dir.exists():
        for p in sorted(plot_dir.glob("*.png")):
            plots.append({
                "name": p.name,
                "url": f"/api/experiments/{exp_name}/{run_id}/plot/{p.name}"
            })

    # Read metrics CSV if present
    metrics_history = []
    metrics_csv = run_dir / "metrics.csv"
    if metrics_csv.exists():
        df_m = pd.read_csv(metrics_csv)
        metrics_history = df_m.to_dict(orient="records")

    return {
        "exp_name": exp_name,
        "run_id": run_id,
        "config": cfg,
        "metrics": results.get("metrics", {}),
        "metrics_history": metrics_history,
        "warnings": warnings,
        "layer_summary": layer_summary,
        "plots": plots
    }


# ------------------------------------------------------------------ Feature Discovery Helpers
def get_features_list(
    exp_name: str,
    run_id: str,
    search: Optional[str] = None,
    sort_by: str = "purity",
    sort_desc: bool = True,
    alive_only: bool = True,
    limit: int = 50,
    offset: int = 0
) -> Dict[str, Any]:
    run_dir = get_experiments_dir() / exp_name / run_id
    summary_path = run_dir / "discovery" / "feature_summary.csv"
    if not summary_path.exists():
        return {"total": 0, "features": [], "message": "Discovery not yet run for this configuration."}

    df = pd.read_csv(summary_path)

    # Attach candidate causal info if available
    cand_path = run_dir / "causal" / "candidate_causal_summary.csv"
    if cand_path.exists():
        cand_df = pd.read_csv(cand_path)
        if "feature_id" in cand_df.columns:
            df = df.merge(
                cand_df[["feature_id", "causal_rank", "abl_mean", "abl_ci_lo", "abl_ci_hi", "amp_mean"]],
                on="feature_id",
                how="left"
            )

    if alive_only and "dead" in df.columns:
        df = df[~df["dead"]]

    if search:
        search_lower = search.lower()
        query_cols = []
        if "clip_concept" in df.columns:
            query_cols.append(df["clip_concept"].astype(str).str.lower().str.contains(search_lower))
        if "top_class_name" in df.columns:
            query_cols.append(df["top_class_name"].astype(str).str.lower().str.contains(search_lower))
        if search.isdigit() and "feature_id" in df.columns:
            query_cols.append(df["feature_id"] == int(search))

        if query_cols:
            mask = query_cols[0]
            for c in query_cols[1:]:
                mask = mask | c
            df = df[mask]

    total = len(df)

    if sort_by in df.columns:
        df = df.sort_values(by=sort_by, ascending=not sort_desc)

    paged = df.iloc[offset: offset + limit].replace({np.nan: None})
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "features": paged.to_dict(orient="records")
    }


def get_feature_detail(exp_name: str, run_id: str, feature_id: int) -> Dict[str, Any]:
    run_dir = get_experiments_dir() / exp_name / run_id
    summary_path = run_dir / "discovery" / "feature_summary.csv"
    if not summary_path.exists():
        raise FileNotFoundError("feature_summary.csv missing")

    df = pd.read_csv(summary_path).set_index("feature_id", drop=False)
    if feature_id not in df.index:
        raise KeyError(f"Feature {feature_id} not found.")

    row = df.loc[feature_id].replace({np.nan: None}).to_dict()

    # Check for report image and heatmaps
    rep_img_path = run_dir / "plots" / "features" / f"feature_{feature_id}_report.png"
    has_report_img = rep_img_path.exists()

    heatmaps_dir = run_dir / "plots" / "features" / f"feature_{feature_id}_heatmaps"
    heatmaps = {}
    if heatmaps_dir.exists():
        for k in ["raw", "normalized", "overlay", "mask", "bbox"]:
            hm_p = heatmaps_dir / f"top1_{k}.png"
            if hm_p.exists():
                heatmaps[k] = f"/api/experiments/{exp_name}/{run_id}/heatmap/{feature_id}/{k}"

    # Top patches
    patches = []
    top_patches_p = run_dir / "discovery" / "feature_top_patches.csv.gz"
    if top_patches_p.exists():
        disc_db = pd.read_csv(top_patches_p)
        f_patches = disc_db[disc_db["feature_id"] == feature_id].head(8)
        patches = f_patches.replace({np.nan: None}).to_dict(orient="records")

    # Causal stats if candidate
    causal_info = None
    cand_path = run_dir / "causal" / "candidate_causal_summary.csv"
    if cand_path.exists():
        cand_df = pd.read_csv(cand_path)
        match = cand_df[cand_df["feature_id"] == feature_id]
        if not match.empty:
            causal_info = match.iloc[0].replace({np.nan: None}).to_dict()

    return {
        "feature_id": feature_id,
        "summary": row,
        "has_report_image": has_report_img,
        "report_image_url": f"/api/experiments/{exp_name}/{run_id}/feature-report/{feature_id}" if has_report_img else None,
        "heatmaps": heatmaps,
        "top_patches": patches,
        "causal_info": causal_info
    }


# ------------------------------------------------------------------ Image to Base64 Helper
def pil_to_base64(img: Image.Image, format: str = "PNG") -> str:
    buffered = io.BytesIO()
    img.save(buffered, format=format)
    return base64.b64encode(buffered.getvalue()).decode("utf-8")


# ------------------------------------------------------------------ Causal Interventions
def perform_intervention(
    exp_name: str,
    run_id: str,
    feature_ids: List[int],
    alphas: List[float],
    mode: str = "scale",
    scope: str = "global",
    local_percentile: Optional[int] = 90,
    image_pos: Optional[int] = None,
    image_base64: Optional[str] = None
) -> Dict[str, Any]:
    run_dir = get_experiments_dir() / exp_name / run_id
    ctx = context_manager.get_context(run_dir)

    pil_img: Optional[Image.Image] = None
    hidden = None

    if image_base64:
        # User uploaded image
        image_bytes = base64.b64decode(image_base64.split(",")[-1])
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        from features.retrieval import analyze_image
        res = analyze_image(ctx, pil_img)
        hidden = res["hidden"]
    elif image_pos is not None:
        pil_img = ctx.image_pil(image_pos)
        hidden = ctx.hidden([image_pos])
    else:
        raise ValueError("Must provide either image_pos or image_base64")

    eng = ctx.engine()
    h = hidden.to(ctx.device)
    base = eng.baseline(h).cpu().numpy()[0]

    pct = local_percentile if scope == "local" else None
    lg, info = eng.run(h, feature_ids, alphas, mode, pct)
    new = lg.cpu().numpy()[0]

    names = ctx.vit_class_names
    y = int(base.argmax())
    new_y = int(new.argmax())

    # Softmax
    sm = lambda z: (np.exp(z - z.max()) / np.exp(z - z.max()).sum()).tolist()
    base_probs = sm(base)
    new_probs = sm(new)

    # Top-5 before and after
    top5_before_idx = np.argsort(-base)[:5].tolist()
    top5_after_idx = np.argsort(-new)[:5].tolist()

    top5_before = [{"class": names[i], "index": i, "logit": float(base[i]), "prob": float(base_probs[i])} for i in top5_before_idx]
    top5_after = [{"class": names[i], "index": i, "logit": float(new[i]), "prob": float(new_probs[i])} for i in top5_after_idx]

    return {
        "target_class": names[y],
        "target_class_idx": y,
        "prediction_before": names[y],
        "prediction_after": names[new_y],
        "is_prediction_flipped": bool(y != new_y),
        "target_logit_before": float(base[y]),
        "target_logit_after": float(new[y]),
        "target_delta_logit": float(new[y] - base[y]),
        "target_prob_before": float(base_probs[y]),
        "target_prob_after": float(new_probs[y]),
        "target_delta_prob": float(new_probs[y] - base_probs[y]),
        "top5_before": top5_before,
        "top5_after": top5_after,
        "safety_info": {
            "max_norm_ratio": float(info.get("max_norm_ratio", 1.0)),
            "flagged": bool(info.get("flagged", False)),
            "clamped": bool(info.get("clamped", False))
        },
        "image_preview": pil_to_base64(pil_img.resize((224, 224))) if pil_img else None
    }


# ------------------------------------------------------------------ Image Concept Analysis
def analyze_custom_image(exp_name: str, run_id: str, pil_img: Image.Image, top_n: int = 8) -> Dict[str, Any]:
    run_dir = get_experiments_dir() / exp_name / run_id
    ctx = context_manager.get_context(run_dir)
    from features.retrieval import analyze_image
    from features.heatmaps import normalize_map, patch_map, overlay, upsample
    import matplotlib.pyplot as plt

    res = analyze_image(ctx, pil_img, top_n=top_n)
    z = res["logits"]
    exp_z = np.exp(z - z.max())
    probs = exp_z / exp_z.sum()

    top5_idx = np.argsort(-z)[:5].tolist()
    top_predictions = [
        {"class": ctx.vit_class_names[i], "index": i, "logit": float(z[i]), "prob": float(probs[i])}
        for i in top5_idx
    ]

    # Calculate SAE Reconstruction metrics on this exact image
    hidden = res["hidden"]
    patches = hidden[:, ctx.store.num_prefix:]
    D = ctx.store.d_model
    x_norm = ctx.normalizer(patches).reshape(-1, D).to(ctx.device)
    
    with torch.no_grad():
        x_hat, f_tensor = ctx.sae(x_norm)
        mse = float(((x_norm - x_hat) ** 2).mean().item())
        var = ((x_norm - x_norm.mean(0, keepdim=True)) ** 2).sum().clamp_min(1e-8)
        residual_var = ((x_norm - x_hat) ** 2).sum()
        exp_var = float(max(0.0, min(1.0, 1.0 - (residual_var / var).item())))
        cos_sim = float(max(0.0, min(1.0, F.cosine_similarity(x_norm, x_hat, dim=-1).mean().item())))
        l0_per_patch = float((f_tensor > 0).float().sum(dim=-1).mean().item())
        total_active_feats = int((f_tensor.sum(dim=0) > 0).sum().item())

    # Load causal candidates summary if available
    causal_candidates = {}
    candidate_csv = run_dir / "causal" / "candidate_causal_summary.csv"
    if candidate_csv.exists():
        try:
            cdf = pd.read_csv(candidate_csv)
            if "feature_id" in cdf.columns:
                for idx, row in cdf.iterrows():
                    causal_candidates[int(row["feature_id"])] = {
                        "causal_rank": int(idx + 1),
                        "mean_effect": float(row.get("mean_effect", 0.0)),
                        "p_val": float(row.get("p_val", 0.0)) if "p_val" in row else None
                    }
        except Exception:
            pass

    # Augment features with causal data and localization descriptions
    augmented_features = []
    grid = ctx.cfg.model.grid
    img_np = np.asarray(pil_img.convert("RGB").resize((224, 224), Image.BICUBIC))

    feature_heatmaps = {}
    for feat in res["features"]:
        fid = feat["feature_id"]
        feat_dict = dict(feat)
        if fid in causal_candidates:
            feat_dict["causal_info"] = causal_candidates[fid]
            feat_dict["is_causal"] = True
        else:
            feat_dict["is_causal"] = False

        scs = feat.get("spatial_conc10", 0.0)
        feat_dict["localization_type"] = "Focal / Localized" if scs >= 0.5 else "Distributed / Contextual"
        
        # Pre-generate heatmaps for top features (up to 4)
        if len(feature_heatmaps) < 4:
            feat_map = res["feature_map"][:, fid]
            raw = patch_map(feat_map, grid)
            norm = normalize_map(raw)
            
            # Raw heatmap base64
            fig, ax = plt.subplots(figsize=(3, 3))
            ax.imshow(raw, cmap="viridis")
            ax.axis("off")
            buf = io.BytesIO()
            fig.savefig(buf, format="png", bbox_inches="tight", pad_inches=0)
            plt.close(fig)
            raw_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
            
            # Overlay heatmap base64
            ov_np = overlay(img_np, norm, alpha=0.55)
            ov_b64 = pil_to_base64(Image.fromarray((ov_np * 255).astype(np.uint8)))
            
            feature_heatmaps[str(fid)] = {
                "feature_id": fid,
                "raw": raw_b64,
                "overlay": ov_b64,
                "concept": feat.get("concept", f"feature_{fid}"),
                "max_activation": feat["max_activation"],
                "active_patches": feat["n_active_patches"]
            }

        augmented_features.append(feat_dict)

    # Narrative explanation
    top_pred = top_predictions[0]
    top_feat = augmented_features[0] if augmented_features else None
    
    pipeline_steps = [
        {
            "step": 1,
            "title": "Patch Tokenization",
            "description": f"Divided 224×224 image into 196 non-overlapping 16×16 spatial patches, prepended learnable [CLS] token, and mapped to {D}-dimensional token vectors."
        },
        {
            "step": 2,
            "title": f"ViT Layer {ctx.layer} Forward Propagation",
            "description": f"Tokens processed through transformer attention blocks. Model predicted class: '{top_pred['class']}' ({top_pred['prob']*100:.1f}% confidence, logit {top_pred['logit']:.2f})."
        },
        {
            "step": 3,
            "title": "Sparse Dictionary Decomposition",
            "description": f"Sparse Autoencoder projected {D}-dim residual vectors into {ctx.sae.width} sparse dictionary features. Reconstructed hidden activations with {cos_sim*100:.1f}% cosine similarity and {exp_var*100:.1f}% explained variance."
        },
        {
            "step": 4,
            "title": "Concept Discovery & Localization",
            "description": f"Identified {len(augmented_features)} active concepts. Strongest is Feature #{top_feat['feature_id'] if top_feat else 0} ('{top_feat['concept'] if top_feat else ''}'), firing across {top_feat['n_active_patches'] if top_feat else 0} patches."
        },
        {
            "step": 5,
            "title": "Causal Actionability",
            "description": f"Ablating or steering active features tests whether the model causally depends on these concepts to classify '{top_pred['class']}'."
        }
    ]

    reconstruction_stats = {
        "cosine_similarity": cos_sim,
        "explained_variance": exp_var,
        "mse": mse,
        "l0_per_patch": l0_per_patch,
        "total_active_features": total_active_feats,
        "dictionary_size": ctx.sae.width,
        "layer": ctx.layer
    }

    # Primary heatmap for backward compatibility
    primary_heatmaps = {}
    if top_feat and str(top_feat["feature_id"]) in feature_heatmaps:
        primary_heatmaps["raw"] = feature_heatmaps[str(top_feat["feature_id"])]["raw"]
        primary_heatmaps["overlay"] = feature_heatmaps[str(top_feat["feature_id"])]["overlay"]

    return {
        "top_predictions": top_predictions,
        "active_features": augmented_features,
        "feature_heatmaps": feature_heatmaps,
        "heatmaps": primary_heatmaps,
        "reconstruction_stats": reconstruction_stats,
        "pipeline_steps": pipeline_steps,
        "image_preview": pil_to_base64(pil_img.resize((224, 224))),
        "summary_narrative": {
            "predicted_class": top_pred["class"],
            "confidence_pct": round(top_pred["prob"] * 100, 1),
            "dominant_feature_id": top_feat["feature_id"] if top_feat else None,
            "dominant_concept": top_feat["concept"] if top_feat else "Unknown",
            "is_dominant_causal": top_feat.get("is_causal", False) if top_feat else False,
            "recommendation": f"Test causal necessity by setting Feature #{top_feat['feature_id'] if top_feat else 0} to Ablation (x0.0) below to see if '{top_pred['class']}' logit drops."
        }
    }


# ------------------------------------------------------------------ Statistical Validation
def get_random_controls(exp_name: str, run_id: str, feature_id: Optional[int] = None) -> Dict[str, Any]:
    run_dir = get_experiments_dir() / exp_name / run_id
    rc_path = run_dir / "causal" / "random_controls.json"
    if not rc_path.exists():
        return {"error": "random_controls.json not found for this run. Run evaluate.py first."}

    rc = load_json(rc_path)
    available_features = sorted({int(k.split("_")[0]) for k in rc.keys()})

    selected_feat = feature_id if (feature_id in available_features) else (available_features[0] if available_features else None)
    if selected_feat is None:
        return {"error": "No features found in random_controls.json"}

    abl_data = rc.get(f"{selected_feat}_ablation", {})
    amp_data = rc.get(f"{selected_feat}_amplification", {})

    return {
        "available_features": available_features,
        "selected_feature": selected_feat,
        "ablation": abl_data,
        "amplification": amp_data
    }


def get_hypotheses(exp_name: str) -> Dict[str, Any]:
    exp_dir = get_experiments_dir() / exp_name
    h_json = exp_dir / "hypotheses.json"
    h_md = exp_dir / "hypotheses.md"

    data = load_json(h_json) if h_json.exists() else {}
    markdown_content = h_md.read_text(encoding="utf-8") if h_md.exists() else ""
    return {"hypotheses": data, "markdown": markdown_content}


def get_comparisons(exp_name: str) -> Dict[str, Any]:
    comp_p = get_experiments_dir() / exp_name / "comparison.csv"
    if not comp_p.exists():
        return {"has_comparison": False, "rows": []}
    df = pd.read_csv(comp_p).replace({np.nan: None})
    return {"has_comparison": True, "rows": df.to_dict(orient="records")}


# ------------------------------------------------------------------ Pipeline Runner
def start_pipeline_job(mode: str = "demo", stages: Optional[str] = None, sweep: bool = False) -> Dict[str, Any]:
    global pipeline_process, pipeline_logs, pipeline_status

    with pipeline_lock:
        if pipeline_process is not None and pipeline_process.poll() is None:
            return {"success": False, "message": "A pipeline job is already running."}

        pipeline_logs.clear()
        cmd = ["python3", "run_pipeline.py", "--mode", mode]
        if sweep:
            cmd.append("--sweep")
        if stages:
            cmd.extend(["--stages", stages])

        pipeline_status = {
            "status": "running",
            "mode": mode,
            "cmd": " ".join(cmd),
            "start_time": time.time(),
            "end_time": None,
            "exit_code": None,
            "error": None
        }

        try:
            pipeline_process = subprocess.Popen(
                cmd,
                cwd=str(PROJECT_ROOT),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1
            )
        except Exception as e:
            pipeline_status["status"] = "failed"
            pipeline_status["error"] = str(e)
            return {"success": False, "message": f"Failed to spawn process: {e}"}

        def reader():
            global pipeline_status
            for line in iter(pipeline_process.stdout.readline, ""):
                with pipeline_lock:
                    pipeline_logs.append(line)
            pipeline_process.stdout.close()
            return_code = pipeline_process.wait()
            with pipeline_lock:
                pipeline_status["status"] = "completed" if return_code == 0 else "failed"
                pipeline_status["exit_code"] = return_code
                pipeline_status["end_time"] = time.time()

        t = threading.Thread(target=reader, daemon=True)
        t.start()

        return {"success": True, "message": f"Pipeline started with mode '{mode}'", "status": pipeline_status}


def stop_pipeline_job() -> Dict[str, Any]:
    global pipeline_process, pipeline_status
    with pipeline_lock:
        if pipeline_process is None or pipeline_process.poll() is not None:
            return {"success": False, "message": "No active pipeline is running."}

        pipeline_process.terminate()
        pipeline_status["status"] = "terminated"
        pipeline_status["end_time"] = time.time()
        return {"success": True, "message": "Pipeline process terminated."}


def get_pipeline_status() -> Dict[str, Any]:
    with pipeline_lock:
        return {
            "status": pipeline_status,
            "log_line_count": len(pipeline_logs),
            "recent_logs": pipeline_logs[-100:] if pipeline_logs else []
        }


# ------------------------------------------------------------------ Advanced Capabilities
def perform_multi_steering(
    exp_name: str,
    run_id: str,
    vectors: List[Dict[str, Any]],
    scope: str = "global",
    local_percentile: Optional[int] = 90,
    image_pos: Optional[int] = None,
    image_base64: Optional[str] = None
) -> Dict[str, Any]:
    """Execute composite multi-feature vector steering arithmetic: x' = x + sum_i (alpha_i * W_dec[i])."""
    fids = [int(v["feature_id"]) for v in vectors]
    alphas = [float(v["alpha"]) for v in vectors]

    return perform_intervention(
        exp_name=exp_name,
        run_id=run_id,
        feature_ids=fids,
        alphas=alphas,
        mode="steer",
        scope=scope,
        local_percentile=local_percentile,
        image_pos=image_pos,
        image_base64=image_base64
    )


def get_dose_response_data(exp_name: str, run_id: str, feature_id: int) -> Dict[str, Any]:
    run_dir = get_experiments_dir() / exp_name / run_id
    dr_path = run_dir / "causal" / "dose_response.json"
    if not dr_path.exists():
        return {"has_data": False, "message": "dose_response.json not generated for this run."}

    data = load_json(dr_path)
    feat_key = str(feature_id)
    if feat_key in data:
        return {"has_data": True, "feature_id": feature_id, **data[feat_key]}

    # Fallback to first available feature
    available = list(data.keys())
    if available:
        first_k = available[0]
        return {
            "has_data": True,
            "feature_id": int(first_k),
            "fallback_used": True,
            "available_features": [int(k) for k in available],
            **data[first_k]
        }

    return {"has_data": False, "message": "No dose-response curves found in dose_response.json"}


def inspect_single_patch(
    exp_name: str,
    run_id: str,
    patch_index: int,
    image_pos: Optional[int] = None,
    image_base64: Optional[str] = None
) -> Dict[str, Any]:
    run_dir = get_experiments_dir() / exp_name / run_id
    ctx = context_manager.get_context(run_dir)

    pil_img: Optional[Image.Image] = None
    if image_base64:
        image_bytes = base64.b64decode(image_base64.split(",")[-1])
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    elif image_pos is not None:
        pil_img = ctx.image_pil(image_pos)
    else:
        raise ValueError("Must provide either image_pos or image_base64")

    from features.retrieval import analyze_image
    res = analyze_image(ctx, pil_img)
    feat_map = res["feature_map"]  # [P, W]

    if patch_index < 0 or patch_index >= feat_map.shape[0]:
        raise ValueError(f"Patch index must be between 0 and {feat_map.shape[0]-1}")

    patch_acts = feat_map[patch_index]
    top_fids = np.argsort(-patch_acts)[:10]

    summ = ctx.summary() if (ctx.disc_dir / "feature_summary.csv").exists() else None
    active_concepts = []
    for fid in top_fids:
        val = float(patch_acts[fid])
        if val <= 0:
            continue
        info = {
            "feature_id": int(fid),
            "activation": val,
            "concept": f"Feature #{fid}"
        }
        if summ is not None and fid in summ.index:
            s = summ.loc[fid]
            concept_name = s.get("clip_concept") or s.get("top_class_name") or f"Feature #{fid}"
            info.update({
                "concept": str(concept_name),
                "purity": float(s.get("purity", 0.0)),
                "top_class": str(s.get("top_class_name", "")),
                "specificity": str(s.get("specificity", ""))
            })
        active_concepts.append(info)

    row, col = divmod(patch_index, ctx.cfg.model.grid)
    return {
        "patch_index": patch_index,
        "row": row,
        "col": col,
        "grid_size": ctx.cfg.model.grid,
        "active_concepts": active_concepts,
        "total_active": len(active_concepts)
    }


def get_circuit_graph(exp_name: str, run_id: str, max_nodes: int = 24) -> Dict[str, Any]:
    run_dir = get_experiments_dir() / exp_name / run_id
    summary_path = run_dir / "discovery" / "feature_summary.csv"
    if not summary_path.exists():
        return {"nodes": [], "links": [], "message": "Discovery not yet run"}

    df = pd.read_csv(summary_path)
    if "dead" in df.columns:
        df = df[~df["dead"]]

    cand_path = run_dir / "causal" / "candidate_causal_summary.csv"
    if cand_path.exists():
        cand_df = pd.read_csv(cand_path)
        if "feature_id" in cand_df.columns:
            df = df.merge(cand_df[["feature_id", "causal_rank", "abl_mean"]], on="feature_id", how="left")

    # Pick top features by purity and causal rank
    selected_df = df.sort_values(by="purity", ascending=False).head(max_nodes)
    nodes = []
    fids = selected_df["feature_id"].tolist()

    for _, r in selected_df.iterrows():
        nodes.append({
            "id": int(r["feature_id"]),
            "label": f"#{r['feature_id']} {r.get('clip_concept') or r.get('top_class_name') or ''}",
            "purity": float(r.get("purity", 0.5)),
            "spatial_conc10": float(r.get("spatial_conc10", 0.5)),
            "causal_rank": int(r["causal_rank"]) if ("causal_rank" in r and pd.notnull(r["causal_rank"])) else None,
            "class": str(r.get("top_class_name", ""))
        })

    # Build links based on interactions and decoder cosine similarity
    links = []
    it_path = run_dir / "causal" / "interactions.csv"
    if it_path.exists():
        it_df = pd.read_csv(it_path)
        for _, r in it_df.iterrows():
            fa, fb = int(r["feature_a"]), int(r["feature_b"])
            if fa in fids and fb in fids:
                links.append({
                    "source": fa,
                    "target": fb,
                    "type": str(r.get("category", "interaction")),
                    "value": float(r.get("decoder_cosine", 0.2))
                })

    # Add decoder cosine similarity links from checkpoint
    try:
        ctx = context_manager.get_context(run_dir)
        W = ctx.sae.W_dec.data.cpu()  # [W, D]
        # Normalize
        W_norm = W / torch.clamp(W.norm(dim=1, keepdim=True), min=1e-8)
        sub_W = W_norm[fids]
        sims = (sub_W @ sub_W.T).numpy()

        for i in range(len(fids)):
            for j in range(i + 1, len(fids)):
                s = float(sims[i, j])
                if s > 0.12 and not any(l["source"] == fids[i] and l["target"] == fids[j] for l in links):
                    links.append({
                        "source": fids[i],
                        "target": fids[j],
                        "type": "cosine_sim",
                        "value": round(s, 3)
                    })
    except Exception:
        pass

    return {"nodes": nodes, "links": links}


def get_viva_defense_data() -> Dict[str, Any]:
    path = PROJECT_ROOT / "reports" / "viva_questions.md"
    if not path.exists():
        return {"categories": [], "questions": []}

    content = path.read_text(encoding="utf-8")
    categories = []
    questions = []
    current_category = "General"

    for line in content.splitlines():
        line = line.strip()
        if line.startswith("## "):
            current_category = line.replace("## ", "").strip()
            if current_category not in categories:
                categories.append(current_category)
        elif line and line[0].isdigit() and ". **" in line:
            parts = line.split(". **", 1)
            num = parts[0]
            rest = parts[1].split("**", 1)
            q_text = rest[0].strip()
            a_text = rest[1].strip() if len(rest) > 1 else ""
            questions.append({
                "id": int(num),
                "category": current_category,
                "question": q_text,
                "answer": a_text
            })

    return {"categories": categories, "questions": questions}

