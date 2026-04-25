#!/bin/bash
# init-ssl.sh — Obtain the first Let's Encrypt SSL certificate.
# Run this ONCE after the first deploy (with NGINX_CONFIG=nossl).
# Idempotent: safe to re-run (certbot skips if cert is already valid).
# Usage: ./infra/scripts/init-ssl.sh [--dry-run] [--env-file /path/to/.env]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"
DRY_RUN=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run) DRY_RUN="--dry-run"; shift ;;
        --env-file) ENV_FILE="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env file not found at $ENV_FILE"
    exit 1
fi

set -a; source "$ENV_FILE"; set +a

for VAR in DOMAIN CERTBOT_EMAIL; do
    if [ -z "${!VAR:-}" ]; then
        echo "ERROR: $VAR is not set in $ENV_FILE"
        exit 1
    fi
done

cd "$PROJECT_ROOT"

echo "────────────────────────────────────────────────"
echo "  MyPresc Deploy — SSL Certificate Init"
echo "  Domain:  ${DOMAIN}"
echo "  Email:   ${CERTBOT_EMAIL}"
if [ -n "$DRY_RUN" ]; then
    echo "  Mode:    DRY RUN (no certificate issued)"
fi
echo "────────────────────────────────────────────────"

# Step 1: Make sure nginx is running in HTTP-only mode
echo "[1/4] Switching nginx to HTTP-only mode (for ACME challenge)..."
sed -i.bak 's/^NGINX_CONFIG=.*/NGINX_CONFIG=nossl/' "$ENV_FILE"
docker compose --env-file "$ENV_FILE" up -d nginx
sleep 5

# Step 2: Verify nginx is serving port 80
echo "[2/4] Verifying nginx is reachable on port 80..."
if ! curl -sf --max-time 10 "http://${DOMAIN}/healthz" > /dev/null 2>&1; then
    echo "WARNING: http://${DOMAIN}/healthz not reachable."
    echo "  - Check DNS: dig +short ${DOMAIN}"
    echo "  - Check firewall: port 80 must be open"
    echo "  - Continuing anyway (certbot will verify independently)..."
fi

# Step 3: Request the certificate
echo "[3/4] Requesting certificate from Let's Encrypt..."
docker compose --env-file "$ENV_FILE" run --rm certbot \
    certonly \
    --webroot \
    --webroot-path /var/www/certbot \
    --email "${CERTBOT_EMAIL}" \
    --agree-tos \
    --no-eff-email \
    --domain "${DOMAIN}" \
    ${DRY_RUN}

if [ -n "$DRY_RUN" ]; then
    echo "Dry run complete. No certificate was actually issued."
    exit 0
fi

# Step 4: Switch to SSL mode and reload
echo "[4/4] Certificate obtained. Switching nginx to SSL mode..."
sed -i 's/^NGINX_CONFIG=.*/NGINX_CONFIG=ssl/' "$ENV_FILE"
docker compose --env-file "$ENV_FILE" up -d nginx

sleep 5

echo ""
echo "SSL certificate installed successfully."
echo "Your app is now available at: https://${DOMAIN}"
echo ""
echo "Certificate renews automatically every 12h via the certbot container."
echo "To check renewal: docker compose logs certbot"
