/**
 * Which files count toward "volume"?
 *
 * A single `package-lock.json` bump can outweigh a month of real work, so by default
 * lockfiles, vendored code and generated artefacts are left out of line counts.
 * They still count as commits. Turn this off with `--no-default-excludes`.
 */

const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
  'deno.lock',
  'cargo.lock',
  'go.sum',
  'go.work.sum',
  'composer.lock',
  'gemfile.lock',
  'poetry.lock',
  'pdm.lock',
  'uv.lock',
  'pipfile.lock',
  'flake.lock',
  'mix.lock',
  'pubspec.lock',
  'podfile.lock',
  'packages.lock.json',
  'gradle.lockfile',
  'package.resolved',
  'conan.lock',
]);

const VENDORED_DIRS = /(^|\/)(node_modules|vendor|vendored|third_party|third-party|bower_components|Pods|\.yarn|__snapshots__|__generated__)\//i;

const GENERATED_FILES = /(\.min\.(js|css)|\.map|\.snap|\.pb\.go|_pb2(_grpc)?\.py|\.pb\.(cc|h)|\.g\.dart|\.freezed\.dart|\.generated\.[a-z]+|\.designer\.cs|\.lock)$/i;

export function isDefaultExcluded(path) {
  const p = String(path).replace(/\\/g, '/');
  const base = p.slice(p.lastIndexOf('/') + 1).toLowerCase();
  if (LOCKFILES.has(base)) return true;
  if (VENDORED_DIRS.test(p)) return true;
  if (GENERATED_FILES.test(base)) return true;
  return false;
}

/**
 * Tiny glob → RegExp. Supports `*`, `**`, `?`. A pattern without a slash matches at any depth,
 * like a .gitignore entry (`*.svg` matches `assets/logo.svg`).
 */
export function globToRegExp(glob) {
  let g = String(glob).trim().replace(/\\/g, '/');
  const anchored = g.startsWith('/');
  if (anchored) g = g.slice(1);
  const dirOnly = g.endsWith('/');
  if (dirOnly) g = g.slice(0, -1);
  const anyDepth = !anchored && !g.includes('/');

  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        // `**/` matches zero or more directories; a bare `**` matches anything.
        if (g[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  const prefix = anyDepth ? '(?:^|.*/)' : '^';
  const suffix = '(?:/.*)?$';
  return new RegExp(prefix + re + suffix);
}

/**
 * Build the predicate that decides whether a path is left out of line counts.
 * @param {{ defaults?: boolean, patterns?: string[] }} [options]
 */
export function createExcluder(options = {}) {
  const useDefaults = options.defaults !== false;
  const custom = (options.patterns || []).map(globToRegExp);
  return function isExcluded(path) {
    const p = String(path).replace(/\\/g, '/');
    if (useDefaults && isDefaultExcluded(p)) return true;
    for (const re of custom) {
      if (re.test(p)) return true;
    }
    return false;
  };
}

/**
 * `git log --numstat` prints renames as `src/{old => new}/file.js` or `old.js => new.js`.
 * Resolve that to the path the file has after the commit.
 */
export function resolveNumstatPath(raw) {
  let p = String(raw);
  if (p.includes(' => ')) {
    if (p.includes('{')) {
      p = p.replace(/\{[^{}]*? => ([^{}]*?)\}/g, '$1');
    } else {
      p = p.slice(p.indexOf(' => ') + 4);
    }
    p = p.replace(/\/{2,}/g, '/');
  }
  // Paths with unusual bytes come back C-quoted; strip the quotes, keep it simple.
  if (p.length > 1 && p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
  return p;
}
