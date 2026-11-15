#!/usr/bin/env bash
set -euo pipefail

# Construit un paquet Debian (.deb) pour serveur Linux (x64 / arm64) avec dpkg-deb.
# Prérequis sur le serveur cible lors de l'installation du .deb : nodejs >= 22.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/dist-packages}"
VERSION="${FACTOREALM_VERSION:-0.1.0}"
ARCH="${2:-$(dpkg --print-architecture 2>/dev/null || echo amd64)}"

if ! command -v dpkg-deb >/dev/null 2>&1; then
  echo "Erreur : dpkg-deb est requis pour construire le paquet .deb." >&2
  exit 1
fi

if [ ! -d "$ROOT_DIR/dist" ]; then
  echo "Compilation du frontend (npm run build)..."
  (cd "$ROOT_DIR" && npm run build)
fi

STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

PKG_ROOT="$STAGE_DIR/factorealm_${VERSION}_${ARCH}"
mkdir -p "$PKG_ROOT/DEBIAN"
mkdir -p "$PKG_ROOT/opt/factorealm"
mkdir -p "$PKG_ROOT/etc/factorealm"
mkdir -p "$PKG_ROOT/var/lib/factorealm/uploads"
mkdir -p "$PKG_ROOT/lib/systemd/system"
mkdir -p "$PKG_ROOT/usr/local/bin"

# Copier uniquement les fichiers nécessaires à l'exécution du serveur (sans docs, tests ni sources frontend)
mkdir -p "$PKG_ROOT/opt/factorealm/bin" "$PKG_ROOT/opt/factorealm/src/core" "$PKG_ROOT/opt/factorealm/src/server" "$PKG_ROOT/opt/factorealm/installer"
for item in server.ts package.json package-lock.json migrations dist; do
  if [ -e "$ROOT_DIR/$item" ]; then
    cp -r "$ROOT_DIR/$item" "$PKG_ROOT/opt/factorealm/"
  fi
done
cp "$ROOT_DIR/bin/factorealm.mjs" "$PKG_ROOT/opt/factorealm/bin/factorealm.mjs"
chmod 0755 "$PKG_ROOT/opt/factorealm/bin/factorealm.mjs"
cp -r "$ROOT_DIR/src/core/"* "$PKG_ROOT/opt/factorealm/src/core/"
cp -r "$ROOT_DIR/src/server/"* "$PKG_ROOT/opt/factorealm/src/server/"
find "$PKG_ROOT/opt/factorealm/src" -type f \( -name '*.test.*' -o -name '*.spec.*' \) -delete
cp "$ROOT_DIR/installer/install.mjs" "$ROOT_DIR/installer/installerCore.mjs" "$ROOT_DIR/installer/bootstrap-company.ts" "$PKG_ROOT/opt/factorealm/installer/"

cat > "$PKG_ROOT/etc/factorealm/factorealm.env" <<'EOF'
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
FACTOREALM_DB_PATH=/var/lib/factorealm/factorealm.sqlite
FACTOREALM_UPLOAD_DIR=/var/lib/factorealm/uploads
EOF

cat > "$PKG_ROOT/lib/systemd/system/factorealm.service" <<'EOF'
[Unit]
Description=Factorealm — Gestion commerciale et comptabilité
After=network.target

[Service]
Type=simple
User=factorealm
WorkingDirectory=/opt/factorealm
EnvironmentFile=/etc/factorealm/factorealm.env
ExecStart=/usr/bin/env node /opt/factorealm/node_modules/tsx/dist/cli.mjs server.ts --production
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

cat > "$PKG_ROOT/usr/local/bin/factorealm" <<'EOF'
#!/usr/bin/env bash
exec node /opt/factorealm/bin/factorealm.mjs "$@"
EOF
chmod 0755 "$PKG_ROOT/usr/local/bin/factorealm"

cat > "$PKG_ROOT/usr/local/bin/factorealm-configure" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/factorealm
exec node installer/install.mjs --install-dir=/opt/factorealm --data-dir=/var/lib/factorealm --skip-build --omit-dev --skip-tests "$@"
EOF
chmod 0755 "$PKG_ROOT/usr/local/bin/factorealm-configure"

cat > "$PKG_ROOT/DEBIAN/control" <<EOF
Package: factorealm
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${ARCH}
Maintainer: Thibstudio24
Description: Factorealm - Gestion commerciale et comptabilite locale pour entreprises francaises
 Serveur applicatif local Node.js/SQLite (aucun serveur central ni abonnement).
EOF

cat > "$PKG_ROOT/DEBIAN/conffiles" <<'EOF'
/etc/factorealm/factorealm.env
EOF

cat > "$PKG_ROOT/DEBIAN/postinst" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if ! id -u factorealm >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin factorealm || true
fi
mkdir -p /var/lib/factorealm/uploads
chown -R factorealm:factorealm /var/lib/factorealm /opt/factorealm
chmod 0640 /etc/factorealm/factorealm.env
echo "Factorealm installe dans /opt/factorealm."
echo "Pour installer les dependances et configurer port/entreprise :"
echo "  sudo factorealm-configure"
echo "Commandes disponibles ensuite : factorealm start | stop | restart | status"
EOF
chmod 0755 "$PKG_ROOT/DEBIAN/postinst"

cat > "$PKG_ROOT/DEBIAN/prerm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if command -v systemctl >/dev/null 2>&1; then
  systemctl stop factorealm.service >/dev/null 2>&1 || true
  systemctl disable factorealm.service >/dev/null 2>&1 || true
fi
EOF
chmod 0755 "$PKG_ROOT/DEBIAN/prerm"

mkdir -p "$OUT_DIR"
OUT_DEB="$OUT_DIR/factorealm_${VERSION}_${ARCH}.deb"
dpkg-deb --build --root-owner-group "$PKG_ROOT" "$OUT_DEB"
echo "Paquet .deb créé : $OUT_DEB"
