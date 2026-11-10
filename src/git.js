/**
 * Talking to git. The only file that spawns a process.
 *
 * Everything is read with a single streaming `git log`, so memory stays flat
 * no matter how long the history is. Nothing is written, nothing leaves the machine.
 */

import { execFile, spawn } from 'node:child_process';
import path from 'node:path';

import { resolveNumstatPath } from './core/excludes.js';

const RS = '\x1e'; // record separator: starts every commit
const US = '\x1f'; // unit separator: between fields
const FORMAT = '%x1e%H%x1f%aN%x1f%aE%x1f%at%x1f%s%x1f%B%x1f';
/** Lets git read repositories that live under very deep Windows paths. Ignored elsewhere. */
const LONG_PATHS = ['-c', 'core.longpaths=true'];

export class GitError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'GitError';
    this.detail = detail;
  }
}

/** Run a git command and return trimmed stdout. Rejects with GitError on failure. */
export function git(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', cwd, ...LONG_PATHS, ...args], { maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') reject(new GitError('git was not found on your PATH.'));
        else reject(new GitError(String(stderr || err.message).trim(), err));
        return;
      }
      resolve(String(stdout).trim());
    });
  });
}

async function tryGit(cwd, args) {
  try {
    return await git(cwd, args);
  } catch (err) {
    if (err instanceof GitError && /not found on your PATH/.test(err.message)) throw err;
    return null;
  }
}

/**
 * "https://user:token@github.com/acme/rocket.git" → "acme/rocket".
 * Only ever returns the last two path segments, so credentials in a URL never leak into output.
 */
export function repoNameFromRemote(url) {
  if (!url) return null;
  let s = String(url).trim();
  s = s.replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\.git$/i, '');
  // scp-like: git@host:owner/repo
  const scp = /^[^/@:]+@[^/:]+:(.+)$/.exec(s);
  if (scp) s = scp[1];
  else s = s.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*\//i, '');
  const parts = s.split(/[\\/]/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.slice(-2).join('/');
}

/**
 * Basic facts about the repository at `cwd`.
 * @returns {Promise<{ root: string, name: string, branch: string|null, head: string|null, shallow: boolean, empty: boolean }>}
 */
export async function repoInfo(cwd) {
  const gitDir = await tryGit(cwd, ['rev-parse', '--absolute-git-dir']);
  if (gitDir == null) {
    throw new GitError(`Not a git repository: ${path.resolve(cwd)}`);
  }
  const top = await tryGit(cwd, ['rev-parse', '--show-toplevel']);
  const root = top || gitDir;

  const remote = await tryGit(cwd, ['config', '--get', 'remote.origin.url']);
  let name = repoNameFromRemote(remote);
  if (!name) {
    const base = path.basename(root.replace(/[\\/]\.git$/i, ''));
    name = base.replace(/\.git$/i, '') || 'repo';
  }

  const head = await tryGit(cwd, ['rev-parse', '--short', 'HEAD']);
  let branch = await tryGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch === 'HEAD') branch = null; // detached
  const shallow = (await tryGit(cwd, ['rev-parse', '--is-shallow-repository'])) === 'true';

  return { root, name, branch, head, shallow, empty: head == null };
}

/**
 * Stream every non-merge commit to `onCommit`.
 *
 * @param {string} cwd
 * @param {Object} opts
 * @param {string}   [opts.rev]       revision or range, default HEAD
 * @param {boolean}  [opts.all]       walk all refs instead of `rev`
 * @param {string}   [opts.since]
 * @param {string}   [opts.until]
 * @param {string[]} [opts.authors]   passed to `git log --author`
 * @param {string[]} [opts.paths]     pathspecs to restrict the walk to
 * @param {boolean}  [opts.numstat]   count lines (slower); default true
 * @param {(path: string) => boolean} [opts.isExcluded]  paths left out of line counts
 * @param {(commit: object) => void} onCommit
 * @returns {Promise<{ commits: number }>}
 */
export function streamCommits(cwd, opts, onCommit) {
  const numstat = opts.numstat !== false;
  const isExcluded = opts.isExcluded || (() => false);

  const args = ['-C', cwd, ...LONG_PATHS, '-c', 'core.quotepath=off', 'log', '--no-merges', `--format=${FORMAT}`];
  if (numstat) args.push('--numstat', '-M');
  if (opts.since) args.push(`--since=${opts.since}`);
  if (opts.until) args.push(`--until=${opts.until}`);
  for (const a of opts.authors || []) args.push(`--author=${a}`);
  if (opts.all) args.push('--all');
  else args.push(opts.rev || 'HEAD');
  args.push('--');
  for (const p of opts.paths || []) args.push(p);

  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let buffer = '';
    let stderr = '';
    let count = 0;
    let failed = null;

    const handle = (record) => {
      if (!record) return;
      const f = record.split(US);
      if (f.length < 7) return;
      const stat = f[f.length - 1];
      const message = f.length === 7 ? f[5] : f.slice(5, f.length - 1).join(US);

      let added = 0;
      let deleted = 0;
      let files = 0;
      if (numstat && stat.length > 2) {
        let pos = 0;
        while (pos < stat.length) {
          let end = stat.indexOf('\n', pos);
          if (end === -1) end = stat.length;
          const line = stat.slice(pos, end);
          pos = end + 1;
          const t1 = line.indexOf('\t');
          if (t1 <= 0) continue;
          const t2 = line.indexOf('\t', t1 + 1);
          if (t2 === -1) continue;
          const a = line.slice(0, t1);
          if (a === '-') continue; // binary file
          const filePath = resolveNumstatPath(line.slice(t2 + 1));
          if (isExcluded(filePath)) continue;
          added += Number(a) || 0;
          deleted += Number(line.slice(t1 + 1, t2)) || 0;
          files += 1;
        }
      }

      count += 1;
      try {
        onCommit({
          hash: f[0].trim(),
          authorName: f[1],
          authorEmail: f[2],
          time: Number(f[3]),
          subject: f[4],
          message,
          added,
          deleted,
          files,
        });
      } catch (err) {
        failed = err;
        child.kill();
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lastSep = buffer.lastIndexOf(RS);
      if (lastSep <= 0) return; // at most one (still incomplete) record in the buffer
      const complete = buffer.slice(0, lastSep);
      buffer = buffer.slice(lastSep);
      for (const record of complete.split(RS)) handle(record);
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 8192) stderr += chunk;
    });
    child.on('error', (err) => {
      if (err.code === 'ENOENT') reject(new GitError('git was not found on your PATH.'));
      else reject(new GitError(err.message, err));
    });
    child.on('close', (code) => {
      if (failed) return reject(failed);
      if (code !== 0) {
        const msg = stderr.trim();
        // A repository with no commits yet is not an error, just an empty glass.
        if (/does not have any commits yet|bad (default )?revision 'HEAD'|unknown revision or path not in the working tree/i.test(msg) && !opts.rev && !opts.all) {
          return resolve({ commits: 0 });
        }
        return reject(new GitError(msg || `git log exited with code ${code}`));
      }
      for (const record of buffer.split(RS)) handle(record);
      if (failed) return reject(failed);
      resolve({ commits: count });
    });
  });
}
