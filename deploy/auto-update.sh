#!/usr/bin/env bash
# =============================================================================
#  sevinchim.uz — GitHub'дан автоматик янгилаш (systemd таймери ҳар 5 дақиқада)
#
#  1. GitHub'да янги коммит борми — текширади.
#  2. Янги версия АЛОҲИДА папкада йиғилади; ишлаб турган сайтга тегилмайди.
#     Йиғиш хато берса — сайт ўзгармайди, Telegram'га хабар.
#  3. Эфир ёзилаётган бўлса — ёзув тугашини кутади (сайт қайта ишга тушса
#     ёзув узилиб қолади).
#  4. Папкалар бир лаҳзада алмаштирилади, сайт қайта ишга туширилади.
#     Очилмаса — олдинги версия дарҳол қайтарилади.
#  5. Инфратузилма (nginx, systemd) setup.sh орқали янгиланади (йиғишсиз).
#
#  Журнал:  sudo journalctl -u sevinchim-update -n 100
#  Қўлда:   sudo systemctl start sevinchim-update
# =============================================================================

# Скрипт git орқали ўзгариши мумкин — нусхасидан ишлаймиз
if [ -z "${SV_AU_COPY:-}" ]; then
  tmp=$(mktemp /tmp/sv-auto-update.XXXXXX)
  cp "$0" "$tmp"
  SV_AU_COPY=1 exec bash "$tmp" "$@"
fi
trap 'rm -f "$0"' EXIT
set -uo pipefail

APP_DIR="${APP_DIR:-/var/www/sevinchim-uz}"
BRANCH="${BRANCH:-main}"
NEXT_DIR="$APP_DIR.next-release"
PREV_DIR="$APP_DIR.prev"
SERVICE="${SERVICE:-sevinchim}"
WAIT_REC_MAX="${WAIT_REC_MAX:-21600}" # ёзув тугашини энг кўпи 6 соат кутамиз

log() { echo "[$(date '+%F %T')] $*"; }

# Бир вақтда фақат битта янгилаш
exec 9>/tmp/sevinchim-update.lock
flock -n 9 || { log "Бошқа янгилаш кетяпти — ўтказиб юборилди"; exit 0; }

APP_USER=$(stat -c %U "$APP_DIR")
as_user() { if [ "$(id -un)" = "$APP_USER" ]; then "$@"; else sudo -u "$APP_USER" -H "$@"; fi; }
envval() { grep -E "^$1=" "$APP_DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2- | sed "s/^'//; s/'$//"; }
DATA_DIR=$(envval DATA_DIR); DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
TG_API=$(envval TELEGRAM_API_BASE); TG_API="${TG_API:-https://api.telegram.org}"
FAILED_MARK="$DATA_DIR/.update-failed"

# Telegram'га хабар (бот уланган бўлса)
notify() {
  python3 - "$DATA_DIR/telegram.json" "$TG_API" "$1" <<'PY' || true
import json, sys, urllib.request
path, api, text = sys.argv[1], sys.argv[2].rstrip("/"), sys.argv[3]
try:
    s = json.load(open(path))
except Exception:
    sys.exit(0)
for a in s.get("admins", []):
    body = json.dumps({"chat_id": a["id"], "text": text, "parse_mode": "HTML"}).encode()
    req = urllib.request.Request(f"{api}/bot{s['token']}/sendMessage", body, {"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=15).read()
    except Exception as e:
        print("telegram:", e, file=sys.stderr)
PY
}

recording_active() { [ -f "$DATA_DIR/recording.json" ] || [ -f "$DATA_DIR/recording-fm90.json" ]; }
healthy() {
  local code=000
  for _ in $(seq 1 60); do
    code=$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || true)
    [ "$code" = 200 ] && return 0
    sleep 1
  done
  return 1
}

# ---------------------------------------------------------------- 1. Текшириш
as_user git -C "$APP_DIR" fetch -q origin "$BRANCH" || { log "GitHub'га уланиб бўлмади"; exit 0; }
OLD=$(as_user git -C "$APP_DIR" rev-parse HEAD)
NEW=$(as_user git -C "$APP_DIR" rev-parse "origin/$BRANCH")
[ "$OLD" = "$NEW" ] && exit 0
if [ "$(cat "$FAILED_MARK" 2>/dev/null)" = "$NEW" ]; then
  log "Бу коммит аввал йиғилмаган (${NEW:0:7}) — янги коммит кутилмоқда"
  exit 0
fi
MSG=$(as_user git -C "$APP_DIR" log -1 --format=%s "$NEW")
log "Янги версия: ${OLD:0:7} → ${NEW:0:7} — $MSG"

# ------------------------------------------------- 2. Алоҳида папкада йиғиш
rm -rf "$NEXT_DIR"
cp -a "$APP_DIR" "$NEXT_DIR"
cd "$NEXT_DIR"
as_user git reset -q --hard "$NEW"
BUILD_LOG=/tmp/sevinchim-auto-build.log
if ! (
  set -e
  # Пакетлар рўйхати ўзгарган бўлсагина қайта ўрнатамиз (тезроқ)
  if ! as_user git diff --quiet "$OLD" "$NEW" -- package.json package-lock.json; then
    as_user npm ci --no-audit --no-fund --loglevel=error
  fi
  as_user npm run build --silent
) >"$BUILD_LOG" 2>&1; then
  log "Йиғишда хатолик — сайт ўзгармади"
  tail -30 "$BUILD_LOG"
  cd /; rm -rf "$NEXT_DIR"
  echo "$NEW" > "$FAILED_MARK"
  err=$(tail -5 "$BUILD_LOG" | sed 's/[<>&]//g' | cut -c1-300)
  notify "❌ <b>Сайтни янгилаб бўлмади</b> (йиғишда хато)
${MSG}

Сайт олдинги версияда ишлашда давом этяпти.
<code>${err}</code>"
  exit 1
fi
log "Йиғилди"

# --------------------------------------------- 3. Эфир ёзуви тугашини кутиш
waited=0
while recording_active; do
  [ "$waited" = 0 ] && log "Эфир ёзилмоқда — ёзув тугашини кутяпмиз"
  sleep 30; waited=$((waited + 30))
  if [ "$waited" -ge "$WAIT_REC_MAX" ]; then
    log "Ёзув жуда узоқ давом этяпти — янгилаш кейинги текширувга қолдирилди"
    cd /; rm -rf "$NEXT_DIR"; exit 0
  fi
done

# ------------------------------------------ 4. Алмаштириш ва текшириш
cd /
rm -rf "$PREV_DIR"
mv "$APP_DIR" "$PREV_DIR" && mv "$NEXT_DIR" "$APP_DIR"
systemctl restart "$SERVICE"
if ! healthy; then
  log "Янги версия очилмади — олдинги версия қайтарилмоқда"
  rm -rf "$APP_DIR.failed"
  mv "$APP_DIR" "$APP_DIR.failed" && mv "$PREV_DIR" "$APP_DIR"
  systemctl restart "$SERVICE"
  echo "$NEW" > "$FAILED_MARK"
  notify "❌ <b>Сайтни янгилаб бўлмади</b> (янги версия ишга тушмади)
${MSG}

Олдинги версия тикланди, сайт ишлаяпти."
  exit 1
fi
rm -f "$FAILED_MARK"

# ------------------------- 5. Инфратузилмани янгилаш (nginx, systemd) — йиғишсиз
QUICK=1 SKIP_BUILD=1 PIN_COMMIT="$NEW" APP_DIR="$APP_DIR" BRANCH="$BRANCH" APP_USER="$APP_USER" \
  bash "$APP_DIR/deploy/setup.sh" > /tmp/sevinchim-auto-setup.log 2>&1 \
  || { log "setup.sh огоҳлантириши:"; tail -15 /tmp/sevinchim-auto-setup.log; }
healthy || log "Огоҳлантириш: setup.sh дан кейин сайт жавоб бермаяпти"

log "Тайёр: ${NEW:0:7}"
notify "🔄 <b>Сайт янгиланди</b>
${MSG}"
