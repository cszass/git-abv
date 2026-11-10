/**
 * Build a real git repository from a list of commit descriptions, in milliseconds.
 *
 * Uses `git fast-import`, so a thousand commits take well under a second and the result
 * is byte-for-byte deterministic. Used by the test suite and by the demo generator.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

function run(args, options = {}) {
  const res = spawnSync('git', args, { encoding: 'utf8', windowsHide: true, ...options });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed:\n${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

function data(text) {
  const body = Buffer.from(String(text), 'utf8');
  return Buffer.concat([Buffer.from(`data ${body.length}\n`), body, Buffer.from('\n')]);
}

/** `n` unique lines of filler, so numstat reports exactly `n` additions. */
export function filler(n, tag = 'x') {
  let out = '';
  for (let i = 0; i < n; i++) out += `${tag} ${i}\n`;
  return out;
}

/**
 * @typedef {Object} FakeCommit
 * @property {string} name          author name
 * @property {string} email         author email
 * @property {number} time          author date, unix seconds
 * @property {string} message       full commit message
 * @property {{path: string, content: string}[]} [files]  files written by this commit
 * @property {number} [lines]       shortcut: add one new file with this many lines
 * @property {string[]} [deletes]   paths removed by this commit
 * @property {string} [branch]      default "main"
 * @property {number} [from]        1-based index of the commit to branch from
 * @property {number} [merge]       1-based index of a commit to merge in
 */

/**
 * @param {string} dir  directory to (re)create
 * @param {FakeCommit[]} commits
 * @param {{ remote?: string, bare?: boolean }} [options]
 * @returns {string} dir
 */
export function buildRepo(dir, commits, options = {}) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  run(['init', '-q', '-b', 'main', ...(options.bare ? ['--bare'] : []), dir]);
  // Deep Windows paths (CI temp dirs, nested workspaces) overflow MAX_PATH without this.
  run(['-C', dir, 'config', 'core.longpaths', 'true']);

  if (commits.length > 0) {
    const chunks = [];
    commits.forEach((c, i) => {
      const who = `${c.name} <${c.email}> ${c.time} +0000`;
      chunks.push(Buffer.from(`commit refs/heads/${c.branch || 'main'}\nmark :${i + 1}\nauthor ${who}\ncommitter ${who}\n`));
      chunks.push(data(c.message));
      if (c.from) chunks.push(Buffer.from(`from :${c.from}\n`));
      if (c.merge) chunks.push(Buffer.from(`merge :${c.merge}\n`));
      const files = [...(c.files || [])];
      if (c.lines) files.push({ path: `src/c${String(i + 1).padStart(5, '0')}.txt`, content: filler(c.lines, `c${i + 1}`) });
      for (const f of files) {
        chunks.push(Buffer.from(`M 100644 inline ${f.path}\n`));
        chunks.push(data(f.content));
      }
      for (const p of c.deletes || []) chunks.push(Buffer.from(`D ${p}\n`));
      chunks.push(Buffer.from('\n'));
    });
    const res = spawnSync('git', ['-C', dir, '-c', 'core.longpaths=true', 'fast-import', '--quiet'], {
      input: Buffer.concat(chunks),
      windowsHide: true,
      maxBuffer: 256 * 1024 * 1024,
    });
    if (res.error) throw res.error;
    if (res.status !== 0) throw new Error(`git fast-import failed:\n${res.stderr}`);
  }

  if (options.remote) run(['-C', dir, 'remote', 'add', 'origin', options.remote]);
  return dir;
}

/** Small deterministic PRNG (mulberry32), so demo data never changes between runs. */
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
