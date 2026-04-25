#!/bin/bash
# deploy.sh — Pull latest code, rebuild images, restart services.
# Idempotent: safe to run multiple times.
# Usage: ./infra/scripts/deploy.sh [--no-pull] [--env-file /path/to/.env]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"
PULL=true

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-pull)    PULL=false; shift ;;
        --env-file)   ENV_FILE="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# ── Validate ──────────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env file not found at $ENV_FILE"
    echo "Copy infra/.env.example to .env and fill in your values."
    exit 1
fi

# Source .env to validate required vars
set -a; source "$ENV_FILE"; set +a

for VAR in DOMAIN ENCRYPTION_KEY FRONTEND_URL; do
    if [ -z "${!VAR:-}" ]; then
        echo "ERROR: Required variable $VAR is not set in $ENV_FILE"
        exit 1
    fi
done

echo "────────────────────────────────────────────────"
echo "  MyPresc Deploy — Deployment"
echo "  Domain:  ${DOMAIN}"
echo "  Config:  ${NGINX_CONFIG:-ssl}"
echo "  Tag:     ${IMAGE_TAG:-latest}"
echo "────────────────────────────────────────────────"

cd "$PROJECT_ROOT"

# ── Git pull ──────────────────────────────────────────────────────────────────
if [ "$PULL" = true ]; then
    echo "[1/5] Pulling latest code..."
    git pull --ff-only
fi

# ── Build images ──────────────────────────────────────────────────────────────
echo "[2/5] Building Docker images..."
docker compose --env-file "$ENV_FILE" build --pull --no-cache

# ── Pull certbot image ────────────────────────────────────────────────────────
echo "[3/5] Pulling certbot image..."
docker compose --env-file "$ENV_FILE" pull certbot

# ── Start / restart services ──────────────────────────────────────────────────
echo "[4/5] Starting services..."
docker compose --env-file "$ENV_FILE" up -d --remove-orphans

# ── Health check ──────────────────────────────────────────────────────────────
echo "[5/5] Waiting for health checks..."
MAX_WAIT=120
ELAPSED=0
until docker compose --env-file "$ENV_FILE" ps --format json \
    | grep -v '"Health":"healthy"' \
    | grep -q '"State":"running"' && [ "$ELAPSED" -lt "$MAX_WAIT" ]; do
    sleep 5
    ELAPSED=$((ELAPSED + 5))
done

# Final status
docker compose --env-file "$ENV_FILE" ps

# Remove dangling images to free disk space
docker image prune -f

echo ""
echo "Deployment complete. App running at: https://${DOMAIN}"
