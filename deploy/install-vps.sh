#!/usr/bin/env bash
# =========================================================================
# Cài app "LtL · Tạm ứng & Hoàn ứng" (bản chính thức) lên VPS Ubuntu/Debian.
# Cách dùng (chạy trên VPS, quyền sudo):
#   curl -fsSL https://raw.githubusercontent.com/LearntoLeap/Hoan-ung-/main/deploy/install-vps.sh | sudo bash -s -- hoanung.learntoleap.vn email@learntoleap.vn
# Tham số 1: tên miền đã trỏ bản ghi A về IP VPS · Tham số 2: email nhận thông báo chứng chỉ HTTPS
# Chạy lại để cập nhật bản mới (git pull) — an toàn.
# =========================================================================
set -euo pipefail
DOMAIN="${1:-}"; MAIL="${2:-}"
DIR=/var/www/ltl-hoan-ung
if [ -z "$DOMAIN" ]; then echo "Thiếu tên miền. VD: sudo bash install-vps.sh hoanung.learntoleap.vn admin@learntoleap.vn"; exit 1; fi

echo "==> Cài nginx, certbot, git"
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx git

echo "==> Lấy / cập nhật code"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone https://github.com/LearntoLeap/Hoan-ung-.git "$DIR"; fi

echo "==> Cấu hình nginx cho $DOMAIN"
CONF=/etc/nginx/sites-available/ltl-hoan-ung
if [ ! -f /etc/letsencrypt/live/"$DOMAIN"/fullchain.pem ]; then
  # chưa có chứng chỉ: tạm chạy HTTP để certbot xác minh tên miền
  cat > "$CONF" <<EOF
server {
  listen 80; listen [::]:80;
  server_name $DOMAIN;
  root $DIR; index index.html;
  location / { try_files \$uri \$uri/ /index.html; }
}
EOF
  ln -sf "$CONF" /etc/nginx/sites-enabled/ltl-hoan-ung
  nginx -t && systemctl reload nginx
  echo "==> Cấp HTTPS (Let's Encrypt)"
  if [ -n "$MAIL" ]; then certbot --nginx -d "$DOMAIN" -m "$MAIL" --agree-tos --non-interactive --redirect
  else certbot --nginx -d "$DOMAIN" --register-unsafely-without-email --agree-tos --non-interactive --redirect; fi
fi
# cấu hình đầy đủ (bảo mật, cache, chặn file nội bộ)
sed "s/hoanung.example.com/$DOMAIN/g; s#/var/www/ltl-hoan-ung#$DIR#g" "$DIR/deploy/nginx-ltl-hoan-ung.conf" > "$CONF"
ln -sf "$CONF" /etc/nginx/sites-enabled/ltl-hoan-ung
nginx -t && systemctl reload nginx

echo ""
echo "XONG: https://$DOMAIN"
echo "Việc còn lại trên Supabase (một lần):"
echo "  1) SQL Editor: chạy toàn bộ supabase/setup.sql"
echo "  2) Authentication → URL Configuration: Site URL = https://$DOMAIN ; Redirect URLs thêm https://$DOMAIN/**"
echo "  3) Authentication → Email: bật Confirm email"
