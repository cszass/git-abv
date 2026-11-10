#!/usr/bin/env node
/**
 * One-time setup after you create the GitHub repository: point every link at your account.
 *
 *   node scripts/set-owner.mjs <github-username-or-org> [repo-name]
 *
 * Replaces the YOUR_GITHUB_USERNAME placeholder (and, optionally, the repository name)
 * in the READMEs, the web app, the workflows and package.json. Safe to run more than once.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLACEHOLDER = 'YOUR_GITHUB_USERNAME';
const [owner, repo = 'git-abv'] = process.argv.slice(2);

if (!owner || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) {
  console.error('Usage: node scripts/set-owner.mjs <github-username-or-org> [repo-name]');
  process.exit(2);
}
if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo)) {
  console.error(`Not a valid repository name: ${repo}`);
  process.exit(2);
}

const FILES = [
  'README.md',
  'README.zh-CN.md',
  'CONTRIBUTING.md',
  'docs/index.html',
  'docs/app.js',
  '.github/workflows/abv.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
];

let touched = 0;
for (const rel of FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  let after = before.split(`${PLACEHOLDER}/git-abv`).join(`${owner}/${repo}`);
  after = after.split(`${PLACEHOLDER}.github.io/git-abv`).join(`${owner.toLowerCase()}.github.io/${repo}`);
  after = after.split(PLACEHOLDER).join(owner);
  if (after !== before) {
    fs.writeFileSync(file, after);
    touched += 1;
    console.log(`updated ${rel}`);
  }
}

// package.json gets proper repository metadata, which npm shows on the package page.
const pkgFile = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const url = `https://github.com/${owner}/${repo}`;
const next = {
  ...pkg,
  homepage: `https://${owner.toLowerCase()}.github.io/${repo}/`,
  repository: { type: 'git', url: `git+${url}.git` },
  bugs: { url: `${url}/issues` },
};
if (JSON.stringify(next) !== JSON.stringify(pkg)) {
  fs.writeFileSync(pkgFile, JSON.stringify(next, null, 2) + '\n');
  touched += 1;
  console.log('updated package.json');
}

console.log(touched > 0 ? `\nDone. ${touched} file(s) now point at ${url}` : '\nNothing to change.');
