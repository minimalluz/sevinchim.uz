#!/usr/bin/env bash
# =============================================================================
#  sevinchim.uz — серверни битта буйруқ билан созлаш
#  Ubuntu 22.04 / 24.04: Oracle Cloud, Google Cloud, Hetzner, маҳаллий VPS…
#
#  Ишлатиш (серверда, оддий фойдаланувчи номидан, масалан ubuntu):
#    curl -fsSL https://raw.githubusercontent.com/minimalluz/sevinchim.uz/main/deploy/setup.sh | bash
#
#  Қайта ишга туширилса — сайтни янгилайди (git pull → build → restart),
#  .env ва юкланган аудиолар сақланиб қолади.
#
#  Ихтиёрий ўзгарувчилар: DOMAIN, REPO_URL, BRANCH, APP_DIR, DATA_DIR,
#  APP_USER, ADMIN_PASSWORD (сўралмаслиги учун), SERVER_IP (IP қўлда).
# =============================================================================
set -euo pipefail

DOMAIN="${DOMAIN:-sevinchim.uz}"
REPO_URL="${REPO_URL:-https://github.com/minimalluz/sevinchim.uz.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/var/www/sevinchim-uz}"
DATA_DIR="${DATA_DIR:-/var/lib/sevinchim}"
APP_USER="${APP_USER:-${SUDO_USER:-$(id -un)}}"

if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi

step() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
# Буйруқни сайт эгаси (APP_USER) номидан бажариш
as_user() {
  if [ "$(id -un)" = "$APP_USER" ]; then "$@"; else sudo -u "$APP_USER" -H "$@"; fi
}

[ -r /etc/os-release ] && . /etc/os-release
[ "${ID:-}" = "ubuntu" ] || warn "Скрипт Ubuntu учун ёзилган (сизда: ${PRETTY_NAME:-номаълум})"
id "$APP_USER" >/dev/null 2>&1 || die "Фойдаланувчи топилмади: $APP_USER"

# QUICK=1 — автоматик янгилаш учун: тизим пакетлари, Node.js ва файрвол
# аввалги ўрнатишда созланган, улар ўтказиб юборилади
if [ "${QUICK:-0}" != 1 ]; then
# -----------------------------------------------------------------------------
step "1/8 Тизим пакетлари"
$SUDO env DEBIAN_FRONTEND=noninteractive apt-get update -qq
$SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl git nginx openssl ca-certificates sudo ffmpeg >/dev/null
ok "curl, git, nginx, openssl, ffmpeg"

# 2 ГБ дан кам RAM бўлса (масалан, Google e2-micro) — йиғиш учун swap
mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
if [ "$mem_kb" -lt 2000000 ] && [ -z "$(swapon --show 2>/dev/null)" ]; then
  $SUDO fallocate -l 2G /swapfile && $SUDO chmod 600 /swapfile
  $SUDO mkswap /swapfile >/dev/null && $SUDO swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null
  ok "2 ГБ swap қўшилди (RAM кам)"
fi

# -----------------------------------------------------------------------------
step "2/8 Node.js"
need_node=1
if command -v node >/dev/null 2>&1; then
  if [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; then need_node=0; fi
fi
if [ "$need_node" -eq 1 ]; then
  if [ -n "$SUDO" ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
  else
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  fi
  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs >/dev/null
fi
ok "Node.js $(node -v)"

# -----------------------------------------------------------------------------
step "3/8 Файрвол (80 ва 443 портлар)"
# Oracle Cloud'нинг Ubuntu образида iptables бошқа портларни ёпиб қўяди
if $SUDO iptables -S INPUT 2>/dev/null | grep -q -- '-j REJECT'; then
  for port in 80 443; do
    $SUDO iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null \
      || $SUDO iptables -I INPUT 1 -p tcp -m state --state NEW --dport "$port" -j ACCEPT
  done
  if command -v netfilter-persistent >/dev/null 2>&1; then
    $SUDO netfilter-persistent save >/dev/null 2>&1 || true
  fi
  ok "iptables: 80 ва 443 очилди"
fi
if command -v ufw >/dev/null 2>&1 && $SUDO ufw status 2>/dev/null | grep -q "Status: active"; then
  $SUDO ufw allow OpenSSH >/dev/null && $SUDO ufw allow 'Nginx Full' >/dev/null
  ok "ufw: SSH, 80 ва 443 очилди"
fi
warn "Провайдер панелида ҳам 80 ва 443 очиқ бўлсин (Oracle: VCN → Security List → Ingress Rules)"

fi # QUICK

# -----------------------------------------------------------------------------
step "4/8 Сайт коди"
$SUDO mkdir -p "$APP_DIR" "$DATA_DIR"
$SUDO chown "$APP_USER": "$APP_DIR" "$DATA_DIR"
if [ -d "$APP_DIR/.git" ]; then
  # Серверадаги нусха доим GitHub'дагига тенглаштирилади
  # (.env git'да кузатилмайди, у сақланади)
  as_user git -C "$APP_DIR" fetch -q origin "$BRANCH"
  # PIN_COMMIT — автоматик янгилаш аниқ шу коммитни ўрнатади (йиғилган версия билан мос бўлсин)
  as_user git -C "$APP_DIR" checkout -q -B "$BRANCH" "${PIN_COMMIT:-origin/$BRANCH}"
  as_user git -C "$APP_DIR" reset -q --hard "${PIN_COMMIT:-origin/$BRANCH}"
  ok "Янгиланди: $(as_user git -C "$APP_DIR" log -1 --format='%h %s')"
else
  [ -z "$(ls -A "$APP_DIR")" ] || die "$APP_DIR бўш эмас ва git репозиторий эмас"
  as_user git clone -q --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  ok "Юклаб олинди: $REPO_URL"
fi

# -----------------------------------------------------------------------------
step "5/8 Созламалар (.env)"
ENV_FILE="$APP_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  ok ".env аввалдан бор — ўзгартирилмади"
else
  pass="${ADMIN_PASSWORD:-}"
  valid() { [ "${#1}" -ge 10 ] && ! printf '%s' "$1" | grep -q "[[:space:]'\"\\\\\$\`]"; }
  until valid "$pass"; do
    [ -r /dev/tty ] || die "ADMIN_PASSWORD ўзгарувчисини беринг (камида 10 белги)"
    [ -z "$pass" ] || warn "Парол камида 10 белги бўлсин; бўш жой ва ' \" \\ \$ \` белгиларисиз"
    printf 'Админ-панел учун янги парол ўйлаб топинг: ' >/dev/tty
    read -rs pass </dev/tty
    printf '\n' >/dev/tty
  done
  secret=$(openssl rand -hex 32)
  printf "ADMIN_PASSWORD='%s'\nSESSION_SECRET=%s\nDATA_DIR=%s\nNEXT_PUBLIC_SITE_URL=https://%s\n" \
    "$pass" "$secret" "$DATA_DIR" "$DOMAIN" | as_user tee "$ENV_FILE" >/dev/null
  as_user chmod 600 "$ENV_FILE"
  ok ".env яратилди"
fi

# -----------------------------------------------------------------------------
step "6/8 Йиғиш (2–5 дақиқа)"
cd "$APP_DIR"
if [ "${SKIP_BUILD:-0}" = 1 ]; then
  ok "Йиғиш ўтказиб юборилди (автоматик янгилаш аввал йиққан)"
else
as_user npm ci --no-audit --no-fund --loglevel=error
as_user npm run build --silent >/tmp/sevinchim-build.log 2>&1 \
  || { tail -30 /tmp/sevinchim-build.log; die "Йиғишда хатолик (тўлиқ журнал: /tmp/sevinchim-build.log)"; }
ok "Сайт йиғилди"
fi

# -----------------------------------------------------------------------------
step "7/8 Хизмат (systemd)"
sed -e "s|__USER__|$APP_USER|g" -e "s|__APP_DIR__|$APP_DIR|g" \
  "$APP_DIR/deploy/sevinchim.service.template" | $SUDO tee /etc/systemd/system/sevinchim.service >/dev/null
$SUDO systemctl daemon-reload
$SUDO systemctl enable sevinchim >/dev/null 2>&1
$SUDO systemctl restart sevinchim
code=000
for _ in $(seq 1 40); do
  code=$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || true)
  [ "$code" = 200 ] && break
  sleep 1
done
[ "$code" = 200 ] || die "Сайт ишга тушмади. Журнал: sudo journalctl -u sevinchim -n 50"
ok "Сайт ишлаяпти (127.0.0.1:3000)"

# Автоматик янгилаш: ҳар 5 дақиқада GitHub'ни текширади (AUTO_UPDATE=0 — ўчириш)
if [ "${AUTO_UPDATE:-1}" = 1 ]; then
  $SUDO tee /etc/systemd/system/sevinchim-update.service >/dev/null <<UNIT
[Unit]
Description=sevinchim.uz — GitHub'дан автоматик янгилаш
After=network-online.target

[Service]
Type=oneshot
Environment=APP_DIR=$APP_DIR
Environment=BRANCH=$BRANCH
ExecStart=/bin/bash $APP_DIR/deploy/auto-update.sh
TimeoutStartSec=3600
UNIT
  $SUDO tee /etc/systemd/system/sevinchim-update.timer >/dev/null <<UNIT
[Unit]
Description=sevinchim.uz — ҳар 5 дақиқада янгиланишни текшириш

[Timer]
OnBootSec=3min
OnUnitInactiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
UNIT
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable --now sevinchim-update.timer >/dev/null 2>&1
  ok "Автоматик янгилаш ёқилди (ҳар 5 дақиқада)"
else
  $SUDO systemctl disable --now sevinchim-update.timer >/dev/null 2>&1 || true
fi

# -----------------------------------------------------------------------------
step "8/8 Nginx ва HTTPS"
IP="${SERVER_IP:-$(curl -fsS4 --max-time 10 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')}"
CF_CERT="/etc/ssl/cloudflare/$DOMAIN.pem"
CF_KEY="/etc/ssl/cloudflare/$DOMAIN.key"
LE_DIR="/etc/letsencrypt/live/$DOMAIN"
SELF_CERT="/etc/ssl/sevinchim/$DOMAIN.crt"
SELF_KEY="/etc/ssl/sevinchim/$DOMAIN.key"
ACME_ROOT=/var/www/letsencrypt
$SUDO mkdir -p "$ACME_ROOT"

# Домен (ва www) шу серверга тўғридан-тўғри кўрсатяптими? (Cloudflare прокси бўлса — йўқ)
resolves_here() { [ "$(getent ahostsv4 "$1" 2>/dev/null | awk 'NR==1{print $1}')" = "$IP" ]; }

pick_cert() {
  if $SUDO test -s "$CF_CERT" && $SUDO test -s "$CF_KEY"; then
    CERT="$CF_CERT"; KEY="$CF_KEY"; MODE="cloudflare-strict"
  elif $SUDO test -s "$LE_DIR/fullchain.pem"; then
    CERT="$LE_DIR/fullchain.pem"; KEY="$LE_DIR/privkey.pem"; MODE="direct"
  else
    CERT="$SELF_CERT"; KEY="$SELF_KEY"; MODE="cloudflare"
    if ! $SUDO test -s "$CERT"; then
      $SUDO mkdir -p /etc/ssl/sevinchim
      $SUDO openssl req -x509 -nodes -newkey rsa:2048 -days 3650 -subj "/CN=$DOMAIN" \
        -addext "subjectAltName=DNS:$DOMAIN,DNS:www.$DOMAIN" \
        -keyout "$KEY" -out "$CERT" >/dev/null 2>&1
      $SUDO chmod 600 "$KEY"
    fi
  fi
}

render_nginx() {
  # Серверда IPv6 ўчирилган бўлса, «listen [::]» қаторларини олиб ташлаймиз
  local ipv6_filter='s/^\(.*listen \[::\].*\)$/\1/'
  [ -f /proc/net/if_inet6 ] || ipv6_filter='/listen \[::\]/d'
  sed -e "s|__DOMAIN__|$DOMAIN|g" -e "s|__CERT__|$CERT|g" -e "s|__KEY__|$KEY|g" \
      -e "s|__ACME_ROOT__|$ACME_ROOT|g" -e "$ipv6_filter" \
    "$APP_DIR/deploy/nginx.conf.template" | $SUDO tee "/etc/nginx/sites-available/$DOMAIN" >/dev/null
  $SUDO ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
  $SUDO rm -f /etc/nginx/sites-enabled/default
  $SUDO nginx -t -q || die "Nginx конфигурациясида хато"
  $SUDO systemctl enable nginx >/dev/null 2>&1 || true
  $SUDO systemctl reload nginx 2>/dev/null || $SUDO systemctl restart nginx
}

# Cloudflare орқасида тингловчининг ҳақиқий IP манзили (тўғридан-тўғри режимга зарар қилмайди)
cf_ips=$( { curl -fsS --max-time 15 https://www.cloudflare.com/ips-v4 || true; echo; \
            curl -fsS --max-time 15 https://www.cloudflare.com/ips-v6 || true; echo; } \
          | grep -E '^[0-9a-fA-F:.]+/[0-9]+$' || true)
if [ -n "$cf_ips" ]; then
  { printf '%s\n' "$cf_ips" | sed 's/.*/set_real_ip_from &;/'; echo 'real_ip_header CF-Connecting-IP;'; } \
    | $SUDO tee /etc/nginx/conf.d/cloudflare-realip.conf >/dev/null
fi

pick_cert
render_nginx

# Тўғридан-тўғри режим: Let's Encrypt сертификатини олиш (бир марта; кейин ўзи янгиланади)
if [ "$MODE" = "cloudflare" ] && resolves_here "$DOMAIN"; then
  domains=(-d "$DOMAIN")
  resolves_here "www.$DOMAIN" && domains+=(-d "www.$DOMAIN")
  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot >/dev/null
  if $SUDO certbot certonly --webroot -w "$ACME_ROOT" "${domains[@]}" --non-interactive --agree-tos \
       --register-unsafely-without-email --deploy-hook "systemctl reload nginx" >/tmp/sevinchim-certbot.log 2>&1; then
    pick_cert
    render_nginx
    ok "Let's Encrypt сертификати олинди (ҳар 3 ойда ўзи янгиланади)"
  else
    warn "Let's Encrypt сертификатини олиб бўлмади (журнал: /tmp/sevinchim-certbot.log) — вақтинча ўз-ўзига имзоланган"
  fi
fi

case "$MODE" in
  direct) ok "Режим: тўғридан-тўғри (Let's Encrypt)";;
  cloudflare-strict) ok "Режим: Cloudflare прокси, Origin сертификати";;
  *) ok "Режим: Cloudflare прокси (ўз-ўзига имзоланган сертификат)";;
esac

code=$(curl -sk --noproxy '*' -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" || true)
[ "$code" = 200 ] || die "Nginx орқали сайт очилмади (HTTP $code)"
ok "Nginx орқали HTTPS ишлаяпти"

# -----------------------------------------------------------------------------
if [ "$MODE" = "direct" ]; then
cat <<EOF

$(printf '\033[1;32m')Тайёр! Сайт ишлаяпти: https://$DOMAIN$(printf '\033[0m')

Режим: тўғридан-тўғри (TAS-IX), Let's Encrypt сертификати.
Админ-панел:  https://$DOMAIN/admin

Сайтни янгилаш учун шу скриптни қайта ишга туширинг.
EOF
else
cat <<EOF

$(printf '\033[1;32m')Тайёр! Сервер созланди.$(printf '\033[0m')

Сервер IP манзили:  $IP

DNS (dash.cloudflare.com → $DOMAIN → DNS → Records), икки йўлдан бири:

 A) Тўғридан-тўғри (тавсия, TAS-IX учун тезроқ):
       A   @     $IP   DNS only (кулранг булут)
       A   www   $IP   DNS only (кулранг булут)
    DNS янгилангач, шу скриптни ҚАЙТА ишга туширинг — Let's Encrypt
    сертификати ўзи олинади.

 B) Cloudflare прокси орқали:
       A   @     $IP   Proxied (тўқ сариқ булут)
       A   www   $IP   Proxied
    SSL/TLS → Overview → режим: Full

Админ-панел:  https://$DOMAIN/admin
Сайтни янгилаш учун шу скриптни қайта ишга туширинг.
EOF
fi
