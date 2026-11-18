#!/usr/bin/env bash
# Opencodev2 — lanceur local (usage personnel, depot public Neoxff/opencodev2).
# Aucun jeton n'est lu, ecrit ou transmis par ce script.
set -euo pipefail

GITLEAKS_VERSION="8.30.1"
GITLEAKS_SHA_X64="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
GITLEAKS_SHA_ARM64="e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080"
GITLEAKS_BASE="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}"
REPO_URL="https://github.com/Neoxff/opencodev2.git"

log() { printf '[opencodev2] %s\n' "$*"; }
die() { printf '[opencodev2] ERREUR: %s\n' "$*" >&2; exit 1; }

banner() {
  cat <<'EOF'
  ___  ___  _   _  ___  _   _  ___  ___  ___  _   _  ___  ___
 / _ \/ __|| \ | ||_ _|| \ | ||_ _|/ __||_ _|| \ | ||_ _|/ __|
| (_) \__ \|  \| | | | |  \| | | || (__  | | |  \| | | |\__ \
 \___/|___/|_|\__||___||_|\__||___| \___||___|_|\__||___||___/
EOF
}

install_gitleaks() {
  local bin="$HOME/.local/bin/gitleaks"
  if [ -x "$bin" ] && [ "$("$bin" version 2>/dev/null)" = "$GITLEAKS_VERSION" ]; then
    log "gitleaks ${GITLEAKS_VERSION} deja installe"
    return 0
  fi
  command -v curl >/dev/null 2>&1 || die "curl absent : installation de gitleaks impossible"
  command -v sha256sum >/dev/null 2>&1 || die "sha256sum absent : verification impossible"
  local arch sha asset tmp
  case "$(uname -m)" in
    x86_64|amd64) arch="x64";  sha="$GITLEAKS_SHA_X64" ;;
    aarch64|arm64) arch="arm64"; sha="$GITLEAKS_SHA_ARM64" ;;
    *) die "architecture $(uname -m) non prise en charge" ;;
  esac
  asset="gitleaks_${GITLEAKS_VERSION}_linux_${arch}.tar.gz"
  tmp=$(mktemp -d)
  log "telechargement de ${asset} (version epinglee ${GITLEAKS_VERSION})"
  curl -fsSL --retry 3 -o "${tmp}/${asset}" "${GITLEAKS_BASE}/${asset}"
  printf '%s  %s\n' "$sha" "${tmp}/${asset}" | sha256sum -c - || die "SHA-256 invalide : archive rejetee"
  tar -xzf "${tmp}/${asset}" -C "$tmp" gitleaks
  mkdir -p "$HOME/.local/bin"
  install -m 0755 "$tmp/gitleaks" "$bin"
  log "gitleaks ${GITLEAKS_VERSION} installe dans ~/.local/bin (SHA-256 verifie)"
}

if [ "${1:-}" = "--install-gitleaks" ]; then
  install_gitleaks
  exit 0
fi

banner
command -v bun >/dev/null 2>&1 || die "Bun absent : installez Bun puis relancez"
log "Bun $(bun --version)"

REPO_DIR="${OPENCODEV2_DIR:-$HOME/opencodev2}"
if [ ! -d "${REPO_DIR}/.git" ]; then
  log "clonage de ${REPO_URL} dans ${REPO_DIR}"
  git clone "$REPO_URL" "$REPO_DIR"
else
  log "depot local deja present : ${REPO_DIR}"
fi
cd "$REPO_DIR"

PORT="4096"
REPO_LIE="Neoxff/opencodev2 (defaut)"
if [ -f opencodev2.config.json ]; then
  REPO_LIE=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("repo","Neoxff/opencodev2"))' opencodev2.config.json)
  PORT=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("port",4096))' opencodev2.config.json)
fi
log "depot lie : ${REPO_LIE}"
log "port : ${PORT}"

install_gitleaks
log "installation des dependances"
bun install

log "demarrage du serveur : http://127.0.0.1:${PORT}"
OPENCODE_SERVER_PORT="$PORT" bun run web &
SERVER_PID=$!
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}" 2>/dev/null; then break; fi
  sleep 1
done
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://127.0.0.1:${PORT}" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  open "http://127.0.0.1:${PORT}" >/dev/null 2>&1 &
fi
log "ouvrez http://127.0.0.1:${PORT} dans votre navigateur"
wait "$SERVER_PID"
