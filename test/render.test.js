import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAggregator } from '../src/core/aggregate.js';
import { renderBadge } from '../src/core/badge.js';
import { estimateWidth, renderCard } from '../src/core/card.js';
import { STYLES } from '../src/core/styles.js';
import { bigText, renderReport, wrap } from '../src/render-terminal.js';
import { assertWellFormedXml } from '../scripts/lib/testing.mjs';

const utc = (y, m, d = 1) => Date.UTC(y, m - 1, d) / 1000;
const NOW = utc(2026, 11, 10);

/** Build a report with a chosen AI share (by lines), spread over a few years and tools. */
function reportWith(aiPercent, { name = 'acme/rocket', tools = ['Claude <noreply@anthropic.com>'], months = 30 } = {}) {
  const agg = createAggregator({ now: NOW });
  let n = 0;
  for (let i = 0; i < months; i++) {
    const time = utc(2024, 5, 3) + i * 30.4 * 86400;
    n += 1;
    agg.add({ hash: String(n).padStart(40, '0'), authorName: 'Jane Doe', authorEmail: 'jane@example.com', time, subject: 'Human work', message: 'Human work\n', added: 100 - aiPercent, deleted: 0 });
    if (aiPercent > 0) {
      n += 1;
      const who = tools[i % tools.length];
      agg.add({ hash: String(n).padStart(40, '0'), authorName: 'Omar Haddad', authorEmail: 'omar@example.com', time: time + 3600, subject: 'AI work', message: `AI work\n\nCo-authored-by: ${who}\n`, added: aiPercent, deleted: 0 });
    }
  }
  return agg.finish({ version: '0.0.0', repo: { name, branch: 'main', head: 'abc1234' } });
}

const MANY_TOOLS = [
  'Claude <noreply@anthropic.com>',
  'Cursor <cursoragent@cursor.com>',
  'Codex <noreply@openai.com>',
  'Copilot <175728472+Copilot@users.noreply.github.com>',
  'Amp <amp@ampcode.com>',
  'Warp <agent@warp.dev>',
  'Qwen-Coder <qwen-coder@alibabacloud.com>',
  'aider (o3) <aider@aider.chat>',
];

test('bigText renders five equally wide rows', () => {
  for (const text of ['0%', '37.5%', '100%', '<0.1%']) {
    const rows = bigText(text);
    assert.equal(rows.length, 5);
    assert.equal(new Set(rows.map((r) => r.length)).size, 1, text);
    assert.ok(rows[0].length <= 38, `${text} is ${rows[0].length} wide`);
  }
});

test('wrap breaks at spaces and between CJK characters', () => {
  assert.deepEqual(wrap('one two three four', 9), ['one two', 'three', 'four']);
  const zh = wrap('这是一个很长的中文句子需要换行', 10);
  assert.ok(zh.length >= 3);
  assert.equal(zh.join(''), '这是一个很长的中文句子需要换行');
  assert.deepEqual(wrap('', 10), []);
});

test('the label is well-formed for every style, theme and language', () => {
  const shares = [0, 0.3, 2, 5, 12, 20, 37.5, 53, 70, 90, 100];
  const seen = new Set();
  for (const share of shares) {
    const report = reportWith(share, { tools: MANY_TOOLS });
    seen.add(report.style);
    for (const theme of ['paper', 'night']) {
      for (const lang of ['en', 'zh']) {
        const svg = renderCard(report, { theme, lang });
        assertWellFormedXml(svg);
        assert.match(svg, /viewBox="0 0 1200 630"/);
      }
    }
  }
  assert.equal(seen.size, STYLES.length, `styles covered: ${[...seen].join(', ')}`);
});

test('the label escapes hostile repository names', () => {
  const report = reportWith(40, { name: '<script>alert("x")</script> & co' });
  const svg = renderCard(report);
  assertWellFormedXml(svg);
  assert.ok(!svg.includes('<script>'));
  assert.match(svg, /&lt;script&gt;/);
});

test('long repository names are shrunk or truncated to fit the left column', () => {
  const longName = 'an-organisation-with-a-long-name/and-a-repository-with-an-even-longer-name-than-that';
  const svg = renderCard(reportWith(40, { name: longName }));
  const m = /font-size="(\d+)" font-weight="700" fill="#2B2119">([^<]+)<\/text>/.exec(svg);
  assert.ok(m, 'repository name not found in label');
  const size = Number(m[1]);
  assert.ok(size >= 26 && size < 50);
  assert.ok(estimateWidth(m[2], size) * 1.12 <= 571);
});

test('the label groups extra tools under "Other AI"', () => {
  const svg = renderCard(reportWith(60, { tools: MANY_TOOLS }));
  assert.match(svg, />Other AI</);
  const rows = svg.match(/font-size="18" font-weight="700" text-anchor="end"/g) || [];
  assert.ok(rows.length <= 6, `${rows.length} ingredient rows`);
});

test('the label is deterministic', () => {
  const report = reportWith(37.5);
  assert.equal(renderCard(report), renderCard(report));
});

test('a young repository gets the commit split instead of a chart', () => {
  const svg = renderCard(reportWith(40, { months: 1 }));
  assertWellFormedXml(svg);
  assert.match(svg, /BY COMMITS/);
  assert.ok(!/VINTAGE/.test(svg));
});

test('the badge shows the number, in the colour of its style', () => {
  for (const share of [0, 5, 53, 100]) {
    const report = reportWith(share);
    const svg = renderBadge(report);
    assertWellFormedXml(svg);
    const style = STYLES.find((s) => s.id === report.style);
    assert.ok(svg.includes(style.ink), `badge for ${share}% should use ${style.ink}`);
    assert.match(svg, /height="20"/);
  }
  assert.match(renderBadge(reportWith(53)), /AI by volume: 53\.0%/);
  assert.match(renderBadge(reportWith(53), { lang: 'zh' }), /含 AI 量: 53\.0%/);
  assert.match(renderBadge(reportWith(53), { label: 'vibes' }), /vibes: 53\.0%/);
});

test('the terminal report lists at most six tools, then "Other AI"', () => {
  const out = renderReport(reportWith(80, { tools: MANY_TOOLS }), { lang: 'en' });
  assert.match(out, /Other AI/);
  assert.match(out, /ROCKET FUEL|RECTIFIED SPIRIT|ABSINTHE/);
});

test('an AI-free report skips the vintage chart and the trend line', () => {
  const out = renderReport(reportWith(0), { lang: 'en' });
  assert.match(out, /ALCOHOL-FREE/);
  assert.ok(!/VINTAGE|Lately|FIRST POUR|HEAVIEST POURERS/.test(out));
  assert.match(out, /Clean and dry/);
});

test('hints can be switched off', () => {
  const report = reportWith(40);
  assert.match(renderReport(report), /git abv --card/);
  assert.ok(!/git abv --card/.test(renderReport(report, { hints: false })));
});
