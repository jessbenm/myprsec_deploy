#!/bin/bash
# init-ssl.sh — Obtain the first Let's Encrypt SSL certificate.
# Uses DNS-01 validation so it works even when this app does not own ports 80/443.
# Run this ONCE after the first deploy.
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

echo "[1/3] Requesting certificate from Let's Encrypt using DNS-01..."
echo ""
echo "When certbot prompts you, create this TXT record in your DNS zone:"
echo "  _acme-challenge.${DOMAIN}"
echo "It will show the exact TXT value to paste."
echo ""
echo "Certbot will now prompt you to add the TXT record and then continue once DNS is ready."

docker compose --env-file "$ENV_FILE" run --rm certbot \
    certonly \
    --manual \
    --preferred-challenges dns \
    --email "${CERTBOT_EMAIL}" \
    --agree-tos \
    --no-eff-email \
    --domain "${DOMAIN}" \
    ${DRY_RUN}

if [ -n "$DRY_RUN" ]; then
    echo "Dry run complete. No certificate was actually issued."
    exit 0
fi

# Step 2: Switch to SSL mode and reload
echo "[2/3] Certificate obtained. Switching nginx to SSL mode..."
sed -i 's/^NGINX_CONFIG=.*/NGINX_CONFIG=ssl/' "$ENV_FILE"
docker compose --env-file "$ENV_FILE" up -d nginx

sleep 5

echo ""
echo "SSL certificate installed successfully."
echo "Your app is now available at: https://${DOMAIN}:${HTTPS_PORT:-8444}"
echo ""
echo "This certificate was issued with DNS-01 validation."
echo "To renew later, re-run this script and update the TXT record when prompted."
