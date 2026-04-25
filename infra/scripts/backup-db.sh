#!/bin/bash
# backup-db.sh — Create a timestamped SQLite backup and rotate old ones.
# Idempotent: safe to run as a daily cron job.
# Usage: ./infra/scripts/backup-db.sh [--env-file /path/to/.env]
#
# Cron example (daily at 3am):
#   0 3 * * * /path/to/repo/infra/scripts/backup-db.sh >> /var/log/mypresc-backup.log 2>&1
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

if [ -f "$ENV_FILE" ]; then
    set -a; source "$ENV_FILE"; set +a
fi

BACKUP_DIR="${BACKUP_DIR:-/opt/mypresc/backups}"
RETENTION="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/metrics-history_${TIMESTAMP}.db"
VOLUME_NAME="mypresc_sqlite_data"

echo "[backup] Starting backup at $(date)"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Use SQLite online backup via a temporary container reading the named volume
# The backend's SQLite file is at /data/metrics-history.db inside the volume
docker run --rm \
    -v "${VOLUME_NAME}:/data:ro" \
    -v "${BACKUP_DIR}:/backups" \
    alpine/sqlite \
    sh -c "sqlite3 /data/metrics-history.db '.backup /backups/metrics-history_${TIMESTAMP}.db'"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "[backup] ERROR: Backup file not created at $BACKUP_FILE"
    exit 1
fi

BACKUP_SIZE="$(du -sh "$BACKUP_FILE" | cut -f1)"
echo "[backup] Created: $BACKUP_FILE ($BACKUP_SIZE)"

# Rotate: delete backups older than RETENTION days
DELETED=0
while IFS= read -r -d '' OLD_FILE; do
    rm -f "$OLD_FILE"
    echo "[backup] Deleted old backup: $OLD_FILE"
    DELETED=$((DELETED + 1))
done < <(find "$BACKUP_DIR" -name "metrics-history_*.db" -mtime "+${RETENTION}" -print0)

echo "[backup] Rotation complete. Deleted $DELETED file(s) older than ${RETENTION} days."
echo "[backup] Current backups in $BACKUP_DIR:"
ls -lh "${BACKUP_DIR}/metrics-history_"*.db 2>/dev/null || echo "  (none)"
echo "[backup] Done at $(date)"
