#!/bin/bash
# Backup SQLite DB and uploads for giveaway-bot.
# Usage: bash scripts/backup-data.sh
# Cron example (every 6 hours):
#   0 */6 * * * root bash /opt/giveaway-bot/scripts/backup-data.sh >> /var/log/giveaway-backup.log 2>&1

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/giveaway-bot}"
BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/backups}"
KEEP_HOURLY="${KEEP_HOURLY:-28}"
KEEP_DAILY="${KEEP_DAILY:-14}"
TIMESTAMP="$(date +%Y%m%d-%H%M)"
DAILY_STAMP="$(date +%Y%m%d)"

mkdir -p "${BACKUP_DIR}/hourly" "${BACKUP_DIR}/daily"

DB_FILE="${APP_DIR}/data/giveaway.db"
UPLOADS_DIR="${APP_DIR}/data/uploads"

if [[ -f "${DB_FILE}" ]]; then
  BACKUP_DB="${BACKUP_DIR}/hourly/giveaway-${TIMESTAMP}.db"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "${DB_FILE}" ".backup '${BACKUP_DB}'"
  else
    node "${APP_DIR}/scripts/backup-sqlite.js" "${DB_FILE}" "${BACKUP_DB}"
  fi
  cp "${BACKUP_DB}" "${BACKUP_DIR}/daily/giveaway-${DAILY_STAMP}.db"
  echo "[$(date -Is)] sqlite backup ok: giveaway-${TIMESTAMP}.db"
else
  echo "[$(date -Is)] sqlite db not found, backing up JSON files"
  tar -czf "${BACKUP_DIR}/hourly/json-data-${TIMESTAMP}.tar.gz" -C "${APP_DIR}" data/*.json 2>/dev/null || true
fi

if [[ -d "${UPLOADS_DIR}" ]]; then
  tar -czf "${BACKUP_DIR}/hourly/uploads-${TIMESTAMP}.tar.gz" -C "${APP_DIR}/data" uploads
  echo "[$(date -Is)] uploads backup ok: uploads-${TIMESTAMP}.tar.gz"
fi

ls -1t "${BACKUP_DIR}/hourly"/*.db "${BACKUP_DIR}/hourly"/*.tar.gz 2>/dev/null | tail -n +"$((KEEP_HOURLY + 1))" | xargs -r rm -f
ls -1t "${BACKUP_DIR}/daily"/*.db 2>/dev/null | tail -n +"$((KEEP_DAILY + 1))" | xargs -r rm -f

echo "[$(date -Is)] backup finished"
