#!/bin/bash
# Установка бота на Ubuntu 20.04+
# Запуск: sudo bash deploy/install.sh

set -euo pipefail

APP_DIR="/opt/giveaway-bot"
APP_USER="giveaway"
NODE_MAJOR=20

echo "==> Обновление системы..."
apt-get update -qq
apt-get install -y curl git nginx ufw

echo "==> Установка Node.js ${NODE_MAJOR}..."
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "${NODE_MAJOR}" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

echo "==> Установка PM2..."
npm install -g pm2

echo "==> Пользователь ${APP_USER}..."
if ! id "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --home "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi

echo "==> Папка приложения..."
mkdir -p "${APP_DIR}/data/uploads"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

if [[ ! -f "${APP_DIR}/.env" ]]; then
  if [[ -f "${APP_DIR}/.env.example" ]]; then
    cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
    echo "Создан ${APP_DIR}/.env — заполните BOT_TOKEN и ADMIN_IDS!"
  else
    echo "ОШИБКА: нет ${APP_DIR}/.env — создайте вручную перед запуском."
    exit 1
  fi
fi

echo "==> npm install..."
cd "${APP_DIR}"
sudo -u "${APP_USER}" npm install --omit=dev

echo "==> PM2..."
cp "${APP_DIR}/deploy/ecosystem.config.cjs" /etc/giveaway-bot.ecosystem.config.cjs
sudo -u "${APP_USER}" pm2 start /etc/giveaway-bot.ecosystem.config.cjs
sudo -u "${APP_USER}" pm2 save
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "${APP_USER}" --hp "${APP_DIR}" | tail -1 | bash || true

echo "==> Nginx..."
cp "${APP_DIR}/deploy/nginx-giveaway-bot.conf" /etc/nginx/sites-available/giveaway-bot
ln -sf /etc/nginx/sites-available/giveaway-bot /etc/nginx/sites-enabled/giveaway-bot
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> Firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "============================================"
echo "  Готово!"
echo "  Панель: http://$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
echo "  Логи:   pm2 logs giveaway-bot"
echo "  Статус: pm2 status"
echo "============================================"
echo ""
echo "Не забудьте отредактировать ${APP_DIR}/.env и перезапустить:"
echo "  nano ${APP_DIR}/.env"
echo "  sudo -u ${APP_USER} pm2 restart giveaway-bot"
