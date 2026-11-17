// Liste als Text: Titel, darunter die offenen Einträge mit Datum. Zum Teilen über das Android-Menü oder zum Kopieren.
import { formatDue, isCompleted } from './rules.js';
import { t } from './i18n.js';

export function listAsText(list, items, now = new Date()) {
  const open = items.filter((item) => !isCompleted(item) && !String(item.uid).startsWith('tmp-'));
  if (open.length === 0) return '';
  const lines = open.map((item) => `- ${item.summary}${item.due ? ` (${formatDue(item.due, now)})` : ''}`);
  return [list.name, ...lines].join('\n');
}

// Eine einzelne Aufgabe als Text: Titel, Fälligkeit, Beschreibung (mit Unteraufgaben).
export function itemAsText(item, now = new Date()) {
  const lines = [item.summary];
  if (item.due) lines.push(t('share.due', { date: formatDue(item.due, now) }));
  if (item.description?.trim()) lines.push(item.description.trim());
  return lines.join('\n');
}

// Android-Teilen-Menü, sonst Zwischenablage (zum Beispiel am PC).
export async function shareOrCopy({ title, text, toast, copiedText = t('share.copied') }) {
  try {
    if (navigator.share) await navigator.share({ title, text });
    else {
      await navigator.clipboard.writeText(text);
      toast.show(copiedText);
    }
  } catch (err) {
    if (err?.name !== 'AbortError') toast.show(t('share.failed'), { error: true });
  }
}
