import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAggregator } from '../src/core/aggregate.js';

const DAY = 86400;
const utc = (y, m, d = 1) => Date.UTC(y, m - 1, d) / 1000;
const NOW = utc(2026, 11, 10);

const CLAUDE = 'Co-Authored-By: Claude <noreply@anthropic.com>';
const CURSOR = 'Co-authored-by: Cursor <cursoragent@cursor.com>';

let seq = 0;
function commit(over = {}) {
  seq += 1;
  const { trailer, ...rest } = over;
  return {
    hash: String(seq).padStart(40, '0'),
    authorName: 'Jane Doe',
    authorEmail: 'jane@example.com',
    time: utc(2026, 6, 1),
    subject: 'Change',
    message: trailer ? `Change\n\n${trailer}\n` : 'Change\n',
    added: 10,
    deleted: 0,
    ...rest,
  };
}

function run(commits, options = {}) {
  const agg = createAggregator({ now: NOW, ...options });
  for (const c of commits) agg.add(c);
  return agg.finish({ version: '9.9.9', repo: { name: 'acme/test', branch: 'main', head: 'abc1234' } });
}

test('headline numbers: by volume and by commits', () => {
  const r = run([
    commit({ added: 100 }),
    commit({ added: 100 }),
    commit({ added: 100 }),
    commit({ added: 300, trailer: CLAUDE }),
  ]);
  assert.equal(r.metric, 'lines');
  assert.equal(r.abv, 50);
  assert.equal(r.proof, 100);
  assert.equal(r.style, 'cask');
  assert.deepEqual(
    { ai: r.byLines.ai, human: r.byLines.human, bot: r.byLines.bot, total: r.byLines.total, share: r.byLines.aiShare },
    { ai: 300, human: 300, bot: 0, total: 600, share: 50 },
  );
  assert.deepEqual(
    { ai: r.byCommits.ai, human: r.byCommits.human, total: r.byCommits.total, share: r.byCommits.aiShare },
    { ai: 1, human: 3, total: 4, share: 25 },
  );
  assert.equal(r.tool.version, '9.9.9');
  assert.equal(r.repo.name, 'acme/test');
  assert.equal(r.schema, 1);
});

test('falls back to commits when there are no line counts', () => {
  const r = run([commit({ added: 0 }), commit({ added: 0, trailer: CLAUDE })]);
  assert.equal(r.metric, 'commits');
  assert.equal(r.abv, 50);
  assert.equal(r.byLines.available, false);
});

test('metric can be forced to commits', () => {
  const r = run([commit({ added: 900 }), commit({ added: 100, trailer: CLAUDE })], { metric: 'commits' });
  assert.equal(r.metric, 'commits');
  assert.equal(r.abv, 50);
  assert.equal(r.byLines.aiShare, 10);
});

test('bots are neither AI nor human', () => {
  const r = run([
    commit({ added: 50 }),
    commit({ added: 50, authorName: 'dependabot[bot]', authorEmail: '49699333+dependabot[bot]@users.noreply.github.com' }),
    commit({ added: 100, trailer: CLAUDE }),
  ]);
  assert.equal(r.byCommits.bot, 1);
  assert.equal(r.byLines.bot, 50);
  assert.equal(r.abv, 50);
  // The bot is not a person.
  assert.equal(r.people.total, 1);
});

test('a commit signed by two tools is split evenly between them', () => {
  const r = run([commit({ added: 100, trailer: `${CLAUDE}\n${CURSOR}` }), commit({ added: 100 })]);
  const byId = Object.fromEntries(r.tools.map((x) => [x.id, x]));
  assert.equal(byId.claude.lines, 50);
  assert.equal(byId.cursor.lines, 50);
  assert.equal(byId.claude.commits, 0.5);
  assert.equal(byId.claude.share, 25);
  assert.equal(r.byCommits.ai, 1);
  // Tool shares add up to the ABV.
  assert.equal(r.tools.reduce((n, x) => n + x.share, 0), r.abv);
});

test('tools are sorted by volume and carry first/last seen dates', () => {
  const r = run([
    commit({ added: 10, trailer: CURSOR, time: utc(2025, 3, 1) }),
    commit({ added: 500, trailer: CLAUDE, time: utc(2025, 9, 1) }),
    commit({ added: 20, trailer: CURSOR, time: utc(2026, 1, 15) }),
  ]);
  assert.deepEqual(r.tools.map((x) => x.id), ['claude', 'cursor']);
  assert.equal(r.tools[1].firstSeen, '2025-03-01');
  assert.equal(r.tools[1].lastSeen, '2026-01-15');
  assert.equal(r.tools[0].name, 'Claude');
});

test('authored and assisted commits are told apart', () => {
  const r = run([
    commit({ trailer: CLAUDE }),
    commit({ authorName: 'devin-ai-integration[bot]', authorEmail: '1+devin-ai-integration[bot]@users.noreply.github.com' }),
    commit(),
  ]);
  assert.deepEqual(r.modes, { authored: 1, assisted: 1 });
});

test('first pour is the earliest AI commit, not the first one seen', () => {
  const r = run([
    commit({ trailer: CLAUDE, time: utc(2026, 5, 1), subject: 'later', hash: 'b'.repeat(40) }),
    commit({ trailer: CURSOR, time: utc(2025, 2, 3), subject: 'earlier', hash: 'a'.repeat(40) }),
    commit({ time: utc(2024, 1, 1) }),
  ]);
  assert.deepEqual(r.firstAi, { date: '2025-02-03', hash: 'aaaaaaa', subject: 'earlier', tool: 'cursor', toolName: 'Cursor' });
});

test('a repo with no AI has no first pour and is alcohol-free', () => {
  const r = run([commit(), commit()]);
  assert.equal(r.firstAi, null);
  assert.equal(r.abv, 0);
  assert.equal(r.style, 'alcohol-free');
  assert.deepEqual(r.tools, []);
});

test('an empty history produces an empty but valid report', () => {
  const r = run([]);
  assert.equal(r.byCommits.total, 0);
  assert.equal(r.abv, 0);
  assert.equal(r.metric, 'commits');
  assert.deepEqual(r.timeline.points, []);
  assert.equal(r.range.firstCommit, null);
  assert.equal(r.recent, null);
});

test('timeline uses months for young repos and fills gaps', () => {
  const r = run([
    commit({ time: utc(2026, 1, 10), added: 100 }),
    commit({ time: utc(2026, 4, 2), added: 100, trailer: CLAUDE }),
    commit({ time: utc(2026, 4, 20), added: 300 }),
  ]);
  assert.equal(r.timeline.bucket, 'month');
  assert.deepEqual(r.timeline.points.map((p) => p.key), ['2026-01', '2026-02', '2026-03', '2026-04']);
  assert.deepEqual(r.timeline.points.map((p) => p.empty), [false, true, true, false]);
  assert.equal(r.timeline.points[3].aiShare, 25);
  assert.equal(r.timeline.points[0].aiShare, 0);
});

test('timeline switches to quarters, then years, as history grows', () => {
  const quarters = run([commit({ time: utc(2021, 2, 1) }), commit({ time: utc(2026, 9, 1), trailer: CLAUDE })]);
  assert.equal(quarters.timeline.bucket, 'quarter');
  assert.equal(quarters.timeline.points[0].key, '2021-Q1');
  assert.equal(quarters.timeline.points.at(-1).key, '2026-Q3');
  assert.ok(quarters.timeline.points.length <= 36);

  const years = run([commit({ time: utc(2008, 2, 1) }), commit({ time: utc(2026, 9, 1), trailer: CLAUDE })]);
  assert.equal(years.timeline.bucket, 'year');
  assert.equal(years.timeline.points[0].key, '2008');
  assert.equal(years.timeline.points.length, 19);
});

test('recent window compares the last 90 days with the whole history', () => {
  const r = run([
    commit({ time: utc(2024, 1, 1), added: 900 }),
    commit({ time: utc(2026, 5, 1), added: 50 }),
    commit({ time: utc(2026, 6, 1), added: 50, trailer: CLAUDE }),
  ]);
  assert.equal(r.abv, 5);
  assert.equal(r.recent.days, 90);
  assert.equal(r.recent.abv, 50);
  assert.equal(r.recent.byCommits.total, 2);
});

test('recent window is omitted when the whole history fits inside it', () => {
  const r = run([commit({ time: utc(2026, 5, 1) }), commit({ time: utc(2026, 6, 1), trailer: CLAUDE })]);
  assert.equal(r.recent, null);
});

test('people: pourers are ranked by AI volume, sober authors by commits', () => {
  const omar = { authorName: 'Omar', authorEmail: 'omar@example.com' };
  const li = { authorName: '林', authorEmail: 'lin@example.com' };
  const r = run([
    commit({ added: 100, trailer: CLAUDE }),
    commit({ added: 100 }),
    commit({ ...omar, added: 900, trailer: CLAUDE }),
    commit({ ...li, added: 5 }),
    commit({ ...li, added: 5 }),
  ]);
  assert.equal(r.people.total, 3);
  assert.equal(r.people.withAi, 2);
  assert.deepEqual(r.people.pourers.map((a) => a.name), ['Omar', 'Jane Doe']);
  assert.equal(r.people.pourers[1].aiShare, 50);
  assert.deepEqual(r.people.sober.map((a) => [a.name, a.commits]), [['林', 2]]);
});

test('people are keyed by email, case-insensitively', () => {
  const r = run([
    commit({ authorName: 'Jane Doe', authorEmail: 'Jane@Example.com' }),
    commit({ authorName: 'jane', authorEmail: 'jane@example.com' }),
  ]);
  assert.equal(r.people.total, 1);
  assert.equal(r.people.sober[0].commits, 2);
});

test('agent-authored commits credit the human co-author', () => {
  const r = run([
    commit({
      authorName: 'copilot-swe-agent[bot]',
      authorEmail: '198982749+Copilot@users.noreply.github.com',
      trailer: 'Co-authored-by: Omar <omar@example.com>',
      added: 40,
    }),
  ]);
  assert.equal(r.people.total, 1);
  assert.deepEqual(r.people.pourers[0], { name: 'Omar', commits: 1, aiCommits: 1, lines: 40, aiLines: 40, aiShare: 100 });
});

test('commits with broken clocks still count, but stay off the timeline', () => {
  const r = run([
    commit({ time: 0, trailer: CLAUDE, added: 10 }),
    commit({ time: NOW + 400 * DAY, added: 10 }),
    commit({ time: utc(2026, 3, 1), added: 20 }),
  ]);
  assert.equal(r.byCommits.total, 3);
  assert.equal(r.undatedCommits, 2);
  assert.equal(r.range.firstCommit, '2026-03-01');
  assert.equal(r.range.lastCommit, '2026-03-01');
  assert.equal(r.abv, 25);
  assert.equal(r.firstAi, null);
});

test('samples are kept only when asked for, and are capped', () => {
  const none = run([commit({ trailer: CLAUDE })]);
  assert.equal(none.samples, undefined);
  const some = run([commit({ trailer: CLAUDE }), commit({ trailer: CURSOR }), commit({ trailer: CLAUDE })], { samples: 2 });
  assert.equal(some.samples.length, 2);
  assert.equal(some.samples[0].evidence[0].via, 'co-author');
  assert.equal(some.samples[0].hash.length, 7);
});

test('suspects lists bot-looking identities the database does not know', () => {
  const r = run(
    [
      commit({ authorName: 'acme-agent[bot]', authorEmail: '9+acme-agent[bot]@users.noreply.github.com' }),
      commit({ authorName: 'acme-agent[bot]', authorEmail: '9+acme-agent[bot]@users.noreply.github.com' }),
      commit({ trailer: 'Co-authored-by: Helper AI <helper@example.com>' }),
      commit({ trailer: CLAUDE }),
      commit(),
    ],
    { suspects: true },
  );
  assert.deepEqual(
    r.suspects.map((s) => [s.identity, s.count, s.as]),
    [
      ['acme-agent[bot] <9+acme-agent[bot]@users.noreply.github.com>', 2, 'bot'],
      ['Helper AI <helper@example.com>', 1, 'human'],
    ],
  );
});

test('custom AI identities flow through the aggregator', () => {
  const r = run([commit({ authorName: 'robobun', authorEmail: 'robobun@example.com', added: 30 }), commit({ added: 10 })], {
    customAi: [/^robobun\b/],
  });
  assert.equal(r.abv, 75);
  assert.equal(r.tools[0].id, 'custom');
});

test('nonsense line counts are ignored rather than trusted', () => {
  const r = run([commit({ added: NaN, deleted: -5 }), commit({ added: undefined }), commit({ added: 10, trailer: CLAUDE })]);
  assert.equal(r.byLines.total, 10);
  assert.equal(r.abv, 100);
});
