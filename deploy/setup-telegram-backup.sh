#!/bin/bash
# Ставит отправку зашифрованных копий базы в Telegram каждые 3 часа.
#   sudo bash /opt/giveaway-bot/deploy/setup-telegram-backup.sh
set -euo pipefail

APP_DIR="/opt/giveaway-bot"
APP_USER="giveaway"
ENV_FILE="${APP_DIR}/.env"

if [ ! -f "${ENV_FILE}" ]; then
  echo "Не найден ${ENV_FILE}" >&2
  exit 1
fi

# The passphrase is generated here and never printed: it must not travel through
# a terminal transcript or a chat. Reading it back is a deliberate second step.
if grep -q "^BACKUP_PASSPHRASE=" "${ENV_FILE}"; then
  echo "  пароль уже задан — оставляю как есть"
else
  PASS="$(openssl rand -base64 33 | tr -d '\n/+=' | cut -c1-40)"
  printf '\nBACKUP_PASSPHRASE=%s\n' "${PASS}" >> "${ENV_FILE}"
  unset PASS
  echo "  пароль сгенерирован и записан в .env"
fi
chown "${APP_USER}:${APP_USER}" "${ENV_FILE}"
chmod 600 "${ENV_FILE}"

cat > /etc/systemd/system/giveaway-tg-backup.service <<UNIT
[Unit]
Description=Encrypted RollerBot database backup to Telegram
After=network-online.target

[Service]
Type=oneshot
User=${APP_USER}
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node ${APP_DIR}/scripts/backup-to-telegram.js
UNIT

cat > /etc/systemd/system/giveaway-tg-backup.timer <<UNIT
[Unit]
Description=Send an encrypted database backup to Telegram every 3 hours

[Timer]
OnCalendar=*-*-* 00/3:07:00
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now giveaway-tg-backup.timer
echo "  таймер включён:"
systemctl list-timers giveaway-tg-backup.timer --no-pager | sed -n '2p'
echo
echo "  ВАЖНО: пароль лежит в ${ENV_FILE}. Прочитать и сохранить его себе:"
echo "    sudo grep '^BACKUP_PASSPHRASE=' ${ENV_FILE}"
echo "  Без него копии расшифровать нельзя."
