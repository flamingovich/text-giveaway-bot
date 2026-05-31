#!/bin/bash
# Обновление бота с GitHub на сервере
# Запуск: sudo bash /opt/giveaway-bot/deploy/update.sh
set -euo pipefail

APP_DIR="/opt/giveaway-bot"
APP_USER="giveaway"

cd "${APP_DIR}"
sudo -u "${APP_USER}" git -C "${APP_DIR}" pull origin main
sudo -u "${APP_USER}" npm install --omit=dev
cp "${APP_DIR}/deploy/ecosystem.config.cjs" /etc/giveaway-bot.ecosystem.config.cjs
sudo -u "${APP_USER}" pm2 startOrRestart /etc/giveaway-bot.ecosystem.config.cjs
sudo -u "${APP_USER}" pm2 save
echo "Обновлено (giveaway-bot + support-bot)."
