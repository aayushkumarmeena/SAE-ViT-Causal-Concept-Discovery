# ==============================================================================
# Production Dockerfile for SAE-ViT Causal Concept Discovery & Steering Platform
# Base: python:3.11-slim (Optimized for Apple Silicon ARM64 & Linux x86_64)
# ==============================================================================

FROM python:3.11-slim

ARG TORCH_INDEX_URL="https://download.pytorch.org/whl/cpu"

# Install system runtime dependencies for OpenCV, PyTorch, image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    ffmpeg \
    libsm6 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Upgrade pip and packaging tools
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Configure pip for network resilience
ENV PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10

# Step 1: Install PyTorch CPU directly first
# Prevents pip from pulling 4+ GB of NVIDIA CUDA drivers on CPU / Apple Silicon Docker
RUN pip install --no-cache-dir --timeout 120 --retries 10 \
    torch torchvision --index-url ${TORCH_INDEX_URL}

# Step 2: Copy requirements and install remaining dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir --timeout 120 --retries 10 -r requirements.txt

# Step 3: Copy application code, prebuilt static UI assets, and configurations
COPY . /app

# Runtime environment settings
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEVICE=auto \
    PORT=8000

# Expose Web Platform (FastAPI + React SPA) on 8000, and Streamlit on 8501
EXPOSE 8000 8501

# Healthcheck to ensure API and model server are responsive
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/api/system/info || exit 1

# Default execution: run the FastAPI production server
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
