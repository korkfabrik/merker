# Merker

PWA für die To-do-Listen aus Home Assistant (Android und Desktop). Läuft unter `/local/merker/` auf dem Home-Assistant-Server und spricht über die WebSocket-API mit Home Assistant.

- `app/`: die App, wird 1:1 nach `/config/www/merker` kopiert
- `tests/`: nachgebauter Home-Assistant-Server (`mock-ha.mjs`), Browser-Tests (`e2e*.cjs`) und Tests ohne Browser (`*.test.mjs`)
- `scripts/`: Version setzen, Zip bauen
- `ha/`: Einspielen nach Home Assistant direkt aus GitHub
- `CHANGELOG.md`: alle Versionen
- `CLAUDE.md`: Regeln und Entscheidungen für die Arbeit mit Claude Code

## Tests

```
npm run setup      # einmal: Abhängigkeiten und Chromium
npm test           # alle Tests
npm run test:one -- e2e33
```
