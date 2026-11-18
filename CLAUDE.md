# Merker: Regeln für Claude Code

Merker ist eine PWA für die To-do-Listen aus Home Assistant (HA). Sie liegt auf dem HA-Server unter `/config/www/merker` und ist unter `https://<ha-adresse>/local/merker/index.html` erreichbar. Genutzt vor allem als installierte App auf Android, auch im PC-Browser. Der Besitzer testet jede Version selbst auf dem Handy.

## Antworten und Texte

- Immer Deutsch, knapp und direkt.
- Keine Gedankenstriche, keine Semikolons, keine Floskeln, keine Buzzwords. Gilt auch für Texte in der App und im CHANGELOG.
- Höchstens eine Rückfrage, und trotzdem einen Vorschlag machen.
- Am Ende kurz sagen, was sich geändert hat und was er auf dem Handy prüfen sollte. Nicht jeden Schritt nacherzählen.
- Bei Design-Fragen gern Vorschläge als kleine HTML-Seite mit Varianten nebeneinander (hell und dunkel).

## Aufbau

- `app/`: die App, ohne Build-Schritt. Vanilla ES-Module, kein Framework. Alles, was hier liegt, kommt 1:1 nach HA.
- `app/js/vendor/haws.js`: home-assistant-js-websocket (nicht anfassen).
- `tests/`: `mock-ha.mjs` (nachgebauter HA-Server auf Port 8123 mit WebSocket, Auth, To-do, Config-Flow, frontend/user_data und Test-Hilfen unter `/__mock/...`), Browser-Tests `e2e*.cjs` (Playwright), Tests ohne Browser `*.test.mjs`.
- `scripts/version.sh 1.2.3` setzt die Version, `scripts/zip.sh` baut ein Zip nur mit der App.
- `npm run screenshots` erzeugt die Bilder für die READMEs (`docs/screenshots/de` und `en`) mit den Beispieldaten aus `scripts/demo-data.mjs`. Nach sichtbaren Änderungen an der App neu erzeugen.
- `README.md` (Englisch) und `README.de.md` (Deutsch) beschreiben die App für andere Nutzer. Neue Funktionen in beiden ergänzen.
- `ha/`: Skript und Anleitung, mit denen HA die neueste Version von `main` holt.

## Bei jeder Änderung an der App

1. Version erhöhen: `scripts/version.sh x.y.z` (ändert `app/sw.js` und `app/js/version.js`). Fehler beheben: letzte Stelle. Neue Funktion: mittlere Stelle.
2. Eintrag ganz oben in `CHANGELOG.md` unter `## Version x.y.z`, zwei bis vier Sätze.
3. Neue Datei in `app/`: in die Liste `ASSETS` in `app/sw.js` eintragen (`tests/assets.test.mjs` prüft, dass jede Datei dort existiert, nicht umgekehrt).
4. Neue Texte: nie fest im Code, immer `t('schlüssel')` und den Schlüssel in `app/locales/de.json` UND `app/locales/en.json` (`tests/i18n.test.mjs` prüft beides und meldet ungenutzte Schlüssel). Schlüssel mit `t('...')` ausschreiben, keine zusammengesetzten Schlüssel, sonst findet der Test sie nicht.
5. Tests: `npm test`. Zum Schluss müssen alle grün sein. Neue Funktion bekommt einen neuen Browser-Test (nächste freie Nummer, in `tests/all.sh` eintragen). Ein gefundener Fehler bekommt einen Test, der ihn mit der alten Version zeigt.
6. Commit auf einem Branch, Pull Request mit kurzer deutscher Beschreibung. `main` ist das, was HA holt.

Einmal pro Umgebung: `npm run setup` (installiert Playwright und Chromium).

## Tests: Fallstricke

- `pkill -f "node mock-ha.mjs"` direkt in der Shell beendet die eigene Shell. In Befehlen immer das Muster `mock-h[a].mjs` nutzen, oder `tests/run.sh` verwenden.
- e2e35 und e2e40 verändern die App (Version, fehlende Datei) und laufen in `all.sh` auf einer Kopie. Nie direkt auf `app/` laufen lassen.
- Timing: nie feste Wartezeiten als einzige Absicherung. Auf Zustand warten (`waitForFunction`), bei Messungen der Snackbar das Ende der Animation abwarten.
- Bei einem frischen Browser-Kontext führt der Login über eine Weiterleitung, die den `#`-Teil der Adresse verliert. Erst `APP` öffnen, auf `.list-tile` warten, dann zur Unterseite.

## Technik

- Daten nur über `js/repository.js` (Store plus Repository, optimistische Änderungen, bei Fehler zurück). Die Ansichten kennen HA nicht.
- Offline: Warteschlange `js/queue.js` (localStorage `merker.queue`), über den HA-Stand gelegt (overlay). Neue Aufgaben ohne Netz haben `local-...`-IDs, nach dem Senden auf die echte ID umgeschrieben. Aufträge warten, bis ihre Liste verfügbar ist. Abgerissenes Anlegen wird vor dem erneuten Senden geprüft (keine Doppelten).
- Gespeicherter Stand für den Start ohne Netz: `merker.snapshot`.
- Service Worker (`app/sw.js`): eigener Cache pro Version (`merker-x.y.z`), Installation alles oder nichts, neue Version wartet, bis man im Hinweis "Neu laden" tippt (`js/update.js`). Nur eigene Caches und den eigenen Service Worker anfassen, unter derselben Adresse läuft das HA-Frontend. Ohne Netz nichts löschen.
- `js/boot.js` ist ein klassisches Skript vor den Modulen: setzt Theme, Dichte und Akzentfarbe früh und fängt einen kaputten Start ab (Texte dort direkt de/en).
- Sprache: `js/i18n.js` (Top-Level-await lädt die JSON-Dateien, `t(key, vars)`, Mehrzahl über `Intl.PluralRules`).
- Router mit Hash: `#/`, `#/liste/<id>`, `#/liste/<id>/<uid>`, `#/suche`, `#/woche`, `#/einstellungen`, `#/einstellungen/<seite>` (listen, darstellung, bedienung, sprache), `#/einstellungen/<todo.id>`.
- Beschreibung als Datenträger: Unteraufgaben als Zeilen `- [ ]` und `- [x]`, Wiederholung als Zeile `🔁 wöchentlich`, Erledigt-Datum als letzte Zeile `✓ TT.MM.JJJJ`, Priorität als `❗` vor dem Titel.
- Fälligkeit: meist nur Datum. Hat eine Aufgabe Datum mit Uhrzeit, bleibt die Uhrzeit bei allen Aktionen erhalten (`dueValue`, `withTimeOf` in `rules.js`).
- Einstellungen auf dem Gerät: localStorage-Schlüssel beginnen alle mit `merker.`. Abmelden löscht Anmeldung, Stand, Warteschlange und persönliche Verläufe, Aussehen bleibt.
- Pro HA-Benutzer (alle Geräte): eigene Bilder und Abteilungen der Einkaufsartikel über `frontend/set_user_data` (Schlüssel `merker_shop_icons`, `merker_shop_sections`). Immer nur einzelne Einträge auf den frisch geholten Stand anwenden, nie die ganze Zuordnung blind schreiben.
- Neue Listen nur über den Config-Flow von "Local To-do".

## Design-Entscheidungen (nicht ohne Rückfrage ändern)

- Ecken 10px (`--radius-card`) für Karten, Knöpfe, Chips. Markierungen (Datums-Chip, Zähler) 6px. Rund nur für Punkte und Abhak-Kreise. Keine Pillenform.
- Listenfarbe über die Variable `--lh` (Farbton). Farbband oben in den Dialogen in Listenfarbe.
- Segmentleisten statt Dropdowns, wo es wenige Optionen sind. Auswahl mit mehr Optionen als Fenster von unten (`pickChoice`, `pickList`, `openPicker` in `js/picker.js`).
- Hell, dunkel und Gerät. Dunkle Regeln immer doppelt: `@media (prefers-color-scheme: dark)` mit `:where(:root:not([data-theme='light']))` und `:where(:root[data-theme='dark'])`.
- Snackbar über dem Plus-Knopf, bei offenem Dialog oben. "Erledigt: Titel" einzeilig mit … gekürzt.
- Wischen: rechts erledigen. Links nach Einstellung verschieben, löschen oder Datum. Über die Hälfte nach links löscht (abschaltbar), die normale Aktion links dann ab einem Viertel.
- Einkaufsansicht (Liste in den Einstellungen als Einkaufsliste markiert, nur auf dem Gerät, keine automatische Erkennung über den Namen): Kacheln wie Bring!, 3 oder 4 pro Reihe, Abteilungen in Ladenreihenfolge, "Zuletzt gekauft" einklappbar, langes Drücken für Menge, Notiz, Abteilung, Bild. Kein "Einkauf fertig"-Knopf, kein Zählen von Häufigkeiten.
- App-Symbol: zwei gestapelte Karten mit Haken. Kurzbefehle am Symbol: "Neue Aufgabe" und "Einkaufsliste".

## Bekannte Grenzen

- Benachrichtigungen kann die PWA nicht zuverlässig selbst schicken. Dafür HA-Automationen an die Companion App.
- Android übernimmt Änderungen an `manifest.json` (Symbol, Kurzbefehle) oft erst nach Entfernen und neu Hinzufügen der App.
- Eine wiederkehrende Aufgabe bekommt ihre nächste Runde nur, wenn sie in Merker erledigt wird, nicht in HA.
- Neue Listen nur mit Verbindung.

## Offene Ideen (nur auf Wunsch angehen)

#Stichwörter im Titel (Besitzer will dazu noch Input geben), Vorlagen, Mehrfachauswahl, Listen umbenennen oder löschen, morgendliche Übersicht per HA-Automation, eigene Abteilungen und Reihenfolge im Laden, CSS aufräumen. Spracheingabe ist ausgeschlossen.
