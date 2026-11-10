import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyCommit, parseIdentity, parseTrailers } from '../src/core/classify.js';

const jane = { authorName: 'Jane Doe', authorEmail: 'jane@example.com' };
const withTrailer = (trailer, subject = 'Fix the thing') => ({ ...jane, message: `${subject}\n\n${trailer}\n` });

// ── What must count ───────────────────────────────────────────────────────────

/** [description, commit, expected tools, expected mode] */
const POSITIVE = [
  ['Claude Code default trailer', withTrailer('Co-Authored-By: Claude <noreply@anthropic.com>'), ['claude'], 'assisted'],
  ['Claude trailer with a model name', withTrailer('Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>'), ['claude'], 'assisted'],
  ['Claude trailer, shouting', withTrailer('CO-AUTHORED-BY: CLAUDE <NOREPLY@ANTHROPIC.COM>'), ['claude'], 'assisted'],
  ['Claude Code marker, new URL', withTrailer('🤖 Generated with [Claude Code](https://claude.com/claude-code)'), ['claude'], 'assisted'],
  ['Claude Code marker, old URL', withTrailer('🤖 Generated with [Claude Code](https://claude.ai/code)'), ['claude'], 'assisted'],
  [
    'Claude marker and trailer together count once',
    withTrailer('🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nCo-Authored-By: Claude <noreply@anthropic.com>'),
    ['claude'],
    'assisted',
  ],
  [
    'Claude GitHub app as author',
    { authorName: 'claude[bot]', authorEmail: '209825114+claude[bot]@users.noreply.github.com', message: 'Fix lint\n' },
    ['claude'],
    'authored',
  ],
  ['Copilot co-author', withTrailer('Co-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>'), ['copilot'], 'assisted'],
  [
    'Copilot coding agent as author',
    {
      authorName: 'copilot-swe-agent[bot]',
      authorEmail: '198982749+Copilot@users.noreply.github.com',
      message: 'Initial plan\n\nCo-authored-by: Jane Doe <jane@example.com>\n',
    },
    ['copilot'],
    'authored',
  ],
  ['Copilot Autofix co-author', withTrailer('Co-authored-by: Copilot Autofix powered by AI <62310815+github-advanced-security[bot]@users.noreply.github.com>'), ['copilot'], 'assisted'],
  ['Cursor co-author', withTrailer('Co-authored-by: Cursor <cursoragent@cursor.com>'), ['cursor'], 'assisted'],
  [
    'Cursor agent as author',
    { authorName: 'Cursor Agent', authorEmail: 'cursoragent@cursor.com', message: 'Refactor\n' },
    ['cursor'],
    'authored',
  ],
  ['Codex co-author', withTrailer('Co-authored-by: Codex <noreply@openai.com>'), ['codex'], 'assisted'],
  ['ChatGPT co-author added by hand', withTrailer('Co-authored-by: ChatGPT <noreply@openai.com>'), ['chatgpt'], 'assisted'],
  ['Aider author suffix', { authorName: 'Jane Doe (aider)', authorEmail: 'jane@example.com', message: 'Add tests\n' }, ['aider'], 'assisted'],
  ['Aider co-author', withTrailer('Co-authored-by: aider (gpt-4o) <aider@aider.chat>'), ['aider'], 'assisted'],
  ['Aider subject prefix', { ...jane, message: 'aider: Fix the off-by-one\n' }, ['aider'], 'assisted'],
  [
    'Devin as author',
    { authorName: 'devin-ai-integration[bot]', authorEmail: '158243242+devin-ai-integration[bot]@users.noreply.github.com', message: 'Fix\n' },
    ['devin'],
    'authored',
  ],
  [
    'Jules as author',
    { authorName: 'google-labs-jules[bot]', authorEmail: '161369871+google-labs-jules[bot]@users.noreply.github.com', message: 'Fix\n' },
    ['jules'],
    'authored',
  ],
  ['Amp co-author', withTrailer('Co-authored-by: Amp <amp@ampcode.com>'), ['amp'], 'assisted'],
  ['Amp thread trailer', withTrailer('Amp-Thread-ID: https://ampcode.com/threads/T-1234'), ['amp'], 'assisted'],
  ['OpenHands as author', { authorName: 'openhands', authorEmail: 'openhands@all-hands.dev', message: 'Fix\n' }, ['openhands'], 'authored'],
  ['Warp co-author', withTrailer('Co-Authored-By: Warp <agent@warp.dev>'), ['warp'], 'assisted'],
  ['Qwen Code co-author', withTrailer('Co-authored-by: Qwen-Coder <qwen-coder@alibabacloud.com>'), ['qwen'], 'assisted'],
  ['Replit agent trailer', withTrailer('Replit-Commit-Author: Agent\nReplit-Commit-Session-Id: abc'), ['replit'], 'assisted'],
  ['Kernel-style Assisted-by', withTrailer('Assisted-by: Claude:claude-sonnet-4-6'), ['claude'], 'assisted'],
  ['Kernel-style Assisted-by with extra tools', withTrailer('Assisted-by: Copilot:gpt-5 coccinelle sparse'), ['copilot'], 'assisted'],
  ['Assisted-by an unknown agent:model pair', withTrailer('Assisted-by: Sidekick:v2-large'), ['other'], 'assisted'],
  ['Assisted-by credits the agent, not the model it runs', withTrailer('Assisted-by: Cursor:claude-opus-5'), ['cursor'], 'assisted'],
  ['Assisted-by Copilot running a Claude model', withTrailer('Assisted-by: Copilot:Claude-Opus-4.8'), ['copilot'], 'assisted'],
  ['Assisted-by with a slash separator', withTrailer('Assisted-by: Opencode/Opus 4.6'), ['opencode'], 'assisted'],
  ['Assisted-by a vendor:model pair', withTrailer('Assisted-by: openai:gpt-5.5'), ['chatgpt'], 'assisted'],
  ['Assisted-by an agent we only know by its model', withTrailer('Assisted-by: Antigravity:gemini-3.1-pro'), ['antigravity'], 'assisted'],
  ['Assisted-by two tools', withTrailer('Assisted-by: Claude, Codex'), ['claude', 'codex'], 'assisted'],
  ['Assisted-by a bare product name', withTrailer('Assisted-by: Claude Code'), ['claude'], 'assisted'],
  ['Assisted-by "LLM"', withTrailer('Assisted-by: LLM'), ['other'], 'assisted'],
  ['Assisted-by an LLM plus static analysers', withTrailer('Assisted-by: LLM sparse kasan'), ['other'], 'assisted'],
  ['Assisted-by several agent:model pairs', withTrailer('Assisted-by: Deepseek:v4-pro Kimi:K2.6 ChatGPT:GPT-5.5 Claude:Sonnet-4.6'), ['deepseek', 'kimi', 'chatgpt', 'claude'], 'assisted'],
  ['Assisted-by Qoder running Qwen', withTrailer('Assisted-by: Qoder:Qwen3.8-Max'), ['qoder'], 'assisted'],
  ['Assisted-by CodeBuddy running Kimi', withTrailer('Assisted-by: CodeBuddy:Kimi-K3'), ['codebuddy'], 'assisted'],
  ['Assisted-by an unnamed agent with a known model', withTrailer('Assisted-by: unnamed:deepseek-v3.2 coccinelle'), ['deepseek'], 'assisted'],
  ['Assisted-by a model with a space after the colon', withTrailer('Assisted-by: YuanSheng: deepseek-v4-pro'), ['deepseek'], 'assisted'],
  ['Assisted-by GLM', withTrailer('Assisted-by: GLM:GLM-5.1'), ['glm'], 'assisted'],
  ['Assisted-by Grok with its vendor in brackets', withTrailer('Assisted-by: Grok(xAI):4.6'), ['grok'], 'assisted'],
  ['Open SWE as author', { authorName: 'open-swe[bot]', authorEmail: 'open-swe@users.noreply.github.com', message: 'Fix\n' }, ['openswe'], 'authored'],
  ['Cline agent as author', { authorName: 'Cline Agent', authorEmail: 'cline-agent@users.noreply.github.com', message: 'Fix\n' }, ['cline'], 'authored'],
  ['Real-world Claude co-author with a context note', withTrailer('Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>'), ['claude'], 'assisted'],
  ['A project-specific Claude bot mailbox', withTrailer('Co-authored-by: Claude <claude-bot@bun.sh>'), ['claude'], 'assisted'],
  ['Copilot app co-author', withTrailer('Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>'), ['copilot'], 'assisted'],
  ['An author called "Anthropic" on the noreply address', { authorName: 'Anthropic', authorEmail: 'noreply@anthropic.com', message: 'Fix\n' }, ['claude'], 'authored'],
  ['Generated-by with a product name', withTrailer('Generated-by: GitHub Copilot'), ['copilot'], 'assisted'],
  ['Generic AI-assisted flag', withTrailer('AI-assisted: yes'), ['other'], 'assisted'],
  [
    'Two tools on one commit',
    withTrailer('Co-Authored-By: Claude <noreply@anthropic.com>\nCo-authored-by: Cursor <cursoragent@cursor.com>'),
    ['claude', 'cursor'],
    'assisted',
  ],
  ['CRLF line endings', { ...jane, message: 'Fix\r\n\r\nCo-Authored-By: Claude <noreply@anthropic.com>\r\n' }, ['claude'], 'assisted'],
  ['Trailer in the middle of a squash message', { ...jane, message: 'Feature (#12)\n\n* part one\n\nCo-authored-by: Cursor <cursoragent@cursor.com>\n\n* part two\n' }, ['cursor'], 'assisted'],
  [
    'Lovable app as author',
    { authorName: 'lovable-dev[bot]', authorEmail: '159125892+lovable-dev[bot]@users.noreply.github.com', message: 'Add page\n' },
    ['lovable'],
    'authored',
  ],
];

for (const [name, commit, tools, mode] of POSITIVE) {
  test(`counts: ${name}`, () => {
    const c = classifyCommit(commit);
    assert.equal(c.kind, 'ai');
    assert.deepEqual(c.tools, tools);
    assert.equal(c.mode, mode);
    assert.ok(c.evidence.length > 0);
  });
}

// ── What must NOT count ───────────────────────────────────────────────────────

/** [description, commit, expected kind] */
const NEGATIVE = [
  ['a plain human commit', { ...jane, message: 'Fix the thing\n' }, 'human'],
  ['a human called Claude as co-author', withTrailer('Co-authored-by: Claude Dupont <claude.dupont@example.com>'), 'human'],
  ['a human called Claude as author', { authorName: 'Claude Monet', authorEmail: 'claude@example.com', message: 'Paint\n' }, 'human'],
  ['a human called just "Claude" with a personal email', withTrailer('Co-authored-by: Claude <claude@gmail.com>'), 'human'],
  ['a human with the surname Cline', { authorName: 'Patsy Cline', authorEmail: 'patsy@example.com', message: 'Sing\n' }, 'human'],
  ['a human called Devin', withTrailer('Co-authored-by: Devin Townsend <devin@example.com>'), 'human'],
  ['a human called Amp-something', withTrailer('Co-authored-by: Amp Fiddler <amp@example.com>'), 'human'],
  ['a Cursor employee co-author', withTrailer('Co-authored-by: Sam Smith <sam@cursor.com>'), 'human'],
  ['an Anthropic employee author', { authorName: 'Jane Doe', authorEmail: 'jane@anthropic.com', message: 'Fix\n' }, 'human'],
  ['Assisted-by a person', withTrailer('Assisted-by: Jane Roe <jane.roe@example.com>'), 'human'],
  ['Assisted-by a person called Claude', withTrailer('Assisted-by: Claude Dupont <claude.dupont@example.com>'), 'human'],
  ['Assisted-by a person called Claude, no email', withTrailer('Assisted-by: Claude Dupont'), 'human'],
  ['Assisted-by a person called Devin, no email', withTrailer('Assisted-by: Devin Townsend'), 'human'],
  ['Assisted-by two people', withTrailer('Assisted-by: Jules Verne and Amp Fiddler'), 'human'],
  ['Generated-by a script', withTrailer('Generated-by: scripts/update-deps.sh'), 'human'],
  ['Generated-by a URL', withTrailer('Generated-by: https://example.com/codemod'), 'human'],
  ['Generated-by a URL on an .ai domain', withTrailer('Generated-by: https://codemods.ai/run/42'), 'human'],
  ['Assisted-by a static analyser written as agent:version', withTrailer('Assisted-by: smatch:2.0 [static analysis]'), 'human'],
  ['Assisted-by coccinelle alone', withTrailer('Assisted-by: coccinelle'), 'human'],
  ['the kernel docs quoting the trailer format', withTrailer('Assisted-by: AGENT_NAME:MODEL_VERSION [TOOL1] [TOOL2]'), 'human'],
  ['a surname ending in "bot" is still a person', { authorName: 'Alexandre Courbot', authorEmail: 'acourbot@example.com', message: 'Fix\n' }, 'human'],
  ['a camel-case merge bot', { authorName: 'PyTorch MergeBot', authorEmail: 'pytorchmergebot@users.noreply.github.com', message: 'Merge\n' }, 'bot'],
  ['merely mentioning tools in prose', { ...jane, message: 'Fix cursor position bug\n\nCopilot suggested this but Claude disagreed. ChatGPT was no help.\n' }, 'human'],
  ['a "(aider)" suffix on a co-author is not the author rule', withTrailer('Co-authored-by: Jane Doe (aider fan) <jane@example.com>'), 'human'],
  ['Reviewed-by an AI is not authorship', withTrailer('Reviewed-by: Claude <noreply@anthropic.com>'), 'human'],
  ['the word "aider" later in the subject', { ...jane, message: 'docs: mention aider: the tool\n' }, 'human'],
  ['Dependabot', { authorName: 'dependabot[bot]', authorEmail: '49699333+dependabot[bot]@users.noreply.github.com', message: 'Bump x from 1 to 2\n' }, 'bot'],
  ['Renovate', { authorName: 'renovate[bot]', authorEmail: '29139614+renovate[bot]@users.noreply.github.com', message: 'Update deps\n' }, 'bot'],
  ['GitHub Actions', { authorName: 'github-actions[bot]', authorEmail: '41898282+github-actions[bot]@users.noreply.github.com', message: 'Release\n' }, 'bot'],
  ['an unknown GitHub App', { authorName: 'some-new-thing[bot]', authorEmail: '1+some-new-thing[bot]@users.noreply.github.com', message: 'Sync\n' }, 'bot'],
  ['a release robot', { authorName: 'semantic-release-bot', authorEmail: 'semantic-release-bot@martynus.net', message: 'chore(release): 1.2.3\n' }, 'bot'],
];

for (const [name, commit, kind] of NEGATIVE) {
  test(`does not count: ${name}`, () => {
    const c = classifyCommit(commit);
    assert.equal(c.kind, kind, JSON.stringify(c.evidence));
    assert.deepEqual(c.tools, []);
    assert.equal(c.mode, null);
  });
}

// ── Details ───────────────────────────────────────────────────────────────────

test('a bot author with an AI co-author counts as AI', () => {
  const c = classifyCommit({
    authorName: 'github-actions[bot]',
    authorEmail: '41898282+github-actions[bot]@users.noreply.github.com',
    message: 'Apply fix\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n',
  });
  assert.equal(c.kind, 'ai');
  assert.deepEqual(c.tools, ['claude']);
});

test('the driver of an assisted commit is its human author', () => {
  const c = classifyCommit(withTrailer('Co-Authored-By: Claude <noreply@anthropic.com>'));
  assert.deepEqual(c.driver, { name: 'Jane Doe', email: 'jane@example.com' });
});

test('the driver of an agent-authored commit is the first human co-author', () => {
  const c = classifyCommit({
    authorName: 'copilot-swe-agent[bot]',
    authorEmail: '198982749+Copilot@users.noreply.github.com',
    message: 'Plan\n\nCo-authored-by: dependabot[bot] <x@users.noreply.github.com>\nCo-authored-by: Omar Haddad <omar@example.com>\n',
  });
  assert.deepEqual(c.driver, { name: 'Omar Haddad', email: 'omar@example.com' });
});

test('an agent-authored commit with nobody else attached has no driver', () => {
  const c = classifyCommit({ authorName: 'devin-ai-integration[bot]', authorEmail: 'x@users.noreply.github.com', message: 'Fix\n' });
  assert.equal(c.driver, null);
});

test('aider keeps the human as driver, minus the suffix', () => {
  const c = classifyCommit({ authorName: 'Jane Doe (aider)', authorEmail: 'jane@example.com', message: 'Add tests\n' });
  assert.deepEqual(c.driver, { name: 'Jane Doe', email: 'jane@example.com' });
});

test('custom identities count under the "custom" tool', () => {
  const customAi = [/^robobun\b/i];
  const authored = classifyCommit({ authorName: 'robobun', authorEmail: 'robobun@example.com', message: 'Fix\n' }, { customAi });
  assert.equal(authored.kind, 'ai');
  assert.deepEqual(authored.tools, ['custom']);
  assert.equal(authored.mode, 'authored');

  const assisted = classifyCommit(withTrailer('Co-authored-by: robobun <robobun@example.com>'), { customAi });
  assert.deepEqual(assisted.tools, ['custom']);
  assert.equal(assisted.mode, 'assisted');

  assert.equal(classifyCommit(withTrailer('Co-authored-by: robobun <robobun@example.com>')).kind, 'human');
});

test('"other" is dropped when a named tool is also present', () => {
  const c = classifyCommit(withTrailer('AI-assisted: yes\nCo-authored-by: Cursor <cursoragent@cursor.com>'));
  assert.deepEqual(c.tools, ['cursor']);
});

test('evidence records what matched and how', () => {
  const c = classifyCommit(withTrailer('Co-Authored-By: Claude <noreply@anthropic.com>'));
  assert.deepEqual(c.evidence, [
    { via: 'co-author', tool: 'claude', match: 'Co-Authored-By: Claude <noreply@anthropic.com>' },
  ]);
});

test('parseIdentity handles the usual shapes', () => {
  assert.deepEqual(parseIdentity('Jane Doe <jane@example.com>'), { name: 'Jane Doe', email: 'jane@example.com' });
  assert.deepEqual(parseIdentity('  "Jane Doe"  <jane@example.com> '), { name: 'Jane Doe', email: 'jane@example.com' });
  assert.deepEqual(parseIdentity('Copilot'), { name: 'Copilot', email: '' });
  assert.deepEqual(parseIdentity('<only@example.com>'), { name: '', email: 'only@example.com' });
  assert.deepEqual(parseIdentity(''), { name: '', email: '' });
});

test('parseTrailers lower-cases keys and keeps values', () => {
  const trailers = parseTrailers('Subject\n\nBody text here.\nCo-Authored-By: A <a@b.c>\nSigned-off-by: B <b@c.d>\n');
  assert.deepEqual(
    trailers.map((x) => [x.key, x.value]),
    [
      ['co-authored-by', 'A <a@b.c>'],
      ['signed-off-by', 'B <b@c.d>'],
    ],
  );
});

test('classifyCommit survives missing fields', () => {
  assert.equal(classifyCommit({}).kind, 'human');
  assert.equal(classifyCommit({ authorName: null, authorEmail: undefined, message: null }).kind, 'human');
});
