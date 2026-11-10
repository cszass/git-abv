import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import { analyze } from '../src/analyze.js';
import { GitError, repoInfo, repoNameFromRemote } from '../src/git.js';
import { CLAUDE, CURSOR, DAY, NOW, T0, cleanup, commit, jane, omar, tempDir, tempRepo } from '../scripts/lib/testing.mjs';
import { filler } from '../scripts/lib/fake-repo.mjs';

after(cleanup);

test('repoNameFromRemote handles every common URL shape', () => {
  const cases = [
    ['https://github.com/acme/rocket.git', 'acme/rocket'],
    ['https://github.com/acme/rocket', 'acme/rocket'],
    ['https://github.com/acme/rocket/', 'acme/rocket'],
    ['git@github.com:acme/rocket.git', 'acme/rocket'],
    ['ssh://git@github.com/acme/rocket.git', 'acme/rocket'],
    ['ssh://git@gitlab.example.com:2222/group/sub/project.git', 'sub/project'],
    ['https://gitlab.com/group/sub/project.git', 'sub/project'],
    ['/srv/git/rocket.git', 'git/rocket'],
    ['C:\\repos\\acme\\rocket', 'acme/rocket'],
    ['rocket', 'rocket'],
    ['', null],
    [null, null],
  ];
  for (const [url, expected] of cases) assert.equal(repoNameFromRemote(url), expected, String(url));
});

test('credentials embedded in a remote URL never reach the output', () => {
  const name = repoNameFromRemote('https://jane:ghp_SuperSecretToken123@github.com/acme/rocket.git');
  assert.equal(name, 'acme/rocket');
  assert.ok(!name.includes('ghp_'));
});

test('measures a simple history end to end', async () => {
  const dir = tempRepo(
    [
      commit({ lines: 100, time: T0 }),
      commit({ lines: 100, time: T0 + DAY, ...omar }),
      commit({ lines: 200, time: T0 + 2 * DAY, trailer: CLAUDE }),
    ],
    { remote: 'https://github.com/acme/rocket.git' },
  );
  const r = await analyze(dir, { now: NOW });
  assert.equal(r.repo.name, 'acme/rocket');
  assert.equal(r.repo.branch, 'main');
  assert.match(r.repo.head, /^[0-9a-f]{7,}$/);
  assert.equal(r.byCommits.total, 3);
  assert.equal(r.byCommits.ai, 1);
  assert.equal(r.byLines.total, 400);
  assert.equal(r.byLines.ai, 200);
  assert.equal(r.abv, 50);
  assert.equal(r.tools[0].id, 'claude');
  assert.equal(r.range.firstCommit, '2025-06-15');
  assert.equal(r.range.lastCommit, '2025-06-17');
  assert.equal(r.people.total, 2);
});

test('falls back to the folder name without a remote, spaces and all', async () => {
  const dir = tempRepo([commit()], { dirName: 'my cool repo' });
  const r = await analyze(dir, { now: NOW });
  assert.equal(r.repo.name, 'my cool repo');
  assert.equal(r.byCommits.total, 1);
});

test('lockfiles and vendored code do not count toward volume, but do count as commits', async () => {
  const dir = tempRepo([
    commit({ lines: 0, files: [{ path: 'src/app.js', content: filler(10) }] }),
    commit({
      lines: 0,
      trailer: CLAUDE,
      files: [
        { path: 'src/feature.js', content: filler(30) },
        { path: 'package-lock.json', content: filler(5000) },
        { path: 'vendor/lib/big.js', content: filler(2000) },
      ],
    }),
  ]);
  const r = await analyze(dir, { now: NOW });
  assert.equal(r.byLines.total, 40);
  assert.equal(r.byLines.ai, 30);
  assert.equal(r.abv, 75);
  assert.equal(r.byCommits.total, 2);

  const raw = await analyze(dir, { now: NOW, defaultExcludes: false });
  assert.equal(raw.byLines.total, 7040);
});

test('--exclude patterns remove extra paths from volume', async () => {
  const dir = tempRepo([
    commit({ lines: 0, files: [{ path: 'src/app.js', content: filler(10) }] }),
    commit({ lines: 0, trailer: CLAUDE, files: [{ path: 'data/dump.csv', content: filler(990) }] }),
  ]);
  assert.equal((await analyze(dir, { now: NOW })).abv, 99);
  const r = await analyze(dir, { now: NOW, exclude: ['data/'] });
  assert.equal(r.byLines.total, 10);
  assert.equal(r.abv, 0);
  // The commit is still an AI commit; only its lines were set aside.
  assert.equal(r.byCommits.ai, 1);
});

test('a pure rename adds no volume', async () => {
  const body = filler(200, 'stable');
  const dir = tempRepo([
    commit({ lines: 0, files: [{ path: 'old/name.js', content: body }] }),
    {
      ...jane,
      time: T0 + DAY,
      message: `Move file\n\n${CLAUDE}\n`,
      // fast-import: write the same blob at a new path and delete the old one → git sees a rename.
      files: [{ path: 'new/name.js', content: body }],
      deletes: ['old/name.js'],
    },
  ]);
  const r = await analyze(dir, { now: NOW });
  assert.equal(r.byLines.total, 200);
  assert.equal(r.byLines.ai, 0);
});

test('binary files are skipped', async () => {
  const dir = tempRepo([
    commit({ lines: 0, files: [{ path: 'logo.png', content: '\u0000\u0001\u0002binary\u0000stuff\u0000' }, { path: 'a.txt', content: filler(3) }] }),
  ]);
  const r = await analyze(dir, { now: NOW });
  assert.equal(r.byLines.total, 3);
});

test('merge commits are not counted', async () => {
  const dir = tempRepo([
    commit({ lines: 10, time: T0 }), // 1
    commit({ lines: 10, time: T0 + 1 * DAY, branch: 'feature', from: 1, trailer: CLAUDE }), // 2
    commit({ lines: 10, time: T0 + 2 * DAY }), // 3 on main
    { ...jane, time: T0 + 3 * DAY, message: `Merge branch 'feature'\n\n${CLAUDE}\n`, merge: 2 }, // 4: merge into main
  ]);
  const r = await analyze(dir, { now: NOW });
  assert.equal(r.byCommits.total, 3);
  assert.equal(r.byCommits.ai, 1);
  assert.equal(r.byLines.total, 30);
});

test('--since, --until and --author narrow the scan', async () => {
  const dir = tempRepo([
    commit({ lines: 10, time: T0 }),
    commit({ lines: 10, time: T0 + 10 * DAY, trailer: CLAUDE }),
    commit({ lines: 10, time: T0 + 20 * DAY, ...omar }),
    commit({ lines: 10, time: T0 + 30 * DAY, ...omar, trailer: CURSOR }),
  ]);
  const iso = (t) => new Date(t * 1000).toISOString();
  const since = await analyze(dir, { now: NOW, since: iso(T0 + 15 * DAY) });
  assert.equal(since.byCommits.total, 2);
  assert.equal(since.range.since, iso(T0 + 15 * DAY));
  const until = await analyze(dir, { now: NOW, until: iso(T0 + 15 * DAY) });
  assert.equal(until.byCommits.total, 2);
  assert.equal(until.tools[0].id, 'claude');
  const byOmar = await analyze(dir, { now: NOW, authors: ['Omar'] });
  assert.equal(byOmar.byCommits.total, 2);
  assert.equal(byOmar.abv, 50);
});

test('--only restricts the scan to a path', async () => {
  const dir = tempRepo([
    commit({ lines: 0, files: [{ path: 'packages/api/index.js', content: filler(10) }] }),
    commit({ lines: 0, trailer: CLAUDE, files: [{ path: 'packages/web/index.js', content: filler(90) }] }),
  ]);
  const api = await analyze(dir, { now: NOW, paths: ['packages/api'] });
  assert.equal(api.byCommits.total, 1);
  assert.equal(api.abv, 0);
  const web = await analyze(dir, { now: NOW, paths: ['packages/web'] });
  assert.equal(web.abv, 100);
});

test('--fast skips line counting and measures by commits', async () => {
  const dir = tempRepo([commit({ lines: 990 }), commit({ lines: 10, trailer: CLAUDE })]);
  const r = await analyze(dir, { now: NOW, fast: true });
  assert.equal(r.metric, 'commits');
  assert.equal(r.abv, 50);
  assert.equal(r.byLines.available, false);
});

test('non-ASCII authors, subjects and paths survive the round trip', async () => {
  const dir = tempRepo([
    {
      name: '林晓雨',
      email: 'xiaoyu@example.com',
      time: T0,
      message: `修复登录页面的问题 🐛\n\n${CLAUDE}\n`,
      files: [{ path: 'src/页面/登录.js', content: filler(7) }],
    },
  ]);
  const r = await analyze(dir, { now: NOW, samples: 1 });
  assert.equal(r.people.pourers[0].name, '林晓雨');
  assert.equal(r.firstAi.subject, '修复登录页面的问题 🐛');
  assert.equal(r.byLines.ai, 7);
});

test('messages containing separators and odd characters do not derail the parser', async () => {
  const dir = tempRepo([
    commit({ lines: 5, subject: 'Normal one' }),
    { ...jane, time: T0 + DAY, lines: 5, message: `Weird \u001f subject\n\nBody with \u001f unit separators\tand tabs\n1\t2\tnot-a-file\n\n${CLAUDE}\n` },
    commit({ lines: 5, time: T0 + 2 * DAY, subject: 'After the weird one' }),
  ]);
  const r = await analyze(dir, { now: NOW });
  assert.equal(r.byCommits.total, 3);
  assert.equal(r.byCommits.ai, 1);
  assert.equal(r.byLines.total, 15);
});

test('an empty repository yields an empty report instead of an error', async () => {
  const dir = tempRepo([]);
  const info = await repoInfo(dir);
  assert.equal(info.empty, true);
  const r = await analyze(dir, { now: NOW });
  assert.equal(r.byCommits.total, 0);
  assert.equal(r.abv, 0);
});

test('bare repositories work', async () => {
  const dir = tempRepo([commit({ lines: 10 }), commit({ lines: 30, trailer: CLAUDE })], { bare: true, dirName: 'rocket.git' });
  const r = await analyze(dir, { now: NOW });
  assert.equal(r.repo.name, 'rocket');
  assert.equal(r.abv, 75);
});

test('a folder that is not a repository is a clear error', async () => {
  const dir = tempDir();
  await assert.rejects(() => analyze(dir, { now: NOW }), (err) => err instanceof GitError && /Not a git repository/.test(err.message));
});

test('an unknown revision is reported, not swallowed', async () => {
  const dir = tempRepo([commit()]);
  await assert.rejects(() => analyze(dir, { now: NOW, rev: 'no-such-branch' }), GitError);
});

test('--rev and --all pick which commits are walked', async () => {
  const dir = tempRepo([
    commit({ lines: 10, time: T0 }), // 1
    commit({ lines: 10, time: T0 + DAY, branch: 'feature', from: 1, trailer: CLAUDE }), // 2
    commit({ lines: 10, time: T0 + 2 * DAY }), // 3 on main
  ]);
  assert.equal((await analyze(dir, { now: NOW })).byCommits.total, 2);
  assert.equal((await analyze(dir, { now: NOW, rev: 'feature' })).byCommits.ai, 1);
  assert.equal((await analyze(dir, { now: NOW, all: true })).byCommits.total, 3);
  assert.equal((await analyze(dir, { now: NOW, rev: 'main..feature' })).byCommits.total, 1);
});

test('progress is reported on long histories', async () => {
  const commits = Array.from({ length: 600 }, (_, i) => commit({ lines: 1, time: T0 + i * 60 }));
  const dir = tempRepo(commits);
  const seen = [];
  const r = await analyze(dir, { now: NOW, onProgress: (n) => seen.push(n) });
  assert.equal(r.byCommits.total, 600);
  assert.deepEqual(seen, [250, 500]);
});
