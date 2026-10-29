# Deployment & Production Guide: SAE-ViT Causal Concept Discovery Platform

This guide provides complete instructions for deploying and running the **SAE-ViT Causal Concept Discovery & Steering Platform** with Docker, Docker Compose, GPU acceleration, and local environments.

---

## Architecture Overview

```
                      ┌─────────────────────────────────────────┐
                      │             Client Browser              │
                      └────────────────────┬────────────────────┘
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    │                                             │
             Port 8000                                     Port 8501
                    │                                             │
                    ▼                                             ▼
  ┌───────────────────────────────────┐         ┌───────────────────────────────────┐
  │         sae-vit-web               │         │        sae-vit-dashboard          │
  │  FastAPI Backend + React Studio   │         │       Streamlit Dashboard         │
  │  - REST & SSE Streaming Endpoints │         │  - Exploratory Data Analysis      │
  │  - Causal Steering Studio         │         │  - Interactive Visualizations     │
  │  - Real-time Intervention Engine  │         └─────────────────┬─────────────────┘
  │  - Discovered Concepts Catalog    │                           │
  └─────────────────┬─────────────────┘                           │
                    │                                             │
                    └──────────────────────┬──────────────────────┘
                                           │
                         Shared Host Volume Mounts:
                           - ./experiments (Checkpoints & results)
                           - ./activations (Extracted ViT caches)
                           - ./data        (Raw image datasets)
                           - ./reports     (Generated papers & Q&A)
```

---

## Quickstart: 1-Command Launch with Docker

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (macOS, Windows, or Linux)
- Ensure Docker daemon is running

### Step 1: Clone / Navigate to Project Directory
```bash
cd SAE_ViT_Causal_Concept_Discovery-main
```

### Step 2: Initialize Environment
```bash
cp .env.example .env
```

### Step 3: Launch with Docker Compose
You can use the automated quickstart launcher:
```bash
chmod +x start.sh
./start.sh
```
Or use Docker Compose directly:
```bash
docker compose up --build
```

To run in the background (detached mode):
```bash
docker compose up --build -d
```

### Step 4: Access the Applications
| Service | URL | Description |
| :--- | :--- | :--- |
| **Main Web Platform & Studio** | [http://localhost:8000](http://localhost:8000) | Full interactive React UI, Causal Steering Studio, Feature Explorer, and Pipeline Runner |
| **Streamlit Companion** | [http://localhost:8501](http://localhost:8501) | Classic data science dashboard with 10 analytical tabs |
| **Interactive API Documentation** | [http://localhost:8000/docs](http://localhost:8000/docs) | Swagger UI for all REST & SSE streaming endpoints |
| **Alternative API Specs** | [http://localhost:8000/redoc](http://localhost:8000/redoc) | ReDoc format API documentation |

---

## GPU / CUDA Hardware Acceleration (Linux / Windows WSL2)

To enable NVIDIA GPU acceleration inside the Docker containers:

### 1. Verify NVIDIA Container Toolkit
Ensure `nvidia-container-toolkit` is installed on your host:
```bash
nvidia-smi
```

### 2. Update `docker-compose.yml` for GPU
Add the `deploy.resources.reservations.devices` block to the services in `docker-compose.yml`:

```yaml
services:
  web:
    build: .
    environment:
      - DEVICE=cuda
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

### 3. Set Device in `.env`
In `.env`:
```env
DEVICE=cuda
```

---

## Running Pipeline Stages Inside Docker

You can trigger pipeline executions directly from the Web UI (**Tab 7: Run Pipeline**) with live streaming terminal logs, or run commands via `docker compose exec`:

### Run Offline Self-Test (~10 seconds)
```bash
docker compose exec web python run_pipeline.py --mode selftest
```

### Run Smoke Test (10 images, real ViT-B/16 ~30 seconds)
```bash
docker compose exec web python run_pipeline.py --mode smoke
```

### Run Full Demo (CIFAR-100, 500 images, Top-K SAE ~3 minutes)
```bash
docker compose exec web python run_pipeline.py --mode demo
```

### Run Research Mode with Architectural Sweeps
```bash
docker compose exec web python run_pipeline.py --mode full --sweep
```

### Run Individual Stages
```bash
# 1. Activation Extraction
docker compose exec web python extract.py --mode demo --layer 9

# 2. SAE Training
docker compose exec web python train.py --mode demo --sae-width 1024 --sae-type topk --k 16

# 3. Concept Discovery
docker compose exec web python discover.py --mode demo

# 4. Causal Intervention & Hypothesis Evaluation
docker compose exec web python evaluate.py --mode demo
```

---

## Persistent Storage & Volume Mounts

The container mounts the following host directories:
- `./experiments`: Contains all trained checkpoints (`checkpoint.pt`), run configs (`config.json`), warnings (`warnings.json`), discovery tables (`feature_summary.csv`), causal tables (`candidate_causal_summary.csv`, `random_controls.json`), and high-resolution plots (`plots/*.png`).
- `./activations`: Contains cached ViT block outputs and normalization statistics to avoid re-extracting representations.
- `./data`: Stores raw CIFAR-100 and validation images.
- `./reports`: Stores generated Markdown papers (`report_<name>.md`) and defense guides (`viva_questions.md`).

All files written inside Docker persist immediately on your host machine.

---

## Local Development (Without Docker)

If you prefer developing locally:

### 1. Backend Setup
```bash
python -m venv .venv
source .venv/bin/activate   # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
```

### 2. Frontend Development (Hot-Reload)
```bash
cd frontend
npm install
npm run dev
```
The Vite development server runs at `http://localhost:3000` with auto-proxying of `/api` requests to port 8000.

### 3. Building Production Frontend Assets
```bash
cd frontend
npm run build
```
This automatically compiles and bundles the SPA into the root `static/` directory, which is served directly by FastAPI at `http://localhost:8000/`.

---

## Stopping & Managing Containers

### Stop Containers
```bash
docker compose down
```

### Stop Containers and Remove Volumes
```bash
docker compose down -v
```

### View Live Container Logs
```bash
docker compose logs -f web
```

### Container Status & Health
```bash
docker compose ps
```

---

## Troubleshooting & FAQ

#### Q: Port 8000 or 8501 is already in use
**A:** Edit the `.env` file and change `API_PORT` or `DASHBOARD_PORT`:
```env
API_PORT=8080
DASHBOARD_PORT=8502
```
Then restart: `docker compose up --build`.

#### Q: Container crashes with "Killed" (Out of Memory)
**A:** Deep learning models and SAEs require adequate RAM. Open **Docker Desktop Settings -> Resources** and increase Memory to at least **4GB - 6GB**. Alternatively, use `--mode selftest` or `--mode smoke` for minimal memory usage.

#### Q: How do I test the API endpoints directly?
**A:** Visit `http://localhost:8000/docs` to test every endpoint interactively via Swagger UI, including custom image upload and live intervention execution.
