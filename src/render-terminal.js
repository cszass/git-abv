/**
 * The terminal report. Takes a report object, returns a string. No I/O.
 */

import { displayWidth, formatInt, formatPct, padEnd, padStart, truncate } from './core/format.js';
import { styleName, styleTagline, t, tastingNotes, trendOf } from './core/i18n.js';
import { toolColor, toolName } from './core/signatures.js';
import { styleById } from './core/styles.js';

const WIDTH = 76;
const MARGIN = '  ';

// ── Colour ────────────────────────────────────────────────────────────────────

function parseHex(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function to256(r, g, b) {
  const q = (v) => Math.round((v / 255) * 5);
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

function mix(hexA, hexB, ratio) {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * ratio));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {{ color?: boolean, truecolor?: boolean }} [opts]
 */
export function createPainter(opts = {}) {
  const plain = (s) => String(s);
  if (!opts.color) return { enabled: false, bold: plain, dim: plain, hex: () => plain };
  const truecolor = opts.truecolor !== false;
  const sgr = (open, close) => (s) => `\x1b[${open}m${s}\x1b[${close}m`;
  const fg = (hex) => {
    const [r, g, b] = parseHex(hex);
    return truecolor ? `38;2;${r};${g};${b}` : `38;5;${to256(r, g, b)}`;
  };
  return {
    enabled: true,
    bold: sgr(1, 22),
    dim: sgr(2, 22),
    hex: (hex) => sgr(fg(hex), 39),
  };
}

// ── Big digits ────────────────────────────────────────────────────────────────

const GLYPHS = {
  0: ['###', '# #', '# #', '# #', '###'],
  1: [' # ', '## ', ' # ', ' # ', '###'],
  2: ['###', '  #', '###', '#  ', '###'],
  3: ['###', '  #', '###', '  #', '###'],
  4: ['# #', '# #', '###', '  #', '  #'],
  5: ['###', '#  ', '###', '  #', '###'],
  6: ['###', '#  ', '###', '# #', '###'],
  7: ['###', '  #', '  #', '  #', '  #'],
  8: ['###', '# #', '###', '# #', '###'],
  9: ['###', '# #', '###', '  #', '###'],
  '.': [' ', ' ', ' ', ' ', '#'],
  '%': ['# #', '  #', ' # ', '#  ', '# #'],
  '<': ['  #', ' # ', '#  ', ' # ', '  #'],
};

/** Render text such as "37.5%" as five rows of chunky block digits. */
export function bigText(text, fill = '█') {
  const rows = ['', '', '', '', ''];
  const chars = [...String(text)];
  chars.forEach((ch, i) => {
    const glyph = GLYPHS[ch];
    if (!glyph) return;
    for (let r = 0; r < 5; r++) {
      let cell = '';
      for (const px of glyph[r]) cell += px === '#' ? fill + fill : '  ';
      rows[r] += cell + (i < chars.length - 1 ? '  ' : '');
    }
  });
  return rows;
}

// ── Bars and sparklines ───────────────────────────────────────────────────────

const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
const SPARKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const SPARKS_ASCII = ['.', ':', '-', '=', '+', '*', '#', '@'];

/** A horizontal bar: returns { filled, rest } so each half can be painted separately. */
function bar(share, width, ascii) {
  const clamped = Math.max(0, Math.min(100, share));
  if (ascii) {
    let n = Math.round((clamped / 100) * width);
    if (clamped > 0 && n === 0) n = 1;
    return { filled: '#'.repeat(n), rest: '.'.repeat(width - n) };
  }
  const exact = (clamped / 100) * width;
  let whole = Math.floor(exact);
  let part = Math.round((exact - whole) * 8);
  if (part === 8) {
    whole += 1;
    part = 0;
  }
  if (clamped > 0 && whole === 0 && part === 0) part = 1;
  const filled = '█'.repeat(whole) + EIGHTHS[part];
  const used = whole + (part > 0 ? 1 : 0);
  return { filled, rest: '░'.repeat(Math.max(0, width - used)) };
}

/** Wrap text to a display width. Breaks between CJK characters, at spaces otherwise. */
export function wrap(text, width) {
  const lines = [];
  let current = '';
  let currentWidth = 0;
  const tokens = String(text).match(/[⺀-鿿＀-￯]|[^\s⺀-鿿＀-￯]+|\s+/g) || [];
  for (const token of tokens) {
    const isSpace = /^\s+$/.test(token);
    const w = displayWidth(token);
    if (currentWidth + w > width && currentWidth > 0) {
      lines.push(current.trimEnd());
      current = '';
      currentWidth = 0;
      if (isSpace) continue;
    }
    if (isSpace && currentWidth === 0) continue;
    current += token;
    currentWidth += w;
  }
  if (current.trim()) lines.push(current.trimEnd());
  return lines;
}

// ── The report ────────────────────────────────────────────────────────────────

/**
 * @param {object} report  output of the aggregator
 * @param {Object} [opts]
 * @param {string}  [opts.lang]
 * @param {boolean} [opts.color]
 * @param {boolean} [opts.truecolor]
 * @param {boolean} [opts.ascii]      stick to 7-bit characters
 * @param {number}  [opts.top]        how many authors to list
 * @param {boolean} [opts.authors]    false hides the per-author sections
 * @param {boolean} [opts.hints]      false hides the trailing "share it" line
 */
export function renderReport(report, opts = {}) {
  const lang = opts.lang || 'en';
  const ascii = Boolean(opts.ascii);
  const p = createPainter(opts);
  const top = opts.top ?? 5;
  const dot = ascii ? '-' : '·';
  const out = [];
  const line = (s = '') => out.push(s ? MARGIN + s : '');

  const style = styleById(report.style);
  const accent = p.hex(style.accent);
  const src = report.metric === 'lines' ? report.byLines : report.byCommits;

  // Header
  const title = `git-abv ${dot} ${t(lang, 'title')}`;
  const repoLabel = (report.repo?.name || '') + (report.repo?.branch ? `@${report.repo.branch}` : '');
  const right = truncate(repoLabel, Math.max(8, WIDTH - displayWidth(title) - 3));
  const gap = Math.max(2, WIDTH - displayWidth(title) - displayWidth(right));
  line();
  line(`${p.bold('git-abv')} ${p.dim(dot)} ${t(lang, 'title')}${' '.repeat(gap)}${p.dim(right)}`);
  line();

  if (report.byCommits.total === 0) {
    line(t(lang, 'noCommits'));
    line();
    return out.join('\n') + '\n';
  }

  // Big number, with the style beside it
  const numberText = `${formatPct(report.abv)}%`;
  const big = bigText(numberText, ascii ? '#' : '█');
  const bigWidth = Math.max(...big.map((r) => r.length));
  const sideCol = Math.max(bigWidth + 4, 38);
  const sideWidth = WIDTH - sideCol;
  const tagline = wrap(styleTagline(lang, style.id), sideWidth).slice(0, 2);
  const proofText =
    lang === 'zh'
      ? t(lang, 'proof', { n: formatPct(report.abv) })
      : t(lang, 'proof', { n: report.proof });
  const metricNote = t(lang, report.metric === 'lines' ? 'byVolumeNote' : 'byCommitsNote');
  const name = styleName(lang, style.id);
  const side = [
    p.dim(`${t(lang, 'abvUnit')} ${dot} ${metricNote}`),
    p.bold(accent(lang === 'zh' ? name : name.toUpperCase())) + (ascii ? '' : `  ${style.emoji}`),
    p.dim(proofText),
    tagline[0] || '',
    tagline[1] || '',
  ];
  const shades = [0.45, 0.3, 0.15, 0, 0].map((ratio) => p.hex(mix(style.accent, '#ffffff', ratio)));
  for (let r = 0; r < 5; r++) {
    const pad = ' '.repeat(sideCol - big[r].length);
    line(shades[r](big[r]) + pad + side[r]);
  }
  line();

  // Headline numbers
  const labels = [t(lang, 'byVolume'), t(lang, 'byCommits'), t(lang, 'lately')];
  const labelWidth = Math.max(...labels.map(displayWidth)) + 2;
  const stat = (label, value, detail) =>
    line(`${padEnd(label, labelWidth)}${p.bold(padStart(`${formatPct(value)}%`, 6))}   ${p.dim(detail)}`);

  if (report.byLines.available) {
    stat(
      labels[0],
      report.byLines.aiShare,
      `${formatInt(report.byLines.ai)} ${t(lang, 'of')} ${formatInt(report.byLines.total)} ${t(lang, 'linesAdded')}`,
    );
  }
  stat(
    labels[1],
    report.byCommits.aiShare,
    `${formatInt(report.byCommits.ai)} ${t(lang, 'of')} ${formatInt(report.byCommits.total)} ${t(lang, 'commitsUnit')}`,
  );
  if (report.recent && report.byCommits.ai > 0) {
    const trend = trendOf(report);
    const arrow = trend > 0 ? (ascii ? '^' : '▲') : trend < 0 ? (ascii ? 'v' : '▼') : ascii ? '=' : '●';
    const word = t(lang, trend > 0 ? 'stronger' : trend < 0 ? 'mellower' : 'steady');
    stat(labels[2], report.recent.abv, `${t(lang, 'lastNDays', { n: report.recent.days })} ${dot} ${arrow} ${word}`);
  }
  if (!report.byLines.available) line(p.dim(t(lang, 'commitsOnly')));
  if (report.modes.authored > 0) {
    line(p.dim(t(lang, 'agentAuthored', { n: formatInt(report.modes.authored) })));
  }
  line();

  // Ingredients
  const unit = t(lang, report.metric === 'lines' ? 'linesAdded' : 'commitsUnit');
  const heading = t(lang, 'ingredients');
  line(`${p.bold(heading)}${' '.repeat(Math.max(1, WIDTH - displayWidth(heading) - displayWidth(unit)))}${p.dim(unit)}`);

  const NAME_W = 13;
  const BAR_W = 38;
  const rows = [];
  rows.push({ name: t(lang, 'human'), value: src.human, paint: (s) => s });
  const toolValue = (tool) => (report.metric === 'lines' ? tool.lines : tool.commits);
  const shown = report.tools.slice(0, 6);
  const rest = report.tools.slice(6);
  for (const tool of shown) {
    rows.push({ name: toolName(tool.id), value: toolValue(tool), paint: p.hex(toolColor(tool.id)) });
  }
  if (rest.length > 0) {
    rows.push({
      name: t(lang, 'otherTools'),
      value: rest.reduce((acc, tool) => acc + toolValue(tool), 0),
      paint: p.hex(toolColor('other')),
    });
  }
  if (src.bot > 0) rows.push({ name: t(lang, 'bots'), value: src.bot, paint: p.dim, note: t(lang, 'botsNote') });

  for (const row of rows) {
    const share = src.total > 0 ? (row.value / src.total) * 100 : 0;
    const b = bar(share, BAR_W, ascii);
    line(
      `${padEnd(truncate(row.name, NAME_W - 1), NAME_W)}${row.paint(b.filled)}${p.dim(b.rest)} ${padStart(
        `${formatPct(share)}%`,
        6,
      )} ${padStart(formatInt(row.value), 12)}`,
    );
  }
  if (src.bot > 0) line(p.dim(`${' '.repeat(NAME_W)}${t(lang, 'botsNote')}`));
  line();

  // Vintage
  const points = report.timeline?.points || [];
  if (points.length >= 2 && report.byCommits.ai > 0) {
    const ramp = ascii ? SPARKS_ASCII : SPARKS;
    let spark = '';
    let peak = null;
    for (const pt of points) {
      if (!pt.empty && (!peak || pt.aiShare > peak.aiShare)) peak = pt;
      if (pt.empty) {
        spark += '  ';
      } else if (pt.aiShare <= 0) {
        spark += p.dim((ascii ? '_' : '▁').repeat(2));
      } else {
        const idx = Math.min(7, Math.max(0, Math.ceil((pt.aiShare / 100) * 8) - 1));
        spark += accent(ramp[idx].repeat(2));
      }
    }
    const vintage = t(lang, 'vintage');
    const sub = t(lang, `sharePer_${report.timeline.bucket}`);
    const peakText = peak && peak.aiShare > 0 ? `${t(lang, 'peak')} ${formatPct(peak.aiShare)}% ${dot} ${peak.key}` : '';
    const used = displayWidth(vintage) + 2 + displayWidth(sub);
    line(
      `${p.bold(vintage)}  ${p.dim(sub)}${' '.repeat(Math.max(1, WIDTH - used - displayWidth(peakText)))}${p.dim(peakText)}`,
    );
    line(spark);
    const firstKey = points[0].key;
    const lastKey = points[points.length - 1].key;
    const axisWidth = points.length * 2;
    const axisGap = axisWidth - firstKey.length - lastKey.length;
    line(p.dim(axisGap >= 1 ? `${firstKey}${' '.repeat(axisGap)}${lastKey}` : `${firstKey} ${ascii ? '->' : '→'} ${lastKey}`));
    line();
  }

  // People
  const people = report.people;
  if (opts.authors !== false && people && people.total > 1 && people.pourers.length > 0 && top > 0) {
    line(`${p.bold(t(lang, 'pourers'))}  ${p.dim(t(lang, 'pourersNote'))}`);
    people.pourers.slice(0, top).forEach((a, i) => {
      const b = bar(a.aiShare, 16, ascii);
      const detail = `${formatInt(a.aiCommits)}/${formatInt(a.commits)} ${t(lang, 'commitsUnit')}`;
      line(
        `${padStart(String(i + 1), 2)}. ${padEnd(truncate(a.name, 21), 22)}${accent(b.filled)}${p.dim(b.rest)} ${padStart(
          `${formatPct(a.aiShare)}%`,
          6,
        )}   ${p.dim(detail)}`,
      );
    });
    line();
    if (people.sober.length > 0) {
      line(`${p.bold(t(lang, 'drivers'))}  ${p.dim(t(lang, 'driversNote'))}`);
      const named = people.sober.slice(0, 6).map((a) => `${truncate(a.name, 20)} (${formatInt(a.commits)})`);
      const extra = people.sober.length - named.length;
      let text = named.join(', ');
      if (extra > 0) text += `, ${t(lang, 'more', { n: formatInt(extra) })}`;
      for (const l of wrap(text, WIDTH)) line(l);
      line();
    }
  }

  // First pour
  if (report.firstAi) {
    const f = report.firstAi;
    const head = `${f.date}  ${f.hash}  ${toolName(f.tool)}`;
    const label = t(lang, 'firstPour');
    const room = WIDTH - displayWidth(label) - 2 - displayWidth(head) - 4;
    const subject = room > 8 ? `  ${ascii ? '"' : '“'}${truncate(f.subject || '', room)}${ascii ? '"' : '”'}` : '';
    line(`${p.bold(label)}  ${head}${p.dim(subject)}`);
    line();
  }

  // Tasting notes
  line(p.bold(t(lang, 'tastingNotes')));
  for (const l of wrap(tastingNotes(report, lang), WIDTH)) line(l);
  line();

  // Fine print
  line(p.dim((ascii ? '-' : '─').repeat(WIDTH)));
  for (const l of wrap(t(lang, 'caveat'), WIDTH)) line(p.dim(l));
  if (opts.hints !== false) {
    const arrow = ascii ? '->' : '→';
    line();
    line(
      `${p.dim(`${t(lang, 'shareIt')} ${arrow}`)} git abv --card      ${p.dim(`${t(lang, 'badge')} ${arrow}`)} git abv --badge`,
    );
  }
  line();
  const rendered = out.join('\n') + '\n';
  // truncate() marks cut text with an ellipsis; keep --ascii output 7-bit clean (names aside).
  return ascii ? rendered.replace(/…/g, '~') : rendered;
}

/** `--explain`: show which commits matched and what gave them away. */
export function renderExplain(report, opts = {}) {
  const lang = opts.lang || 'en';
  const p = createPainter(opts);
  const out = [''];
  const found = (report.signatures || []).slice(0, opts.limit ?? 15);
  if (found.length > 0) {
    out.push(MARGIN + p.bold(t(lang, 'signaturesTitle')));
    out.push('');
    for (const sig of found) {
      out.push(
        `${MARGIN}${padStart(formatInt(sig.count), 7)}  ${padEnd(truncate(toolName(sig.tool), 11), 12)}${p.dim(padEnd(sig.via, 10))} ${truncate(sig.text, 44)}`,
      );
    }
    const hidden = (report.signatures || []).length - found.length;
    if (hidden > 0) out.push(`${MARGIN}${p.dim(`${' '.repeat(9)}${t(lang, 'more', { n: formatInt(hidden) })}`)}`);
    out.push('');
  }
  out.push(MARGIN + p.bold(t(lang, 'explainTitle')));
  for (const s of report.samples || []) {
    const tools = s.tools.map(toolName).join(' + ');
    out.push('');
    out.push(
      `${MARGIN}${p.dim(s.hash)}  ${s.date}  ${p.bold(tools)} ${p.dim(`(${t(lang, s.mode)})`)}  ${truncate(s.subject || '', 40)}`,
    );
    for (const e of s.evidence) {
      out.push(`${MARGIN}    ${p.dim(padEnd(e.via, 10))} ${truncate(e.match, 60)}`);
    }
  }
  if (!report.samples || report.samples.length === 0) out.push(MARGIN + p.dim('—'));
  out.push('');
  return out.join('\n') + '\n';
}

/** `--suspects`: bot-looking identities the database does not know yet. */
export function renderSuspects(report, opts = {}) {
  const lang = opts.lang || 'en';
  const p = createPainter(opts);
  const out = [''];
  out.push(MARGIN + p.bold(t(lang, 'suspectsTitle')));
  const list = (report.suspects || []).slice(0, opts.limit ?? 40);
  if (list.length === 0) {
    out.push(MARGIN + p.dim(t(lang, 'suspectsNone')));
  } else {
    for (const l of wrap(t(lang, 'suspectsNote'), WIDTH)) out.push(MARGIN + p.dim(l));
    out.push('');
    for (const s of list) {
      out.push(`${MARGIN}${padStart(formatInt(s.count), 7)}  ${padEnd(s.as, 6)} ${truncate(s.identity, 58)}`);
    }
  }
  out.push('');
  return out.join('\n') + '\n';
}
