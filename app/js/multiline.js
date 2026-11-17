// Mehrzeiliger Text (eingefügt oder aus "Teilen an Merker") wird zu einzelnen Einträgen.
// Entfernt Aufzählungszeichen, Nummern, Kästchen und den Vorspann kopierter WhatsApp-Nachrichten.
// Ein "!" oder "❗" am Zeilenanfang markiert die Zeile als Prio.

// WhatsApp: "[08.11., 14:32] Name: " (iPhone) oder "08.11.26, 14:32 - Name: " (Android)
const WHATSAPP = /^\[?\d{1,2}[./]\d{1,2}[./]?(?:\d{2,4})?,?\s+\d{1,2}:\d{2}(?::\d{2})?\]?\s*(?:-\s*)?[^:\n]{1,40}:\s+/;
// Aufzählungen: - * • · – + ▪ ◦ ‣, "1." "1)" "a)", Kästchen ☐ ☑ ✅ ✔ und Markdown "[ ]" "[x]"
// Zeichen und Nummern nur mit Leerzeichen dahinter, damit "+49 170 …" oder "1.5 kg Mehl" erhalten bleiben.
const BULLET = /^(?:(?:[-*•·–—+▪◦‣]|\d{1,3}[.)]|[a-zA-Z][)])\s+|(?:☐|☑️?|✅|✔️?|\[[ xX]?\])\s*)/;
const PRIO = /^(?:❗️?|!)\s*/;

export function splitLines(text) {
  const seen = new Set();
  const result = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    let line = raw.trim().replace(WHATSAPP, '');
    // Mehrere Zeichen hintereinander (zum Beispiel "- [ ] ") nacheinander entfernen
    for (let i = 0; i < 3 && BULLET.test(line); i++) line = line.replace(BULLET, '').trim();
    let prio = false;
    if (PRIO.test(line)) {
      prio = true;
      line = line.replace(PRIO, '').trim();
    }
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ text: line, prio });
  }
  return result;
}

// Ab dieser Anzahl fragt die App noch einmal nach, bevor sie alles anlegt.
export const CONFIRM_FROM = 50;
