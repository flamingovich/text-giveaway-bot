#!/bin/bash
# Обновление бота с GitHub на сервере
set -euo pipefail
cd /opt/giveaway-bot
git pull origin main
sudo -u giveaway npm install --omit=dev
sudo -u giveaway pm2 restart giveaway-bot
echo "Обновлено."
