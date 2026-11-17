#!/usr/bin/env bash
# Alle Tests: Browser-Tests gegen den nachgebauten Home-Assistant-Server und die Tests ohne Browser.
# Gibt je Test "ok/fehler" aus und endet mit Code 1, wenn etwas fehlschlägt.
cd "$(dirname "$0")"
failed=0
e2e() {
  local name=$1 out
  out=$(./run.sh "$name" 2>&1)
  local oks fails
  oks=$(echo "$out" | grep -c '^OK')
  fails=$(echo "$out" | grep -c 'FEHLER')
  echo "$name: $oks ok, $fails fehler"
  if [ "$fails" != "0" ] || [ "$oks" = "0" ]; then
    echo "$out" | grep -E "FEHLER" -A4
    failed=1
  fi
}
for t in e2e e2e2 e2e4 e2e6 e2e7 e2e10 e2e11 e2e14 e2e15 e2e16 e2e17 e2e18 e2e19 e2e20 e2e21 e2e22 e2e23 e2e24 e2e25 e2e26 e2e27 e2e28 e2e29 e2e30 e2e31 e2e32 e2e33 e2e34 e2e36 e2e37 e2e38 e2e39 e2e41; do
  e2e "$t"
done
# Diese beiden ändern die App (Version hochzählen, Datei entfernen) und laufen deshalb auf einer Kopie
for t in e2e35 e2e40; do
  copy=$(mktemp -d)
  cp -r ../app/. "$copy"
  MERKER_DIR="$copy" e2e "$t"
  rm -rf "$copy"
done
for t in assets rules links i18n multiline rules2 queue shop modules; do
  node "$t.test.mjs" 2>&1 | tail -1
  [ "${PIPESTATUS[0]}" = "0" ] || failed=1
done
[ "$failed" = "0" ] && echo "ALLE TESTS BESTANDEN" || echo "ES GIBT FEHLER"
exit $failed
