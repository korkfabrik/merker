// Startparameter: ?neu=1 und ?einkauf=1 (Kurzbefehle am App-Symbol) und ?title=&text=&url= (Teilen an Merker aus anderen Apps).
// Liefert { initial } für den Dialog "Neue Aufgabe" oder null, wenn die App normal startet. raw ist der erste geteilte Text (für mehrere Zeilen).
export function parseLaunch(search) {
  const params = new URLSearchParams(search);
  if (params.has('einkauf')) return { shop: true };
  const clean = (key) => (params.get(key) ?? '').trim();
  const [title, text, url] = [clean('title'), clean('text'), clean('url')];
  const parts = [...new Set([title, text, url].filter(Boolean))];
  // Eine Adresse, die schon im Text steht, nicht noch einmal anhängen.
  const unique = parts.filter((part, i) => !parts.some((other, j) => j !== i && other.length > part.length && other.includes(part) && /^https?:\/\//.test(part)));
  if (unique.length === 0) return params.has('neu') ? { initial: {} } : null;
  const lines = unique[0].split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rest = [...lines.slice(1), ...unique.slice(1)];
  let summary = lines[0];
  if (summary.length > 200) {
    rest.unshift(summary);
    summary = `${summary.slice(0, 197)}…`;
  }
  return { initial: { title: summary, description: rest.join('\n'), raw: unique[0] } };
}
