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
#  APP_USER, ADMIN_PASSWORD (сўралмаслиги учун).
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

# -----------------------------------------------------------------------------
step "4/8 Сайт коди"
$SUDO mkdir -p "$APP_DIR" "$DATA_DIR"
$SUDO chown "$APP_USER": "$APP_DIR" "$DATA_DIR"
if [ -d "$APP_DIR/.git" ]; then
  # Серверадаги нусха доим GitHub'дагига тенглаштирилади
  # (.env git'да кузатилмайди, у сақланади)
  as_user git -C "$APP_DIR" fetch -q origin "$BRANCH"
  as_user git -C "$APP_DIR" checkout -q -B "$BRANCH" "origin/$BRANCH"
  as_user git -C "$APP_DIR" reset -q --hard "origin/$BRANCH"
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
as_user npm ci --no-audit --no-fund --loglevel=error
as_user npm run build --silent >/tmp/sevinchim-build.log 2>&1 \
  || { tail -30 /tmp/sevinchim-build.log; die "Йиғишда хатолик (тўлиқ журнал: /tmp/sevinchim-build.log)"; }
ok "Сайт йиғилди"

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

# -----------------------------------------------------------------------------
step "8/8 Nginx ва HTTPS"
CF_CERT="/etc/ssl/cloudflare/$DOMAIN.pem"
CF_KEY="/etc/ssl/cloudflare/$DOMAIN.key"
if $SUDO test -s "$CF_CERT" && $SUDO test -s "$CF_KEY"; then
  CERT="$CF_CERT"; KEY="$CF_KEY"; SSL_MODE="Full (strict)"
  ok "Cloudflare Origin сертификати ишлатилади"
else
  CERT="/etc/ssl/sevinchim/$DOMAIN.crt"; KEY="/etc/ssl/sevinchim/$DOMAIN.key"; SSL_MODE="Full"
  if ! $SUDO test -s "$CERT"; then
    $SUDO mkdir -p /etc/ssl/sevinchim
    $SUDO openssl req -x509 -nodes -newkey rsa:2048 -days 3650 -subj "/CN=$DOMAIN" \
      -addext "subjectAltName=DNS:$DOMAIN,DNS:www.$DOMAIN" \
      -keyout "$KEY" -out "$CERT" >/dev/null 2>&1
    $SUDO chmod 600 "$KEY"
  fi
  ok "Ўз-ўзига имзоланган сертификат (Cloudflare «Full» режими учун)"
fi

# Cloudflare орқасида тингловчининг ҳақиқий IP манзили
cf_ips=$( { curl -fsS --max-time 15 https://www.cloudflare.com/ips-v4 || true; echo; \
            curl -fsS --max-time 15 https://www.cloudflare.com/ips-v6 || true; echo; } \
          | grep -E '^[0-9a-fA-F:.]+/[0-9]+$' || true)
if [ -n "$cf_ips" ]; then
  { printf '%s\n' "$cf_ips" | sed 's/.*/set_real_ip_from &;/'; echo 'real_ip_header CF-Connecting-IP;'; } \
    | $SUDO tee /etc/nginx/conf.d/cloudflare-realip.conf >/dev/null
  ok "Cloudflare IP рўйхати қўшилди"
else
  warn "Cloudflare IP рўйхатини юклаб бўлмади — кейин скриптни қайта ишга туширинг"
fi

# Серверда IPv6 ўчирилган бўлса, «listen [::]» қаторларини олиб ташлаймиз
ipv6_filter='s/^\(.*listen \[::\].*\)$/\1/'
[ -f /proc/net/if_inet6 ] || ipv6_filter='/listen \[::\]/d'
sed -e "s|__DOMAIN__|$DOMAIN|g" -e "s|__CERT__|$CERT|g" -e "s|__KEY__|$KEY|g" -e "$ipv6_filter" \
  "$APP_DIR/deploy/nginx.conf.template" | $SUDO tee "/etc/nginx/sites-available/$DOMAIN" >/dev/null
$SUDO ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
$SUDO rm -f /etc/nginx/sites-enabled/default
$SUDO nginx -t -q || die "Nginx конфигурациясида хато"
$SUDO systemctl enable nginx >/dev/null 2>&1 || true
$SUDO systemctl reload nginx 2>/dev/null || $SUDO systemctl restart nginx
code=$(curl -sk --noproxy '*' -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" || true)
[ "$code" = 200 ] || die "Nginx орқали сайт очилмади (HTTP $code)"
ok "Nginx орқали HTTPS ишлаяпти"

# -----------------------------------------------------------------------------
IP=$(curl -fsS4 --max-time 10 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
cat <<EOF

$(printf '\033[1;32m')Тайёр! Сервер созланди.$(printf '\033[0m')

Сервер IP манзили:  $IP

Cloudflare'да (dash.cloudflare.com → $DOMAIN):
  1. DNS → Records:
       A   @     $IP   (Proxied, тўқ сариқ булут)
       A   www   $IP   (Proxied)
  2. SSL/TLS → Overview → режим: $SSL_MODE
  3. SSL/TLS → Edge Certificates → Always Use HTTPS: ёқилган

Кейин:  https://$DOMAIN        Админ-панел:  https://$DOMAIN/admin

Сайтни янгилаш учун шу скриптни қайта ишга туширинг.
EOF
