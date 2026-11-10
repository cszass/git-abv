#!/usr/bin/env node
/**
 * Copy the shared core (src/core) into the web app (docs/lib).
 *
 * GitHub Pages serves docs/ as-is, with no build step, so the browser needs its own copy
 * of the modules. Run this after changing anything in src/core:
 *
 *   npm run sync:web          # copy
 *   node scripts/sync-web.mjs --check   # exit 1 if the copy is stale (used by the tests)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src', 'core');
const DEST = path.join(ROOT, 'docs', 'lib');
const BANNER = '// Generated from src/core by `npm run sync:web`. Do not edit here.\n';

export function expectedFiles() {
  return fs
    .readdirSync(SRC)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((name) => ({ name, content: BANNER + fs.readFileSync(path.join(SRC, name), 'utf8').replace(/\r\n/g, '\n') }));
}

/** @returns {string[]} names of files in docs/lib that are missing, stale or unexpected */
export function staleFiles() {
  const expected = expectedFiles();
  const stale = [];
  for (const file of expected) {
    const target = path.join(DEST, file.name);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current !== file.content) stale.push(file.name);
  }
  const names = new Set(expected.map((f) => f.name));
  if (fs.existsSync(DEST)) {
    for (const f of fs.readdirSync(DEST)) if (!names.has(f)) stale.push(f);
  }
  return stale;
}

function sync() {
  fs.rmSync(DEST, { recursive: true, force: true });
  fs.mkdirSync(DEST, { recursive: true });
  for (const file of expectedFiles()) fs.writeFileSync(path.join(DEST, file.name), file.content);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const stale = staleFiles();
    if (stale.length > 0) {
      console.error(`docs/lib is out of date (${stale.join(', ')}). Run: npm run sync:web`);
      process.exit(1);
    }
    console.log('docs/lib is in sync with src/core.');
  } else {
    sync();
    console.log(`Synced ${expectedFiles().length} modules to docs/lib.`);
  }
}
