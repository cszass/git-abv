/**
 * The command line. Parses flags, runs the analysis, prints the result.
 * `main()` returns an exit code and only writes to the streams it is given, which keeps it testable.
 */

import fs from 'node:fs';
import path from 'node:path';

import { analyze, version } from './analyze.js';
import { renderBadge } from './core/badge.js';
import { renderCard, THEMES } from './core/card.js';
import { formatPct, padEnd } from './core/format.js';
import { normalizeLang, styleName, styleTagline, t, tastingNotes } from './core/i18n.js';
import { describeSignatures } from './core/signatures.js';
import { GitError } from './git.js';
import { createPainter, renderExplain, renderReport, renderSuspects } from './render-terminal.js';

const HELP = `
git-abv: AI By Volume. How much of this repo was written with AI?

Usage
  git abv [path] [options]          (or: npx git-abv [path] [options])

Measure
  --since <date>          only commits after <date>  (anything \`git log\` understands)
  --until <date>          only commits before <date>
  --year <yyyy>           a single vintage, e.g. --year 2026
  --rev <range>           revision or range to scan  (default: HEAD)
  --all                   scan every branch and tag
  --author <pattern>      only commits by matching authors (repeatable)
  --only <pathspec>       only count changes under a path (repeatable)
  --exclude <glob>        leave matching files out of line counts (repeatable)
  --no-default-excludes   count lockfiles, vendored and generated files too
  --fast                  skip line counting and measure by commits (much quicker on huge repos)
  --ai-identity <regex>   also count a matching "Name <email>" as AI (repeatable)

Output
  --card[=file.svg]       write a shareable label    (default: abv-label.svg)
  --badge[=file.svg]      write a README badge       (default: abv-badge.svg)
  --theme <paper|night>   label theme                (default: paper)
  --name <text>           name to print on the label
  --json                  print the full report as JSON
  --lang <en|zh>          output language            (default: from your locale)
  --top <n>               how many authors to list   (default: 5)
  --no-authors            hide the per-author sections
  --explain[=n]           show n matched commits and what gave them away (default: 10)
  --suspects              list bot-looking identities missing from the signature database
  --signatures            list every signature git-abv knows
  -q, --quiet             print nothing but errors (handy with --card, --badge, --max)
  --ascii, --no-color     plain output

CI
  --max <pct>             exit 1 if ABV is above <pct>
  --min <pct>             exit 1 if ABV is below <pct>

  -h, --help              -v, --version

Nothing is uploaded. git-abv only reads your local git history.
`;

class UsageError extends Error {}

const BOOLEAN = new Set([
  'json', 'all', 'fast', 'no-color', 'color', 'ascii', 'no-authors', 'no-default-excludes',
  'suspects', 'signatures', 'help', 'version', 'quiet',
]);
const VALUE = new Set(['since', 'until', 'year', 'rev', 'lang', 'theme', 'name', 'max', 'min', 'top', 'recent-days']);
const MULTI = new Set(['exclude', 'author', 'only', 'ai-identity']);
/** Flags whose value is optional. The value is only taken from the next argument if it looks right. */
const OPTIONAL = {
  card: (v) => /\.svg$/i.test(v),
  badge: (v) => /\.svg$/i.test(v),
  explain: (v) => /^\d+$/.test(v),
};
const SHORT = { h: 'help', v: 'version', V: 'version', q: 'quiet' };

export function parseArgs(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith('-') || arg === '-') {
      positionals.push(arg);
      continue;
    }

    let name;
    let value;
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      value = eq === -1 ? undefined : arg.slice(eq + 1);
    } else {
      name = SHORT[arg.slice(1)];
      if (!name) throw new UsageError(`Unknown option: ${arg}`);
    }

    if (BOOLEAN.has(name)) {
      if (value !== undefined) throw new UsageError(`--${name} does not take a value.`);
      flags[name] = true;
    } else if (VALUE.has(name) || MULTI.has(name)) {
      if (value === undefined) {
        value = argv[++i];
        if (value === undefined) throw new UsageError(`--${name} needs a value.`);
      }
      if (MULTI.has(name)) (flags[name] ||= []).push(value);
      else flags[name] = value;
    } else if (name in OPTIONAL) {
      if (value === undefined && argv[i + 1] !== undefined && OPTIONAL[name](argv[i + 1])) value = argv[++i];
      flags[name] = value === undefined || value === '' ? true : value;
    } else {
      throw new UsageError(`Unknown option: --${name}`);
    }
  }
  return { flags, positionals };
}

function number(flags, name, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (flags[name] === undefined) return undefined;
  const n = Number(flags[name]);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    throw new UsageError(`--${name} expects a number${Number.isFinite(min) ? ` from ${min}` : ''}${Number.isFinite(max) ? ` to ${max}` : ''}.`);
  }
  return n;
}

export function detectLang(flags, env) {
  if (flags.lang) return normalizeLang(flags.lang);
  const fromEnv = env.GIT_ABV_LANG || env.LC_ALL || env.LC_MESSAGES || env.LANG || '';
  if (fromEnv && !/^(c|posix)(\.|$)/i.test(fromEnv)) return normalizeLang(fromEnv);
  try {
    return normalizeLang(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return 'en';
  }
}

function detectColor(flags, env, stream) {
  if (flags['no-color']) return false;
  if (flags.color) return true;
  if (env.NO_COLOR != null && env.NO_COLOR !== '') return false;
  if (env.FORCE_COLOR != null && env.FORCE_COLOR !== '0' && env.FORCE_COLOR !== '') return true;
  return Boolean(stream.isTTY) && env.TERM !== 'dumb';
}

function detectTruecolor(env) {
  if (/truecolor|24bit/i.test(env.COLORTERM || '')) return true;
  if (env.WT_SESSION) return true;
  if (/^(iTerm\.app|vscode|WezTerm|ghostty|Hyper|WarpTerminal|Tabby)$/i.test(env.TERM_PROGRAM || '')) return true;
  if (/kitty|alacritty|direct|ghostty/i.test(env.TERM || '')) return true;
  return false;
}

function printSignatures(io, paint) {
  const lines = ['', '  ' + paint.bold('SIGNATURES git-abv LOOKS FOR'), ''];
  for (const entry of describeSignatures()) {
    const examples = entry.examples.length > 0 ? entry.examples : ['(bot account)'];
    examples.forEach((eg, i) => {
      lines.push(`  ${padEnd(i === 0 ? entry.name : '', 14)}${paint.dim(eg)}`);
    });
  }
  lines.push('');
  lines.push(`  ${padEnd('Any tool', 14)}${paint.dim('Assisted-by: AGENT:MODEL   (the Linux kernel convention)')}`);
  lines.push(`  ${padEnd('', 14)}${paint.dim('Generated-by: <tool>   ·   AI-assisted: yes')}`);
  lines.push('');
  lines.push('  ' + paint.dim('Missing one? Add it to src/core/signatures.js and open a PR.'));
  lines.push('');
  io.stdout.write(lines.join('\n') + '\n');
}

function writeFile(io, file, content) {
  const abs = path.resolve(io.cwd, file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}

/**
 * @param {string[]} argv  arguments after the program name
 * @param {{ stdout: any, stderr: any, env: object, cwd: string }} [io]
 * @returns {Promise<number>} exit code: 0 ok, 1 a --max/--min gate failed, 2 error
 */
export async function main(argv, io = { stdout: process.stdout, stderr: process.stderr, env: process.env, cwd: process.cwd() }) {
  let flags;
  let positionals;
  try {
    ({ flags, positionals } = parseArgs(argv));
    if (positionals.length > 1) throw new UsageError(`Expected one path, got ${positionals.length}: ${positionals.join(' ')}`);
    if (flags.lang && !/^(en|zh)/i.test(flags.lang)) throw new UsageError('--lang must be en or zh.');
    if (flags.theme && !THEMES[flags.theme]) throw new UsageError(`--theme must be one of: ${Object.keys(THEMES).join(', ')}.`);
    if (flags.year && !/^\d{4}$/.test(flags.year)) throw new UsageError('--year expects a four-digit year, e.g. --year 2026.');
  } catch (err) {
    io.stderr.write(`git-abv: ${err.message}\nRun \`git abv --help\` for usage.\n`);
    return 2;
  }

  const lang = detectLang(flags, io.env);
  const color = detectColor(flags, io.env, io.stdout);
  const paintOpts = { color, truecolor: detectTruecolor(io.env) };
  const paint = createPainter(paintOpts);

  if (flags.help) {
    io.stdout.write(HELP);
    return 0;
  }
  if (flags.version) {
    io.stdout.write(`git-abv ${version()}\n`);
    return 0;
  }
  if (flags.signatures) {
    printSignatures(io, paint);
    return 0;
  }

  let options;
  let max;
  let min;
  let top;
  let explain = 0;
  try {
    max = number(flags, 'max', { min: 0, max: 100 });
    min = number(flags, 'min', { min: 0, max: 100 });
    top = number(flags, 'top', { min: 0, max: 1000, integer: true });
    const recentDays = number(flags, 'recent-days', { min: 1, max: 36500, integer: true });
    if (flags.explain) explain = flags.explain === true ? 10 : Number(flags.explain);
    const customAi = (flags['ai-identity'] || []).map((source) => {
      try {
        return new RegExp(source, 'i');
      } catch {
        throw new UsageError(`--ai-identity is not a valid regular expression: ${source}`);
      }
    });
    let since = flags.since;
    let until = flags.until;
    if (flags.year) {
      since ||= `${flags.year}-01-01T00:00:00`;
      until ||= `${flags.year}-12-31T23:59:59`;
    }
    options = {
      rev: flags.rev,
      all: Boolean(flags.all),
      since,
      until,
      authors: flags.author,
      paths: flags.only,
      exclude: flags.exclude,
      defaultExcludes: !flags['no-default-excludes'],
      fast: Boolean(flags.fast),
      customAi,
      recentDays,
      samples: explain,
      suspects: Boolean(flags.suspects),
      name: flags.name,
    };
  } catch (err) {
    io.stderr.write(`git-abv: ${err.message}\nRun \`git abv --help\` for usage.\n`);
    return 2;
  }

  const target = path.resolve(io.cwd, positionals[0] || '.');
  const showProgress = Boolean(io.stderr.isTTY) && !flags.quiet;
  if (showProgress) {
    options.onProgress = (n) => io.stderr.write(`\r\x1b[2K  ${t(lang, 'scanning', { n: n.toLocaleString('en-US') })}`);
  }

  let report;
  try {
    report = await analyze(target, options);
  } catch (err) {
    if (showProgress) io.stderr.write('\r\x1b[2K');
    if (err instanceof GitError) {
      io.stderr.write(`git-abv: ${err.message}\n`);
      return 2;
    }
    throw err;
  }
  if (showProgress) io.stderr.write('\r\x1b[2K');

  // Notes go to stderr when stdout must stay machine-readable.
  const note = (message) => {
    if (flags.quiet) return;
    (flags.json ? io.stderr : io.stdout).write(`  ${message}\n`);
  };

  if (flags.json) {
    const style = report.style;
    const payload = {
      ...report,
      styleName: styleName(lang, style),
      tagline: styleTagline(lang, style),
      tastingNotes: tastingNotes(report, lang),
    };
    if (flags['no-authors']) delete payload.people;
    io.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else if (!flags.quiet) {
    io.stdout.write(
      renderReport(report, {
        ...paintOpts,
        lang,
        ascii: Boolean(flags.ascii),
        top: top ?? 5,
        authors: !flags['no-authors'],
        hints: !flags.card && !flags.badge,
      }),
    );
    if (explain > 0) io.stdout.write(renderExplain(report, { ...paintOpts, lang }));
    if (flags.suspects) io.stdout.write(renderSuspects(report, { ...paintOpts, lang }));
  }

  if (report.repo.shallow && !flags.quiet) {
    io.stderr.write(`  ${paint.dim(t(lang, 'shallow'))}\n`);
  }

  if (flags.card) {
    const file = flags.card === true ? 'abv-label.svg' : flags.card;
    writeFile(io, file, renderCard(report, { lang, theme: flags.theme }));
    note(t(lang, 'wroteCard', { file }));
  }
  if (flags.badge) {
    const file = flags.badge === true ? 'abv-badge.svg' : flags.badge;
    writeFile(io, file, renderBadge(report, { lang }));
    note(t(lang, 'wroteBadge', { file }));
    note(paint.dim(`![${lang === 'zh' ? '含 AI 量' : 'AI by volume'}](${file.replace(/\\/g, '/')})`));
  }
  if ((flags.card || flags.badge) && !flags.quiet && !flags.json) io.stdout.write('\n');

  if (max !== undefined && report.abv > max) {
    io.stderr.write(`git-abv: ${t(lang, 'gateAbove', { abv: formatPct(report.abv), limit: max })}\n`);
    return 1;
  }
  if (min !== undefined && report.abv < min) {
    io.stderr.write(`git-abv: ${t(lang, 'gateBelow', { abv: formatPct(report.abv), limit: min })}\n`);
    return 1;
  }
  return 0;
}
