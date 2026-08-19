#!/bin/bash
# Install a recurring backup job for giveaway-bot (SQLite + uploads).
# Run once on server: sudo bash /opt/giveaway-bot/deploy/setup-backups.sh
#
# Prefers cron when it is actually installed and falls back to a systemd timer.
# The old version only ever dropped a file in /etc/cron.d, which does nothing on
# a host without cron - the backup directory stayed empty and nobody noticed.

set -euo pipefail

APP_DIR="/opt/giveaway-bot"
CRON_FILE="/etc/cron.d/giveaway-bot-backup"
SERVICE_FILE="/etc/systemd/system/giveaway-backup.service"
TIMER_FILE="/etc/systemd/system/giveaway-backup.timer"
LOG_FILE="/var/log/giveaway-backup.log"

mkdir -p "${APP_DIR}/backups/hourly" "${APP_DIR}/backups/daily"
touch "${LOG_FILE}"

have_cron() {
  command -v cron >/dev/null 2>&1 || command -v crond >/dev/null 2>&1
}

cron_running() {
  systemctl is-active --quiet cron 2>/dev/null || systemctl is-active --quiet crond 2>/dev/null
}

install_cron() {
  cat > "${CRON_FILE}" <<EOF
# Giveaway bot backups (SQLite + uploads)
0 */6 * * * root bash ${APP_DIR}/scripts/backup-data.sh >> ${LOG_FILE} 2>&1
EOF
  chmod 644 "${CRON_FILE}"
  echo "Installed ${CRON_FILE}"
}

install_systemd_timer() {
  cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=Giveaway bot backup (SQLite + uploads)
After=network.target

[Service]
Type=oneshot
ExecStart=/bin/bash ${APP_DIR}/scripts/backup-data.sh
StandardOutput=append:${LOG_FILE}
StandardError=append:${LOG_FILE}
EOF

  cat > "${TIMER_FILE}" <<EOF
[Unit]
Description=Giveaway bot backup every 6 hours

[Timer]
OnCalendar=*-*-* 00,06,12,18:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

  rm -f "${CRON_FILE}"
  systemctl daemon-reload
  systemctl enable --now giveaway-backup.timer
  echo "Installed ${TIMER_FILE}"
}

if have_cron && cron_running; then
  install_cron
elif command -v systemctl >/dev/null 2>&1; then
  echo "cron is not available on this host - using a systemd timer instead."
  install_systemd_timer
else
  echo "ERROR: neither cron nor systemd is available - no backup job was installed." >&2
  echo "Schedule 'bash ${APP_DIR}/scripts/backup-data.sh' every 6 hours by hand." >&2
  exit 1
fi

echo "Backups every 6 hours -> ${APP_DIR}/backups/"
echo "Log: ${LOG_FILE}"
echo ""
echo "Run once now to confirm it works:"
echo "  sudo bash ${APP_DIR}/scripts/backup-data.sh"
