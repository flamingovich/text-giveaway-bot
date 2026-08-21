#!/bin/bash
# Сжимает нарезанные pm2 логи и держит их количество в узде.
#
# pm2-logrotate умеет резать, но его собственное сжатие не срабатывает
# (настройка сохраняется, файлы остаются несжатыми). Девять мегабайт вчерашнего
# лога — не авария, просто мусор, который копится.
set -euo pipefail

LOG_DIR="${LOG_DIR:-/opt/giveaway-bot/.pm2/logs}"
KEEP="${KEEP_ROTATED:-7}"

shopt -s nullglob

before="$(du -sk "${LOG_DIR}" | cut -f1)"

for file in "${LOG_DIR}"/*__*.log; do
  gzip -9 -- "${file}" || true
done

# pm2-logrotate считает только те файлы, которые узнаёт по имени; после сжатия
# он их больше не видит, поэтому ограничение приходится держать здесь.
for base in $(ls -1 "${LOG_DIR}"/*__*.log.gz 2>/dev/null | sed -E 's|.*/||; s|__.*||' | sort -u); do
  ls -1t "${LOG_DIR}/${base}__"*.log.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
done

after="$(du -sk "${LOG_DIR}" | cut -f1)"
echo "[$(date -Is)] логи: ${before} КБ -> ${after} КБ, архивов $(ls -1 "${LOG_DIR}"/*__*.log.gz 2>/dev/null | wc -l)"
