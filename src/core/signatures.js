/**
 * The signature database: how AI coding tools sign the commits they touch.
 *
 * Pure data plus tiny helpers. No Node APIs, so this file also runs in the browser.
 *
 * House rules for adding a signature (see CONTRIBUTING.md):
 *   1. Precision over recall. A rule must never match an ordinary human contributor.
 *      "Claude Dupont <claude@example.com>" is a person. Do not count people.
 *   2. Prefer emails and bot logins over display names.
 *   3. Add an `eg` (a real-looking example) so the docs can show what the rule catches.
 */

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A GitHub App identity. Apps commit as `login[bot]` with the email
 * `<id>+login[bot]@users.noreply.github.com`. Either half is enough.
 */
function ghApp(tool, login) {
  const l = esc(login);
  return [
    { tool, name: new RegExp(`^${l}\\[bot\\]$`, 'i'), eg: `${login}[bot]` },
    { tool, email: new RegExp(`^(\\d+\\+)?${l}\\[bot\\]@users\\.noreply\\.github\\.com$`, 'i') },
  ];
}

/** Display metadata for every tool we can attribute a commit to. */
export const TOOLS = {
  claude: { name: 'Claude', color: '#D97757' },
  copilot: { name: 'Copilot', color: '#8B5CF6' },
  cursor: { name: 'Cursor', color: '#0EA5E9' },
  codex: { name: 'Codex', color: '#10A37F' },
  chatgpt: { name: 'ChatGPT', color: '#5EC4A8' },
  gemini: { name: 'Gemini', color: '#4285F4' },
  antigravity: { name: 'Antigravity', color: '#34A853' },
  jules: { name: 'Jules', color: '#B06EF3' },
  aider: { name: 'Aider', color: '#22A722' },
  devin: { name: 'Devin', color: '#F2A93B' },
  amp: { name: 'Amp', color: '#F34E3F' },
  openhands: { name: 'OpenHands', color: '#E3B505' },
  opencode: { name: 'opencode', color: '#F97316' },
  warp: { name: 'Warp', color: '#01A4FF' },
  droid: { name: 'Droid', color: '#EF6F2E' },
  junie: { name: 'Junie', color: '#21D789' },
  amazonq: { name: 'Amazon Q', color: '#7D5CF5' },
  kiro: { name: 'Kiro', color: '#9046FF' },
  windsurf: { name: 'Windsurf', color: '#0FB5AE' },
  cline: { name: 'Cline', color: '#6366F1' },
  roo: { name: 'Roo Code', color: '#8E6CEF' },
  kilo: { name: 'Kilo Code', color: '#FACC15' },
  goose: { name: 'Goose', color: '#64748B' },
  qwen: { name: 'Qwen Code', color: '#615CED' },
  qoder: { name: 'Qoder', color: '#2B6BFF' },
  codebuddy: { name: 'CodeBuddy', color: '#7B61FF' },
  trae: { name: 'Trae', color: '#22C55E' },
  kimi: { name: 'Kimi', color: '#5B8DEF' },
  deepseek: { name: 'DeepSeek', color: '#4D6BFE' },
  glm: { name: 'GLM', color: '#2E7CF6' },
  grok: { name: 'Grok', color: '#6B7280' },
  openclaw: { name: 'OpenClaw', color: '#E4572E' },
  openswe: { name: 'Open SWE', color: '#10B981' },
  continue: { name: 'Continue', color: '#BE185D' },
  aikido: { name: 'Aikido AutoFix', color: '#6551F3' },
  multica: { name: 'Multica', color: '#0EA5A4' },
  replit: { name: 'Replit Agent', color: '#F26207' },
  lovable: { name: 'Lovable', color: '#FF5C8A' },
  v0: { name: 'v0', color: '#737373' },
  bolt: { name: 'Bolt', color: '#1389FD' },
  sweep: { name: 'Sweep', color: '#A855F7' },
  codegen: { name: 'Codegen', color: '#F472B6' },
  coderabbit: { name: 'CodeRabbit', color: '#FF570A' },
  sourcery: { name: 'Sourcery', color: '#F59E0B' },
  ellipsis: { name: 'Ellipsis', color: '#6D28D9' },
  seer: { name: 'Sentry Seer', color: '#6C5FC7' },
  greptile: { name: 'Greptile', color: '#22C55E' },
  cubic: { name: 'cubic', color: '#3B82F6' },
  qodo: { name: 'Qodo', color: '#7C3AED' },
  charlie: { name: 'Charlie', color: '#EC4899' },
  terragon: { name: 'Terragon', color: '#84CC16' },
  custom: { name: 'Custom agent', color: '#A8A29E' },
  other: { name: 'Other AI', color: '#A8A29E' },
};

/**
 * Identity rules. Tested against the commit author and every `Co-authored-by:` trailer.
 * A rule matches when every field it defines (`name`, `email`) matches.
 */
export const IDENTITY_RULES = [
  // ── Claude (Anthropic) ────────────────────────────────────────────────────
  { tool: 'claude', email: /^noreply@anthropic\.com$/i, eg: 'Co-Authored-By: Claude <noreply@anthropic.com>' },
  { tool: 'claude', name: /^claude\b/i, email: /@anthropic\.com$/i },
  // Model-name attribution ("Claude Opus 4.5", "Claude Code"). Nobody's parents did this.
  { tool: 'claude', name: /^claude (code|opus|sonnet|haiku|fable|mythos|instant)\b/i, eg: 'Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>' },
  { tool: 'claude', name: /^claude[- ]?bot$/i, eg: 'Co-authored-by: Claude Bot <claude-bot@example.com>' },
  // A bare "Claude" only counts when the mailbox is plainly a machine's. People are called Claude too.
  { tool: 'claude', name: /^(claude|claude code|anthropic)$/i, email: /^[^@]*(bot|agent|no-?reply)[^@]*@/i },
  ...ghApp('claude', 'claude'),

  // ── GitHub Copilot ────────────────────────────────────────────────────────
  ...ghApp('copilot', 'copilot-swe-agent'),
  ...ghApp('copilot', 'copilot'),
  ...ghApp('copilot', 'github-copilot'),
  ...ghApp('copilot', 'copilot-pull-request-reviewer'),
  { tool: 'copilot', email: /^(\d+\+)?copilot@users\.noreply\.github\.com$/i, eg: 'Co-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>' },
  { tool: 'copilot', name: /^(github )?copilot( coding agent| autofix.*)?$/i },

  // ── Cursor ────────────────────────────────────────────────────────────────
  { tool: 'cursor', email: /^cursoragent@cursor\.com$/i, eg: 'Co-authored-by: Cursor <cursoragent@cursor.com>' },
  { tool: 'cursor', name: /^cursor( agent)?$/i, email: /@cursor\.(com|sh)$/i },
  ...ghApp('cursor', 'cursor'),

  // ── OpenAI Codex / ChatGPT ────────────────────────────────────────────────
  { tool: 'codex', name: /^(openai )?codex( cli)?$/i, eg: 'Co-authored-by: Codex <noreply@openai.com>' },
  { tool: 'codex', name: /codex/i, email: /@openai\.com$/i },
  ...ghApp('codex', 'chatgpt-codex-connector'),
  ...ghApp('codex', 'openai-codex'),
  { tool: 'chatgpt', name: /^chatgpt\b/i, eg: 'Co-authored-by: ChatGPT <noreply@openai.com>' },
  { tool: 'chatgpt', name: /^(openai )?gpt-?[345o][\w.-]*$/i },
  { tool: 'chatgpt', name: /^openai$/i, email: /@openai\.com$/i },

  // ── Google ────────────────────────────────────────────────────────────────
  ...ghApp('jules', 'google-labs-jules'),
  ...ghApp('gemini', 'gemini-code-assist'),
  ...ghApp('gemini', 'gemini-cli'),
  { tool: 'gemini', name: /^(google )?gemini( cli| code assist| \d[\w. -]*| (pro|flash|ultra)[\w. -]*)?$/i, eg: 'Co-authored-by: Gemini <...>' },

  // ── Aider ─────────────────────────────────────────────────────────────────
  // Aider appends "(aider)" to the author name of commits it wrote. The person stays the
  // author, so they keep the credit in per-author stats (`keepsHuman`).
  { tool: 'aider', name: /\(aider\)\s*$/i, eg: 'Author: Jane Doe (aider)', authorOnly: true, keepsHuman: true },
  { tool: 'aider', email: /@aider\.chat$/i, eg: 'Co-authored-by: aider (model) <...@aider.chat>' },
  { tool: 'aider', name: /^aider( \(.*\))?$/i },

  // ── Agents that commit under their own identity ───────────────────────────
  ...ghApp('devin', 'devin-ai-integration'),
  { tool: 'devin', name: /^devin( ai)?$/i, email: /(cognition|devin)/i },
  { tool: 'amp', email: /^amp@ampcode\.com$/i, eg: 'Co-authored-by: Amp <amp@ampcode.com>' },
  { tool: 'openhands', email: /^openhands@all-hands\.dev$/i, eg: 'Author: openhands <openhands@all-hands.dev>' },
  { tool: 'openhands', name: /^openhands([- ]?(agent|ai))?$/i },
  ...ghApp('openhands', 'openhands-agent'),
  ...ghApp('openhands', 'openhands-ai'),
  ...ghApp('opencode', 'opencode-agent'),
  { tool: 'opencode', name: /^opencode$/i },
  { tool: 'warp', email: /^agent@warp\.dev$/i, eg: 'Co-Authored-By: Warp <agent@warp.dev>' },
  ...ghApp('droid', 'factory-droid'),
  { tool: 'junie', email: /^junie@jetbrains\.com$/i },
  ...ghApp('junie', 'jetbrains-junie'),
  ...ghApp('amazonq', 'amazon-q-developer'),
  { tool: 'amazonq', name: /^amazon q( developer)?$/i },
  ...ghApp('kiro', 'kiro-agent'),
  { tool: 'kiro', name: /^kiro( agent)?$/i, email: /(kiro\.dev|noreply)/i },
  { tool: 'windsurf', name: /^windsurf( cascade)?$/i },
  { tool: 'windsurf', name: /^cascade$/i, email: /(windsurf|codeium)/i },
  { tool: 'cline', name: /^cline( bot)?$/i, email: /(cline\.bot|noreply)/i },
  { tool: 'cline', name: /^cline agent$/i, eg: 'Author: Cline Agent <cline-agent@users.noreply.github.com>' },
  ...ghApp('cline', 'cline'),
  ...ghApp('openswe', 'open-swe'),
  ...ghApp('continue', 'continue'),
  { tool: 'multica', name: /^multica[- ]agent$/i, eg: 'Author: multica-agent <github@multica.ai>' },
  ...ghApp('roo', 'roomote'),
  { tool: 'roo', name: /^roo ?code$/i },
  ...ghApp('kilo', 'kilo-code-bot'),
  { tool: 'kilo', name: /^kilo ?code( bot)?$/i },
  { tool: 'goose', name: /^goose$/i, email: /(block\.xyz|squareup\.com|noreply)/i },
  { tool: 'qwen', name: /^qwen[- ]?(coder|code)$/i, eg: 'Co-authored-by: Qwen-Coder <qwen-coder@alibabacloud.com>' },
  { tool: 'qwen', email: /^qwen-coder@alibabacloud\.com$/i },

  // ── App builders ──────────────────────────────────────────────────────────
  ...ghApp('lovable', 'lovable-dev'),
  ...ghApp('lovable', 'gpt-engineer-app'),
  ...ghApp('v0', 'v0'),
  ...ghApp('bolt', 'bolt-new-by-stackblitz'),

  // ── Review / fix bots whose suggestions land as (co-)authored commits ─────
  ...ghApp('sweep', 'sweep-ai'),
  ...ghApp('codegen', 'codegen-sh'),
  ...ghApp('coderabbit', 'coderabbitai'),
  ...ghApp('sourcery', 'sourcery-ai'),
  ...ghApp('ellipsis', 'ellipsis-dev'),
  ...ghApp('seer', 'seer-by-sentry'),
  ...ghApp('greptile', 'greptile-apps'),
  ...ghApp('cubic', 'cubic-dev-ai'),
  ...ghApp('qodo', 'qodo-merge-pro'),
  ...ghApp('qodo', 'codiumai-pr-agent-pro'),
  ...ghApp('charlie', 'charliecreates'),
  ...ghApp('terragon', 'terragon-labs'),
  ...ghApp('aikido', 'aikido-autofix'),
];

/** Message rules. Tested against the whole commit message. */
export const MESSAGE_RULES = [
  { tool: 'claude', re: /Generated with \[Claude Code\]\(https?:\/\/(www\.)?claude\.(ai|com)\//i, eg: '🤖 Generated with [Claude Code](https://claude.com/claude-code)' },
  { tool: 'claude', re: /^\s*🤖 Generated with (\[)?Claude Code/im },
  { tool: 'codex', re: /^\s*🤖 Generated with (\[)?(OpenAI )?Codex/im },
  { tool: 'gemini', re: /^\s*🤖 Generated with (\[)?Gemini( CLI)?/im },
  { tool: 'aider', re: /^aider: /, eg: 'aider: fix the off-by-one in pagination', subjectOnly: true },
];

/** Trailer rules. `key` is lower-case; `value` (optional) must match too. */
export const TRAILER_RULES = [
  { tool: 'amp', key: 'amp-thread-id', eg: 'Amp-Thread-ID: https://ampcode.com/threads/T-…' },
  { tool: 'replit', key: 'replit-commit-author', value: /^(agent|assistant)\b/i, eg: 'Replit-Commit-Author: Agent' },
  { tool: 'other', key: 'ai-assisted', value: /^(yes|true)\b/i },
  { tool: 'other', key: 'ai-generated', value: /^(yes|true)\b/i },
];

/**
 * Free-form attribution trailers, e.g. the Linux kernel's
 * `Assisted-by: AGENT_NAME:MODEL_VERSION [TOOL1] [TOOL2]`.
 */
export const GENERIC_AI_TRAILERS = new Set([
  'assisted-by',
  'generated-by',
  'ai-assisted-by',
  'ai-generated-by',
]);

/** Maps a tool or model name found in a free-form trailer to a tool id. First hit wins. */
export const NAME_KEYWORDS = [
  [/claude|anthropic|\b(sonnet|opus|haiku)\b/i, 'claude'],
  [/copilot/i, 'copilot'],
  [/cursor/i, 'cursor'],
  [/codex/i, 'codex'],
  [/chatgpt|openai|\bgpt[- ]?[345o]|\bo[134](-mini|-pro)?\b/i, 'chatgpt'],
  [/\bjules\b/i, 'jules'],
  [/antigravity/i, 'antigravity'],
  [/gemini/i, 'gemini'],
  [/aider/i, 'aider'],
  [/\bdevin\b/i, 'devin'],
  [/openhands/i, 'openhands'],
  [/opencode/i, 'opencode'],
  [/windsurf|cascade/i, 'windsurf'],
  [/\bcline\b/i, 'cline'],
  [/\broo\b/i, 'roo'],
  [/\bkilo\b/i, 'kilo'],
  [/\bkiro\b/i, 'kiro'],
  [/\bjunie\b/i, 'junie'],
  [/\bgoose\b/i, 'goose'],
  [/qoder/i, 'qoder'],
  [/codebuddy/i, 'codebuddy'],
  [/\btrae\b/i, 'trae'],
  [/qwen|tongyi|lingma/i, 'qwen'],
  [/\bkimi|moonshot/i, 'kimi'],
  [/deepseek/i, 'deepseek'],
  [/\bglm\b|\bglm-?\d|z\.ai|zhipu|\bzcode\b/i, 'glm'],
  [/\bgrok\b/i, 'grok'],
  [/openclaw/i, 'openclaw'],
  [/open[- ]?swe/i, 'openswe'],
  [/\bamp\b/i, 'amp'],
  [/\bwarp\b/i, 'warp'],
  [/amazon q|\bq developer\b/i, 'amazonq'],
  [/replit/i, 'replit'],
  [/\b(llm|ai|llama|ollama|mistral|codestral|devstral|minimax|doubao)\b|(^|[\s:_-])ai$/i, 'other'],
];

/**
 * Automation that is NOT AI: dependency bots, CI, release robots.
 * They get their own bucket so a wall of Dependabot bumps never inflates the AI number.
 */
export const AUTOMATION_RULES = [
  { name: /\[bot\]$/i },
  { email: /\[bot\]@users\.noreply\.github\.com$/i },
  { name: /^(dependabot|dependabot-preview|renovate|renovate-bot|greenkeeper|snyk-bot|pyup-bot|depfu)$/i },
  { name: /^(github[- ]actions?|github-merge-queue|semantic-release-bot|release-please|allcontributors|imgbot)$/i },
  { name: /^(mergify|bors|k8s-ci-robot|dotnet-bot|dotnet-maestro|weblate|crowdin bot|transifex.*|gitlab[- ]bot|jenkins|travis ?ci)$/i },
  { email: /^(bot|ci|noreply|no-reply|action|actions)@(github\.com|users\.noreply\.github\.com)$/i },
  { name: /(^|[\s_-])(bot|robot)$/i, email: /(noreply|no-reply|bot)/i },
  // "PyTorch MergeBot". Case-sensitive on purpose: "Talbot" and "Courbot" are surnames.
  { name: /[a-z]Bot$/, email: /(noreply|no-reply|bot)/i },
];

// ── Matching helpers ────────────────────────────────────────────────────────

function ruleMatches(rule, id) {
  if (!rule.name && !rule.email) return false;
  if (rule.name && !rule.name.test(id.name)) return false;
  if (rule.email && !rule.email.test(id.email)) return false;
  return true;
}

/**
 * @param {{name: string, email: string}} id
 * @param {{ isAuthor?: boolean }} [ctx]
 * @returns {object|null} the first matching identity rule
 */
export function matchAiIdentity(id, ctx = {}) {
  for (const rule of IDENTITY_RULES) {
    if (rule.authorOnly && !ctx.isAuthor) continue;
    if (ruleMatches(rule, id)) return rule;
  }
  return null;
}

/** @returns {boolean} true when the identity is a non-AI automation account */
export function isAutomation(id) {
  for (const rule of AUTOMATION_RULES) {
    if (ruleMatches(rule, id)) return true;
  }
  return false;
}

/** Map free text ("Claude:claude-sonnet-4-6", "GitHub Copilot") to a tool id, or null. */
export function toolFromText(text) {
  for (const [re, tool] of NAME_KEYWORDS) {
    if (re.test(text)) return tool;
  }
  return null;
}

export function toolName(id) {
  return (TOOLS[id] || TOOLS.other).name;
}

export function toolColor(id) {
  return (TOOLS[id] || TOOLS.other).color;
}

/** A printable summary of what we look for, grouped by tool. Used by `--signatures` and the docs. */
export function describeSignatures() {
  const byTool = new Map();
  const push = (tool, text) => {
    if (!text) return;
    if (!byTool.has(tool)) byTool.set(tool, []);
    const list = byTool.get(tool);
    if (!list.includes(text)) list.push(text);
  };
  for (const r of IDENTITY_RULES) push(r.tool, r.eg);
  for (const r of MESSAGE_RULES) push(r.tool, r.eg);
  for (const r of TRAILER_RULES) push(r.tool, r.eg);
  // Make sure every tool with at least one rule shows up, even without an example.
  for (const r of [...IDENTITY_RULES, ...MESSAGE_RULES, ...TRAILER_RULES]) {
    if (!byTool.has(r.tool)) byTool.set(r.tool, []);
  }
  return [...byTool.entries()]
    .filter(([tool]) => tool !== 'other')
    .map(([tool, examples]) => ({ tool, name: toolName(tool), examples }));
}
