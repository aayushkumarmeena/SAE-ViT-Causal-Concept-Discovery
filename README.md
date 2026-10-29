# SAE-Based Causal Concept Discovery and Feature Steering in Vision Transformers (v2.0)

A comprehensive mechanistic interpretability and causal steering platform for Vision Transformers (ViT) using Sparse Autoencoders (SAEs). Includes a full-stack interactive web application, Causal Steering Studio, FastAPI REST & SSE streaming server, companion Streamlit dashboard, and production Docker containerization.

---

## Key Features & Advancements

### 1. Interactive Causal Steering Studio
- **Composite Concept Vector Arithmetic**: Perform multi-feature steering combinations:
  $$\vec{x}' = \vec{x} + \sum_{i} \alpha_i W_{\text{dec}}[i]$$
  Combine or contrast semantic directions simultaneously (e.g. amplifying feature $A$ while ablating feature $B$).
- **Ablation ($\times 0.0$) / Suppression ($\times 0.5$) / Amplification ($\times 2.0$)**: Knock out or scale concepts and observe logit drops on the model's top predicted class.
- **Interactive 14x14 Patch Inspector**: Click any individual patch out of 196 image patches to view its exact 2D coordinate, token Euclidean norm $\|x_{\text{patch}}\|_2$, and Top-5 firing SAE concepts with activation intensities.
- **Real-Time Prediction Flip Tracking**: Detect when interventions cause the top-1 prediction to flip classes.
- **Interactive 5-in-1 Patch Heatmaps**: Raw, Normalized, Overlay, Active Mask, and Strongest Connected Bounding Box.

### 2. Rigorous Statistical Controls & Monotonicity Verification
- **9-Point Dose-Response Monotonicity Curve Generator**: Evaluates causal impact across a multiplier spectrum ($0.0\times \dots 5.0\times$) with a 95% bootstrap confidence interval envelope and matched random baseline.
- **Frequency-Matched Random Controls**: Candidate features tested against 30 random features using paired Wilcoxon signed-rank tests and Cohen's $d_z$ effect sizes.
- **Hypothesis Testing (H1–H6)**: Formal validation for monosemanticity, causal efficacy, spatial specificity, dose monotonicity, layer hierarchy, and non-linear interactions.

### 3. Concept Circuit Graph & Interaction Lab
- **Topological Circuit Graph**: Visual network displaying concept nodes colored by semantic class/purity, causal rank rings, and decoder cosine similarity edges.
- **Pairwise Non-Linear Interaction Test**:
  $$I(A, B) = \Delta z_{AB} - (\Delta z_A + \Delta z_B)$$
  Classifies feature pairs as **Synergistic** (super-additive circuit, $I > 0$), **Redundant** (sub-additive compensation, $I < 0$), or **Independent** ($I \approx 0$).

### 4. Academic Viva Defense Center & Publication Tools
- **Interactive Viva Voce Defense Trainer**: 61 curated oral defense and peer-review questions categorized into *ViT & Attention*, *SAE Mathematics*, *Mechanistic Interpretability*, *Causality Preservation*, *Statistics*, and *Limitations*, with study flashcard mode.
- **One-Click Academic LaTeX Table Generator**: Generates clean, booktabs-compliant LaTeX code for architecture benchmarks and top causal candidates ready for Overleaf, NeurIPS, ICML, or CVPR submission.

### 5. Multi-Architecture & Depth Support
- Seamless support for **ViT-B/16**, **TinyViT**, and custom checkpoints.
- Compares **Top-K SAE**, **$L_1$-penalized SAE**, and standard dense autoencoders across layers 3, 6, 9, and 11.

---

## Quickstart with Docker (Recommended)

Run the entire platform (Web UI + API on port 8000, Streamlit on port 8501) with one command:

```bash
chmod +x start.sh
./start.sh
```

Or using Docker Compose directly:
```bash
docker compose up --build -d
```

### Access Ports
| Service | URL | Description |
| :--- | :--- | :--- |
| **Main Web Platform & Causal Studio** | [http://localhost:8000](http://localhost:8000) | Full interactive React UI, Causal Steering Studio, Circuit Graph, and Defense Center |
| **Streamlit Companion Dashboard** | [http://localhost:8501](http://localhost:8501) | Classic data science dashboard with 10 analytical tabs |
| **Interactive Swagger API Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | Swagger UI for all REST & SSE streaming endpoints |

For detailed deployment instructions, GPU configuration, volume persistence, and cloud hosting, see [DEPLOYMENT.md](file:///Users/aayush/Downloads/SAE_ViT_Causal_Concept_Discovery-main/DEPLOYMENT.md).

---

## Local Development (Without Docker)

### 1. Setup Environment
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Launch FastAPI Web Platform & UI
```bash
uvicorn api.main:app --reload --port 8000
```
Open [http://localhost:8000](http://localhost:8000) in your browser.

### 3. Launch Frontend in Hot-Reload Dev Mode (Optional)
```bash
cd frontend
npm install
npm run dev
```

### 4. Build Production Static Assets
```bash
cd frontend && npm run build
```
Outputs bundled production assets directly to `static/` served by FastAPI at `/`.

---

## Pipeline Execution & Presets

You can trigger pipeline executions directly from the Web UI (**Tab 7: Run Pipeline**) with live streaming terminal logs, or run commands from the CLI:

```bash
python run_pipeline.py --mode selftest   # Offline tiny ViT + synthetic images (~10s)
python run_pipeline.py --mode smoke      # 10 images, real ViT-B/16 (~30s)
python run_pipeline.py --mode demo       # CIFAR-100, 500 images, layer 9, 1024 features, Top-K=16 (~3m)
python run_pipeline.py --mode full       # Research mode: 10k images, layer 9, 4096 features
python run_pipeline.py --mode full --sweep # Architectural sweep across layers 3/6/9/11 & SAE widths
```

### Individual Stage Commands
```bash
# 1. Activation Extraction
python extract.py --mode demo --layer 9

# 2. SAE Training
python train.py --mode demo --sae-width 4096 --sae-type topk --k 32

# 3. Concept Discovery
python discover.py --mode demo [--feature 172]

# 4. Causal Intervention & Steering
python intervene.py --mode demo --feature 172 --strength 0 [--steer] [--local 90]

# 5. Statistical Evaluation & Hypotheses Testing
python evaluate.py --mode demo
```

---

## Project Structure

```
.
├── api/                           # FastAPI REST & SSE Streaming Backend
│   ├── main.py                    # Server routes, CORS, static SPA mount
│   ├── schemas.py                 # Pydantic request models
│   └── service.py                 # RunContext caching, causal engine & advanced analytics
├── frontend/                      # Modern React + Vite + Tailwind CSS Single-Page App
│   ├── src/
│   │   ├── components/            # Navbar, MetricCard, HeatmapViewer
│   │   ├── views/                 # 8 interactive tabs (Studio, Explorer, Stats, etc.)
│   │   ├── api.js                 # Axios API client
│   │   └── App.jsx                # Application root
├── static/                        # Compiled production frontend bundle
├── activations/                   # ViT activation extraction & store
├── causal/                        # Causal metrics, statistical hypotheses, random controls
├── features/                      # Concept discovery, spatial heatmaps, CLIP labeling
├── interventions/                 # Causal intervention engine (ablate, steer, local/global)
├── models/                        # Vision Transformer loader (timm) and TinyViT
├── sae/                           # Sparse Autoencoder architectures (Top-K, L1, Standard)
├── reports/                       # Scientific report generator & viva defense questions
├── experiments/                   # Experiment checkpoints, configs, and plots
├── tests/                         # Pytest test suite
├── Dockerfile                     # Multi-stage production container build
├── docker-compose.yml             # Container orchestration (Web API + Streamlit)
├── start.sh                       # Quickstart launcher script
├── DEPLOYMENT.md                  # Comprehensive deployment guide
└── requirements.txt               # Python dependencies
```

---

## Scientific Design & Methodology

- **Data Split**: 60% SAE-train / 20% feature-val / 20% causal-eval. Candidates are identified strictly on validation non-causal metrics to prevent statistical snooping.
- **Causal Metric**: Effect on model prediction $z_y(\text{base}) - z_y(\text{intervened})$ for the baseline top-1 class $y$.
- **Steering Formula**: $\vec{x}' = \vec{x} + \sum_i (f'_i - f_i) W_{\text{dec}}[i]$, preserving SAE reconstruction error.
- **Random Controls**: Frequency-matched features subjected to identical interventions, evaluated with paired Wilcoxon signed-rank tests and Cohen's $d_z$ effect sizes.
