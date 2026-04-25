#!/bin/bash
# rollback.sh — Roll back to the previously running Docker images.
# Usage: ./infra/scripts/rollback.sh [--env-file /path/to/.env]
#
# How it works:
#   1. Finds the second-most-recent image tag for each service
#   2. Updates IMAGE_TAG in .env to that previous tag
#   3. Restarts services with the old images
#
# For registry-based deploys (GitHub Actions), images are tagged with git SHA.
# For local builds, use the "previous" image (tagged :<previous> by this script).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --env-file) ENV_FILE="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env file not found at $ENV_FILE"
    exit 1
fi

set -a; source "$ENV_FILE"; set +a
cd "$PROJECT_ROOT"

REGISTRY="${REGISTRY:-mypresc}"
CURRENT_TAG="${IMAGE_TAG:-latest}"

echo "────────────────────────────────────────────────"
echo "  MyPresc Deploy — Rollback"
echo "  Registry: ${REGISTRY}"
echo "  Current:  ${CURRENT_TAG}"
echo "────────────────────────────────────────────────"

# Find the previous tag for the backend image (use as reference)
PREVIOUS_TAG="$(docker images "${REGISTRY}/backend" --format "{{.Tag}}" \
    | grep -v "^${CURRENT_TAG}$" \
    | head -1)"

if [ -z "$PREVIOUS_TAG" ]; then
    echo "ERROR: No previous image found for ${REGISTRY}/backend"
    echo "Available tags:"
    docker images "${REGISTRY}/backend" --format "{{.Tag}}"
    exit 1
fi

echo "Rolling back: ${CURRENT_TAG} → ${PREVIOUS_TAG}"
echo ""
read -r -p "Confirm rollback? [y/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Rollback cancelled."
    exit 0
fi

# Save current tag as a backup label
docker tag "${REGISTRY}/backend:${CURRENT_TAG}"  "${REGISTRY}/backend:rollback-from-${CURRENT_TAG}"  2>/dev/null || true
docker tag "${REGISTRY}/frontend:${CURRENT_TAG}" "${REGISTRY}/frontend:rollback-from-${CURRENT_TAG}" 2>/dev/null || true
docker tag "${REGISTRY}/nginx:${CURRENT_TAG}"    "${REGISTRY}/nginx:rollback-from-${CURRENT_TAG}"    2>/dev/null || true

# Update IMAGE_TAG in .env
sed -i.bak "s/^IMAGE_TAG=.*/IMAGE_TAG=${PREVIOUS_TAG}/" "$ENV_FILE"
echo "[rollback] Updated IMAGE_TAG to: ${PREVIOUS_TAG}"

# Restart services
echo "[rollback] Restarting services with tag ${PREVIOUS_TAG}..."
docker compose --env-file "$ENV_FILE" up -d --remove-orphans

# Health check
echo "[rollback] Waiting for services to become healthy..."
sleep 15
docker compose --env-file "$ENV_FILE" ps

echo ""
echo "Rollback complete. Rolled back to: ${PREVIOUS_TAG}"
echo "If the rollback is stable, remove backup labels:"
echo "  docker rmi ${REGISTRY}/backend:rollback-from-${CURRENT_TAG}"
