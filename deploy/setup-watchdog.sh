#!/bin/bash
# Install the scheduler watchdog. Run once on the server:
#   sudo bash /opt/giveaway-bot/deploy/setup-watchdog.sh
#
# The bot writes a heartbeat file on every scheduler pass. This timer checks how
# old it is, restarts the bot when the scheduler has gone quiet, and reports to
# Telegram. On 20 August the scheduler was dead for two hours before a user
# noticed; this closes that gap to a few minutes.

set -euo pipefail

APP_DIR="/opt/giveaway-bot"
APP_USER="giveaway"
SERVICE_FILE="/etc/systemd/system/giveaway-watchdog.service"
TIMER_FILE="/etc/systemd/system/giveaway-watchdog.timer"
LOG_FILE="/var/log/giveaway-watchdog.log"
INTERVAL="${WATCHDOG_INTERVAL:-3min}"

touch "${LOG_FILE}"
chown "${APP_USER}:${APP_USER}" "${LOG_FILE}" 2>/dev/null || true

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=RollerBot scheduler watchdog
After=network.target

[Service]
Type=oneshot
User=${APP_USER}
WorkingDirectory=${APP_DIR}
# pm2 lives in the user's path; the watchdog restarts the bot through it.
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${APP_DIR}/node_modules/.bin
ExecStart=/usr/bin/env node ${APP_DIR}/scripts/watchdog.js
StandardOutput=append:${LOG_FILE}
StandardError=append:${LOG_FILE}
EOF

cat > "${TIMER_FILE}" <<EOF
[Unit]
Description=Check the RollerBot scheduler every ${INTERVAL}

[Timer]
OnBootSec=2min
OnUnitActiveSec=${INTERVAL}
AccuracySec=15s
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now giveaway-watchdog.timer

echo "Установлено: ${TIMER_FILE}"
echo "Проверка каждые ${INTERVAL}, лог: ${LOG_FILE}"
echo ""
echo "Проверить прямо сейчас, ничего не меняя:"
echo "  sudo -u ${APP_USER} node ${APP_DIR}/scripts/watchdog.js --dry-run"
