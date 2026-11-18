# Merker aus GitHub nach Home Assistant holen

Einmal einrichten. Danach holt HA die neueste Version von `main` nach `/config/www/merker`, sobald dort ein neuer Commit landet. Die App zeigt dann von selbst "Version … verfügbar" mit "Neu laden".

Du brauchst Zugriff auf die Dateien in `/config`, zum Beispiel mit dem Add-on "File editor" oder "Studio Code Server". Das Repository muss öffentlich sein (sonst siehe "Privates Repository" unten).

## 1. Skript ablegen

Im Ordner `/config` einen Ordner `scripts` anlegen (falls noch nicht da). Darin die Datei `merker_update.sh` anlegen und den Inhalt von `ha/merker_update.sh` aus diesem Repository hineinkopieren (auf GitHub die Datei öffnen, "Raw", alles kopieren). Oben steht `REPO="korkfabrik/merker"`. Bei einem anderen Repository-Namen dort anpassen.

Der Ordner `/config/www` wird beim ersten Lauf angelegt, falls es ihn noch nicht gibt.

## 2. configuration.yaml

In `/config/configuration.yaml` ergänzen. `shell_command:` steht ganz links, die Zeile darunter mit zwei Leerzeichen. Gibt es `shell_command:` schon, nur die zweite Zeile darunter setzen:

```yaml
shell_command:
  merker_update: "sh /config/scripts/merker_update.sh"
```

Danach Entwicklerwerkzeuge → YAML → "Konfiguration prüfen", dann "Neu starten". Neu laden reicht nicht.

Test: Entwicklerwerkzeuge → Aktionen → `shell_command.merker_update` → "Aktion ausführen". Die Antwort muss `returncode: 0` und `stdout: Merker x.y.z installiert` enthalten.

## 3. Skript "Merker aktualisieren"

Einstellungen → Automatisierungen & Szenen → Reiter **Skripte** (nicht Automatisierungen) → "Skript hinzufügen" → "Neues Skript erstellen" → ⋮ → "In YAML bearbeiten", alles ersetzen durch:

```yaml
alias: Merker aktualisieren
mode: single
sequence:
  - action: shell_command.merker_update
```

Speichern. Die Entität heißt `script.merker_aktualisieren` und lässt sich als Knopf aufs Dashboard legen.

## 4. GitHub-Integration

Einstellungen → Geräte & Dienste → "Integration hinzufügen" → **GitHub**. Den angezeigten Code unter `github.com/login/device` eingeben. Danach bei der Integration "Konfigurieren" und `korkfabrik/merker` als Repository auswählen.

Es entsteht ein Gerät "korkfabrik/merker" mit dem Sensor "Letzter Commit" (zeigt die Nachricht des letzten Commits auf `main`). Seine Entitäts-ID steht nach Antippen unter dem Zahnrad.

## 5. Automation: Update bei neuem Commit

Reiter **Automatisierungen** → Neue Automation → ⋮ → "In YAML bearbeiten". `entity_id` durch die ID aus Schritt 4 ersetzen:

```yaml
alias: Merker bei neuem Commit aktualisieren
mode: single
triggers:
  - trigger: state
    entity_id: sensor.DEINE_ENTITAETS_ID
    attribute: sha
conditions:
  - condition: template
    value_template: >-
      {{ trigger.from_state is not none
         and trigger.from_state.state not in ['unknown', 'unavailable'] }}
actions:
  - action: script.merker_aktualisieren
```

Hat der Sensor kein Attribut `sha`, die Zeile `attribute: sha` löschen. Dann löst eine neue Commit-Nachricht aus.

Die Integration fragt GitHub regelmäßig ab. Ein Update kommt deshalb einige Minuten nach dem Push. Ob die Automation gelaufen ist: Automation öffnen → ⋮ → "Traces".

## Optional: Nachricht aufs Handy

Im Skript aus Schritt 3 die `sequence` so erweitern. `mobile_app_DEIN_HANDY` durch den Dienst deines Handys ersetzen (Entwicklerwerkzeuge → Aktionen, Suche nach `mobile_app`):

```yaml
sequence:
  - action: shell_command.merker_update
    response_variable: result
    continue_on_error: true
  - action: notify.mobile_app_DEIN_HANDY
    data:
      title: Merker
      message: >-
        {% if result is defined and result.returncode == 0 %}{{ result.stdout }}
        {% else %}Update fehlgeschlagen: {{ (result.stderr or result.stdout) if result is defined else 'keine Antwort' }}{% endif %}
```

## Privates Repository

Ist das Repository privat, braucht das Skript einen Token mit Leserecht: GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token. Repository access: nur dieses Repository. Permissions: Contents = Read-only. Den Token als einzige Zeile in `/config/.merker_github_token` schreiben. Die GitHub-Integration sieht ein privates Repository nicht. Dann statt Schritt 4 und 5 das Skript von Hand oder per Zeit-Auslöser starten.

## Fehler

- "Not a valid option at sequence": YAML eines Skripts im Automations-Editor eingefügt. Reiter **Skripte** nehmen.
- "Not a valid icon": Zeile `icon:` löschen oder ein Symbol im visuellen Editor wählen.
- `shell_command.merker_update` fehlt bei den Aktionen: Neustart nach Schritt 2 vergessen oder Einrückung in `configuration.yaml` falsch.
- `curl: (22) ... 404`: Repository privat und kein gültiger Token, oder `REPO` falsch geschrieben.

## Zurück zur vorigen Version

Die vorige Version liegt nach jedem Update unter `/config/merker_backup`. Zurück: Ordner `/config/www/merker` löschen und `/config/merker_backup` dorthin umbenennen.
