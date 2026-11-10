#!/usr/bin/env node
/**
 * Regenerate every image used in the READMEs, from the fictional demo repositories.
 *
 *   npm run assets
 *
 * Everything here is produced by the real CLI, so the pictures cannot drift from the code.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../src/cli.js';
import { termToSvg } from './lib/term-to-svg.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'assets');
const DEMO = path.join(ROOT, '.demo');

function capture() {
  const chunks = [];
  return { isTTY: false, write: (s) => chunks.push(String(s)), text: () => chunks.join('') };
}

/** Run the CLI in-process and return what it printed. */
async function run(args) {
  const io = { stdout: capture(), stderr: capture(), env: { COLORTERM: 'truecolor', LANG: 'en_US.UTF-8' }, cwd: ROOT };
  const code = await main(args, io);
  if (code !== 0) throw new Error(`git-abv ${args.join(' ')} exited ${code}:\n${io.stderr.text()}`);
  return io.stdout.text();
}

const made = [];
function write(name, content) {
  fs.writeFileSync(path.join(ASSETS, name), content);
  made.push(name);
}

// 1. Demo repositories (fictional, deterministic).
const demos = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'make-demo-repo.mjs')], { encoding: 'utf8' });
if (demos.status !== 0) throw new Error(demos.stderr);
fs.mkdirSync(ASSETS, { recursive: true });

const repo = (name) => path.join(DEMO, name);

// 2. Terminal screenshots.
for (const [lang, suffix] of [['en', ''], ['zh', '.zh']]) {
  const report = await run([repo('moonshine'), '--color', '--lang', lang, '--top', '4']);
  write(`terminal${suffix}.svg`, termToSvg(report, { title: 'git abv', minCols: 80 }));
}
const explain = await run([repo('moonshine'), '--color', '--lang', 'en', '--explain=4', '--no-authors']);
const explainLines = explain.split('\n');
const explainStart = explainLines.findIndex((l) => l.includes('WHY THESE COMMITS COUNT'));
write('explain.svg', termToSvg(['', ...explainLines.slice(explainStart)].join('\n'), { title: 'git abv --explain', minCols: 80 }));

// 3. Labels and badges.
const labels = [
  ['moonshine', 'paper', 'en', 'label-rocket.svg'],
  ['moonshine', 'night', 'en', 'label-rocket-night.svg'],
  ['moonshine', 'paper', 'zh', 'label-rocket.zh.svg'],
  ['handmade', 'paper', 'en', 'label-abacus.svg'],
  ['handmade', 'paper', 'zh', 'label-abacus.zh.svg'],
  ['vibes', 'night', 'en', 'label-todo-night.svg'],
  ['vibes', 'night', 'zh', 'label-todo-night.zh.svg'],
];
for (const [demo, theme, lang, file] of labels) {
  await run([repo(demo), '-q', '--lang', lang, '--theme', theme, `--card=${path.join(ASSETS, file)}`]);
  made.push(file);
}
for (const [demo, name] of [['moonshine', 'rocket'], ['handmade', 'abacus'], ['vibes', 'todo']]) {
  await run([repo(demo), '-q', '--lang', 'en', `--badge=${path.join(ASSETS, `badge-${name}.svg`)}`]);
  await run([repo(demo), '-q', '--lang', 'zh', `--badge=${path.join(ASSETS, `badge-${name}.zh.svg`)}`]);
  made.push(`badge-${name}.svg`, `badge-${name}.zh.svg`);
}

console.log(`Wrote ${made.length} files to assets/:\n  ${made.join('\n  ')}`);
