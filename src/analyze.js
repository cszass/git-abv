/**
 * analyze(): point it at a repository, get a report back.
 * This is the whole pipeline: git log → classify → aggregate.
 */

import fs from 'node:fs';

import { createAggregator } from './core/aggregate.js';
import { createExcluder } from './core/excludes.js';
import { repoInfo, streamCommits } from './git.js';

let cachedVersion = null;

export function version() {
  if (cachedVersion == null) {
    try {
      const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
      cachedVersion = pkg.version || '0.0.0';
    } catch {
      cachedVersion = '0.0.0';
    }
  }
  return cachedVersion;
}

/**
 * @param {string} cwd  path to a git repository (work tree or bare)
 * @param {Object} [options]
 * @param {string}   [options.rev]              revision or range (default HEAD)
 * @param {boolean}  [options.all]              walk every ref
 * @param {string}   [options.since]
 * @param {string}   [options.until]
 * @param {string[]} [options.authors]          `git log --author` filters
 * @param {string[]} [options.paths]            pathspecs to restrict the scan to
 * @param {string[]} [options.exclude]          extra globs left out of line counts
 * @param {boolean}  [options.defaultExcludes]  false counts lockfiles and vendored code too
 * @param {boolean}  [options.fast]             skip line counting; ABV is then measured by commits
 * @param {RegExp[]} [options.customAi]         extra identities to count as AI
 * @param {number}   [options.recentDays]
 * @param {number}   [options.samples]          keep N matched commits (for --explain)
 * @param {boolean}  [options.suspects]
 * @param {boolean}  [options.breakdown]        tally which signatures matched (on by default with samples)
 * @param {string}   [options.name]             display name override
 * @param {number}   [options.now]              unix seconds, for deterministic output
 * @param {(count: number) => void} [options.onProgress]
 * @returns {Promise<object>} the report
 */
export async function analyze(cwd, options = {}) {
  const info = await repoInfo(cwd);
  const aggregator = createAggregator({
    customAi: options.customAi,
    metric: options.fast ? 'commits' : undefined,
    recentDays: options.recentDays,
    now: options.now,
    samples: options.samples,
    suspects: options.suspects,
    breakdown: options.breakdown ?? (options.samples > 0),
  });

  if (!info.empty || options.all || options.rev) {
    let seen = 0;
    await streamCommits(
      cwd,
      {
        rev: options.rev,
        all: options.all,
        since: options.since,
        until: options.until,
        authors: options.authors,
        paths: options.paths,
        numstat: !options.fast,
        isExcluded: createExcluder({ defaults: options.defaultExcludes !== false, patterns: options.exclude }),
      },
      (commit) => {
        aggregator.add(commit);
        seen += 1;
        if (options.onProgress && seen % 250 === 0) options.onProgress(seen);
      },
    );
  }

  return aggregator.finish({
    version: version(),
    repo: {
      name: options.name || info.name,
      branch: info.branch,
      head: info.head,
      shallow: info.shallow,
    },
    range: { since: options.since, until: options.until },
  });
}
