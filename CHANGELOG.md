# Merker: Änderungen

Neueste Version oben. Jede Version hat eine eigene Überschrift.

## Version 1.0.1

Schickt Home Assistant nach einer eigenen Änderung genau den Stand zurück, der schon angezeigt wird, zeichnet die App die Liste nicht mehr neu. Vorher wurde dabei eine Zeile ersetzt, die man gerade wischt. Wer zwei Aufgaben schnell hintereinander erledigte, verlor so manchmal das zweite Wischen.

## Version 1.0.0

Erste Version im Repository. Inhalt wie 0.39.2, dazu: App im Ordner `app/`, Tests mit nachgebautem Home-Assistant-Server in `tests/`, Regeln für Claude Code in `CLAUDE.md`, Einspielen nach Home Assistant über `ha/merker_update.sh`.

## Version 0.39.2

Fixes aus dem Code-Review:
- Eigene Bilder und Abteilungen: Jede Änderung wird einzeln auf den aktuellen Stand in Home Assistant angewendet. Zwei Geräte überschreiben sich nicht mehr gegenseitig, auch nicht nach Änderungen ohne Verbindung.
- Updates nur vollständig: Lässt sich beim Laden einer neuen Version eine Datei nicht holen, wird die Version verworfen und später erneut versucht. Die alte läuft weiter.
- Langes Drücken auf eine Kachel nimmt immer den neuesten Stand des Artikels.

## Version 0.39.1

Löschen per Wischen schon ab der Hälfte, die eingestellte Aktion nach links dann ab einem Viertel. Fix: Das Symbol hinter der Zeile lag beim Zurückfedern kurz über der Aufgabe.

## Version 0.39.0

Ganz weit nach links wischen (ab 75 % der Breite) löscht die Aufgabe, mit Rückgängig. Die Zeile wird dabei rot, das Handy vibriert doppelt. Abschaltbar unter Einstellungen, Bedienung.

## Version 0.38.1

Meldung beim Erledigen nennt den Titel ("Erledigt: Milch"), zu lange Titel werden mit … gekürzt, Rückgängig bleibt sichtbar.

## Version 0.38.0

Einkaufsansicht: Stichwörter stark erweitert (rund 640 statt 70, zum Beispiel Ketchup, Senf, Backzutaten, Saucen, Drogerie, Haushalt). Abteilung pro Artikel selbst wählbar (lange drücken, Zeile "Abteilung"). Die Wahl liegt wie die Bilder in Home Assistant beim Benutzer und hat Vorrang vor der automatischen Zuordnung.

## Version 0.37.0

Einkaufsansicht erweitert:
- Bilder passen besser: Stichwörter zählen nur am Wortanfang oder Wortende, das Wortende gewinnt ("Orangensaft" ist Saft, "Teelichter" sind Kerzen).
- Kacheln nach Abteilungen in Ladenreihenfolge (Obst und Gemüse, Brot, Milch, Fleisch, Vorrat, Süßes, Tiefkühl, Getränke, Drogerie, Haushalt, Tierbedarf, Sonstiges).
- Mehrere Artikel auf einmal mit Komma ("Milch, Brot, Eier").
- Lange drücken: kleines Fenster mit Mengen-Knöpfen, Notiz und Bildauswahl. Notiz steht in der Beschreibung, das Bild in Home Assistant beim Benutzer (gilt auf allen Geräten).
- Bildschirm bleibt an, solange die Kacheln offen sind.
- "Zuletzt gekauft" einklappbar.
- Kurzbefehl "Einkaufsliste" am App-Symbol.
- Darstellung: drei oder vier Kacheln pro Reihe.

## Version 0.36.0

Einkaufsliste: In den Einstellungen einer Liste unter "Ansicht" lässt sie sich als Einkaufsliste markieren (nur auf diesem Gerät). Sie bekommt dann 🛒 in der Übersicht und öffnet sich als Kacheln, drei pro Reihe, wie bei Bring!. Antippen hakt ab, die Kachel wandert zu "Zuletzt gekauft", dort antippen setzt sie zurück auf die Liste. Lange drücken öffnet den Dialog. Oben "Was brauchst du?" zum Hinzufügen und Filtern, ein bekannter Artikel kommt aus "Zuletzt gekauft" zurück statt doppelt. Passende Bilder über Stichwörter (Milch 🥛, Brot 🍞 …), sonst der Anfangsbuchstabe. Knopf oben schaltet zur normalen Listenansicht.

## Version 0.35.1

Neues App-Symbol: zwei gestapelte Karten, vorn eine Liste mit Haken.

## Version 0.35.0

Hinweis "Version … verfügbar" mit Knopf "Neu laden" oben, sobald eine neue Version auf dem Server liegt. Geprüft wird beim Start, beim Zurückkehren in die App und alle 30 Minuten. Die neue Version wartet, bis man auf "Neu laden" tippt.

## Version 0.34.0

Fixes aus dem Code-Review:
- Vorgemerkte Änderungen warten, bis ihre Liste verfügbar ist (zum Beispiel nach einem Neustart von Home Assistant), statt verworfen zu werden.
- Abmelden löscht auch wartende Änderungen, letzte Suchen und zuletzt genutzte Listen.
- Start-Reparatur und "Cache leeren" löschen ohne Netz nichts mehr.
- Riss die Verbindung beim Senden einer vorgemerkten neuen Aufgabe ab, prüft die App vor dem nächsten Versuch, ob sie schon angelegt ist (keine Doppelten).
- Uhrzeit einer Fälligkeit bleibt bei Rückgängig, Verschieben, Duplizieren, Wiederholen und beim Ändern des Datums erhalten.
- Kaputte Adresse führt zur Startseite statt zum Absturz.

## Version 0.33.2

Fix: "Cache leeren", die Reparatur beim Start und das Aktivieren einer neuen Version löschen nur noch Service Worker und Caches von Merker. Das HA-Frontend und andere Apps unter derselben Adresse bleiben unberührt.

## Version 0.33.1

KW steht jetzt als Titel ("46. Woche"). Neue Liste: Hinweis, dass sie in Home Assistant als lokale To-do-Liste angelegt wird.

## Version 0.33.0

Wochenansicht mit Kalenderwoche über dem Zeitraum. KW antippen: Woche frei eingeben (kleiner als die aktuelle heißt nächstes Jahr). Zeitraum antippen: Auswahl der nächsten 12 Wochen oder "KW eingeben".

## Version 0.32.1

Fix: Eingeklappte Tage in der Wochenansicht zeigten "null".

## Version 0.32.0

Wochenansicht: Tage per Antippen der Überschrift ein- und ausklappbar. Datum an den Aufgaben entfällt (steht schon über dem Tag), nur Überfälliges zeigt es noch. Größere Pfeile, "Ab heute" immer sichtbar. Leere Tage zurückgenommen. Listenansicht: Anzahl offener Aufgaben links neben der Sortierung.

## Version 0.31.1

"Cache leeren" hat in den Einstellungen ein eigenes Symbol in Orange, damit es sich von den blauen Zeilen und vom roten "Abmelden" abhebt.

## Version 0.31.0

Wochenansicht: Kalender-Symbol oben auf der Startseite. Zeigt die nächsten 7 Tage nach Tagen über alle Listen (Heute, Morgen, dann Wochentage), Überfälliges oben, leere Tage mit "Nichts geplant". Mit ‹ › wochenweise blättern, "Ab heute" springt zurück. "+" am Tag legt eine Aufgabe mit diesem Datum an.

## Version 0.30.1

Markierungen an Aufgaben (Datum, Listenname, Fortschritt der Unteraufgaben) mit kleinen Ecken statt rund.

## Version 0.30.0

Unteraufgaben bei "Neue Aufgabe" und schlanker beim Bearbeiten: kleiner Knopf "+ Unteraufgabe" neben "Beschreibung". Erst danach erscheint der Bereich mit Eingabezeile (Enter fügt hinzu, × entfernt). Beim Bearbeiten ist er sofort offen, wenn es schon Unteraufgaben gibt.

## Version 0.29.2

Wiederkehrende Aufgaben zeigen überall ein kleines Wiederholen-Symbol vor dem Datum, auch auf der Startseite. Die Zeile "🔁 …" steht dafür nicht mehr im Beschreibungstext der Zeile.

## Version 0.29.1

Einstellungen: Verbindung mit Status, Home-Assistant-Adresse und Version direkt oben. "Cache leeren" als Zeile über "Abmelden", ohne Rückfrage. Sprache als Liste zum Antippen statt Auswahlfeld.

## Version 0.29.0

Offline vormerken: Ohne Verbindung lassen sich Aufgaben abhaken, anlegen, bearbeiten, löschen und verschieben. Die Änderungen erscheinen sofort, sind mit einer kleinen Uhr markiert, bleiben auch nach einem Neustart erhalten (localStorage merker.queue) und gehen der Reihe nach raus, sobald die Verbindung zurück ist. Das Hinweisband zählt die wartenden Änderungen. Lehnt Home Assistant eine Änderung ab, kommt eine Meldung. Neue Listen anlegen geht weiterhin nur mit Verbindung.

## Version 0.28.0

- Einstellungen neu: Statuszeile und große Zeilen mit aktuellem Stand (Listen, Darstellung, Bedienung, Sprache, Verbindung und App, Abmelden mit Rückfrage). Jede Zeile öffnet eine eigene Seite.
- Eigener App-Name (Darstellung): oben auf der Startseite und im Fenstertitel.
- Suche zeigt passende Listen oben zum direkten Öffnen. Nur der Listenname listet nicht mehr alle Aufgaben der Liste.

## Version 0.27.0

- Datum an einer Aufgabe antippen öffnet die Schnellauswahl. Im Fenster stehen die echten Tage, dazu "Datum wählen …" mit dem Kalender.
- Kurzes Vibrieren an der Wischschwelle (Symbol wird größer) und beim Abhaken.
- Neue Sortierung "Nach Fälligkeit" mit Abschnitten: Überfällig, Heute, Nächste 7 Tage, Später, Ohne Datum.
- Suche: Treffer im Titel markiert, Anzahl, Erledigte ein- und ausblendbar, die letzten fünf Suchbegriffe zum Antippen.
- Einstellung "Kompakte Ansicht".
- Einstellung "Wischen nach links": Verschieben, Löschen oder Datum.

## Version 0.26.0

Neue Aufgabe: Kopf als Farbband der gewählten Liste ("Neue Aufgabe in" und Listenname mit Pfeil). Antippen öffnet die Listenauswahl. Die Chip-Zeile "Liste" entfällt.

## Version 0.25.5

Wiederholen als kleiner Knopf neben "Fälligkeit" (Auswahl im Fenster). Bearbeiten unten rechts: Verschieben, Duplizieren, Teilen. Einstellungen: Unteraufgaben direkt nach den Listen. Escape schließt nur das oberste Fenster.

## Version 0.25.4

Meldung nach dem Schließen eines Dialogs (z. B. "Hinzugefügt zu …") erscheint gleich unten über dem Plus-Button statt kurz oben.

## Version 0.25.3

Einstellungen: Listen zuklappbar (zu: "Listen" und die Anzahl). Erscheinungsbild als drei Knöpfe nebeneinander (Gerät, Hell, Dunkel).

## Version 0.25.2

Bearbeiten-Dialog: Kopf als Band in der Listenfarbe mit Listenname und Speichern, bleibt beim Scrollen oben.

## Version 0.25.1

Fehler behoben: Bei offenem Dialog in der Listenansicht wurde die Meldung (z. B. "Unteraufgabe gelöscht") bildschirmhoch.

## Version 0.25.0

- Langes Drücken (oder Rechtsklick) auf eine Aufgabe: neues Datum ohne Dialog (Heute, Morgen, Wochenende, Nächste Woche, Kein Datum), mit Rückgängig.
- Erledigt-Datum: Beim Abhaken kommt "✓ TT.MM.JJJJ" als letzte Zeile in die Beschreibung, beim Wieder-Öffnen fällt sie weg.
- Wiederholen (täglich, wöchentlich, alle 2 Wochen, monatlich, jährlich) im Dialog, gespeichert als Zeile "🔁 wöchentlich" in der Beschreibung. Beim Abhaken legt die App die nächste Runde mit neuem Datum an (Unteraufgaben wieder offen), Rückgängig räumt auf.
- Unteraufgaben per Griff links umsortieren. Einstellung "Erledigte nach unten".
- Duplizieren im Bearbeiten-Dialog, auf Wunsch in eine andere Liste.
- Erscheinungsbild: wie das Gerät, Hell oder Dunkel.

## Version 0.24.0

Mehrere Zeilen, mehrere Aufgaben: Mehrzeiliger Text, eingefügt ins Titelfeld von "Neue Aufgabe" oder über "Teilen an Merker", zeigt eine Vorschau. Wahl: "Einzeln anlegen" (in Reihenfolge, Rückgängig entfernt alle) oder "Als Checkliste" (eine Aufgabe mit Unteraufgaben). Aufzählungszeichen, Nummern, Kästchen und WhatsApp-Vorspann werden entfernt, doppelte und leere Zeilen fallen weg, "!" am Zeilenanfang wird Prio. Ab 50 Zeilen Rückfrage.

## Version 0.23.3

Datum-Knopf: Datum mit Leerzeichen, Cursor dahinter in derselben Zeile, bisheriger Text in der nächsten Zeile.

## Version 0.23.2

Bearbeiten: kleiner Knopf "Datum" neben "Beschreibung" setzt das heutige Datum (TT.MM.JJJJ) als erste Zeile, Cursor in der Zeile darunter.

## Version 0.23.1

Sprache als Auswahlliste. Akzentfarbe und Sprache stehen unter den Listen, über den Aktionen. Knöpfe, Chips, Eingabefelder und Meldungen mit 10 px Abrundung statt Pillenform.

## Version 0.23.0

Englisch: locales/en.json. Sprache folgt dem Gerät (nicht unterstützte Sprachen: Englisch), in den Einstellungen wählbar: Automatisch, Deutsch, English. Datumsformate folgen der Region des Geräts. Der Startschutz hat seine Texte auf Deutsch und Englisch.

Neue Sprache: locales/en.json kopieren, übersetzen, in js/i18n.js unter LANGUAGES und in sw.js unter ASSETS eintragen, in boot.js die vier Texte ergänzen.

## Version 0.22.0

Vorbereitung für weitere Sprachen: Alle Texte der Oberfläche stehen in locales/de.json, der Code nutzt nur Schlüssel über t() aus js/i18n.js (Platzhalter wie {n}, Mehrzahl über Intl.PluralRules, Datumsformate über meta.locale). Sichtbar ändert sich nichts. Ausnahme: der Startschutz in boot.js, der vor allen Modulen läuft.

## Version 0.21.0

Bearbeiten: Speichern oben rechts. Meldungen erscheinen bei offenem Dialog oben und sonst über dem Plus-Button. Vorschläge beim Tippen im Dialog "Neue Aufgabe" (erledigte Einträge der gewählten Liste wieder öffnen). Dialoge passen auch auf sehr schmale Anzeigen. CSS aufgeräumt (ungenutzte Regeln entfernt, doppelte Selektoren zusammengeführt, gleiche Medienabfragen gebündelt), geprüft über berechnete Styles in 44 Zuständen.

## Version 0.20.2

Startseite: "Alle anzeigen" bleibt beim Wechsel des Filters aufgeklappt.

## Version 0.20.1

Karten, Kacheln und Einstellungsblöcke haben dieselbe Abrundung (10 px) wie die Filterleiste.

## Version 0.20.0

Startseite: Filter als zusammenhängende Segmentleiste statt runder Einzelknöpfe.

## Version 0.19.2

Neue Aufgabe: Hinzufügen-Knopf oben rechts neben dem Titel, damit er mit offener Tastatur sichtbar bleibt.

## Version 0.19.1

Einstellungen: Listen als Zeilen mit Initial-Kreis in der Listenfarbe, Akzentfarbe immer sichtbar. Bearbeiten-Dialog: Löschen links unten, rechts Teilen, Verschieben und Speichern.

## Version 0.19.0

Startseite: kein Filter "Offen" mehr, stattdessen rechts die Anzahl offener Aufgaben als reine Anzeige. Einstellungen: Übersicht mit Liste der Listen, Antippen öffnet die Einstellungen der Liste (Farbe, Sortierung, Anheften, Ausblenden, Deaktivieren, Funktionen von Home Assistant).

## Version 0.18.3

Bearbeiten: alle Knöpfe unten in einer Zeile, Teilen als Symbol links unten.

## Version 0.18.2

Bearbeiten: Priorität als ❗-Knopf vor dem Titel, keine Extrazeile mehr.

## Version 0.18.1

autocomplete="off" aus allen Textfeldern entfernt, damit Android die Tastaturvorschläge (Wortvorhersage) anzeigt.

## Version 0.18.0

Unteraufgaben bearbeiten: Stift rechts in der Zeile, Enter oder Verlassen speichert, Escape verwirft.

## Version 0.17.0

Sortierung in der Liste öffnet ein Auswahlfenster statt durchzuschalten. Der Eintrag "Eintrag hinzufügen" unter den Aufgaben entfällt, der Plus-Button unten rechts bleibt.

## Version 0.16.0

Neue Aufgabe: Prio als Knopf mit Ausrufezeichen vor dem Titel, Feld heißt "Fälligkeit". Listenansicht: Der Eintrag "Eintrag hinzufügen" steht unter den offenen Aufgaben, der Plus-Button unten rechts ist auch dort sichtbar. Beide öffnen denselben Dialog mit der aktuellen Liste. Die Eingabeleiste und die Vorschläge beim Tippen entfallen.

## Frühere Versionen (0.7 bis 0.15)

Vor 0.16 gab es keine Einträge je Version. Die wichtigsten Neuerungen aus dieser Zeit:

### PC-Ansicht (ab 0.7.1)

Ab 700 Pixel Breite sitzt die App in einer zentrierten Spalte (780 px), Dialoge erscheinen mittig, die Listenkacheln stehen in drei Spalten. Mit der Maus erscheint links an jeder Aufgabe ein Kreis zum Erledigen (mit Rückgängig). Tastatur auf der Startseite: `/` öffnet die Suche, `n` eine neue Aufgabe.

### Offline lesen (ab 0.12.0)

Die App merkt sich Listen und Einträge vom letzten Stand mit Verbindung (im Speicher des Browsers, nach dem Laden und bei jeder Änderung). Ohne Verbindung oder bei einem Neustart ohne Netz zeigt sie diesen Stand mit dem Hinweis "Stand: heute, 14:32". Lesen, Suchen und Dialog öffnen gehen, Schreiben ist gesperrt. Sobald Home Assistant antwortet, ersetzt der Live-Stand den gespeicherten. Beim Abmelden wird der gespeicherte Stand gelöscht.

### Akzentfarbe (ab 0.9.0)

Einstellungen, Abschnitt "Akzentfarbe": acht Farben zur Wahl. Sie färbt Knöpfe, Auswahl, Hinweise und leicht auch Flächen und Hintergrund, in Hell und Dunkel. Die Wahl liegt nur auf dem Gerät. Das Startskript setzt sie vor dem Laden der App, damit nichts in der alten Farbe aufblitzt. Der Eintrag "Standard" entspricht dem bisherigen Blau.

### Datum, Teilen, Kurzbefehl, Alle löschen (ab 0.10.0)

- Eingabeleiste: Der Kalender-Knopf links neben dem Senden-Knopf öffnet den Datumsdialog des Geräts. Das Datum steht im Knopf, das Kreuz daneben entfernt es. Nach dem Hinzufügen ist es wieder leer. Der Knopf erscheint nur bei Listen mit Datum-Funktion.
- Teilen: Merker steht im Android-Teilen-Menü (nur bei installierter App). Der geteilte Titel oder die erste Zeile wird der Titel, der Rest samt Adresse die Beschreibung. Der Dialog "Neue Aufgabe" öffnet sich vorausgefüllt.
- Kurzbefehl: Langes Drücken auf das App-Symbol zeigt "Neue Aufgabe". Android übernimmt Änderungen am Manifest nicht sofort, notfalls die App einmal neu installieren.
- Erledigt: In der Zeile "Erledigt" löscht "Alle löschen" alle erledigten Einträge der Liste ohne Rückfrage. "Rückgängig" legt sie neu an und setzt sie wieder auf erledigt (Reihenfolge innerhalb der erledigten kann sich ändern).

### Einstellungen und eigene Farben (ab 0.12.0)

Oben steht fest die Verbindung, unten fest die Aktionen. Dazwischen liegen vier aufklappbare Gruppen (Akzentfarbe, Farbe je Liste, Sortierung je Liste, Funktionen je Liste). Die Farben stehen in einer Zeile, der letzte Kreis ist die eigene Farbe. Er öffnet einen Schieberegler für den Farbton und ein Feld für den Hexcode (Anzeige und Einfügen). Übernommen wird der Farbton, Sättigung und Helligkeit legt die App selbst fest, damit es in Hell und Dunkel lesbar bleibt. "Alle löschen" bei "Erledigt" erscheint nur, wenn die Erledigt-Liste aufgeklappt ist.

Teilen und Kurzbefehl (0.10.0) gehen nur, wenn die App über Chrome als App installiert ist (Menü "App installieren"), nicht als bloße Verknüpfung. Android übernimmt Manifest-Änderungen beim Start der App höchstens einmal am Tag. Zuverlässig geht es mit Deinstallieren und neu Installieren.

### Rückgängig an alter Stelle (ab 0.12.1)

Rückgängig bei Löschen und Verschieben setzt den Eintrag an seinen alten Platz in der Reihenfolge zurück (wenn die Liste Verschieben kann) und stellt auch den Erledigt-Status wieder her. Ohne Verschieben-Recht steht er am Ende der Liste.

### Unteraufgaben (ab 0.13.0)

Unteraufgaben stehen als Checkliste in der Beschreibung: `- [ ] Text` (offen) und `- [x] Text` (erledigt), je Zeile eine. Im Dialog erscheinen sie als Kästchen über der Beschreibung. Antippen speichert sofort, unten kann man mit Enter eine neue Unteraufgabe anfügen. Auf der Karte steht ein kleiner Fortschritt wie "2/5", die Checklisten-Zeilen selbst werden dort nicht gezeigt. Das Format ist normales Markdown, auch in Home Assistant selbst lesbar. Nach links wischen löscht eine Unteraufgabe, "Rückgängig" setzt sie an dieselbe Stelle zurück (auch noch nach dem Schließen des Dialogs). Das Erledigen der Hauptaufgabe ändert die Unteraufgaben nicht.

### Kleine Alltagsfunktionen (ab 0.14.0)

- Vorschläge beim Tippen: Ab zwei Buchstaben zeigt die Eingabeleiste bis zu drei passende erledigte Einträge der Liste. Antippen öffnet den alten Eintrag wieder (mit "Rückgängig").
- Schnell-Datum: Im Dialog und bei "Neue Aufgabe" setzen die Knöpfe Heute, Morgen, Nächste Woche (Montag) und Keine (kein Datum) die Fälligkeit.
- Filter auf der Startseite: Überfällig, Heute, Diese Woche (heute bis in 7 Tagen) und ❗ Prio, jeweils über alle Listen und mit Anzahl. Nochmal Antippen hebt den Filter auf.
- Liste teilen: Der Teilen-Knopf in der Listenansicht schickt Listenname und offene Einträge (mit Datum) als Text über das Android-Teilen-Menü, am PC in die Zwischenablage.
- Startseite ordnen: In den Einstellungen unter "Startseite" Listen am Griff ziehen, anheften (stehen zuerst) oder ausblenden (nur als Kachel, fällige Einträge und Suche bleiben). Gilt nur auf diesem Gerät.
- Links und Nummern: Im Dialog erscheinen Web-Adressen, E-Mail-Adressen und Telefonnummern aus Titel und Beschreibung als antippbare Knöpfe.

### Zähler, Stecknadel, Teilen, Deaktivieren (ab 0.15.0)

- Eine Zeile oben auf der Startseite ersetzt Zusammenfassung und Filter: ❗ (wichtig, alle offenen Prio-Einträge), Überfällig, Diese Woche (heute bis in 7 Tagen) und Offen, jeweils mit Anzahl. Antippen filtert über alle Listen, nochmal Antippen hebt den Filter auf. Die Zeile passt auch auf schmale Handys in eine Zeile und scrollt notfalls.
- Angeheftete Listen tragen auf ihrer Kachel eine Stecknadel.
- Einzelne Aufgaben teilen: Im Dialog der Knopf "Teilen" schickt Titel, Fälligkeit und Beschreibung über das Android-Teilen-Menü (am PC in die Zwischenablage).
- Deaktivieren: In den Einstellungen unter "Startseite" lädt "Deaktivieren" eine Liste gar nicht mehr. Sie hat keine Kachel, taucht weder bei Fällig noch in der Suche noch als Ziel zum Verschieben auf und wird nicht synchronisiert. Dort lässt sie sich wieder einschalten. Ausblenden entfernt dagegen nur die Kachel.
