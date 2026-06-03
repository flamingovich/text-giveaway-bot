#!/bin/bash
# Install hourly backup cron for giveaway-bot.
# Run once on server: sudo bash /opt/giveaway-bot/deploy/setup-backups.sh

set -euo pipefail

APP_DIR="/opt/giveaway-bot"
CRON_FILE="/etc/cron.d/giveaway-bot-backup"

cat > "${CRON_FILE}" <<EOF
# Giveaway bot backups (SQLite + uploads)
0 */6 * * * root bash ${APP_DIR}/scripts/backup-data.sh >> /var/log/giveaway-backup.log 2>&1
EOF

chmod 644 "${CRON_FILE}"
mkdir -p "${APP_DIR}/backups/hourly" "${APP_DIR}/backups/daily"
touch /var/log/giveaway-backup.log

echo "Installed ${CRON_FILE}"
echo "Backups every 6 hours -> ${APP_DIR}/backups/"
echo "Log: /var/log/giveaway-backup.log"
