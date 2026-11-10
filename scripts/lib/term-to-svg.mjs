/**
 * Turn ANSI terminal output into a crisp, font-independent SVG "screenshot".
 *
 * Block characters (█ ░ ▁▂▃… ▏▎▍…) and rules (─) are drawn as rectangles rather than glyphs,
 * so bars and big digits line up perfectly whatever monospace font the viewer has.
 * Supports what git-abv emits: bold, dim, 24-bit foreground colours and resets.
 */

import { displayWidth, escapeXml } from '../../src/core/format.js';

const CELL_W = 8.6;
const CELL_H = 19;
const FONT_SIZE = 14;
const PAD_X = 22;
const PAD_TOP = 52;
const PAD_BOTTOM = 18;
const FONT = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', 'DejaVu Sans Mono', monospace";

const LOWER = '▁▂▃▄▅▆▇';
const LEFT = '▏▎▍▌▋▊▉';

/** Split one line into cells: { ch, fg, bold, dim, width }. */
function parseLine(line, defaults) {
  const cells = [];
  let fg = defaults.fg;
  let bold = false;
  let dim = false;
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0;
  let m;
  const pushText = (text) => {
    for (const ch of text) {
      const width = displayWidth(ch);
      if (width === 0) continue;
      cells.push({ ch, fg, bold, dim, width });
    }
  };
  while ((m = re.exec(line))) {
    pushText(line.slice(last, m.index));
    last = re.lastIndex;
    const codes = m[1] === '' ? [0] : m[1].split(';').map(Number);
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) {
        fg = defaults.fg;
        bold = false;
        dim = false;
      } else if (c === 1) bold = true;
      else if (c === 2) dim = true;
      else if (c === 22) {
        bold = false;
        dim = false;
      } else if (c === 39) fg = defaults.fg;
      else if (c === 38 && codes[i + 1] === 2) {
        fg = `#${[codes[i + 2], codes[i + 3], codes[i + 4]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
        i += 4;
      }
    }
  }
  pushText(line.slice(last));
  return cells;
}

/**
 * @param {string} ansi  terminal output, possibly with ANSI colour codes
 * @param {{ title?: string, background?: string, foreground?: string, minCols?: number }} [options]
 * @returns {string} an SVG document
 */
export function termToSvg(ansi, options = {}) {
  const bg = options.background || '#0F1217';
  const fgDefault = options.foreground || '#E6E1D6';
  const lines = String(ansi).replace(/\r/g, '').replace(/\n+$/, '').split('\n');
  const rows = lines.map((l) => parseLine(l, { fg: fgDefault }));
  const cols = Math.max(options.minCols || 0, ...rows.map((cells) => cells.reduce((n, c) => n + c.width, 0)));
  const width = Math.ceil(cols * CELL_W + PAD_X * 2);
  const height = Math.ceil(rows.length * CELL_H + PAD_TOP + PAD_BOTTOM);
  const out = [];

  out.push(
    `<rect width="${width}" height="${height}" rx="12" fill="${bg}"/>`,
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="12" fill="none" stroke="#FFFFFF" stroke-opacity="0.08"/>`,
    `<circle cx="22" cy="20" r="6" fill="#FF5F57"/><circle cx="42" cy="20" r="6" fill="#FEBC2E"/><circle cx="62" cy="20" r="6" fill="#28C840"/>`,
  );
  if (options.title) {
    out.push(
      `<text x="${width / 2}" y="24.5" text-anchor="middle" font-family="${escapeXml(FONT)}" font-size="12.5" fill="#8C93A1">${escapeXml(options.title)}</text>`,
    );
  }

  rows.forEach((cells, r) => {
    const top = PAD_TOP + r * CELL_H;
    const baseline = top + 14;
    // Bar rows carry a track (░) or a percentage; the big block digits carry neither.
    // Bars get a slimmer band so neighbouring rows do not touch; digits stay solid.
    const isBarRow = cells.some((c) => c.ch === '░' || c.ch === '%');
    let col = 0;
    let run = null;
    let block = null; // consecutive full blocks of one colour, merged into a single seamless rect
    const flushBlock = () => {
      if (!block) return;
      const inset = isBarRow ? 2.5 : 0;
      // Digits overlap the next row by a hair so no seam shows between rows.
      const h = isBarRow ? CELL_H - inset * 2 : CELL_H + 0.6;
      out.push(
        `<rect x="${(PAD_X + block.col * CELL_W).toFixed(1)}" y="${(top + inset).toFixed(1)}" width="${(block.cells * CELL_W + 0.25).toFixed(2)}" height="${h.toFixed(1)}" fill="${block.fg}"${block.o < 1 ? ` opacity="${block.o}"` : ''}/>`,
      );
      block = null;
    };
    const flush = () => {
      flushBlock();
      if (!run) return;
      const attrs = [
        `x="${(PAD_X + run.col * CELL_W).toFixed(1)}"`,
        `y="${baseline}"`,
        `fill="${run.fg}"`,
        run.bold ? 'font-weight="700"' : '',
        run.dim ? 'opacity="0.55"' : '',
        // Pin the run to the grid so a slightly wider or narrower font cannot drift.
        run.cells > 1 ? `textLength="${(run.cells * CELL_W).toFixed(1)}" lengthAdjust="spacingAndGlyphs"` : '',
      ].filter(Boolean);
      out.push(`<text ${attrs.join(' ')}>${escapeXml(run.text)}</text>`);
      run = null;
    };

    for (const cell of cells) {
      const x = PAD_X + col * CELL_W;
      const opacity = cell.dim ? 0.55 : 1;
      const ch = cell.ch;
      let shape = null;
      if (ch === '█') {
        if (block && block.fg === cell.fg && block.o === opacity && block.col + block.cells === col) {
          block.cells += 1;
        } else {
          flush();
          block = { col, cells: 1, fg: cell.fg, o: opacity };
        }
        col += cell.width;
        continue;
      }
      if (ch === '░') shape = { x, y: top + 5, w: CELL_W, h: CELL_H - 10, o: 0.16 };
      else if (LOWER.includes(ch)) {
        const h = ((LOWER.indexOf(ch) + 1) / 8) * CELL_H;
        shape = { x, y: top + CELL_H - h, w: CELL_W, h, o: opacity };
      } else if (LEFT.includes(ch)) {
        shape = { x, y: top, w: ((LEFT.indexOf(ch) + 1) / 8) * CELL_W, h: CELL_H, o: opacity };
      } else if (ch === '─') shape = { x, y: top + CELL_H / 2 - 0.5, w: CELL_W, h: 1, o: opacity };

      if (shape) {
        flush();
        const inset = isBarRow && LEFT.includes(ch) ? 2.5 : 0;
        out.push(
          `<rect x="${shape.x.toFixed(1)}" y="${(shape.y + inset).toFixed(1)}" width="${(shape.w + 0.25).toFixed(2)}" height="${Math.max(1, shape.h - inset * 2).toFixed(1)}" fill="${cell.fg}"${shape.o < 1 ? ` opacity="${shape.o}"` : ''}/>`,
        );
      } else if (ch === ' ') {
        flush();
      } else if (cell.width === 2) {
        flush();
        out.push(`<text x="${x.toFixed(1)}" y="${baseline}" fill="${cell.fg}"${cell.bold ? ' font-weight="700"' : ''}${cell.dim ? ' opacity="0.55"' : ''}>${escapeXml(ch)}</text>`);
      } else if (run && run.fg === cell.fg && run.bold === cell.bold && run.dim === cell.dim) {
        run.text += ch;
        run.cells += 1;
      } else {
        flush();
        run = { col, text: ch, cells: 1, fg: cell.fg, bold: cell.bold, dim: cell.dim };
      }
      col += cell.width;
    }
    flush();
  });

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(options.title || 'terminal output')}" font-family="${escapeXml(FONT)}" font-size="${FONT_SIZE}">` +
    out.join('') +
    `</svg>\n`
  );
}
