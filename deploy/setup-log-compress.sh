#!/bin/bash
# Ставит ежечасное сжатие нарезанных логов.
#   sudo bash /opt/giveaway-bot/deploy/setup-log-compress.sh
set -euo pipefail

APP_DIR="/opt/giveaway-bot"
APP_USER="giveaway"

cat > /etc/systemd/system/giveaway-log-compress.service <<UNIT
[Unit]
Description=Compress rotated pm2 logs for giveaway-bot

[Service]
Type=oneshot
User=${APP_USER}
ExecStart=/bin/bash ${APP_DIR}/scripts/compress-logs.sh
StandardOutput=append:/var/log/giveaway-log-compress.log
StandardError=append:/var/log/giveaway-log-compress.log
UNIT

cat > /etc/systemd/system/giveaway-log-compress.timer <<UNIT
[Unit]
Description=Compress rotated pm2 logs hourly

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now giveaway-log-compress.timer
systemctl list-timers giveaway-log-compress.timer --no-pager | sed -n '2p'
