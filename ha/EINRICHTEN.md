# Merker aus GitHub nach Home Assistant holen

Einmal einrichten, danach holt ein Knopf (oder eine nächtliche Automation) die neueste Version von `main` nach `/config/www/merker`. Die App zeigt danach von selbst "Version … verfügbar" mit "Neu laden".

## 1. Token anlegen (GitHub)

GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token
- Repository access: nur dieses Repository
- Permissions: Contents = Read-only
- Ablaufdatum nach Wunsch (danach neu anlegen)

Den Token als einzige Zeile in die Datei `/config/.merker_github_token` schreiben (zum Beispiel mit dem File editor oder Studio Code Server).

## 2. Skript ablegen

`ha/merker_update.sh` aus diesem Repository nach `/config/scripts/merker_update.sh` kopieren. Oben in der Datei `REPO="korkfabrik/merker"` an den echten Namen des Repositorys anpassen.

## 3. configuration.yaml

```yaml
shell_command:
  merker_update: "sh /config/scripts/merker_update.sh"
```

Danach Home Assistant neu starten (Entwicklerwerkzeuge → YAML → Prüfen, dann Neustart).

## 4. Skript "Merker aktualisieren" (Skript-Editor, YAML-Modus)

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

Das Skript lässt sich als Knopf aufs Dashboard legen.

## 5. Optional: jede Nacht automatisch (Automations-Editor, YAML-Modus)

```yaml
alias: Merker nachts aktualisieren
mode: single
triggers:
  - trigger: time
    at: "03:17:00"
actions:
  - action: script.merker_aktualisieren
```

## Zurück zur vorigen Version

Die vorige Version liegt nach jedem Update unter `/config/merker_backup`. Zurück: Ordner `/config/www/merker` löschen und `/config/merker_backup` dorthin umbenennen.
