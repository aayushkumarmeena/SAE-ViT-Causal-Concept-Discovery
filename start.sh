#!/usr/bin/env bash
# ==============================================================================
# Quickstart Launcher for SAE-ViT Causal Concept Discovery & Steering Platform
# ==============================================================================
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}   SAE-ViT Causal Concept Discovery & Steering Platform 2.0    ${NC}"
echo -e "${CYAN}================================================================${NC}"

# Check for Docker
if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
    echo -e "${GREEN}✓ Docker and Docker Compose detected.${NC}"
elif command -v docker &> /dev/null && docker compose version &> /dev/null; then
    echo -e "${GREEN}✓ Docker and Docker Compose (plugin) detected.${NC}"
else
    echo -e "${YELLOW}Notice: Docker was not found in PATH.${NC}"
    echo -e "You can still run locally using Python and Vite."
fi

# Ensure .env exists
if [ ! -f .env ]; then
    echo -e "${BLUE}Creating default .env from .env.example...${NC}"
    cp .env.example .env
fi

# Parse argument
MODE="${1:-docker}"

if [ "$MODE" = "docker" ]; then
    echo -e "${GREEN}Starting platform with Docker Compose...${NC}"
    echo -e "${BLUE}Building multi-stage container and starting services...${NC}"
    docker compose up --build
elif [ "$MODE" = "docker-d" ]; then
    echo -e "${GREEN}Starting platform in detached background mode...${NC}"
    docker compose up --build -d
    echo -e "${GREEN}Platform is running!${NC}"
    echo -e "  - Main Web Platform (FastAPI + React UI): ${CYAN}http://localhost:8000${NC}"
    echo -e "  - Streamlit Dashboard:                    ${CYAN}http://localhost:8501${NC}"
    echo -e "  - API Documentation (Swagger):            ${CYAN}http://localhost:8000/docs${NC}"
    echo -e "To view logs: ${YELLOW}docker compose logs -f${NC}"
    echo -e "To stop:      ${YELLOW}docker compose down${NC}"
elif [ "$MODE" = "local" ]; then
    echo -e "${GREEN}Starting local development environment...${NC}"
    echo -e "1. Ensure python virtualenv is activated and requirements are installed."
    echo -e "2. Running FastAPI backend on port 8000..."
    uvicorn api.main:app --reload --port 8000 &
    API_PID=$!
    echo -e "Backend PID: $API_PID"

    if [ -d "frontend/node_modules" ]; then
        echo -e "3. Running Vite frontend dev server on port 3000..."
        cd frontend && npm run dev &
        VITE_PID=$!
        echo -e "Frontend PID: $VITE_PID"
    fi

    echo -e "${CYAN}Local environment running. Press Ctrl+C to terminate.${NC}"
    trap "kill $API_PID $VITE_PID 2>/dev/null; exit" INT TERM
    wait
else
    echo -e "${RED}Unknown mode: $MODE${NC}"
    echo -e "Usage:"
    echo -e "  ./start.sh          # Build and start via Docker Compose (foreground)"
    echo -e "  ./start.sh docker-d # Build and start via Docker Compose (background)"
    echo -e "  ./start.sh local    # Start local Python & Vite development servers"
    exit 1
fi
