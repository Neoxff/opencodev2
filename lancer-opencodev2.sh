#!/usr/bin/env bash
# lancer-opencodev2.sh — lanceur local pour Arch Linux (bash/zsh).
# Le shebang force bash : le script fonctionne quand il est appelé depuis zsh.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/opencodev2.config.json"

# ---------------------------------------------------------------------------
# Bannière ASCII
# ---------------------------------------------------------------------------
cat <<'BANNER'
 ____  ____  __  __  ___  _   _ _   _ _   _ _____ ____
|  _ \|  _ \|  \/  |/ _ \| \ | | | | | \ | | ____|  _ \
| |_) | |_) | |\/| | | | |  \| | | | |  \| |  _| | |_) |
|  __/|  __/| |  | | |_| | |\  | |_| | |\  | |___|  _ <
|_|   |_|   |_|  |_|\___/|_| \_|\___/|_| \_|_____|_| \_\
                                              v2
BANNER

# ---------------------------------------------------------------------------
# 1. Bun est requis
# ---------------------------------------------------------------------------
if ! command -v bun >/dev/null 2>&1; then
  echo "[lanceur] Bun introuvable. Installez-le : curl -fsSL https://bun.sh/install | bash" >&2
  exit 1
fi
echo "[lanceur] Bun $(bun --version) détecté."

# ---------------------------------------------------------------------------
# 2. Lecture de opencodev2.config.json
# ---------------------------------------------------------------------------
lire_config() {
  local cle="$1" defaut="$2"
  if [[ -f "$CONFIG_FILE" ]]; then
    bun -e '
      const cfg = JSON.parse(await Bun.file(process.argv[1]).text());
      const v = cfg[process.argv[2]];
      console.log(v === undefined || v === null ? process.argv[3] : String(v));
    ' "$CONFIG_FILE" "$cle" "$defaut"
  else
    echo "$defaut"
  fi
}

REPO="$(lire_config repo 'Neoxff/opencodev2')"
PORT="$(lire_config port '4096')"
WORKSPACE="$(lire_config workspace '.')"
echo "[lanceur] config : repo=${REPO} port=${PORT} workspace=${WORKSPACE}"

# ---------------------------------------------------------------------------
# 2b. Port déjà occupé : message clair et port libre propose
#     Sans cela, Bun.serve leve une ServeError et le serveur meurt avec un
#     message « Unexpected error » qui ne dit pas que le port est pris.
# ---------------------------------------------------------------------------
port_occupe() {
  local p="$1"
  # /dev/tcp : une connexion reussie signifie qu'un processus ecoute.
  # Le test dans un 'if' neutralise 'set -e' quand le port est libre.
  if (exec 3<>"/dev/tcp/127.0.0.1/${p}") 2>/dev/null; then
    return 0
  fi
  # Repli si /dev/tcp indisponible : ss (iproute2, present sur Arch).
  if command -v ss >/dev/null 2>&1 && ss -ltnH "sport = :${p}" 2>/dev/null | grep -q .; then
    return 0
  fi
  return 1
}

if port_occupe "$PORT"; then
  PORT_LIBRE="$PORT"
  for _ in {1..20}; do
    PORT_LIBRE=$((PORT_LIBRE + 1))
    port_occupe "$PORT_LIBRE" || break
  done
  if port_occupe "$PORT_LIBRE"; then
    echo "[lanceur] ERREUR : port ${PORT} occupe et aucun port libre trouve (${PORT}..${PORT_LIBRE})." >&2
    echo "[lanceur] Liberez le port ou changez 'port' dans opencodev2.config.json." >&2
    exit 1
  fi
  echo "[lanceur] ATTENTION : le port ${PORT} est deja occupe (ServeError evitee)."
  echo "[lanceur] Port libre propose : ${PORT_LIBRE}."
  echo "[lanceur] Pour garder le port ${PORT}, liberez-le puis relancez ; ou modifiez 'port' dans opencodev2.config.json."
  export OPENCODE_SERVER_PORT="$PORT_LIBRE"
  PORT="$PORT_LIBRE"
fi

if [[ "$WORKSPACE" = /* ]]; then
  TARGET="$WORKSPACE"
else
  TARGET="${SCRIPT_DIR}/${WORKSPACE}"
fi

# ---------------------------------------------------------------------------
# 3. Clone du dépôt si absent
# ---------------------------------------------------------------------------
if [[ ! -d "${TARGET}/.git" ]]; then
  echo "[lanceur] clone de https://github.com/${REPO}.git vers ${TARGET}"
  git clone "https://github.com/${REPO}.git" "$TARGET"
else
  echo "[lanceur] dépôt déjà présent : ${TARGET}"
fi

cd "$TARGET"

# ---------------------------------------------------------------------------
# 4. Dépendances
# ---------------------------------------------------------------------------
echo "[lanceur] bun install"
bun install

# ---------------------------------------------------------------------------
# 4b. gitleaks 8.30.1 — installé avec vérification SHA-256
#     SHA du tarball officiel gitleaks_8.30.1_linux_x64.tar.gz, déjà consigné
#     dans l'historique du dépôt (commit f132adadd) et confirmé par la release.
# ---------------------------------------------------------------------------
GITLEAKS_VERSION="8.30.1"
GITLEAKS_SHA="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
GITLEAKS_BIN="${HOME}/.local/bin/gitleaks"
GITLEAKS_URL="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"

installer_gitleaks() {
  local tmp archive
  tmp="$(mktemp -d)"
  archive="${tmp}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
  echo "[lanceur] téléchargement de gitleaks ${GITLEAKS_VERSION}"
  curl -fsSL -o "$archive" "$GITLEAKS_URL"
  echo "${GITLEAKS_SHA}  ${archive}" | sha256sum -c - || {
    echo "[lanceur] SHA-256 invalide : installation refusée." >&2
    rm -rf "$tmp"
    return 1
  }
  mkdir -p "$(dirname "$GITLEAKS_BIN")"
  tar -xzf "$archive" -C "$tmp" gitleaks
  install -m 0755 "${tmp}/gitleaks" "$GITLEAKS_BIN"
  rm -rf "$tmp"
  echo "[lanceur] gitleaks ${GITLEAKS_VERSION} installé (SHA-256 vérifié)."
}

if [[ -x "$GITLEAKS_BIN" ]] && "$GITLEAKS_BIN" version 2>/dev/null | grep -q "$GITLEAKS_VERSION"; then
  echo "[lanceur] gitleaks $($GITLEAKS_BIN version 2>/dev/null | head -1) déjà présent."
else
  installer_gitleaks
fi

# ---------------------------------------------------------------------------
# 5. Garde-fou : aucun démon démarré par défaut
# ---------------------------------------------------------------------------
export OPENCODE_NO_DAEMON_AUTOSTART=1
echo "[lanceur] OPENCODE_NO_DAEMON_AUTOSTART=1"

# ---------------------------------------------------------------------------
# 6. Plafond mémoire optionnel (OPENCODEV2_MEM_MAX, ex. 4G)
# ---------------------------------------------------------------------------
mem_high() {
  local valeur="$1"
  if [[ "$valeur" =~ ^([0-9]+([.][0-9]+)?)([KMGT])$ ]]; then
    local nombre="${BASH_REMATCH[1]}" unite="${BASH_REMATCH[3]}"
    awk -v n="$nombre" -v u="$unite" 'BEGIN {
      h = n * 0.75
      if (h == int(h)) printf "%d%s", h, u
      else printf "%.2f%s", h, u
    }'
  else
    echo "3G"
  fi
}

# ---------------------------------------------------------------------------
# 7. Lancement
# ---------------------------------------------------------------------------
echo "[lanceur] Opencodev2 prêt : http://127.0.0.1:${PORT}"
if [[ -n "${OPENCODEV2_MEM_MAX:-}" ]]; then
  HIGH="$(mem_high "${OPENCODEV2_MEM_MAX}")"
  echo "[lanceur] plafond mémoire : MemoryHigh=${HIGH} MemoryMax=${OPENCODEV2_MEM_MAX}"
  exec systemd-run --user --scope \
    -p "MemoryHigh=${HIGH}" -p "MemoryMax=${OPENCODEV2_MEM_MAX}" \
    bun run web
fi
exec bun run web
