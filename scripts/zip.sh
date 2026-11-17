#!/usr/bin/env bash
# Zip nur mit der App (für das Einspielen von Hand nach /config/www/merker)
set -e
cd "$(dirname "$0")/.."
v=$(sed -n "s/.*CACHE_VERSION = '\([^']*\)'.*/\1/p" app/sw.js)
rm -f "merker-$v.zip"
(cd app && zip -qr "../merker-$v.zip" . -x '.*')
echo "merker-$v.zip"
