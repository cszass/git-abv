/**
 * Commit classification: given a commit's author and message, decide whether it carries
 * an AI signature, is plain automation, or (as far as anyone can tell) was made by a human.
 *
 * Pure functions, no I/O. Shared by the CLI and the web app.
 */

import {
  GENERIC_AI_TRAILERS,
  MESSAGE_RULES,
  TRAILER_RULES,
  isAutomation,
  matchAiIdentity,
  toolFromText,
} from './signatures.js';

const TRAILER_LINE = /^([A-Za-z][A-Za-z0-9-]*)[ \t]*:[ \t]*(\S.*)$/;
const IDENTITY = /^(.*?)\s*<([^<>]*)>\s*$/;

/** "Jane Doe <jane@example.com>" → { name, email }. Tolerates a missing email. */
export function parseIdentity(text) {
  const s = String(text || '').trim();
  const m = IDENTITY.exec(s);
  if (!m) return { name: stripQuotes(s), email: '' };
  return { name: stripQuotes(m[1].trim()), email: m[2].trim() };
}

function stripQuotes(s) {
  return s.replace(/^["']+|["']+$/g, '').trim();
}

/**
 * Pull `Key: value` lines out of a commit message.
 * Deliberately liberal: squash merges and hand-edited messages put trailers anywhere,
 * and we only act on a handful of specific keys, so stray `Note: ...` lines are harmless.
 */
export function parseTrailers(message) {
  const out = [];
  const lines = String(message || '').split(/\r?\n/);
  for (const raw of lines) {
    const m = TRAILER_LINE.exec(raw.trim());
    if (m) out.push({ key: m[1].toLowerCase(), value: m[2].trim(), raw: raw.trim() });
  }
  return out;
}

/**
 * Read a free-form attribution value such as the kernel's `AGENT_NAME:MODEL_VERSION [TOOLS]`.
 *
 *   "Cursor:claude-opus-5"   → ['cursor']   the agent wins over the model it happens to run
 *   "Claude, Codex"          → ['claude', 'codex']
 *   "Sidekick:v2-large"      → ['other']    unknown agent, but clearly the AGENT:MODEL shape
 *   "LLM"                    → ['other']
 *   "the build team"         → []
 */
export function toolsFromAttribution(value) {
  const tools = [];
  const add = (tool) => {
    if (tool && !tools.includes(tool)) tools.push(tool);
  };
  for (const piece of String(value).split(/\s*(?:,|&|\+|\band\b)\s*/i)) {
    if (!piece || /^https?:\/\//i.test(piece)) continue;

    // 1. One or more AGENT:MODEL pairs ("Deepseek:v4-pro Kimi:K2.6"), the kernel's own shape.
    let pairs = 0;
    for (const m of piece.matchAll(AGENT_MODEL_PAIR)) {
      pairs += 1;
      if (!NOT_AI.test(m[2])) add(preferNamed(m[2], m[3]) || 'other');
    }
    if (pairs > 0) continue;

    // 2. Looser spellings: "Opencode/Opus 4.6", "YuanSheng: deepseek-v4-pro".
    const split = /^([A-Za-z][\w .+-]*?)\s*[:/]\s*(\S.*)$/.exec(piece);
    if (split) {
      if (!NOT_AI.test(split[1].trim())) add(preferNamed(split[1], split[2]));
      continue;
    }

    // 3. A bare name: "Codex", "GitHub Copilot", "LLM".
    let tool = toolFromText(piece);
    // "Assisted-by: Claude Dupont" is a colleague. Names that people also carry only count
    // when they stand alone or are followed by product words.
    if (tool && ALSO_HUMAN_NAMES.has(tool) && !PRODUCT_SHAPED.test(piece.trim())) tool = null;
    add(tool);
  }
  return tools;
}

/** The agent's name wins; failing that the model's; "other" only when neither is a known tool. */
function preferNamed(agent, model) {
  const a = toolFromText(agent);
  if (a && a !== 'other') return a;
  const b = toolFromText(model);
  if (b && b !== 'other') return b;
  return a || b || null;
}

const AGENT_MODEL_PAIR = /(^|[\s(])([A-Za-z][\w.+-]*):([\w.+-]+)/g;
/** Static analysers and friends get credited in the same trailers. They are tools, not AI. */
const NOT_AI =
  /^(smatch|sparse|coccinelle|checkpatch(\.pl)?|syzkaller|syzbot|codeql|clang(-tidy|-format)?|gcc|kasan|kmsan|kcsan|ubsan|coverity|cppcheck|clippy|eslint|prettier|shellcheck|valgrind|git|b4|agent_name)$/i;
const ALSO_HUMAN_NAMES = new Set(['claude', 'devin', 'jules', 'cline', 'amp', 'goose', 'roo', 'junie', 'warp', 'kiro', 'kilo', 'trae']);
const PRODUCT_SHAPED = /^[\w.-]+(\s+(code|ai|cli|agent|bot|opus|sonnet|haiku|fable|mythos|v?\d[\w.-]*)\b[\w .()-]*)?$/i;

function formatIdentity(id) {
  return id.email ? `${id.name} <${id.email}>` : id.name;
}

function matchCustom(id, customAi) {
  if (!customAi || customAi.length === 0) return false;
  const text = formatIdentity(id);
  return customAi.some((re) => re.test(text));
}

/**
 * @typedef {Object} CommitInput
 * @property {string} authorName
 * @property {string} authorEmail
 * @property {string} message   full commit message (subject + body)
 * @property {string} [subject] first line; derived from `message` when missing
 *
 * @typedef {Object} Evidence
 * @property {'author'|'co-author'|'trailer'|'message'} via
 * @property {string} tool   tool id from signatures.js
 * @property {string} match  the text that triggered the match
 *
 * @typedef {Object} Classification
 * @property {'ai'|'bot'|'human'} kind
 * @property {'authored'|'assisted'|null} mode  authored = the agent is the commit author
 * @property {string[]} tools   unique tool ids, strongest evidence first
 * @property {Evidence[]} evidence
 * @property {{name: string, email: string}|null} driver  the human behind the commit, if any
 */

/**
 * @param {CommitInput} commit
 * @param {{ customAi?: RegExp[] }} [options]
 * @returns {Classification}
 */
export function classifyCommit(commit, options = {}) {
  const message = String(commit.message || '');
  const subject = commit.subject != null ? String(commit.subject) : message.split('\n', 1)[0];
  const author = { name: String(commit.authorName || '').trim(), email: String(commit.authorEmail || '').trim() };
  const { customAi } = options;

  /** @type {Evidence[]} */
  const evidence = [];
  const humanCoAuthors = [];

  // 1. Who is the author?
  let authored = false;
  let humanBehindAuthor = null;
  const authorRule = matchAiIdentity(author, { isAuthor: true });
  if (authorRule) {
    evidence.push({ via: 'author', tool: authorRule.tool, match: formatIdentity(author) });
    if (authorRule.keepsHuman) {
      // e.g. "Jane Doe (aider)": Jane is still the author, the tool only tagged her name.
      humanBehindAuthor = { name: author.name.replace(/\s*\([^()]*\)\s*$/, ''), email: author.email };
    } else {
      authored = true;
    }
  } else if (matchCustom(author, customAi)) {
    authored = true;
    evidence.push({ via: 'author', tool: 'custom', match: formatIdentity(author) });
  }

  // 2. Trailers.
  for (const t of parseTrailers(message)) {
    if (t.key === 'co-authored-by') {
      const id = parseIdentity(t.value);
      const rule = matchAiIdentity(id, { isAuthor: false });
      if (rule) evidence.push({ via: 'co-author', tool: rule.tool, match: t.raw });
      else if (matchCustom(id, customAi)) evidence.push({ via: 'co-author', tool: 'custom', match: t.raw });
      else if (!isAutomation(id) && id.name) humanCoAuthors.push(id);
      continue;
    }

    const trailerRule = TRAILER_RULES.find((r) => r.key === t.key && (!r.value || r.value.test(t.value)));
    if (trailerRule) {
      evidence.push({ via: 'trailer', tool: trailerRule.tool, match: t.raw });
      continue;
    }

    if (GENERIC_AI_TRAILERS.has(t.key)) {
      const hasEmail = IDENTITY.test(t.value);
      if (hasEmail) {
        // "Assisted-by: Some Person <p@example.com>" is a human unless the identity is a known agent.
        const rule = matchAiIdentity(parseIdentity(t.value), { isAuthor: false });
        if (rule) evidence.push({ via: 'trailer', tool: rule.tool, match: t.raw });
      } else {
        for (const tool of toolsFromAttribution(t.value)) evidence.push({ via: 'trailer', tool, match: t.raw });
      }
    }
  }

  // 3. Markers in the message itself. One piece of evidence per tool is plenty.
  const markedTools = new Set();
  for (const rule of MESSAGE_RULES) {
    if (markedTools.has(rule.tool)) continue;
    const haystack = rule.subjectOnly ? subject : message;
    const m = rule.re.exec(haystack);
    if (!m) continue;
    markedTools.add(rule.tool);
    // Quote the whole line the marker sits on, so the evidence reads naturally.
    const start = haystack.lastIndexOf('\n', m.index) + 1;
    let end = haystack.indexOf('\n', m.index);
    if (end === -1) end = haystack.length;
    evidence.push({ via: 'message', tool: rule.tool, match: haystack.slice(start, end).trim().slice(0, 120) });
  }

  const tools = [];
  for (const e of evidence) {
    if (!tools.includes(e.tool)) tools.push(e.tool);
  }
  // "Other AI" is a fallback label. Drop it when a named tool was also found.
  const named = tools.filter((t) => t !== 'other');
  const finalTools = named.length > 0 ? named : tools;

  const authorIsBot = !authored && isAutomation(author);
  let kind = 'human';
  if (evidence.length > 0) kind = 'ai';
  else if (authorIsBot) kind = 'bot';

  let driver;
  if (humanBehindAuthor) driver = humanBehindAuthor;
  else if (authored || authorIsBot) driver = humanCoAuthors[0] || null;
  else driver = author;

  return {
    kind,
    mode: kind === 'ai' ? (authored ? 'authored' : 'assisted') : null,
    tools: kind === 'ai' ? finalTools : [],
    evidence,
    driver,
  };
}
