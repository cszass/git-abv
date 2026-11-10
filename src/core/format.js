/** Small, dependency-free formatting helpers shared by every renderer. */

/** 1234567 → "1,234,567" */
export function formatInt(n) {
  const s = String(Math.round(Number(n) || 0));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 1234567 → "1.2M", 45210 → "45.2k", 812 → "812" */
export function formatCompact(n) {
  const v = Math.abs(Number(n) || 0);
  const sign = n < 0 ? '-' : '';
  if (v < 1000) return sign + String(Math.round(v));
  const units = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'k'],
  ];
  for (let i = 0; i < units.length; i++) {
    const [size, suffix] = units[i];
    if (v < size) continue;
    const x = v / size;
    let text = x.toFixed(x >= 100 ? 0 : 1);
    if (text.endsWith('.0')) text = text.slice(0, -2);
    // 999,950 would print as "1000k"; promote it to "1M" instead.
    if (text === '1000' && i > 0) return `${sign}1${units[i - 1][1]}`;
    return sign + text + suffix;
  }
  return sign + String(Math.round(v));
}

/** Share of `part` in `whole`, as a percentage. 0 when there is nothing to divide. */
export function pct(part, whole) {
  if (!whole || whole <= 0) return 0;
  return (part / whole) * 100;
}

/** Round to one decimal place, as a number. */
export function round1(x) {
  return Math.round((Number(x) || 0) * 10) / 10;
}

/**
 * Round to two decimal places. Reports keep percentages at this precision so that a trace
 * (five commits in twenty thousand) stays distinguishable from a true zero.
 */
export function round2(x) {
  return Math.round((Number(x) || 0) * 100) / 100;
}

/**
 * 37.46 → "37.5", 100 → "100", 0.04 → "<0.1", 0 → "0".
 * The "<0.1" case matters: a repo with one AI commit in ten thousand is not "0.0%".
 */
export function formatPct(x) {
  const v = Number(x) || 0;
  if (v <= 0) return '0';
  if (v < 0.05) return '<0.1';
  if (v >= 99.95) return '100';
  return v.toFixed(1);
}

/** Unix seconds → "2026-11-10" (UTC). */
export function formatDate(unixSeconds) {
  if (unixSeconds == null || !Number.isFinite(unixSeconds)) return '';
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

/** Whole years and months between two unix timestamps, e.g. { years: 3, months: 4 }. */
export function ageBetween(fromSeconds, toSeconds) {
  if (!Number.isFinite(fromSeconds) || !Number.isFinite(toSeconds) || toSeconds < fromSeconds) {
    return { years: 0, months: 0, days: 0 };
  }
  const a = new Date(fromSeconds * 1000);
  const b = new Date(toSeconds * 1000);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  months = Math.max(0, months);
  const days = Math.floor((toSeconds - fromSeconds) / 86400);
  return { years: Math.floor(months / 12), months: months % 12, days };
}

/** Terminal column width of a string: CJK and emoji take two cells. */
export function displayWidth(str) {
  let w = 0;
  for (const ch of String(str)) {
    const cp = ch.codePointAt(0);
    if (cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)) continue; // joiners, variation selectors
    if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) continue; // control characters
    if (cp >= 0x300 && cp <= 0x36f) continue; // combining marks
    w += isWide(cp) ? 2 : 1;
  }
  return w;
}

function isWide(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

/** Pad (or leave) a string to a display width. */
export function padEnd(str, width) {
  const w = displayWidth(str);
  return w >= width ? String(str) : String(str) + ' '.repeat(width - w);
}

export function padStart(str, width) {
  const w = displayWidth(str);
  return w >= width ? String(str) : ' '.repeat(width - w) + String(str);
}

/** Cut a string to a display width, adding an ellipsis when something was lost. */
export function truncate(str, width) {
  const s = String(str);
  if (displayWidth(s) <= width) return s;
  let out = '';
  let w = 0;
  for (const ch of s) {
    const cw = displayWidth(ch);
    if (w + cw > width - 1) break;
    out += ch;
    w += cw;
  }
  return out + '…';
}

/** Escape text for inclusion in SVG / HTML. */
export function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
