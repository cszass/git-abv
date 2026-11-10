import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { main } from '../src/cli.js';
import { render as renderSignaturesMd } from '../scripts/gen-signatures-md.mjs';
import { expected as expectedReadmes } from '../scripts/readme-shelf.mjs';
import { fakeIo } from '../scripts/lib/testing.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const READMES = ['README.md', 'README.zh-CN.md'];

test('SIGNATURES.md matches the signature database', () => {
  assert.equal(read('SIGNATURES.md'), renderSignaturesMd(), 'run `npm run signatures:md`');
});

test('the top shelf tables in the READMEs match the measured data', () => {
  for (const r of expectedReadmes()) {
    assert.equal(r.current, r.next, `${r.file} is stale: run \`node scripts/readme-shelf.mjs\``);
  }
});

test('every local file the docs point at exists', () => {
  for (const file of [...READMES, 'CONTRIBUTING.md', 'SIGNATURES.md']) {
    // Code is not prose: `[Claude Code](…)` inside backticks is an example, not a link.
    const text = read(file)
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`\n]*`/g, '');
    const refs = [
      ...[...text.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]),
      ...[...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]),
    ];
    const local = refs.filter((ref) => !/^(https?:|mailto:|#)/.test(ref)).map((ref) => ref.split('#')[0]);
    assert.ok(local.length > 0, `${file} has no local references?`);
    for (const ref of local) {
      assert.ok(fs.existsSync(path.join(ROOT, ref)), `${file} points at ${ref}, which does not exist`);
    }
  }
});

test('in-page anchors in the READMEs resolve to a heading', () => {
  const slug = (heading) =>
    heading
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s/g, '-');
  for (const file of READMES) {
    const text = read(file);
    const headings = new Set([...text.matchAll(/^#{1,4}\s+(.+)$/gm)].map((m) => slug(m[1])));
    const anchors = [...text.matchAll(/href="#([^"]+)"/g), ...text.matchAll(/\]\(#([^)]+)\)/g)].map((m) => decodeURIComponent(m[1]));
    for (const anchor of anchors) assert.ok(headings.has(anchor), `${file}: no heading for #${anchor}`);
  }
});

test('every option in --help is documented in the README', async () => {
  const io = fakeIo(ROOT);
  await main(['--help'], io);
  const flags = new Set(io.stdout.text().match(/--[a-z][a-z-]+/g));
  assert.ok(flags.size > 20);
  const readme = read('README.md');
  for (const flag of flags) assert.ok(readme.includes(flag), `README.md does not mention ${flag}`);
});

test('the READMEs only show commands the CLI accepts', async () => {
  for (const file of READMES) {
    const commands = [...read(file).matchAll(/^(?:git abv|npx git-abv)( .*)?$/gm)].map((m) => (m[1] || '').replace(/\s+#.*$/, '').trim());
    assert.ok(commands.length >= 10, `${file}: expected plenty of example commands`);
    for (const command of commands) {
      if (/[|~]/.test(command)) continue; // pipes and home-relative paths are for a shell
      const args = (command.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((a) => a.replace(/^(['"])(.*)\1$/, '$2'));
      // Run each example against this repository, from a scratch folder so --card and
      // --badge have somewhere harmless to write. The point: every flag parses, every mode runs.
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-abv-docs-'));
      try {
        const io = fakeIo(dir);
        const code = await main([ROOT, ...args], io);
        assert.equal(code, 0, `${file}: \`git abv ${command}\` exited ${code}: ${io.stderr.text()}`);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }
});

test('package.json ships what it says it ships', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const entry of pkg.files) assert.ok(fs.existsSync(path.join(ROOT, entry)), `"files" lists ${entry}, which does not exist`);
  for (const bin of Object.values(pkg.bin)) {
    assert.ok(read(bin).startsWith('#!/usr/bin/env node\n'), `${bin} needs a shebang`);
  }
  assert.equal(pkg.dependencies, undefined, 'git-abv has zero dependencies. Keep it that way.');
  assert.equal(pkg.devDependencies, undefined);
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
});

test('the GitHub Action reads inputs from the environment, not by interpolation', () => {
  const action = read('action.yml');
  assert.match(action, /using: 'composite'/);
  // `${{ inputs.x }}` inside a `run:` script would be a script injection hole.
  for (const block of action.split(/\n\s+run: \|\n/).slice(1)) {
    const script = block.split(/\n {4}- name:/)[0];
    assert.ok(!script.includes('${{'), 'a run: script interpolates an expression directly');
  }
});
