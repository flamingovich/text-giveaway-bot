#!/bin/bash
# Обновление бота с GitHub на сервере
# Запуск: sudo bash /opt/giveaway-bot/deploy/update.sh
set -euo pipefail

APP_DIR="/opt/giveaway-bot"
APP_USER="giveaway"

cd "${APP_DIR}"
sudo -u "${APP_USER}" git -C "${APP_DIR}" pull origin main
BUILD_ID="$(date +%s)"
if grep -q '^JOIN_PAGE_BUILD=' "${APP_DIR}/.env" 2>/dev/null; then
  sudo sed -i "s/^JOIN_PAGE_BUILD=.*/JOIN_PAGE_BUILD=${BUILD_ID}/" "${APP_DIR}/.env"
else
  echo "JOIN_PAGE_BUILD=${BUILD_ID}" | sudo tee -a "${APP_DIR}/.env" >/dev/null
fi
sudo -u "${APP_USER}" npm install --omit=dev
if ! grep -q '^STORAGE_BACKEND=' "${APP_DIR}/.env" 2>/dev/null; then
  echo "STORAGE_BACKEND=sqlite" | sudo tee -a "${APP_DIR}/.env" >/dev/null
fi
cp "${APP_DIR}/deploy/ecosystem.config.cjs" /etc/giveaway-bot.ecosystem.config.cjs
sudo -u "${APP_USER}" pm2 startOrRestart /etc/giveaway-bot.ecosystem.config.cjs
sudo -u "${APP_USER}" pm2 save
echo "Обновлено (giveaway-bot + support-bot + depman-support-bot)."
echo ""
echo "Логи (от пользователя giveaway):"
echo "  sudo -u giveaway pm2 logs giveaway-bot --lines 30 --nostream"
echo "Проверка API:"
echo "  curl -s http://127.0.0.1:30009/api/join/health"
