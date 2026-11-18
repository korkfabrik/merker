# Merker aus GitHub nach Home Assistant holen

Einmal einrichten, danach holt ein Knopf (oder eine nächtliche Automation) die neueste Version von `main` nach `/config/www/merker`. Die App zeigt danach von selbst "Version … verfügbar" mit "Neu laden".

Du brauchst Zugriff auf die Dateien in `/config`, zum Beispiel mit dem Add-on "File editor" oder "Studio Code Server".

## 1. Skript ablegen

Im Ordner `/config` einen Ordner `scripts` anlegen (falls noch nicht da). Darin die Datei `merker_update.sh` anlegen und den Inhalt von `ha/merker_update.sh` aus diesem Repository hineinkopieren. Oben steht `REPO="korkfabrik/merker"`. Bei einem anderen Repository-Namen dort anpassen.

Der Ordner `/config/www` wird beim ersten Lauf angelegt, falls es ihn noch nicht gibt.

## 2. configuration.yaml

In `/config/configuration.yaml` ergänzen (steht dort schon `shell_command:`, nur die zweite Zeile darunter setzen):

```yaml
shell_command:
  merker_update: "sh /config/scripts/merker_update.sh"
```

Danach Home Assistant neu starten: Entwicklerwerkzeuge → YAML → "Konfiguration prüfen", dann "Neu starten". Ein Neuladen reicht hier nicht, `shell_command` braucht den Neustart.

## 3. Skript "Merker aktualisieren"

Einstellungen → Automatisierungen & Szenen → Skripte → Skript erstellen → Neues Skript erstellen → oben rechts ⋮ → "In YAML bearbeiten", alles ersetzen durch:

```yaml
alias: Merker aktualisieren
mode: single
icon: mdi:cellphone-arrow-down
sequence:
  - action: shell_command.merker_update
    response_variable: result
    continue_on_error: true
  - action: notify.mobile_app_<dein_handy>
    data:
      title: 📋 Merker
      message: >-
        {% if result is defined and result.returncode == 0 %}✅ {{ result.stdout }}
        {% else %}❌ Update fehlgeschlagen: {{ (result.stderr or result.stdout) if result is defined else 'keine Antwort' }}{% endif %}
```

`notify.mobile_app_<dein_handy>` durch den Dienst deines Handys ersetzen. Den Namen findest du unter Entwicklerwerkzeuge → Aktionen, Suche nach `mobile_app`. Speichern. Die Entität heißt dann `script.merker_aktualisieren`.

## 4. Ausprobieren

Skript ausführen (in der Skriptliste ⋮ → Ausführen). Aufs Handy kommt "✅ Merker x.y.z installiert". Danach `https://<ha-adresse>/local/merker/index.html` im Browser öffnen, anmelden und in Chrome "App installieren".

Das Skript lässt sich als Knopf aufs Dashboard legen.

## 5. Optional: jede Nacht automatisch

Einstellungen → Automatisierungen & Szenen → Automation erstellen → Neue Automation → ⋮ → "In YAML bearbeiten":

```yaml
alias: Merker nachts aktualisieren
mode: single
triggers:
  - trigger: time
    at: "03:17:00"
actions:
  - action: script.merker_aktualisieren
```

## Privates Repository

Solange das Repository privat ist, braucht das Skript einen Token mit Leserecht:
GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token. Repository access: nur dieses Repository. Permissions: Contents = Read-only.
Den Token als einzige Zeile in `/config/.merker_github_token` schreiben. Bei einem öffentlichen Repository die Datei weglassen oder löschen.

## Fehler

- "❌ Update fehlgeschlagen" mit `curl: (22) ... 404`: Repository privat und kein gültiger Token, oder `REPO` falsch geschrieben.
- Keine Nachricht: Aktion `shell_command.merker_update` fehlt. Neustart nach Schritt 2 vergessen oder Einrückung in `configuration.yaml` falsch.

## Zurück zur vorigen Version

Die vorige Version liegt nach jedem Update unter `/config/merker_backup`. Zurück: Ordner `/config/www/merker` löschen und `/config/merker_backup` dorthin umbenennen.
