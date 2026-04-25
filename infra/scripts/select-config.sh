#!/bin/sh
# Selects the nginx config (ssl or nossl), runs envsubst, writes to conf.d/app.conf
# Called by Docker entrypoint at container startup.
set -e

CONFIG="${NGINX_CONFIG:-ssl}"
TEMPLATE_DIR="/etc/nginx/app-templates"
TEMPLATE="${TEMPLATE_DIR}/app-${CONFIG}.conf"
OUTPUT="/etc/nginx/conf.d/app.conf"

if [ -z "${DOMAIN}" ]; then
    echo "[select-config] ERROR: DOMAIN environment variable is not set." >&2
    exit 1
fi

if [ ! -f "$TEMPLATE" ]; then
    echo "[select-config] ERROR: Template '$TEMPLATE' not found." >&2
    echo "[select-config] Available templates:" >&2
    ls "${TEMPLATE_DIR}" >&2
    exit 1
fi

# Only substitute our custom variables — nginx's $host, $uri, etc. are lowercase
# and not in the environment, so envsubst leaves them untouched.
envsubst '${DOMAIN} ${BACKEND_PORT}' < "$TEMPLATE" > "$OUTPUT"

echo "[select-config] Config: ${CONFIG} | Domain: ${DOMAIN} | Backend port: ${BACKEND_PORT:-3001}"
