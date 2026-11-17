#!/usr/bin/env bash
# Einen Browser-Test gegen den nachgebauten Home-Assistant-Server laufen lassen.
# Aufruf: tests/run.sh e2e33      Eine Kopie der App testen: MERKER_DIR=/pfad/zur/kopie tests/run.sh e2e35
cd "$(dirname "$0")"
pkill -f "node mock-h[a].mjs" 2>/dev/null
sleep 0.5
nohup node mock-ha.mjs > .mock.log 2>&1 &
sleep 1.5
node "${1%.cjs}.cjs" 2>&1 | tail -40
status=${PIPESTATUS[0]}
pkill -f "node mock-h[a].mjs" 2>/dev/null
exit $status
