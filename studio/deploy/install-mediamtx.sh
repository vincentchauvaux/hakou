#!/usr/bin/env bash
# Installe / met à jour MediaMTX sur le VPS (root).
set -euo pipefail

MTX_VERSION="${MTX_VERSION:-v1.19.3}"
INSTALL_DIR=/opt/mediamtx
CONFIG_SRC="$(cd "$(dirname "$0")" && pwd)/mediamtx.yml"
PUBLISH_PASS="${MEDIAMTX_PUBLISH_PASS:?MEDIAMTX_PUBLISH_PASS requis}"
API_PASS="${MEDIAMTX_API_PASS:?MEDIAMTX_API_PASS requis}"

mkdir -p "$INSTALL_DIR"
cd /tmp
curl -fsSL -o mediamtx.tgz \
  "https://github.com/bluenviron/mediamtx/releases/download/${MTX_VERSION}/mediamtx_${MTX_VERSION}_linux_amd64.tar.gz"
tar -xzf mediamtx.tgz mediamtx
install -m 755 mediamtx "$INSTALL_DIR/mediamtx"
rm -f mediamtx.tgz mediamtx

# Config avec secrets injectés
sed \
  -e "s/CHANGE_ME_PUBLISH_PASS/${PUBLISH_PASS//\//\\/}/g" \
  -e "s/CHANGE_ME_API_PASS/${API_PASS//\//\\/}/g" \
  "$CONFIG_SRC" > "$INSTALL_DIR/mediamtx.yml"
chmod 600 "$INSTALL_DIR/mediamtx.yml"

cat >/etc/systemd/system/mediamtx.service <<'EOF'
[Unit]
Description=MediaMTX (Hakou WHIP/HLS)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/mediamtx
ExecStart=/opt/mediamtx/mediamtx /opt/mediamtx/mediamtx.yml
Restart=on-failure
RestartSec=3
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable mediamtx
systemctl restart mediamtx
systemctl --no-pager --full status mediamtx | head -20

# ICE UDP
if command -v ufw >/dev/null 2>&1; then
  ufw allow 8189/udp comment 'MediaMTX WebRTC ICE' || true
fi

echo "MediaMTX ${MTX_VERSION} OK — HLS :8888 WHIP :8889 ICE :8189/udp API :9997"
