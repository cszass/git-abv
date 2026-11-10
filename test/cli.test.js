import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { detectLang, main, parseArgs } from '../src/cli.js';
import { CLAUDE, CURSOR, DAY, T0, assertWellFormedXml, cleanup, commit, fakeIo, omar, tempDir, tempRepo } from '../scripts/lib/testing.mjs';

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'git-abv.js');

let repo;
before(() => {
  repo = tempRepo(
    [
      commit({ lines: 100, time: T0 }),
      commit({ lines: 100, time: T0 + 40 * DAY, ...omar }),
      commit({ lines: 150, time: T0 + 80 * DAY, trailer: CLAUDE }),
      commit({ lines: 50, time: T0 + 120 * DAY, trailer: CURSOR, subject: 'Tom & Jerry <script>alert(1)</script>' }),
    ],
    { remote: 'https://github.com/acme/rocket.git' },
  );
});
after(cleanup);

async function run(args, env) {
  const io = fakeIo(repo, env);
  const code = await main(args, io);
  return { code, out: io.stdout.text(), err: io.stderr.text(), io };
}

// ── argument parsing ──────────────────────────────────────────────────────────

test('parseArgs: booleans, values, repeats and positionals', () => {
  const { flags, positionals } = parseArgs(['some/dir', '--json', '--since', '2026-01-01', '--exclude=*.svg', '--exclude', 'data/', '--top=3', '-q']);
  assert.deepEqual(positionals, ['some/dir']);
  assert.equal(flags.json, true);
  assert.equal(flags.quiet, true);
  assert.equal(flags.since, '2026-01-01');
  assert.deepEqual(flags.exclude, ['*.svg', 'data/']);
  assert.equal(flags.top, '3');
});

test('parseArgs: optional values only swallow what looks like theirs', () => {
  assert.deepEqual(parseArgs(['--card', 'repo-dir']).positionals, ['repo-dir']);
  assert.equal(parseArgs(['--card', 'repo-dir']).flags.card, true);
  assert.equal(parseArgs(['--card', 'out/label.svg']).flags.card, 'out/label.svg');
  assert.equal(parseArgs(['--card=label.svg']).flags.card, 'label.svg');
  assert.equal(parseArgs(['--badge']).flags.badge, true);
  assert.equal(parseArgs(['--explain', '25']).flags.explain, '25');
  assert.deepEqual(parseArgs(['--explain', 'dir']).positionals, ['dir']);
});

test('parseArgs: everything after -- is positional', () => {
  assert.deepEqual(parseArgs(['--', '--json']).positionals, ['--json']);
});

test('parseArgs: rejects unknown flags and missing values', () => {
  assert.throws(() => parseArgs(['--nope']), /Unknown option: --nope/);
  assert.throws(() => parseArgs(['-x']), /Unknown option: -x/);
  assert.throws(() => parseArgs(['--since']), /--since needs a value/);
  assert.throws(() => parseArgs(['--json=yes']), /does not take a value/);
});

test('detectLang: flag beats environment, C locale is ignored', () => {
  assert.equal(detectLang({ lang: 'zh' }, { LANG: 'en_US.UTF-8' }), 'zh');
  assert.equal(detectLang({}, { LANG: 'zh_CN.UTF-8' }), 'zh');
  assert.equal(detectLang({}, { LC_ALL: 'en_GB.UTF-8', LANG: 'zh_CN.UTF-8' }), 'en');
  assert.equal(detectLang({}, { GIT_ABV_LANG: 'zh', LANG: 'en_US.UTF-8' }), 'zh');
  assert.ok(['en', 'zh'].includes(detectLang({}, { LANG: 'C.UTF-8' })));
});

// ── running ───────────────────────────────────────────────────────────────────

test('prints a report for the current directory by default', async () => {
  const { code, out, err } = await run([]);
  assert.equal(code, 0);
  assert.equal(err, '');
  assert.match(out, /git-abv · AI BY VOLUME/);
  assert.match(out, /acme\/rocket@main/);
  assert.match(out, /By volume\s+50\.0%\s+200 of 400 lines added/);
  assert.match(out, /By commits\s+50\.0%\s+2 of 4 commits/);
  assert.match(out, /CASK STRENGTH/);
  assert.match(out, /Claude\s/);
  assert.match(out, /Cursor\s/);
  assert.match(out, /FIRST POUR\s+2025-09-03/);
  assert.match(out, /a floor, not a verdict/);
  // No ANSI escapes when stdout is not a terminal.
  assert.ok(!out.includes('\x1b['));
});

test('every line of the report fits in 80 columns', async () => {
  for (const lang of ['en', 'zh']) {
    const { out } = await run(['--lang', lang]);
    for (const line of out.split('\n')) {
      // CJK characters are two cells wide.
      const width = [...line].reduce((w, ch) => w + (/[⺀-鿿＀-￯]/.test(ch) ? 2 : 1), 0);
      assert.ok(width <= 80, `${lang}: ${width} columns: ${line}`);
    }
  }
});

test('--lang zh switches every label', async () => {
  const { out } = await run(['--lang', 'zh']);
  assert.match(out, /含 AI 量/);
  assert.match(out, /配料表/);
  assert.match(out, /高度白酒/);
  assert.match(out, /人类/);
  assert.ok(!/INGREDIENTS|By volume/.test(out));
});

test('the locale picks the language when no flag is given', async () => {
  const { out } = await run([], { LANG: 'zh_CN.UTF-8' });
  assert.match(out, /含 AI 量/);
});

test('--color forces ANSI output and --ascii avoids fancy characters', async () => {
  const colored = await run(['--color']);
  assert.ok(colored.out.includes('\x1b['));
  const ascii = await run(['--ascii', '--no-authors']);
  // eslint-disable-next-line no-control-regex
  assert.ok(/^[\x00-\x7f]*$/.test(ascii.out), 'non-ASCII output in --ascii mode');
  assert.match(ascii.out, /####/);
});

test('--json prints a parseable report and nothing else', async () => {
  const { code, out, err } = await run(['--json']);
  assert.equal(code, 0);
  assert.equal(err, '');
  const r = JSON.parse(out);
  assert.equal(r.schema, 1);
  assert.equal(r.abv, 50);
  assert.equal(r.metric, 'lines');
  assert.equal(r.style, 'cask');
  assert.equal(r.styleName, 'Cask Strength');
  assert.ok(r.tagline.length > 0);
  assert.ok(r.tastingNotes.length > 0);
  assert.equal(r.repo.name, 'acme/rocket');
  assert.deepEqual(r.tools.map((x) => x.id), ['claude', 'cursor']);
  assert.equal(r.people.total, 2);
  assert.match(r.tool.version, /^\d+\.\d+\.\d+/);
});

test('--json --no-authors leaves people out', async () => {
  const { out } = await run(['--json', '--no-authors']);
  assert.equal(JSON.parse(out).people, undefined);
});

test('--no-authors hides the per-author sections', async () => {
  assert.match((await run([])).out, /HEAVIEST POURERS/);
  assert.ok(!/HEAVIEST POURERS|DESIGNATED DRIVERS/.test((await run(['--no-authors'])).out));
});

test('--card and --badge write well-formed SVG files', async () => {
  const outDir = tempDir();
  const card = path.join(outDir, 'nested', 'label.svg');
  const badge = path.join(outDir, 'badge.svg');
  const { code, out } = await run([`--card=${card}`, `--badge=${badge}`]);
  assert.equal(code, 0);
  assert.match(out, /Label written to/);
  assert.match(out, /Badge written to/);
  const cardSvg = fs.readFileSync(card, 'utf8');
  const badgeSvg = fs.readFileSync(badge, 'utf8');
  assertWellFormedXml(cardSvg);
  assertWellFormedXml(badgeSvg);
  assert.match(cardSvg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1200" height="630"/);
  assert.match(cardSvg, /acme\/rocket/);
  assert.match(cardSvg, />50\.0</);
  assert.match(badgeSvg, /AI by volume: 50\.0%/);
  // Nothing in a generated SVG may execute or phone home.
  for (const svg of [cardSvg, badgeSvg]) {
    assert.ok(!/<script|<foreignObject|<image|href=|url\(http/i.test(svg));
  }
});

test('default output file names land in the working directory', async () => {
  const cwd = tempDir();
  const io = fakeIo(cwd);
  const code = await main([repo, '--card', '--badge', '-q'], io);
  assert.equal(code, 0);
  assert.equal(io.stdout.text(), '');
  assert.ok(fs.existsSync(path.join(cwd, 'abv-label.svg')));
  assert.ok(fs.existsSync(path.join(cwd, 'abv-badge.svg')));
});

test('--theme night and --lang zh change the label', async () => {
  const outDir = tempDir();
  const file = path.join(outDir, 'night.svg');
  await run([`--card=${file}`, '--theme', 'night', '--lang', 'zh', '--name', '火箭 & 月亮', '-q']);
  const svg = fs.readFileSync(file, 'utf8');
  assertWellFormedXml(svg);
  assert.match(svg, /#0F1217/);
  assert.match(svg, /含 AI 量/);
  assert.match(svg, /火箭 &amp; 月亮/);
});

test('--year selects a single vintage', async () => {
  const { out } = await run(['--json', '--year', '2025']);
  const r = JSON.parse(out);
  assert.equal(r.byCommits.total, 4);
  const none = JSON.parse((await run(['--json', '--year', '2019'])).out);
  assert.equal(none.byCommits.total, 0);
});

test('an empty range says so politely', async () => {
  const { code, out } = await run(['--year', '2019']);
  assert.equal(code, 0);
  assert.match(out, /No commits found in this range/);
});

test('--max and --min gate the exit code', async () => {
  assert.equal((await run(['-q', '--max', '60'])).code, 0);
  const tooStrong = await run(['-q', '--max', '20']);
  assert.equal(tooStrong.code, 1);
  assert.match(tooStrong.err, /ABV 50\.0% is above the allowed maximum of 20%/);
  const tooWeak = await run(['-q', '--min', '80']);
  assert.equal(tooWeak.code, 1);
  assert.match(tooWeak.err, /below the required minimum of 80%/);
  assert.equal((await run(['-q', '--min', '50', '--max', '50'])).code, 0);
});

test('--explain shows the evidence, escaped subject and all', async () => {
  const { out } = await run(['--explain']);
  assert.match(out, /WHY THESE COMMITS COUNT/);
  assert.match(out, /co-author\s+Co-Authored-By: Claude <noreply@anthropic\.com>/);
  assert.match(out, /Cursor \(assisted\)/);
});

test('--suspects reports a clean bar when nothing looks off', async () => {
  const { out } = await run(['--suspects']);
  assert.match(out, /SUSPECTS/);
  assert.match(out, /Clean bar/);
});

test('--ai-identity counts a custom agent', async () => {
  const r = JSON.parse((await run(['--json', '--ai-identity', '^Omar Haddad'])).out);
  assert.equal(r.byCommits.ai, 3);
  assert.ok(r.tools.some((x) => x.id === 'custom'));
});

test('--fast measures by commits', async () => {
  const r = JSON.parse((await run(['--json', '--fast'])).out);
  assert.equal(r.metric, 'commits');
  assert.equal(r.abv, 50);
});

test('--signatures lists the database without touching git', async () => {
  const io = fakeIo(tempDir());
  const code = await main(['--signatures'], io);
  assert.equal(code, 0);
  assert.match(io.stdout.text(), /Claude\s+Co-Authored-By: Claude <noreply@anthropic\.com>/);
  assert.match(io.stdout.text(), /Assisted-by: AGENT:MODEL/);
});

test('--help and --version', async () => {
  const help = await run(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.out, /Usage/);
  assert.match(help.out, /--card/);
  const version = await run(['-v']);
  assert.match(version.out, /^git-abv \d+\.\d+\.\d+\n$/);
});

test('usage errors exit 2 with a hint', async () => {
  for (const args of [['--nope'], ['--lang', 'fr'], ['--theme', 'neon'], ['--year', '26'], ['--max', 'lots'], ['--top', '-1'], ['a', 'b'], ['--ai-identity', '(']]) {
    const { code, err, out } = await run(args);
    assert.equal(code, 2, args.join(' '));
    assert.equal(out, '');
    assert.match(err, /^git-abv: /);
    assert.match(err, /--help/);
  }
});

test('pointing at a non-repository exits 2 with a clear message', async () => {
  const io = fakeIo(tempDir());
  const code = await main([], io);
  assert.equal(code, 2);
  assert.match(io.stderr.text(), /Not a git repository/);
  assert.equal(io.stdout.text(), '');
});

test('the real binary runs as a child process', () => {
  const res = spawnSync(process.execPath, [BIN, repo, '--json'], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(JSON.parse(res.stdout).abv, 50);

  const gate = spawnSync(process.execPath, [BIN, repo, '-q', '--max', '10'], { encoding: 'utf8' });
  assert.equal(gate.status, 1);
});
