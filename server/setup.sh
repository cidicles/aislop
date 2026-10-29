#!/usr/bin/env bash
# Idempotent server setup for aislop.cloud; safe to re-run any time.
# `node deploy.js --infra` syncs C:\sites\aislop\server\ over /srv/aislop and then runs this.
set -euo pipefail
ROOT=/srv/aislop
CADDY_IMAGE=caddy:2-alpine

mkdir -p "$ROOT"/{projects,tmp,caddy/projects,www/thumbs}
chmod 755 "$ROOT/bin/aislop"
ln -sf "$ROOT/bin/aislop" /usr/local/bin/aislop

# The droplet has ~460 MB of RAM and no swap, so a docker build (npm ci) can get OOM-killed.
if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  [ -f /swapfile ] || { fallocate -l 1G /swapfile; chmod 600 /swapfile; mkswap /swapfile >/dev/null; }
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "enabled 1G swap"
fi

# Write routes + projects.json first, so the config below can validate.
aislop rebuild --no-reload

# Caddy: host network (so it reaches containers on 127.0.0.1), certificates in the
# caddy_data/caddy_config volumes, config and static sites read-only from /srv/aislop.
# Only recreate the container if it isn't set up that way yet; otherwise hot-reload.
if docker inspect caddy --format '{{range .Mounts}}{{.Destination}} {{end}}' 2>/dev/null | grep -qw "$ROOT"; then
  aislop rebuild
else
  echo "(re)creating the caddy container"
  docker run --rm -v "$ROOT:$ROOT:ro" "$CADDY_IMAGE" caddy validate --config "$ROOT/caddy/Caddyfile" --adapter caddyfile
  docker rm -f caddy >/dev/null 2>&1 || true
  docker run -d --name caddy --network host --restart unless-stopped \
    -v caddy_data:/data -v caddy_config:/config -v "$ROOT:$ROOT:ro" \
    "$CADDY_IMAGE" caddy run --config "$ROOT/caddy/Caddyfile" --adapter caddyfile >/dev/null
fi
echo "setup ok: $(find "$ROOT/projects" -mindepth 1 -maxdepth 1 -type d | wc -l) project(s)"
