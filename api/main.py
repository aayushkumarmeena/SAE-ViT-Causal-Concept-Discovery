"""
api/main.py: FastAPI REST & WebSocket / SSE Backend Server
Serves the SAE-ViT Causal Concept Discovery web application and API.
"""
from __future__ import annotations

import asyncio
import io
import os
import sys
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from api.schemas import (
    CustomImageAnalysisRequest,
    FeatureInteractionRequest,
    InterventionRequest,
    MultiSteerRequest,
    PatchInspectRequest,
    PipelineRunRequest,
)
from api.service import (
    analyze_custom_image,
    context_manager,
    get_circuit_graph,
    get_comparisons,
    get_dose_response_data,
    get_experiments_dir,
    get_feature_detail,
    get_features_list,
    get_hypotheses,
    get_pipeline_status,
    get_random_controls,
    get_run_details,
    get_viva_defense_data,
    inspect_single_patch,
    list_experiments,
    perform_intervention,
    perform_multi_steering,
    pipeline_lock,
    pipeline_logs,
    pipeline_status,
    start_pipeline_job,
    stop_pipeline_job,
)

app = FastAPI(
    title="SAE-ViT Causal Concept Discovery Platform",
    description="Full-stack API for Sparse Autoencoders on Vision Transformers: Mechanistic Interpretability & Causal Steering",
    version="2.0.0",
)

# Enable CORS for local Vite dev server and external clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------ System Routes
@app.get("/api/system/info")
def get_system_info():
    import platform
    gpu_available = False
    device_name = "CPU"
    try:
        import torch
        gpu_available = torch.cuda.is_available()
        if gpu_available:
            device_name = torch.cuda.get_device_name(0)
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            device_name = "Apple Silicon MPS"
    except Exception:
        pass

    return {
        "platform": platform.platform(),
        "python_version": platform.python_version(),
        "gpu_available": gpu_available,
        "device_name": device_name,
        "project_root": str(PROJECT_ROOT),
        "presets": ["selftest", "smoke", "demo", "full"]
    }


# ------------------------------------------------------------------ Experiment Routes
@app.get("/api/experiments")
def get_experiments():
    return list_experiments()


@app.get("/api/experiments/{exp_name}/{run_id}/overview")
def get_run_overview(exp_name: str, run_id: str):
    try:
        return get_run_details(exp_name, run_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/experiments/{exp_name}/{run_id}/plot/{plot_name}")
def get_run_plot(exp_name: str, run_id: str, plot_name: str):
    p = get_experiments_dir() / exp_name / run_id / "plots" / plot_name
    if not p.exists():
        raise HTTPException(status_code=404, detail="Plot not found")
    return FileResponse(p, media_type="image/png")


@app.get("/api/experiments/{exp_name}/{run_id}/feature-report/{feature_id}")
def get_feature_report_image(exp_name: str, run_id: str, feature_id: int):
    p = get_experiments_dir() / exp_name / run_id / "plots" / "features" / f"feature_{feature_id}_report.png"
    if not p.exists():
        raise HTTPException(status_code=404, detail="Feature report image not found")
    return FileResponse(p, media_type="image/png")


@app.get("/api/experiments/{exp_name}/{run_id}/heatmap/{feature_id}/{kind}")
def get_feature_heatmap_image(exp_name: str, run_id: str, feature_id: int, kind: str):
    p = get_experiments_dir() / exp_name / run_id / "plots" / "features" / f"feature_{feature_id}_heatmaps" / f"top1_{kind}.png"
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"Heatmap {kind} not found")
    return FileResponse(p, media_type="image/png")


# ------------------------------------------------------------------ Features Routes
@app.get("/api/experiments/{exp_name}/{run_id}/features")
def get_features(
    exp_name: str,
    run_id: str,
    search: Optional[str] = None,
    sort_by: str = "purity",
    sort_desc: bool = True,
    alive_only: bool = True,
    limit: int = 50,
    offset: int = 0
):
    return get_features_list(exp_name, run_id, search, sort_by, sort_desc, alive_only, limit, offset)


@app.get("/api/experiments/{exp_name}/{run_id}/features/{feature_id}")
def get_single_feature(exp_name: str, run_id: str, feature_id: int):
    try:
        return get_feature_detail(exp_name, run_id, feature_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/experiments/{exp_name}/{run_id}/causal-images")
def get_causal_eval_images(exp_name: str, run_id: str, feature_id: int = Query(default=0), limit: int = 20):
    try:
        run_dir = get_experiments_dir() / exp_name / run_id
        ctx = context_manager.get_context(run_dir)
        pos = ctx.splits["causal"][:300]
        act = ctx.feature_activations(feature_id, pos).max(1) > 0
        active_pos = pos[act].tolist()[:limit]

        # Generate thumbnails for the first 8 active images
        thumbnails = []
        for p in active_pos[:8]:
            pil = ctx.image_pil(p).resize((120, 120))
            from api.service import pil_to_base64
            thumbnails.append({"position": p, "thumbnail": pil_to_base64(pil)})

        return {"feature_id": feature_id, "active_positions": active_pos, "thumbnails": thumbnails}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch causal images: {e}")


# ------------------------------------------------------------------ Interventions Routes
@app.post("/api/experiments/{exp_name}/{run_id}/intervene")
def run_causal_intervention(exp_name: str, run_id: str, req: InterventionRequest):
    try:
        return perform_intervention(
            exp_name=exp_name,
            run_id=run_id,
            feature_ids=req.feature_ids,
            alphas=req.alphas,
            mode=req.mode,
            scope=req.scope,
            local_percentile=req.local_percentile,
            image_pos=req.image_pos,
            image_base64=req.image_base64
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Intervention error: {e}")


@app.post("/api/experiments/{exp_name}/{run_id}/analyze-image")
async def analyze_image_endpoint(exp_name: str, run_id: str, file: UploadFile = File(...)):
    try:
        contents = await file.read()
        pil_img = Image.open(io.BytesIO(contents)).convert("RGB")
        return analyze_custom_image(exp_name, run_id, pil_img)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {e}")


@app.post("/api/experiments/{exp_name}/{run_id}/multi-steer")
def multi_steer_endpoint(exp_name: str, run_id: str, req: MultiSteerRequest):
    try:
        return perform_multi_steering(
            exp_name=exp_name,
            run_id=run_id,
            vectors=[{"feature_id": v.feature_id, "alpha": v.alpha} for v in req.vectors],
            scope=req.scope,
            local_percentile=req.local_percentile,
            image_pos=req.image_pos,
            image_base64=req.image_base64
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Multi-steer error: {e}")


@app.get("/api/experiments/{exp_name}/{run_id}/dose-response/{feature_id}")
def dose_response_endpoint(exp_name: str, run_id: str, feature_id: int):
    try:
        return get_dose_response_data(exp_name, run_id, feature_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dose response error: {e}")


@app.post("/api/experiments/{exp_name}/{run_id}/patch-inspect")
def patch_inspect_endpoint(exp_name: str, run_id: str, req: PatchInspectRequest):
    try:
        return inspect_single_patch(
            exp_name=exp_name,
            run_id=run_id,
            patch_index=req.patch_index,
            image_pos=req.image_pos,
            image_base64=req.image_base64
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Patch inspect error: {e}")


@app.get("/api/experiments/{exp_name}/{run_id}/circuit-graph")
def circuit_graph_endpoint(exp_name: str, run_id: str, max_nodes: int = 24):
    try:
        return get_circuit_graph(exp_name, run_id, max_nodes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Circuit graph error: {e}")


@app.get("/api/viva-defense")
def viva_defense_endpoint():
    return get_viva_defense_data()



# ------------------------------------------------------------------ Feature Interactions
@app.post("/api/experiments/{exp_name}/{run_id}/interaction")
def run_feature_interaction(exp_name: str, run_id: str, req: FeatureInteractionRequest):
    try:
        run_dir = get_experiments_dir() / exp_name / run_id
        ctx = context_manager.get_context(run_dir)
        from causal.metrics import compute_effects
        from causal.stats import interaction_stats

        pos = ctx.splits["causal"]
        act_a = ctx.feature_activations(req.feature_a, pos).max(1) > 0
        act_b = ctx.feature_activations(req.feature_b, pos).max(1) > 0
        both = act_a & act_b

        num_coactive = int(both.sum())
        if num_coactive < 3:
            return {
                "num_coactive": num_coactive,
                "can_compute": False,
                "message": f"Only {num_coactive} images have both features active (minimum 3 required)."
            }

        eng = ctx.engine()
        h = ctx.hidden(pos[both][:100])
        base = eng.baseline_many(h)
        y = base.argmax(1)

        def eff(ids):
            return compute_effects(base, eng.run_many(h, ids, [0.0] * len(ids))["logits"], y)["logit_effect"]

        eff_a = eff([req.feature_a])
        eff_b = eff([req.feature_b])
        eff_ab = eff([req.feature_a, req.feature_b])

        stats_res = interaction_stats(eff_a, eff_b, eff_ab, n_boot=500)
        return {
            "num_coactive": num_coactive,
            "can_compute": True,
            "feature_a": req.feature_a,
            "feature_b": req.feature_b,
            "mean_effect_a": float(eff_a.mean()),
            "mean_effect_b": float(eff_b.mean()),
            "mean_effect_joint": float(eff_ab.mean()),
            "interaction": stats_res
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Interaction error: {e}")


# ------------------------------------------------------------------ Statistical Validation
@app.get("/api/experiments/{exp_name}/{run_id}/random-controls")
def get_random_controls_endpoint(exp_name: str, run_id: str, feature_id: Optional[int] = None):
    return get_random_controls(exp_name, run_id, feature_id)


@app.get("/api/experiments/{exp_name}/hypotheses")
def get_hypotheses_endpoint(exp_name: str):
    return get_hypotheses(exp_name)


@app.get("/api/experiments/{exp_name}/comparisons")
def get_comparisons_endpoint(exp_name: str):
    return get_comparisons(exp_name)


# ------------------------------------------------------------------ Pipeline Execution & Logs
@app.post("/api/pipeline/run")
def trigger_pipeline(req: PipelineRunRequest):
    return start_pipeline_job(mode=req.mode, stages=req.stages, sweep=req.sweep)


@app.post("/api/pipeline/stop")
def terminate_pipeline():
    return stop_pipeline_job()


@app.get("/api/pipeline/status")
def pipeline_status_endpoint():
    return get_pipeline_status()


@app.get("/api/pipeline/logs/stream")
async def stream_pipeline_logs():
    """Server-Sent Events (SSE) streaming real-time terminal output to UI."""
    async def event_generator():
        last_index = 0
        while True:
            with pipeline_lock:
                current_len = len(pipeline_logs)
                if last_index < current_len:
                    new_lines = pipeline_logs[last_index:current_len]
                    last_index = current_len
                    for line in new_lines:
                        yield f"data: {line}\n\n"
                is_active = pipeline_status["status"] == "running"

            if not is_active and last_index >= current_len:
                yield "event: end\ndata: finished\n\n"
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ------------------------------------------------------------------ Reports & Artifact Downloads
@app.get("/api/export/{exp_name}/{run_id}/{file_type}")
def export_file(exp_name: str, run_id: str, file_type: str):
    exp_dir = get_experiments_dir() / exp_name
    run_dir = exp_dir / run_id

    files_map = {
        "results_csv": run_dir / "causal" / "results_rows.csv",
        "candidate_csv": run_dir / "causal" / "candidate_causal_summary.csv",
        "feature_summary_csv": run_dir / "discovery" / "feature_summary.csv",
        "comparison_csv": exp_dir / "comparison.csv",
        "hypotheses_json": exp_dir / "hypotheses.json",
        "layer_summary_json": run_dir / "layer_summary.json",
        "config_json": run_dir / "config.json",
        "scientific_report_md": PROJECT_ROOT / "reports" / f"report_{exp_name}.md",
        "viva_questions_md": PROJECT_ROOT / "reports" / "viva_questions.md"
    }

    target = files_map.get(file_type)
    if not target or not target.exists():
        raise HTTPException(status_code=404, detail=f"File {file_type} not found on disk.")

    media_type = "text/csv" if target.suffix == ".csv" else ("application/json" if target.suffix == ".json" else "text/markdown")
    return FileResponse(target, filename=target.name, media_type=media_type)


# ------------------------------------------------------------------ Static Frontend Mounting
STATIC_DIR = PROJECT_ROOT / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        requested_file = STATIC_DIR / full_path
        if full_path and requested_file.exists() and requested_file.is_file():
            return FileResponse(requested_file)
        index_file = STATIC_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return {"message": "Frontend not yet built. Visit /docs for the API."}
