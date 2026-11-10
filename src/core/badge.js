/**
 * The README badge: a small flat SVG in the familiar two-tone shape.
 * Self-contained, so it works from a file in your repo with no badge service involved.
 */

import { escapeXml, formatPct } from './format.js';
import { t } from './i18n.js';
import { styleById } from './styles.js';

/** Verdana 11px advance widths, close enough for layout. `textLength` pins the final width. */
function measure(text) {
  let w = 0;
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x2e80) w += 11;
    else if (ch === ' ') w += 3.9;
    else if ("il.,:;'|!".includes(ch)) w += 3.6;
    else if ('mwMW%'.includes(ch)) w += 10.6;
    else if (ch >= 'A' && ch <= 'Z') w += 7.9;
    else if (ch >= '0' && ch <= '9') w += 7;
    else w += 6.6;
  }
  return Math.ceil(w);
}

/**
 * @param {object} report  output of the aggregator
 * @param {{ lang?: string, label?: string }} [opts]
 * @returns {string} a complete SVG document
 */
export function renderBadge(report, opts = {}) {
  const lang = opts.lang === 'zh' ? 'zh' : 'en';
  const label = opts.label || (lang === 'zh' ? '含 AI 量' : 'AI by volume');
  const value = `${formatPct(report.abv)}%`;
  const color = styleById(report.style).ink;

  const lw = measure(label);
  const vw = measure(value);
  const leftW = lw + 12;
  const rightW = vw + 12;
  const width = leftW + rightW;
  const title = `${label}: ${value}`;
  const font = "Verdana, Geneva, DejaVu Sans, 'PingFang SC', 'Microsoft YaHei', sans-serif";

  // Coordinates are ×10 with a 0.1 scale, the usual trick for crisp text at 11px.
  const lx = (leftW / 2) * 10;
  const vx = (leftW + rightW / 2) * 10;
  const pair = (x, len, content) =>
    `<text aria-hidden="true" x="${x}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${len * 10}">${escapeXml(content)}</text>` +
    `<text x="${x}" y="140" transform="scale(.1)" fill="#fff" textLength="${len * 10}">${escapeXml(content)}</text>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${escapeXml(title)}">` +
    `<title>${escapeXml(title)}</title>` +
    `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>` +
    `<clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>` +
    `<g clip-path="url(#r)">` +
    `<rect width="${leftW}" height="20" fill="#555"/>` +
    `<rect x="${leftW}" width="${rightW}" height="20" fill="${color}"/>` +
    `<rect width="${width}" height="20" fill="url(#s)"/>` +
    `</g>` +
    `<g fill="#fff" text-anchor="middle" font-family="${escapeXml(font)}" text-rendering="geometricPrecision" font-size="110">` +
    pair(lx, lw, label) +
    pair(vx, vw, value) +
    `</g>` +
    `</svg>\n`
  );
}

/** A ready-to-paste Markdown snippet pointing at a badge file committed to the repo. */
export function badgeMarkdown(file, lang = 'en') {
  const alt = t(lang, 'title');
  return `![${alt}](${file})`;
}
