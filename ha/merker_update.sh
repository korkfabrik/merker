#!/bin/sh
# Holt die neueste Version von Merker aus GitHub (Branch main) nach /config/www/merker.
# Aufgerufen über shell_command.merker_update. Liegt in Home Assistant unter /config/scripts/merker_update.sh.
# Öffentliches Repository: kein Token nötig. Privates Repository: GitHub-Token (nur Lesen, nur dieses Repository)
# allein in /config/.merker_github_token.
# Die vorige Version bleibt als /config/merker_backup liegen (zum Zurückholen von Hand).
set -eu
REPO="korkfabrik/merker"
BRANCH="main"
TOKEN_FILE="/config/.merker_github_token"
TARGET="/config/www/merker"
BACKUP="/config/merker_backup"
WORK="/tmp/merker_update"

TOKEN=""
[ -s "$TOKEN_FILE" ] && TOKEN=$(tr -d ' \r\n' < "$TOKEN_FILE")
URL="https://api.github.com/repos/$REPO/tarball/$BRANCH"

rm -rf "$WORK"
mkdir -p "$WORK/src"
if command -v curl >/dev/null 2>&1; then
  if [ -n "$TOKEN" ]; then
    curl -sSfL -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" -o "$WORK/src.tar.gz" "$URL"
  else
    curl -sSfL -H "Accept: application/vnd.github+json" -o "$WORK/src.tar.gz" "$URL"
  fi
elif [ -n "$TOKEN" ]; then
  wget -q --header="Authorization: Bearer $TOKEN" --header="Accept: application/vnd.github+json" -O "$WORK/src.tar.gz" "$URL"
else
  wget -q --header="Accept: application/vnd.github+json" -O "$WORK/src.tar.gz" "$URL"
fi
tar -xzf "$WORK/src.tar.gz" -C "$WORK/src"
SRC=$(find "$WORK/src" -mindepth 1 -maxdepth 1 -type d | head -n 1)
[ -f "$SRC/app/sw.js" ] && [ -f "$SRC/app/index.html" ] || { echo "Download unvollständig: app/sw.js oder app/index.html fehlt"; exit 1; }
VERSION=$(sed -n "s/.*CACHE_VERSION = '\([^']*\)'.*/\1/p" "$SRC/app/sw.js")

# Erst komplett daneben kopieren, dann austauschen: die App ist nie halb aktualisiert
mkdir -p "$(dirname "$TARGET")"
rm -rf "$TARGET.new"
cp -r "$SRC/app" "$TARGET.new"
rm -rf "$BACKUP"
[ -d "$TARGET" ] && mv "$TARGET" "$BACKUP"
mv "$TARGET.new" "$TARGET"
rm -rf "$WORK"
echo "Merker $VERSION installiert"
