#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Erreur : Node.js v22+ est requis mais introuvable." >&2
  echo "Sous Debian/Ubuntu, installez Node.js 22 LTS puis relancez : bash install.sh" >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Erreur : Node.js v22+ est requis (version actuelle : $(node -v))." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Erreur : npm est requis mais introuvable." >&2
  exit 1
fi

cd "$SCRIPT_DIR"
exec node installer/install.mjs "$@"
