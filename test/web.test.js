import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { TEXT, analyzeCommits, parseRepo } from '../docs/app.js';
import { renderCard } from '../docs/lib/card.js';
import { STYLES } from '../src/core/styles.js';
import { staleFiles } from '../scripts/sync-web.mjs';
import { assertWellFormedXml } from '../scripts/lib/testing.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('docs/lib is an up-to-date copy of src/core', () => {
  assert.deepEqual(staleFiles(), [], 'run `npm run sync:web`');
});

test('parseRepo accepts the ways people write a repository', () => {
  const cases = [
    ['acme/rocket', 'acme/rocket'],
    ['  acme/rocket  ', 'acme/rocket'],
    ['https://github.com/acme/rocket', 'acme/rocket'],
    ['https://github.com/acme/rocket/', 'acme/rocket'],
    ['https://github.com/acme/rocket.git', 'acme/rocket'],
    ['https://github.com/acme/rocket/pull/42/files?w=1#diff', 'acme/rocket'],
    ['http://www.github.com/acme/rocket', 'acme/rocket'],
    ['github.com/acme/rocket', 'acme/rocket'],
    ['git@github.com:acme/rocket.git', 'acme/rocket'],
    ['Aider-AI/aider', 'Aider-AI/aider'],
    ['vercel/next.js', 'vercel/next.js'],
  ];
  for (const [input, expected] of cases) assert.equal(parseRepo(input), expected, input);
});

test('parseRepo rejects everything else', () => {
  for (const input of ['', '   ', 'rocket', 'acme/', '/rocket', 'acme/rocket name', '../../etc/passwd', 'acme/<script>', 'https://evil.example/acme/rocket?x=/../', '-acme/rocket', null, undefined]) {
    assert.equal(parseRepo(input), null, String(input));
  }
});

const apiCommit = (over = {}) => ({
  sha: 'a'.repeat(40),
  parents: [{ sha: 'b'.repeat(40) }],
  commit: {
    author: { name: 'Jane Doe', email: 'jane@example.com', date: '2026-10-01T12:00:00Z' },
    message: 'Fix the thing',
    ...over.commit,
  },
  ...over,
});

test('analyzeCommits turns GitHub API commits into a by-commits report', () => {
  const report = analyzeCommits('acme/rocket', [
    apiCommit(),
    apiCommit({ sha: 'c'.repeat(40), commit: { author: { name: 'Jane Doe', email: 'jane@example.com', date: '2026-10-02T12:00:00Z' }, message: 'Add feature\n\nCo-Authored-By: Claude <noreply@anthropic.com>' } }),
    apiCommit({ sha: 'd'.repeat(40), commit: { author: { name: 'copilot-swe-agent[bot]', email: '198982749+Copilot@users.noreply.github.com', date: '2026-10-03T12:00:00Z' }, message: 'Initial plan' } }),
    apiCommit({ sha: 'e'.repeat(40), commit: { author: { name: 'dependabot[bot]', email: '49699333+dependabot[bot]@users.noreply.github.com', date: '2026-10-04T12:00:00Z' }, message: 'Bump x' } }),
    // A merge commit: skipped, exactly like `git log --no-merges`.
    apiCommit({ sha: 'f'.repeat(40), parents: [{ sha: '1' }, { sha: '2' }], commit: { author: { name: 'Jane Doe', email: 'jane@example.com', date: '2026-10-05T12:00:00Z' }, message: "Merge branch 'x'\n\nCo-Authored-By: Claude <noreply@anthropic.com>" } }),
  ]);
  assert.equal(report.metric, 'commits');
  assert.equal(report.repo.name, 'acme/rocket');
  assert.deepEqual(
    { ai: report.byCommits.ai, human: report.byCommits.human, bot: report.byCommits.bot, total: report.byCommits.total },
    { ai: 2, human: 1, bot: 1, total: 4 },
  );
  assert.equal(report.abv, 50);
  assert.deepEqual(report.tools.map((t) => t.id).sort(), ['claude', 'copilot']);
  assert.equal(report.range.firstCommit, '2026-10-01');
  assert.equal(report.samples.length, 2);
  assertWellFormedXml(renderCard(report, { lang: 'zh', theme: 'night' }));
});

test('analyzeCommits shrugs off malformed API entries', () => {
  const report = analyzeCommits('acme/rocket', [null, {}, { sha: 'x', commit: {} }, apiCommit()]);
  assert.equal(report.byCommits.total, 2);
  assert.equal(report.abv, 0);
});

test('the page references only files that exist', () => {
  const html = fs.readFileSync(path.join(ROOT, 'docs', 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map((m) => m[1]).filter((ref) => !/^(https?:|\.\/$)/.test(ref));
  assert.ok(refs.length >= 3);
  for (const ref of refs) assert.ok(fs.existsSync(path.join(ROOT, 'docs', ref)), `docs/${ref} is missing`);
});

test('the page makes no third-party requests', () => {
  for (const file of ['index.html', 'style.css', 'app.js']) {
    const text = fs.readFileSync(path.join(ROOT, 'docs', file), 'utf8');
    const hosts = new Set([...text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase()));
    for (const host of hosts) {
      assert.ok(['github.com', 'api.github.com', 'www.w3.org'].includes(host), `${file} mentions ${host}`);
    }
  }
});

test('every string on the page has an English and a Chinese version', () => {
  const html = fs.readFileSync(path.join(ROOT, 'docs', 'index.html'), 'utf8');
  const keys = new Set([...html.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g)].map((m) => m[1]));
  assert.ok(keys.size > 20);
  for (const key of keys) {
    assert.ok(TEXT.en[key], `English text missing for "${key}"`);
    assert.ok(TEXT.zh[key], `Chinese text missing for "${key}"`);
  }
  // The two tables carry exactly the same keys, and nothing is left untranslated.
  assert.deepEqual(Object.keys(TEXT.zh).sort(), Object.keys(TEXT.en).sort());
  const sameOnPurpose = new Set(['downloadSvg']);
  for (const key of Object.keys(TEXT.en)) {
    if (!sameOnPurpose.has(key)) assert.notEqual(TEXT.zh[key], TEXT.en[key], `"${key}" is not translated`);
  }
});

test('the top shelf data, when present, is consistent', () => {
  const file = path.join(ROOT, 'docs', 'data', 'top-shelf.json');
  if (!fs.existsSync(file)) return;
  const shelf = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.match(shelf.measuredOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(shelf.metric, 'commits');
  assert.ok(shelf.repos.length > 0);
  const styleIds = new Set(STYLES.map((s) => s.id));
  let previous = Infinity;
  for (const r of shelf.repos) {
    assert.match(r.repo, /^[\w.-]+\/[\w.-]+$/);
    assert.ok(r.aiCommits <= r.commits, r.repo);
    assert.ok(Math.abs(r.abv - (r.commits ? (r.aiCommits / r.commits) * 100 : 0)) < 0.01, `${r.repo}: abv does not match its counts`);
    assert.ok(styleIds.has(r.style), r.repo);
    assert.ok(r.abv <= previous, 'repos are sorted by ABV, strongest first');
    previous = r.abv;
  }
});
