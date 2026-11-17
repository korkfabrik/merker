#!/usr/bin/env bash
# Version setzen: scripts/version.sh 1.2.3   (ändert app/sw.js und app/js/version.js, CHANGELOG.md bitte von Hand)
set -e
cd "$(dirname "$0")/.."
new=$1
[[ "$new" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Aufruf: scripts/version.sh 1.2.3"; exit 1; }
sed -i "s/const CACHE_VERSION = '[^']*'/const CACHE_VERSION = '$new'/" app/sw.js
sed -i "s/export const APP_VERSION = '[^']*'/export const APP_VERSION = '$new'/" app/js/version.js
grep -h "$new" app/sw.js app/js/version.js
