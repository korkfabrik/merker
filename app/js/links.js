// Findet Links, E-Mail-Adressen und Telefonnummern in einem Text. Daraus macht der Dialog antippbare Knöpfe.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const MAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE_RE = /(?<![\w@./-])(?:\+|00)?\d[\d ()/.-]{5,}\d(?![\w@])/g;

const cleanUrl = (raw) => raw.replace(/[.,;:!?)\]}]+$/, '');

function shortUrl(url) {
  const text = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
  return text.length > 30 ? `${text.slice(0, 29)}…` : text;
}

export function findLinks(text) {
  const out = [];
  const seen = new Set();
  const add = (entry) => {
    if (seen.has(entry.href)) return;
    seen.add(entry.href);
    out.push(entry);
  };
  let rest = String(text ?? '');

  for (const match of rest.matchAll(URL_RE)) {
    const url = cleanUrl(match[0]);
    add({ kind: 'url', label: shortUrl(url), href: /^www\./i.test(url) ? `https://${url}` : url });
  }
  rest = rest.replace(URL_RE, ' ');

  for (const match of rest.matchAll(MAIL_RE)) add({ kind: 'mail', label: match[0], href: `mailto:${match[0]}` });
  rest = rest.replace(MAIL_RE, ' ');

  for (const match of rest.matchAll(PHONE_RE)) {
    const raw = match[0].trim();
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) continue;
    if (!/^(\+|0)/.test(raw)) continue; // Nummern beginnen mit +, 00 oder 0
    if (/^\d{4}-\d{2}-\d{2}/.test(raw) || /^\d{1,2}\.\d{1,2}\./.test(raw)) continue; // Datum
    add({ kind: 'tel', label: raw, href: `tel:${raw.replace(/[^\d+]/g, '').replace(/^00/, '+')}` });
  }
  return out;
}

export const LINK_ICONS = { url: '🔗', mail: '✉️', tel: '📞' };
