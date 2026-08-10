#!/usr/bin/env bash
# Щоденне очищення parsed_photos на VPS (system cron).
# Дублює APScheduler job cleanup_parsed_photos — зручно як резерв або без aiogram-бота.
#
# crontab -e:
#   30 3 * * * /path/to/AllYouNeed/bot/scripts/cron_cleanup_parsed_photos.sh
#
set -euo pipefail

BOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$BOT_DIR"

if [[ -f "$BOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$BOT_DIR/.env"
  set +a
fi

LOG_DIR="$BOT_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/parsed_photos_cleanup.log"

DAYS="${PARSER_PHOTOS_CLEANUP_DAYS:-7}"
PUBLIC="${PARSER_PHOTOS_CLEANUP_PUBLIC:-0}"
EXTRA=()
if [[ "$PUBLIC" == "1" || "$PUBLIC" == "true" || "$PUBLIC" == "yes" ]]; then
  EXTRA+=(--public)
fi

{
  echo "=== $(date -Iseconds) cleanup parsed_photos (days=$DAYS, надто старі) ==="
  python3 -m parser.scripts.cleanup_parsed_photos -v --days "$DAYS" "${EXTRA[@]}"
  echo
} >>"$LOG_FILE" 2>&1
