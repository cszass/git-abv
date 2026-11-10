#!/usr/bin/env node
/**
 * Measure "the top shelf": the share of recent commits that carry an AI signature,
 * across a list of well-known public repositories.
 *
 *   node scripts/top-shelf.mjs                      # measure everything in top-shelf-repos.txt
 *   node scripts/top-shelf.mjs --only oven-sh/bun   # one repo (repeatable)
 *   node scripts/top-shelf.mjs --keep               # keep the clones around for a closer look
 *
 * How it stays cheap: each repository is fetched as a bare, blobless, treeless, shallow clone
 * (`--filter=tree:0 --shallow-since=<12 months ago>`), which downloads commit metadata only.
 * No source code is downloaded and nothing from those repositories is ever executed.
 * Without trees there are no line counts, so the shelf is measured by commits.
 *
 * Output: docs/data/top-shelf.json (read by the web app) and a Markdown table on stdout.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyze } from '../src/analyze.js';
import { formatInt, formatPct } from '../src/core/format.js';
import { styleName } from '../src/core/i18n.js';
import { toolName } from '../src/core/signatures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const values = (name) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []));

const DAYS = Number(values('--days')[0]) || 365;
const workdir = path.resolve(values('--workdir')[0] || path.join(os.tmpdir(), 'git-abv-top-shelf'));
const outFile = path.resolve(ROOT, values('--out')[0] || 'docs/data/top-shelf.json');
const listFile = path.resolve(ROOT, values('--repos')[0] || 'scripts/top-shelf-repos.txt');
const only = values('--only');

const today = new Date();
const measuredOn = today.toISOString().slice(0, 10);
const since = new Date(today.getTime() - DAYS * 86400000).toISOString().slice(0, 10);

const repos =
  only.length > 0
    ? only
    : fs
        .readFileSync(listFile, 'utf8')
        .split(/\r?\n/)
        .map((l) => l.replace(/#.*/, '').trim())
        .filter(Boolean);

/** Follow GitHub's redirect for renamed repositories so the table shows today's name. */
async function canonicalName(repo) {
  try {
    const res = await fetch(`https://github.com/${repo}`, { method: 'HEAD', redirect: 'manual' });
    const location = res.headers.get('location');
    const m = location && /github\.com\/([^/]+\/[^/?#]+)/.exec(location);
    if (res.status >= 300 && res.status < 400 && m) return m[1];
  } catch {
    /* offline or blocked: keep the name we were given */
  }
  return repo;
}

function clone(repo, dir) {
  if (fs.existsSync(dir)) return { ok: true, cached: true };
  const res = spawnSync(
    'git',
    [
      '-c', 'core.longpaths=true',
      'clone', '--quiet', '--bare', '--single-branch', '--no-tags',
      '--filter=tree:0', `--shallow-since=${since}`,
      `https://github.com/${repo}.git`, dir,
    ],
    { encoding: 'utf8', timeout: 15 * 60 * 1000, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
  );
  if (res.status !== 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: false, error: String(res.stderr || res.error || 'clone failed').trim().split('\n').pop() };
  }
  return { ok: true, cached: false };
}

fs.mkdirSync(workdir, { recursive: true });
const rows = [];
const failures = [];
const suspects = new Map();

for (const listed of repos) {
  const repo = await canonicalName(listed);
  const dir = path.join(workdir, `${repo.replace('/', '__')}.git`);
  const started = Date.now();
  const cloned = clone(repo, dir);
  if (!cloned.ok) {
    failures.push({ repo, error: cloned.error });
    console.error(`✗ ${repo}: ${cloned.error}`);
    continue;
  }
  try {
    const report = await analyze(dir, { fast: true, since, name: repo, suspects: true, samples: 3 });
    rows.push({
      repo,
      abv: report.abv,
      style: report.style,
      commits: report.byCommits.total,
      aiCommits: report.byCommits.ai,
      botCommits: report.byCommits.bot,
      authored: report.modes.authored,
      topTool: report.tools[0]?.id || null,
      tools: report.tools.map((t) => ({ id: t.id, commits: t.commits })),
    });
    for (const s of report.suspects || []) {
      const entry = suspects.get(s.identity) || { identity: s.identity, count: 0, as: s.as, repos: new Set() };
      entry.count += s.count;
      entry.repos.add(repo);
      suspects.set(s.identity, entry);
    }
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.error(
      `✓ ${repo.padEnd(34)} ${formatPct(report.abv).padStart(5)}%  ${formatInt(report.byCommits.ai).padStart(6)} / ${formatInt(report.byCommits.total).padEnd(7)} ${secs}s${cloned.cached ? ' (cached)' : ''}`,
    );
  } catch (err) {
    failures.push({ repo, error: err.message });
    console.error(`✗ ${repo}: ${err.message}`);
  }
  if (!flag('--keep')) fs.rmSync(dir, { recursive: true, force: true });
}

rows.sort((a, b) => b.abv - a.abv || b.aiCommits - a.aiCommits || a.repo.localeCompare(b.repo));

if (only.length === 0) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        measuredOn,
        since,
        metric: 'commits',
        method: `Non-merge commits on the default branch since ${since} that carry an explicit AI signature. Measured with git-abv --fast.`,
        repos: rows,
      },
      null,
      2,
    ) + '\n',
  );
  console.error(`\nWrote ${path.relative(ROOT, outFile)} (${rows.length} repositories).`);
}

// Markdown table for the README.
console.log(`| Repository | ABV | Style | AI-signed commits | On the nose |`);
console.log(`| --- | ---: | --- | ---: | --- |`);
for (const r of rows) {
  console.log(
    `| [${r.repo}](https://github.com/${r.repo}) | **${formatPct(r.abv)}%** | ${styleName('en', r.style)} | ${formatInt(r.aiCommits)} / ${formatInt(r.commits)} | ${r.topTool ? toolName(r.topTool) : '-'} |`,
  );
}

if (flag('--suspects')) {
  console.log('\nSUSPECTS (bot-looking identities not in the signature database)');
  const list = [...suspects.values()].sort((a, b) => b.count - a.count).slice(0, 80);
  for (const s of list) console.log(`${String(s.count).padStart(6)}  ${s.as.padEnd(5)}  ${s.identity}  [${[...s.repos].slice(0, 3).join(', ')}]`);
}
if (failures.length > 0) {
  console.error(`\n${failures.length} failed: ${failures.map((f) => f.repo).join(', ')}`);
}
