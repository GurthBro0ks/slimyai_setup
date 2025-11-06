#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root or via sudo."
  exit 1
fi

APT="apt-get -qq"

echo "[nginx] Installing dependencies..."
$APT update
$APT install -y nginx python3-certbot-nginx

SITE_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/nginx-admin.conf"
SITE_DEST="/etc/nginx/sites-available/admin.slimyai.xyz.conf"

echo "[nginx] Linking site configuration (${SITE_DEST})"
cp "$SITE_SRC" "$SITE_DEST"
ln -sf "$SITE_DEST" /etc/nginx/sites-enabled/admin.slimyai.xyz.conf

mkdir -p /var/www/certbot

echo "[nginx] Reloading nginx"
systemctl enable nginx
systemctl reload nginx

echo "[certbot] Requesting/renewing certificate..."
certbot --nginx -d admin.slimyai.xyz --non-interactive --agree-tos -m admin@slimyai.xyz || true

echo "[nginx] Final reload"
systemctl reload nginx

echo "Done."
