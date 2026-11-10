// Generated from src/core by `npm run sync:web`. Do not edit here.
/**
 * The label: a 1200×630 SVG you can drop into a README, a tweet or a slide.
 *
 * Hand-built SVG, no fonts embedded, no scripts, no external requests,
 * so GitHub renders it as-is and it looks the same everywhere (give or take a serif).
 */

import { escapeXml, formatCompact, formatInt, formatPct } from './format.js';
import { agedText, styleName, styleTagline, t, tastingNotes } from './i18n.js';
import { toolColor, toolName } from './signatures.js';
import { styleById } from './styles.js';

const W = 1200;
const H = 630;

const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', 'Songti SC', 'Noto Serif CJK SC', SimSun, serif";
const SANS =
  "'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

export const THEMES = {
  paper: {
    bg: '#F3EAD7',
    bg2: '#EADFC6',
    ink: '#2B2119',
    muted: '#7A6A58',
    rule: '#2B2119',
    track: '#DDD0B6',
    human: '#4A3D31',
    accentOf: (style) => style.ink,
  },
  night: {
    bg: '#0F1217',
    bg2: '#171C24',
    ink: '#EFE7D6',
    muted: '#8C93A1',
    rule: '#EFE7D6',
    track: '#252C38',
    human: '#D8D0C0',
    accentOf: (style) => style.accent,
  },
};

function isCjk(cp) {
  return (cp >= 0x2e80 && cp <= 0x9fff) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xff00 && cp <= 0xffef);
}

/** Rough text width in px. SVG cannot measure text for us, so we estimate and leave headroom. */
export function estimateWidth(text, size, spacing = 0) {
  let em = 0;
  let n = 0;
  for (const ch of String(text)) {
    n += 1;
    const cp = ch.codePointAt(0);
    if (isCjk(cp)) em += 1;
    else if (ch === ' ') em += 0.3;
    else if ("il.,:;'|!jtf()[]".includes(ch)) em += 0.32;
    else if ('mwMW@%'.includes(ch)) em += 0.88;
    else if (ch >= 'A' && ch <= 'Z') em += 0.7;
    else if (ch >= '0' && ch <= '9') em += 0.56;
    else em += 0.52;
  }
  return em * size + spacing * n;
}

/** Shrink (then, as a last resort, truncate) text so it fits `maxWidth`. */
function fit(text, maxWidth, size, minSize, spacing = 0, factor = 1) {
  let s = String(text);
  let fontSize = size;
  const measure = (str, px) => estimateWidth(str, px, spacing) * factor;
  const width = measure(s, fontSize);
  if (width > maxWidth) fontSize = Math.max(minSize, Math.floor((fontSize * maxWidth) / width));
  while (measure(s, fontSize) > maxWidth && [...s].length > 4) {
    s = [...s].slice(0, -2).join('').trimEnd() + '…';
  }
  return { text: s, size: fontSize };
}

/** Greedy wrap by estimated width. Breaks at spaces, or between CJK characters. */
function wrapByWidth(text, maxWidth, size, maxLines) {
  const tokens = String(text).match(/[⺀-鿿＀-￯]|[^\s⺀-鿿＀-￯]+|\s+/g) || [];
  const lines = [];
  let current = '';
  for (const token of tokens) {
    if (estimateWidth(current + token, size) > maxWidth && current.trim()) {
      lines.push(current.trim());
      current = /^\s+$/.test(token) ? '' : token;
    } else {
      current += token;
    }
  }
  if (current.trim()) lines.push(current.trim());
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/[\s,.;，。、]*$/, '') + '…';
    return kept;
  }
  return lines;
}

function text(x, y, content, attrs = {}) {
  const a = Object.entries(attrs)
    .filter(([, v]) => v != null && v !== false)
    .map(([k, v]) => `${k}="${escapeXml(v)}"`)
    .join(' ');
  return `<text x="${x}" y="${y}" ${a}>${escapeXml(content)}</text>`;
}

const upper = (lang, s) => (lang === 'zh' ? s : String(s).toUpperCase());

/**
 * @param {object} report  output of the aggregator
 * @param {{ lang?: string, theme?: 'paper'|'night' }} [opts]
 * @returns {string} a complete SVG document
 */
export function renderCard(report, opts = {}) {
  const lang = opts.lang === 'zh' ? 'zh' : 'en';
  const theme = THEMES[opts.theme] || THEMES.paper;
  const style = styleById(report.style);
  const accent = theme.accentOf(style);
  const caps = lang === 'zh' ? 2 : 3; // letter-spacing for small caps
  const src = report.metric === 'lines' ? report.byLines : report.byCommits;
  const parts = [];

  // ── Backdrop and frame ─────────────────────────────────────────────────────
  parts.push(
    `<defs>`,
    `<radialGradient id="glow" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${theme.bg}"/><stop offset="1" stop-color="${theme.bg2}"/></radialGradient>`,
    `<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${theme.track}"/><line x1="0" y1="0" x2="0" y2="6" stroke="${theme.muted}" stroke-width="2" opacity="0.55"/></pattern>`,
    `</defs>`,
    `<rect width="${W}" height="${H}" fill="url(#glow)"/>`,
    `<rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="${theme.rule}" stroke-width="3" rx="6"/>`,
    `<rect x="28" y="28" width="${W - 56}" height="${H - 56}" fill="none" stroke="${theme.rule}" stroke-width="1" rx="3" opacity="0.55"/>`,
  );

  // ── Top line ───────────────────────────────────────────────────────────────
  const LEFT = 70;
  const RIGHT = 1130;
  parts.push(
    text(LEFT, 80, upper(lang, t(lang, 'title')), {
      'font-family': SANS,
      'font-size': 17,
      'font-weight': 700,
      'letter-spacing': caps + 1,
      fill: accent,
    }),
  );
  const bottled = report.generatedAt ? t(lang, 'bottled', { date: report.generatedAt.slice(0, 10) }) : '';
  const aged = agedText(lang, report);
  const topRight = [aged, bottled].filter(Boolean).join('  ·  ');
  parts.push(
    text(RIGHT, 80, upper(lang, topRight), {
      'font-family': SANS,
      'font-size': 14,
      'letter-spacing': caps - 1,
      'text-anchor': 'end',
      fill: theme.muted,
    }),
  );

  // ── Left column: name, the number, the style ───────────────────────────────
  const LEFT_W = 570;
  const repoName = report.repo?.name || 'repository';
  const name = fit(repoName, LEFT_W, 50, 26, 0, 1.12); // bold serif runs wide
  parts.push(
    text(LEFT, 152, name.text, { 'font-family': SERIF, 'font-size': name.size, 'font-weight': 700, fill: theme.ink }),
    `<line x1="${LEFT}" y1="176" x2="${LEFT + 90}" y2="176" stroke="${accent}" stroke-width="4"/>`,
  );

  const number = formatPct(report.abv);
  const metricNote = upper(lang, t(lang, report.metric === 'lines' ? 'byVolumeNote' : 'byCommitsNote'));
  parts.push(
    `<text x="${LEFT - 6}" y="368" font-family="${escapeXml(SERIF)}" font-weight="700" fill="${theme.ink}">` +
      `<tspan font-size="196" letter-spacing="-4">${escapeXml(number)}</tspan>` +
      `<tspan font-size="96" dx="6" fill="${accent}">%</tspan>` +
      `<tspan font-family="${escapeXml(SANS)}" font-size="30" dx="16" dy="-78" letter-spacing="3" fill="${theme.ink}">ABV</tspan>` +
      // The metric note tucks under "ABV". Everything flows inline, so it follows the number
      // whatever its width; -72 steps back over the three letters above.
      `<tspan font-family="${escapeXml(SANS)}" font-size="13" font-weight="400" dx="-72" dy="24" letter-spacing="2" fill="${theme.muted}">${escapeXml(metricNote)}</tspan>` +
      `</text>`,
  );

  const sName = fit(upper(lang, styleName(lang, style.id)), LEFT_W, 30, 20, lang === 'zh' ? 6 : 5);
  parts.push(
    text(LEFT, 452, sName.text, {
      'font-family': SANS,
      'font-size': sName.size,
      'font-weight': 800,
      'letter-spacing': lang === 'zh' ? 6 : 5,
      fill: accent,
    }),
  );
  const tag = fit(styleTagline(lang, style.id), LEFT_W, 19, 14);
  parts.push(
    text(LEFT, 480, tag.text, {
      'font-family': SERIF,
      'font-size': tag.size,
      'font-style': 'italic',
      fill: theme.ink,
      opacity: 0.85,
    }),
  );

  // ── Right column: ingredients ──────────────────────────────────────────────
  const COL = 690;
  const COL_W = RIGHT - COL;
  const unit = t(lang, report.metric === 'lines' ? 'linesAdded' : 'commitsUnit');
  parts.push(
    text(COL, 132, upper(lang, t(lang, 'ingredients')), {
      'font-family': SANS,
      'font-size': 14,
      'font-weight': 700,
      'letter-spacing': caps,
      fill: theme.ink,
    }),
    text(RIGHT, 132, upper(lang, unit), {
      'font-family': SANS,
      'font-size': 12,
      'letter-spacing': caps - 1,
      'text-anchor': 'end',
      fill: theme.muted,
    }),
    `<line x1="${COL}" y1="144" x2="${RIGHT}" y2="144" stroke="${theme.rule}" stroke-width="1" opacity="0.35"/>`,
  );

  const toolValue = (tool) => (report.metric === 'lines' ? tool.lines : tool.commits);
  const rows = [{ name: t(lang, 'human'), value: src.human, fill: theme.human }];
  const tools = report.tools || [];
  const maxTools = tools.length > 4 ? 3 : 4;
  for (const tool of tools.slice(0, maxTools)) {
    rows.push({ name: toolName(tool.id), value: toolValue(tool), fill: toolColor(tool.id) });
  }
  const rest = tools.slice(maxTools);
  if (rest.length > 0) {
    rows.push({ name: t(lang, 'otherTools'), value: rest.reduce((n, tool) => n + toolValue(tool), 0), fill: toolColor('other') });
  }
  if (src.bot > 0 && (src.bot / src.total) * 100 >= 0.05) {
    rows.push({ name: t(lang, 'bots'), value: src.bot, fill: 'url(#hatch)' });
  }

  const NAME_W = 118;
  const PCT_W = 74;
  const BAR_X = COL + NAME_W;
  const BAR_W = COL_W - NAME_W - PCT_W;
  rows.forEach((row, i) => {
    const y = 178 + i * 33;
    const share = src.total > 0 ? (row.value / src.total) * 100 : 0;
    const w = share > 0 ? Math.max(3, (share / 100) * BAR_W) : 0;
    const label = fit(row.name, NAME_W - 10, 18, 13);
    parts.push(
      text(COL, y, label.text, { 'font-family': SANS, 'font-size': label.size, 'font-weight': 600, fill: theme.ink }),
      `<rect x="${BAR_X}" y="${y - 14}" width="${BAR_W}" height="16" rx="3" fill="${theme.track}"/>`,
      w > 0 ? `<rect x="${BAR_X}" y="${y - 14}" width="${w.toFixed(1)}" height="16" rx="3" fill="${row.fill}"/>` : '',
      text(RIGHT, y, `${formatPct(share)}%`, {
        'font-family': SANS,
        'font-size': 18,
        'font-weight': 700,
        'text-anchor': 'end',
        fill: theme.ink,
      }),
    );
  });

  // ── Right column: vintage chart ────────────────────────────────────────────
  const points = report.timeline?.points || [];
  const CH_TOP = 406;
  const CH_H = 54;
  const headY = 388;
  let peak = 0;
  for (const pt of points) if (!pt.empty && pt.aiShare > peak) peak = pt.aiShare;
  if (points.length >= 2 && peak > 0) {
    const scaleMax = Math.max(peak, 10);
    parts.push(
      text(COL, headY, upper(lang, `${t(lang, 'vintage')}  ·  ${t(lang, `sharePer_${report.timeline.bucket}`)}`), {
        'font-family': SANS,
        'font-size': 14,
        'font-weight': 700,
        'letter-spacing': caps - 1,
        fill: theme.ink,
      }),
      peak > 0
        ? text(RIGHT, headY, upper(lang, `${t(lang, 'peak')} ${formatPct(peak)}%`), {
            'font-family': SANS,
            'font-size': 12,
            'letter-spacing': caps - 1,
            'text-anchor': 'end',
            fill: theme.muted,
          })
        : '',
    );
    const step = COL_W / points.length;
    const gap = step > 8 ? Math.max(3, step * 0.16) : 1;
    const barW = Math.max(2, Math.min(72, step - gap));
    points.forEach((pt, i) => {
      const x = COL + i * step + (step - barW) / 2;
      if (pt.empty) return;
      const h = pt.aiShare > 0 ? Math.max(3, (pt.aiShare / scaleMax) * CH_H) : 2;
      const fill = pt.aiShare > 0 ? accent : theme.muted;
      const opacity = pt.aiShare > 0 ? 1 : 0.5;
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${(CH_TOP + CH_H - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${fill}" opacity="${opacity}"/>`,
      );
    });
    parts.push(
      `<line x1="${COL}" y1="${CH_TOP + CH_H + 2}" x2="${RIGHT}" y2="${CH_TOP + CH_H + 2}" stroke="${theme.rule}" stroke-width="1" opacity="0.35"/>`,
      text(COL, CH_TOP + CH_H + 20, points[0].key, { 'font-family': SANS, 'font-size': 12, fill: theme.muted }),
      text(RIGHT, CH_TOP + CH_H + 20, points[points.length - 1].key, {
        'font-family': SANS,
        'font-size': 12,
        'text-anchor': 'end',
        fill: theme.muted,
      }),
    );
  } else {
    // Nothing to chart (too young, or no AI at all): show the commit split instead.
    const c = report.byCommits;
    parts.push(
      text(COL, headY, upper(lang, t(lang, 'byCommits')), {
        'font-family': SANS,
        'font-size': 14,
        'font-weight': 700,
        'letter-spacing': caps - 1,
        fill: theme.ink,
      }),
      text(COL, headY + 48, `${formatPct(c.aiShare)}%`, {
        'font-family': SERIF,
        'font-size': 44,
        'font-weight': 700,
        fill: theme.ink,
      }),
      text(RIGHT, headY + 48, `${formatInt(c.ai)} ${t(lang, 'of')} ${formatInt(c.total)} ${t(lang, 'commitsUnit')}`, {
        'font-family': SANS,
        'font-size': 16,
        'text-anchor': 'end',
        fill: theme.muted,
      }),
    );
  }

  // ── Bottom band: tasting notes and the fine print ──────────────────────────
  parts.push(`<line x1="${LEFT}" y1="506" x2="${RIGHT}" y2="506" stroke="${theme.rule}" stroke-width="1" opacity="0.35"/>`);
  const notes = wrapByWidth(tastingNotes(report, lang), 900, 19, 2);
  notes.forEach((l, i) => {
    parts.push(
      text(LEFT, 538 + i * 26, l, { 'font-family': SERIF, 'font-size': 19, 'font-style': 'italic', fill: theme.ink }),
    );
  });

  const distilled = [
    t(lang, 'distilledFrom', { commits: formatInt(report.byCommits.total) }),
    report.byLines.available ? t(lang, 'andLines', { lines: formatCompact(report.byLines.total) }) : '',
    t(lang, 'caveatShort'),
  ]
    .filter(Boolean)
    .join('  ·  ');
  const fine = fit(upper(lang, distilled), 900, 12, 9, 1);
  parts.push(
    text(LEFT, 594, fine.text, {
      'font-family': SANS,
      'font-size': fine.size,
      'letter-spacing': 1,
      fill: theme.muted,
    }),
    text(RIGHT, 594, 'git-abv', { 'font-family': MONO, 'font-size': 17, 'font-weight': 700, 'text-anchor': 'end', fill: theme.ink }),
  );

  // ── The stamp ──────────────────────────────────────────────────────────────
  const stampBig = lang === 'zh' ? `${Math.round(report.abv)}°` : String(report.proof);
  const stampSmall = lang === 'zh' ? '度数' : 'PROOF';
  parts.push(
    `<g transform="translate(1066 534) rotate(-11)" fill="none" stroke="${accent}">`,
    `<circle r="44" stroke-width="3" fill="${theme.bg}"/>`,
    `<circle r="37" stroke-width="1" stroke-dasharray="3 3"/>`,
    `<text y="8" text-anchor="middle" font-family="${escapeXml(SERIF)}" font-size="32" font-weight="700" fill="${accent}" stroke="none">${escapeXml(stampBig)}</text>`,
    `<text y="26" text-anchor="middle" font-family="${escapeXml(SANS)}" font-size="9" font-weight="700" letter-spacing="2" fill="${accent}" stroke="none">${escapeXml(stampSmall)}</text>`,
    `</g>`,
  );

  const title = `${repoName}: ${number}% ${t(lang, 'title')}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(title)}">` +
    `<title>${escapeXml(title)}</title>` +
    parts.filter(Boolean).join('') +
    `</svg>\n`
  );
}
