/** Shared fixtures for the test suite. Lives outside test/ so the runner does not treat it as a test file. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildRepo } from './fake-repo.mjs';

const created = [];

export const DAY = 86400;
/** 2025-06-15T15:06:40Z. A fixed "now minus a bit" for deterministic histories. */
export const T0 = 1750000000;
/** A fixed clock for reports, a few days after T0-based histories end. */
export const NOW = T0 + 400 * DAY;

export const jane = { name: 'Jane Doe', email: 'jane@example.com' };
export const omar = { name: 'Omar Haddad', email: 'omar@example.com' };

export const CLAUDE = 'Co-Authored-By: Claude <noreply@anthropic.com>';
export const COPILOT = 'Co-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>';
export const CURSOR = 'Co-authored-by: Cursor <cursoragent@cursor.com>';

export function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-abv-'));
  created.push(dir);
  return dir;
}

/** Build a throwaway repository. Pass `dirName` to control the folder name (e.g. one with a space). */
export function tempRepo(commits, options = {}) {
  return buildRepo(path.join(tempDir(), options.dirName || 'repo'), commits, options);
}

export function cleanup() {
  for (const dir of created.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** A commit description with sensible defaults. */
export function commit(overrides = {}) {
  const { trailer, subject = 'Change something', ...rest } = overrides;
  return {
    ...jane,
    time: T0,
    message: trailer ? `${subject}\n\n${trailer}\n` : `${subject}\n`,
    lines: 10,
    ...rest,
  };
}

/** Fake stdout/stderr that just remember what was written. */
export function fakeIo(cwd, env = {}) {
  const stream = () => {
    const chunks = [];
    return { isTTY: false, write: (s) => chunks.push(String(s)), text: () => chunks.join('') };
  };
  return { stdout: stream(), stderr: stream(), env: { LANG: 'en_US.UTF-8', ...env }, cwd };
}

/**
 * Minimal XML well-formedness check: every tag closes, in order, and no raw `&` or `<` leaks into text.
 * Enough to catch the classic "forgot to escape a commit subject" bug in generated SVG.
 */
export function assertWellFormedXml(xml) {
  const stack = [];
  const tagRe = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g;
  let last = 0;
  let m;
  while ((m = tagRe.exec(xml))) {
    const between = xml.slice(last, m.index);
    if (/</.test(between)) throw new Error(`Stray "<" near: ${between.slice(0, 60)}`);
    if (/&(?!(amp|lt|gt|quot|#39|#\d+);)/.test(between)) throw new Error(`Unescaped "&" near: ${between.slice(0, 60)}`);
    last = tagRe.lastIndex;
    const [, closing, name, attrs, selfClosing] = m;
    if (/&(?!(amp|lt|gt|quot|#39|#\d+);)/.test(attrs)) throw new Error(`Unescaped "&" in attributes of <${name}>`);
    if (closing) {
      const open = stack.pop();
      if (open !== name) throw new Error(`Mismatched </${name}>, expected </${open}>`);
    } else if (!selfClosing) {
      stack.push(name);
    }
  }
  const tail = xml.slice(last);
  if (/[<&]/.test(tail.replace(/&(amp|lt|gt|quot|#39|#\d+);/g, ''))) throw new Error('Trailing garbage after last tag');
  if (stack.length > 0) throw new Error(`Unclosed tags: ${stack.join(', ')}`);
}
