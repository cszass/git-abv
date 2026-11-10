import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createExcluder, globToRegExp, isDefaultExcluded, resolveNumstatPath } from '../src/core/excludes.js';
import {
  ageBetween,
  displayWidth,
  escapeXml,
  formatCompact,
  formatDate,
  formatInt,
  formatPct,
  padEnd,
  padStart,
  pct,
  truncate,
} from '../src/core/format.js';
import { agedText, normalizeLang, styleName, styleTagline, t, tastingNotes } from '../src/core/i18n.js';
import { IDENTITY_RULES, MESSAGE_RULES, TOOLS, TRAILER_RULES, describeSignatures, toolFromText } from '../src/core/signatures.js';
import { STYLES, proofFor, styleFor } from '../src/core/styles.js';

// ── excludes ──────────────────────────────────────────────────────────────────

test('lockfiles, vendored and generated files are excluded by default', () => {
  for (const p of [
    'package-lock.json',
    'web/yarn.lock',
    'pnpm-lock.yaml',
    'Cargo.lock',
    'services/api/go.sum',
    'node_modules/left-pad/index.js',
    'vendor/github.com/pkg/errors/errors.go',
    'third_party/zlib/zlib.h',
    'static/app.min.js',
    'static/app.js.map',
    'src/__snapshots__/app.test.js.snap',
    'api/v1/service.pb.go',
    'proto/service_pb2.py',
    'lib/models/user.g.dart',
    'ios/Pods/AFNetworking/AFNetworking.m',
  ]) {
    assert.equal(isDefaultExcluded(p), true, p);
  }
});

test('ordinary source files are not excluded', () => {
  for (const p of [
    'src/index.js',
    'README.md',
    'package.json',
    'cmd/vendor-tool/main.go',
    'docs/locking.md',
    'src/lockfile.ts',
    'src/vendor.ts',
    'app/models/snapshot.rb',
    'Cargo.toml',
  ]) {
    assert.equal(isDefaultExcluded(p), false, p);
  }
});

test('globToRegExp follows gitignore-ish rules', () => {
  const cases = [
    ['*.svg', 'logo.svg', true],
    ['*.svg', 'assets/icons/logo.svg', true],
    ['*.svg', 'assets/logo.svg.txt', false],
    ['docs/', 'docs/guide.md', true],
    ['docs/', 'src/docs/guide.md', true],
    ['/docs', 'src/docs/guide.md', false],
    ['/docs', 'docs/guide.md', true],
    ['src/**/*.gen.ts', 'src/a/b/c.gen.ts', true],
    ['src/**/*.gen.ts', 'src/c.gen.ts', true],
    ['src/**/*.gen.ts', 'lib/c.gen.ts', false],
    ['data/*.json', 'data/a.json', true],
    ['data/*.json', 'data/sub/a.json', false],
    ['fixtures', 'test/fixtures/big.json', true],
    ['file?.txt', 'file1.txt', true],
    ['file?.txt', 'file10.txt', false],
    ['a.b', 'axb', false],
  ];
  for (const [glob, path, expected] of cases) {
    assert.equal(globToRegExp(glob).test(path), expected, `${glob} vs ${path}`);
  }
});

test('createExcluder combines defaults with custom patterns', () => {
  const ex = createExcluder({ patterns: ['*.svg', 'data/'] });
  assert.equal(ex('yarn.lock'), true);
  assert.equal(ex('assets/logo.svg'), true);
  assert.equal(ex('data/big.csv'), true);
  assert.equal(ex('src\\win\\path.js'), false);
  assert.equal(ex('src/index.js'), false);

  const raw = createExcluder({ defaults: false });
  assert.equal(raw('yarn.lock'), false);
});

test('resolveNumstatPath understands rename syntax', () => {
  assert.equal(resolveNumstatPath('src/index.js'), 'src/index.js');
  assert.equal(resolveNumstatPath('src/{old => new}/file.js'), 'src/new/file.js');
  assert.equal(resolveNumstatPath('src/{ => lib}/file.js'), 'src/lib/file.js');
  assert.equal(resolveNumstatPath('src/{lib => }/file.js'), 'src/file.js');
  assert.equal(resolveNumstatPath('old.js => new.js'), 'new.js');
  assert.equal(resolveNumstatPath('{a => b}/yarn.lock'), 'b/yarn.lock');
  assert.equal(resolveNumstatPath('"dir/with space.js"'), 'dir/with space.js');
});

// ── format ────────────────────────────────────────────────────────────────────

test('formatPct keeps tiny shares honest', () => {
  assert.equal(formatPct(0), '0');
  assert.equal(formatPct(0.004), '<0.1');
  assert.equal(formatPct(0.05), '0.1');
  assert.equal(formatPct(37.46), '37.5');
  assert.equal(formatPct(99.94), '99.9');
  assert.equal(formatPct(99.96), '100');
  assert.equal(formatPct(100), '100');
  assert.equal(formatPct(NaN), '0');
});

test('formatInt and formatCompact', () => {
  assert.equal(formatInt(0), '0');
  assert.equal(formatInt(1234567), '1,234,567');
  assert.equal(formatCompact(812), '812');
  assert.equal(formatCompact(1000), '1k');
  assert.equal(formatCompact(45210), '45.2k');
  assert.equal(formatCompact(999950), '1M');
  assert.equal(formatCompact(1234567), '1.2M');
  assert.equal(formatCompact(250_000_000), '250M');
  assert.equal(formatCompact(3_400_000_000), '3.4B');
});

test('pct never divides by zero', () => {
  assert.equal(pct(1, 0), 0);
  assert.equal(pct(1, 4), 25);
});

test('displayWidth counts CJK and emoji as two cells', () => {
  assert.equal(displayWidth('abc'), 3);
  assert.equal(displayWidth('含AI量'), 6);
  assert.equal(displayWidth('林晓雨'), 6);
  assert.equal(displayWidth('🥃'), 2);
  assert.equal(displayWidth(''), 0);
  assert.equal(padEnd('林', 4), '林  ');
  assert.equal(padStart('林', 4), '  林');
  assert.equal(padEnd('toolong', 3), 'toolong');
});

test('truncate respects display width', () => {
  assert.equal(truncate('hello', 10), 'hello');
  assert.equal(truncate('hello world', 8), 'hello w…');
  assert.ok(displayWidth(truncate('林晓雨林晓雨林晓雨', 7)) <= 7);
});

test('dates and ages', () => {
  assert.equal(formatDate(1750000000), '2025-06-15');
  assert.equal(formatDate(undefined), '');
  const a = Date.UTC(2020, 0, 31) / 1000;
  assert.deepEqual(ageBetween(a, Date.UTC(2023, 4, 30) / 1000), { years: 3, months: 3, days: 1215 });
  assert.deepEqual(ageBetween(a, a), { years: 0, months: 0, days: 0 });
  assert.deepEqual(ageBetween(a, a - 10), { years: 0, months: 0, days: 0 });
});

test('escapeXml escapes the five troublemakers', () => {
  assert.equal(escapeXml(`<a href="x">Tom & Jerry's</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
});

// ── styles ────────────────────────────────────────────────────────────────────

test('style bands', () => {
  const cases = [
    [0, 'alcohol-free'],
    [0.01, 'kombucha'],
    [0.49, 'kombucha'],
    [0.5, 'shandy'],
    [2.99, 'shandy'],
    [3, 'lager'],
    [5, 'lager'],
    [8, 'wine'],
    [12.5, 'wine'],
    [16, 'port'],
    [25, 'whisky'],
    [40, 'whisky'],
    [45, 'cask'],
    [53, 'cask'],
    [60, 'absinthe'],
    [80, 'rectified'],
    [95, 'rocket-fuel'],
    [100, 'rocket-fuel'],
    [250, 'rocket-fuel'],
    [-3, 'alcohol-free'],
  ];
  for (const [abv, id] of cases) assert.equal(styleFor(abv).id, id, `abv ${abv}`);
});

test('every style has names, taglines and colours in both languages', () => {
  for (const s of STYLES) {
    for (const lang of ['en', 'zh']) {
      assert.ok(styleName(lang, s.id).length > 0, `${lang} name for ${s.id}`);
      assert.ok(styleTagline(lang, s.id).length > 0, `${lang} tagline for ${s.id}`);
    }
    assert.match(s.accent, /^#[0-9A-F]{6}$/i);
    assert.match(s.ink, /^#[0-9A-F]{6}$/i);
    assert.notEqual(styleName('zh', s.id), styleName('en', s.id));
  }
  assert.equal(proofFor(37.5), 75);
});

// ── i18n ──────────────────────────────────────────────────────────────────────

test('t() fills placeholders and falls back to English', () => {
  assert.equal(t('en', 'lastNDays', { n: 90 }), 'last 90 days');
  assert.equal(t('zh', 'lastNDays', { n: 90 }), '最近 90 天');
  assert.equal(t('fr', 'human'), 'Human');
  assert.equal(t('en', 'no-such-key'), 'no-such-key');
});

test('normalizeLang', () => {
  assert.equal(normalizeLang('zh_CN.UTF-8'), 'zh');
  assert.equal(normalizeLang('zh-Hans-CN'), 'zh');
  assert.equal(normalizeLang('en_US.UTF-8'), 'en');
  assert.equal(normalizeLang('de_DE'), 'en');
  assert.equal(normalizeLang(undefined), 'en');
});

test('zh and en string tables have the same keys', async () => {
  // Reach into the module the same way t() does: every English key must resolve to a
  // different (translated) or intentionally identical string in Chinese without falling back to the key.
  const keys = ['title', 'byVolume', 'byCommits', 'lately', 'ingredients', 'vintage', 'pourers', 'drivers', 'firstPour', 'tastingNotes', 'caveat', 'noCommits', 'shallow', 'peak', 'bottled', 'distilledFrom'];
  for (const key of keys) {
    assert.notEqual(t('zh', key), key);
    assert.notEqual(t('zh', key), t('en', key), `zh translation missing for ${key}`);
  }
});

const baseReport = (over = {}) => ({
  metric: 'lines',
  abv: 40,
  byLines: { ai: 40, human: 60, bot: 0, total: 100 },
  byCommits: { ai: 4, human: 6, bot: 0, total: 10 },
  tools: [
    { id: 'claude', share: 30, commits: 3 },
    { id: 'copilot', share: 10, commits: 1 },
  ],
  recent: null,
  range: { firstCommitTime: Date.UTC(2020, 0, 1) / 1000, lastCommitTime: Date.UTC(2026, 5, 1) / 1000 },
  ...over,
});

test('tasting notes mention the top tools and the human finish', () => {
  const en = tastingNotes(baseReport(), 'en');
  assert.match(en, /Claude on the nose/);
  assert.match(en, /Copilot on the palate/);
  assert.match(en, /balanced human finish/);
  const zh = tastingNotes(baseReport(), 'zh');
  assert.match(zh, /Claude/);
  assert.match(zh, /人类/);
});

test('tasting notes for a dry repo and for a trend', () => {
  assert.match(tastingNotes(baseReport({ tools: [], abv: 0 }), 'en'), /Clean and dry/);
  assert.match(tastingNotes(baseReport({ recent: { abv: 70 } }), 'en'), /Getting stronger/);
  assert.match(tastingNotes(baseReport({ recent: { abv: 10 } }), 'en'), /Mellowing/);
  assert.match(tastingNotes(baseReport({ recent: { abv: 70 } }), 'zh'), /越陈越烈/);
});

test('agedText picks a sensible unit', () => {
  assert.equal(agedText('en', baseReport()), 'Aged 6 years');
  assert.equal(agedText('zh', baseReport()), '陈酿 6 年');
  const day = 86400;
  const start = Date.UTC(2026, 0, 1) / 1000;
  assert.equal(agedText('en', { range: { firstCommitTime: start, lastCommitTime: start + 45 * day } }), 'Aged 1 month');
  assert.equal(agedText('en', { range: { firstCommitTime: start, lastCommitTime: start + 3 * day } }), 'Aged 3 days');
  assert.equal(agedText('en', { range: { firstCommitTime: start, lastCommitTime: start + 60 } }), 'Fresh from the still');
  assert.equal(agedText('en', { range: {} }), '');
});

// ── signature database hygiene ────────────────────────────────────────────────

test('every rule points at a known tool', () => {
  for (const rule of [...IDENTITY_RULES, ...MESSAGE_RULES, ...TRAILER_RULES]) {
    assert.ok(TOOLS[rule.tool], `unknown tool "${rule.tool}"`);
  }
});

test('every identity rule constrains something', () => {
  for (const rule of IDENTITY_RULES) {
    assert.ok(rule.name || rule.email, `rule for ${rule.tool} matches everything`);
    if (rule.name) assert.ok(rule.name instanceof RegExp);
    if (rule.email) assert.ok(rule.email instanceof RegExp);
  }
});

test('tool colours are valid hex', () => {
  for (const [id, tool] of Object.entries(TOOLS)) {
    assert.match(tool.color, /^#[0-9A-F]{6}$/i, id);
    assert.ok(tool.name.length > 0);
  }
});

test('describeSignatures lists the big names with examples', () => {
  const described = describeSignatures();
  const byTool = Object.fromEntries(described.map((d) => [d.tool, d]));
  for (const id of ['claude', 'copilot', 'cursor', 'codex', 'aider', 'devin', 'jules']) {
    assert.ok(byTool[id], `${id} missing from describeSignatures()`);
  }
  assert.ok(byTool.claude.examples.some((e) => e.includes('noreply@anthropic.com')));
  assert.equal(byTool.other, undefined);
});

test('toolFromText maps product and model names', () => {
  assert.equal(toolFromText('Claude:claude-sonnet-4-6'), 'claude');
  assert.equal(toolFromText('GitHub Copilot'), 'copilot');
  assert.equal(toolFromText('OpenAI Codex CLI'), 'codex');
  assert.equal(toolFromText('gpt-5'), 'chatgpt');
  assert.equal(toolFromText('Gemini 2.5 Pro'), 'gemini');
  assert.equal(toolFromText('some local llm'), 'other');
  assert.equal(toolFromText('Jane Roe'), null);
});
