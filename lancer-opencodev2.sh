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
