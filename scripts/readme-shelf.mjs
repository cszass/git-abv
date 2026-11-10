#!/usr/bin/env node
/**
 * Write the "top shelf" table into both READMEs, from docs/data/top-shelf.json.
 *
 *   node scripts/readme-shelf.mjs           # update README.md and README.zh-CN.md
 *   node scripts/readme-shelf.mjs --check   # exit 1 if either is stale (used by the tests)
 *
 * The table sits between <!-- shelf:start --> and <!-- shelf:end -->, so the numbers in the
 * READMEs can never drift from the measured data.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatInt, formatPct } from '../src/core/format.js';
import { styleName } from '../src/core/i18n.js';
import { toolName } from '../src/core/signatures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const START = '<!-- shelf:start -->';
const END = '<!-- shelf:end -->';
const VISIBLE = 16;

const TEXT = {
  en: {
    intro: (s, t) =>
      `Measured on **${s.measuredOn}**: the share of commits since ${s.since} that carry an AI signature (non-merge commits on the default branch).\n` +
      `Across these ${s.repos.length} projects, **${formatInt(t.ai)} of ${formatInt(t.commits)} commits (${formatPct(t.share)}%)** say they had AI help, and ${t.withAi} of the ${s.repos.length} have at least one.`,
    head: '| Repository | ABV | Style | AI-signed commits | On the nose |\n| --- | ---: | --- | ---: | --- |',
    rest: (n) => `The rest of the shelf (${n} more)`,
  },
  zh: {
    intro: (s, t) =>
      `实测于 **${s.measuredOn}**：${s.since} 以来的提交中，带 AI 署名的比例（默认分支上的非合并提交）。\n` +
      `这 ${s.repos.length} 个项目合计 **${formatInt(t.commits)} 个提交里有 ${formatInt(t.ai)} 个（${formatPct(t.share)}%）**声明了 AI 参与，其中 ${t.withAi} 个项目至少有一个这样的提交。`,
    head: '| 仓库 | 含 AI 量 | 酒款 | AI 署名提交 | 主调 |\n| --- | ---: | --- | ---: | --- |',
    rest: (n) => `榜单的其余部分（还有 ${n} 个）`,
  },
};

export function renderShelf(shelf, lang) {
  const text = TEXT[lang];
  const totals = shelf.repos.reduce(
    (acc, r) => ({ commits: acc.commits + r.commits, ai: acc.ai + r.aiCommits, withAi: acc.withAi + (r.aiCommits > 0 ? 1 : 0) }),
    { commits: 0, ai: 0, withAi: 0 },
  );
  totals.share = totals.commits ? (totals.ai / totals.commits) * 100 : 0;
  const row = (r) =>
    `| [${r.repo}](https://github.com/${r.repo}) | **${formatPct(r.abv)}%** | ${styleName(lang, r.style)} | ${formatInt(r.aiCommits)} / ${formatInt(r.commits)} | ${r.topTool ? toolName(r.topTool) : '-'} |`;
  const top = shelf.repos.slice(0, VISIBLE);
  const rest = shelf.repos.slice(VISIBLE);

  const parts = [text.intro(shelf, totals), '', text.head, ...top.map(row)];
  if (rest.length > 0) {
    parts.push('', '<details>', `<summary>${text.rest(rest.length)}</summary>`, '', text.head, ...rest.map(row), '', '</details>');
  }
  return parts.join('\n');
}

export function apply(readme, block) {
  const a = readme.indexOf(START);
  const b = readme.indexOf(END);
  if (a === -1 || b === -1 || b < a) throw new Error('shelf markers not found');
  return `${readme.slice(0, a + START.length)}\n${block}\n${readme.slice(b)}`;
}

export function expected() {
  const shelf = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'data', 'top-shelf.json'), 'utf8'));
  return [
    ['README.md', 'en'],
    ['README.zh-CN.md', 'zh'],
  ].map(([file, lang]) => {
    const current = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
    return { file, current, next: apply(current, renderShelf(shelf, lang)) };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = expected();
  const stale = results.filter((r) => r.current !== r.next);
  if (process.argv.includes('--check')) {
    if (stale.length > 0) {
      console.error(`Out of date: ${stale.map((r) => r.file).join(', ')}. Run: node scripts/readme-shelf.mjs`);
      process.exit(1);
    }
    console.log('README shelf tables are up to date.');
  } else {
    for (const r of stale) fs.writeFileSync(path.join(ROOT, r.file), r.next);
    console.log(stale.length > 0 ? `Updated ${stale.map((r) => r.file).join(', ')}.` : 'Already up to date.');
  }
}
