#!/bin/bash
# HTTPS для rollerbot.pro (Let's Encrypt)
# Запуск на сервере: sudo bash /opt/giveaway-bot/deploy/setup-ssl.sh

set -euo pipefail

DOMAIN="rollerbot.pro"
EMAIL="${SSL_EMAIL:-admin@${DOMAIN}}"

apt-get update -qq
apt-get install -y certbot python3-certbot-nginx

certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect

systemctl reload nginx
echo "HTTPS готов: https://${DOMAIN}"
