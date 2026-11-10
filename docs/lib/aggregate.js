// Generated from src/core by `npm run sync:web`. Do not edit here.
/**
 * Aggregation: fold a stream of classified commits into one report.
 *
 * The aggregator never keeps commits around. Memory stays flat on huge histories:
 * one small bucket per day of history, one per author, one per tool.
 */

import { classifyCommit, parseIdentity, parseTrailers } from './classify.js';
import { isAutomation, toolName } from './signatures.js';
import { formatDate, pct, round2 } from './format.js';
import { proofFor, styleFor } from './styles.js';

const DAY = 86400;
const MIN_TIME = 631152000; // 1990-01-01. Anything older is a broken clock, not history.
const KINDS = ['ai', 'human', 'bot'];

const triple = () => ({ ai: 0, human: 0, bot: 0 });
const sum = (t) => t.ai + t.human + t.bot;

/**
 * @param {Object} [options]
 * @param {RegExp[]} [options.customAi]   extra identities to count as AI
 * @param {'lines'|'commits'} [options.metric]  force the headline metric (default: lines when available)
 * @param {number} [options.recentDays]   size of the "recent" window, default 90
 * @param {number} [options.now]          unix seconds; injected for deterministic tests
 * @param {number} [options.samples]      keep this many matched commits for `--explain`
 * @param {boolean} [options.suspects]    collect bot-looking identities missing from the database
 * @param {boolean} [options.breakdown]   tally which signatures matched, and how often
 */
export function createAggregator(options = {}) {
  const customAi = options.customAi || [];
  const recentDays = options.recentDays ?? 90;
  const nowSec = options.now ?? Date.now() / 1000;
  const maxSamples = options.samples ?? 0;
  const collectSuspects = Boolean(options.suspects);
  const collectBreakdown = Boolean(options.breakdown);

  const commits = triple();
  const added = triple();
  const deleted = triple();
  const modes = { authored: 0, assisted: 0 };
  /** @type {Map<string, {commits:number, added:number, deleted:number, first:number, last:number}>} */
  const tools = new Map();
  /** day index → [commitsAi, commitsHuman, commitsBot, linesAi, linesHuman, linesBot] */
  const days = new Map();
  const authors = new Map();
  const samples = [];
  const suspects = new Map();
  const signatures = new Map();
  let firstAi = null;
  let firstTime = Infinity;
  let lastTime = -Infinity;
  let undated = 0;

  /** Tally one piece of evidence under a stable, readable key. */
  function noteSignature(e) {
    let text = e.match;
    if (e.via === 'co-author') {
      text = text.replace(/^[^:]*:\s*/, '');
    } else if (e.via === 'trailer') {
      // Per-commit values (thread URLs, session ids) would give every commit its own row.
      text = text.replace(/(https?:\/\/[^/\s]+)\/\S+/g, '$1/…').replace(/\b[0-9a-f]{12,}\b/gi, '…');
    }
    text = text.slice(0, 90);
    const key = [e.via, e.tool, text].join('\n');
    let entry = signatures.get(key);
    if (!entry) {
      if (signatures.size >= 2000) return; // plenty; keeps memory bounded on adversarial histories
      entry = { via: e.via, tool: e.tool, text, count: 0 };
      signatures.set(key, entry);
    }
    entry.count += 1;
  }

  function noteSuspect(id, as) {
    const looksAutomated =
      /\[bot\]|bot$|^bot|robo|\b(agent|ai|gpt|llm|assistant|autofix|copilot|automation)\b/i.test(id.name) ||
      /\[bot\]|(^|[-_.+])(bot|ci|agent|automation|ai)([-_.+]|$)/i.test(id.email.split('@')[0] || '');
    if (!looksAutomated) return;
    const key = id.email ? `${id.name} <${id.email}>` : id.name;
    const entry = suspects.get(key) || { identity: key, count: 0, as };
    entry.count += 1;
    suspects.set(key, entry);
  }

  /**
   * @param {Object} commit
   * @param {string} commit.hash
   * @param {string} commit.authorName
   * @param {string} commit.authorEmail
   * @param {number} commit.time     author date, unix seconds
   * @param {string} commit.subject
   * @param {string} commit.message
   * @param {number} [commit.added]   lines added (after path excludes)
   * @param {number} [commit.deleted] lines deleted (after path excludes)
   * @param {import('./classify.js').Classification} [cls]
   */
  function add(commit, cls) {
    const c = cls || classifyCommit(commit, { customAi });
    const kind = c.kind;
    const a = Number.isFinite(commit.added) && commit.added > 0 ? commit.added : 0;
    const d = Number.isFinite(commit.deleted) && commit.deleted > 0 ? commit.deleted : 0;
    const t = Number(commit.time);
    const dated = Number.isFinite(t) && t >= MIN_TIME && t <= nowSec + 2 * DAY;

    commits[kind] += 1;
    added[kind] += a;
    deleted[kind] += d;

    if (dated) {
      if (t < firstTime) firstTime = t;
      if (t > lastTime) lastTime = t;
      const dayIdx = Math.floor(t / DAY);
      let bucket = days.get(dayIdx);
      if (!bucket) {
        bucket = [0, 0, 0, 0, 0, 0];
        days.set(dayIdx, bucket);
      }
      const k = KINDS.indexOf(kind);
      bucket[k] += 1;
      bucket[3 + k] += a;
    } else {
      undated += 1;
    }

    if (kind === 'ai') {
      modes[c.mode] += 1;
      const share = 1 / c.tools.length;
      for (const id of c.tools) {
        let tool = tools.get(id);
        if (!tool) {
          tool = { commits: 0, added: 0, deleted: 0, first: Infinity, last: -Infinity };
          tools.set(id, tool);
        }
        tool.commits += share;
        tool.added += a * share;
        tool.deleted += d * share;
        if (dated) {
          if (t < tool.first) tool.first = t;
          if (t > tool.last) tool.last = t;
        }
      }
      if (dated && (!firstAi || t < firstAi.time)) {
        firstAi = { time: t, hash: commit.hash, subject: commit.subject, tool: c.tools[0] };
      }
      if (collectBreakdown) for (const e of c.evidence) noteSignature(e);
      if (samples.length < maxSamples) {
        samples.push({
          hash: String(commit.hash || '').slice(0, 7),
          date: dated ? formatDate(t) : '',
          subject: commit.subject,
          mode: c.mode,
          tools: c.tools,
          evidence: c.evidence,
        });
      }
    }

    if (c.driver && (c.driver.name || c.driver.email)) {
      const key = (c.driver.email || c.driver.name).toLowerCase();
      let author = authors.get(key);
      if (!author) {
        author = { name: c.driver.name || c.driver.email, commits: 0, aiCommits: 0, lines: 0, aiLines: 0 };
        authors.set(key, author);
      }
      author.commits += 1;
      author.lines += a;
      if (kind === 'ai') {
        author.aiCommits += 1;
        author.aiLines += a;
      }
    }

    if (collectSuspects) {
      const author = { name: commit.authorName || '', email: commit.authorEmail || '' };
      if (kind !== 'ai') noteSuspect(author, kind);
      for (const tr of parseTrailers(commit.message)) {
        if (tr.key !== 'co-authored-by') continue;
        const id = parseIdentity(tr.value);
        const known = c.evidence.some((e) => e.match === tr.raw);
        if (!known) noteSuspect(id, isAutomation(id) ? 'bot' : 'human');
      }
    }
  }

  /** @param {{ repo?: object, range?: object, version?: string }} [meta] */
  function finish(meta = {}) {
    const totalCommits = sum(commits);
    const totalAdded = sum(added);
    const metric = options.metric === 'commits' || totalAdded === 0 ? 'commits' : 'lines';
    const pick = (lineValue, commitValue) => (metric === 'lines' ? lineValue : commitValue);

    const lineShare = pct(added.ai, totalAdded);
    const commitShare = pct(commits.ai, totalCommits);
    const abv = pick(lineShare, commitShare);
    const hasDates = Number.isFinite(firstTime) && Number.isFinite(lastTime);

    // ── Recent window ───────────────────────────────────────────────────────
    let recent = null;
    if (hasDates && recentDays > 0) {
      const lastDay = Math.floor(lastTime / DAY);
      const firstDay = Math.floor(firstTime / DAY);
      const from = lastDay - recentDays + 1;
      if (firstDay < from) {
        const c = triple();
        const l = triple();
        for (const [dayIdx, b] of days) {
          if (dayIdx < from) continue;
          KINDS.forEach((k, i) => {
            c[k] += b[i];
            l[k] += b[3 + i];
          });
        }
        const rc = sum(c);
        const rl = sum(l);
        if (rc > 0) {
          recent = {
            days: recentDays,
            since: formatDate(from * DAY),
            abv: round2(pick(pct(l.ai, rl), pct(c.ai, rc))),
            byLines: { ...l, total: rl, aiShare: round2(pct(l.ai, rl)) },
            byCommits: { ...c, total: rc, aiShare: round2(pct(c.ai, rc)) },
          };
        }
      }
    }

    // ── Timeline ────────────────────────────────────────────────────────────
    const timeline = buildTimeline(days, firstTime, lastTime, metric);

    // ── Tools ───────────────────────────────────────────────────────────────
    const toolList = [...tools.entries()]
      .map(([id, t]) => ({
        id,
        name: toolName(id),
        commits: round2(t.commits),
        lines: Math.round(t.added),
        share: round2(pick(pct(t.added, totalAdded), pct(t.commits, totalCommits))),
        firstSeen: Number.isFinite(t.first) ? formatDate(t.first) : null,
        lastSeen: Number.isFinite(t.last) ? formatDate(t.last) : null,
      }))
      .sort((x, y) => pick(y.lines - x.lines, 0) || y.commits - x.commits || x.name.localeCompare(y.name));

    // ── People ──────────────────────────────────────────────────────────────
    const authorList = [...authors.values()].map((a) => ({
      name: a.name,
      commits: a.commits,
      aiCommits: a.aiCommits,
      lines: a.lines,
      aiLines: a.aiLines,
      aiShare: round2(pick(pct(a.aiLines, a.lines), pct(a.aiCommits, a.commits))),
    }));
    const volume = (a) => pick(a.aiLines, a.aiCommits);
    const pourers = authorList
      .filter((a) => a.aiCommits > 0)
      .sort((x, y) => volume(y) - volume(x) || y.aiCommits - x.aiCommits || x.name.localeCompare(y.name));
    const sober = authorList
      .filter((a) => a.aiCommits === 0)
      .sort((x, y) => y.commits - x.commits || x.name.localeCompare(y.name));

    const style = styleFor(abv);

    return {
      schema: 1,
      tool: { name: 'git-abv', version: meta.version || null },
      generatedAt: new Date(nowSec * 1000).toISOString(),
      repo: meta.repo || { name: null, branch: null, head: null },
      range: {
        since: meta.range?.since || null,
        until: meta.range?.until || null,
        firstCommit: hasDates ? formatDate(firstTime) : null,
        lastCommit: hasDates ? formatDate(lastTime) : null,
        firstCommitTime: hasDates ? firstTime : null,
        lastCommitTime: hasDates ? lastTime : null,
      },
      metric,
      abv: round2(abv),
      proof: proofFor(abv),
      style: style.id,
      byLines: {
        ...added,
        total: totalAdded,
        deleted: sum(deleted),
        aiShare: round2(lineShare),
        available: totalAdded > 0,
      },
      byCommits: { ...commits, total: totalCommits, aiShare: round2(commitShare) },
      modes: { ...modes },
      recent,
      tools: toolList,
      timeline,
      people: {
        total: authorList.length,
        withAi: pourers.length,
        pourers,
        sober,
      },
      firstAi: firstAi
        ? {
            date: formatDate(firstAi.time),
            hash: String(firstAi.hash || '').slice(0, 7),
            subject: firstAi.subject,
            tool: firstAi.tool,
            toolName: toolName(firstAi.tool),
          }
        : null,
      undatedCommits: undated,
      samples: maxSamples > 0 ? samples : undefined,
      signatures: collectBreakdown
        ? [...signatures.values()].sort((x, y) => y.count - x.count || x.text.localeCompare(y.text))
        : undefined,
      suspects: collectSuspects
        ? [...suspects.values()].sort((x, y) => y.count - x.count || x.identity.localeCompare(y.identity))
        : undefined,
    };
  }

  return { add, finish };
}

// ── Timeline helpers ──────────────────────────────────────────────────────────

const MAX_POINTS = 36;

function monthIndexOf(seconds) {
  const d = new Date(seconds * 1000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/**
 * Roll daily buckets up into at most ~36 points: months for young repos,
 * quarters for middle-aged ones, years for the old guard.
 */
function buildTimeline(days, firstTime, lastTime, metric) {
  if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime)) return { bucket: 'month', points: [] };

  const firstMonth = monthIndexOf(firstTime);
  const lastMonth = monthIndexOf(lastTime);
  const months = lastMonth - firstMonth + 1;

  let bucket = 'month';
  let size = 1;
  if (months > MAX_POINTS) {
    bucket = 'quarter';
    size = 3;
    const quarters = Math.floor(lastMonth / 3) - Math.floor(firstMonth / 3) + 1;
    if (quarters > MAX_POINTS) {
      bucket = 'year';
      size = 12;
    }
  }

  const firstSlot = Math.floor(firstMonth / size);
  const lastSlot = Math.floor(lastMonth / size);
  const points = [];
  for (let slot = firstSlot; slot <= lastSlot; slot++) {
    const month = slot * size;
    const year = Math.floor(month / 12);
    const m = month % 12;
    let key;
    if (bucket === 'month') key = `${year}-${String(m + 1).padStart(2, '0')}`;
    else if (bucket === 'quarter') key = `${year}-Q${Math.floor(m / 3) + 1}`;
    else key = String(year);
    points.push({ key, year, commits: triple(), lines: triple(), aiShare: 0 });
  }

  for (const [dayIdx, b] of days) {
    const slot = Math.floor(monthIndexOf(dayIdx * DAY) / size) - firstSlot;
    const p = points[slot];
    if (!p) continue;
    KINDS.forEach((k, i) => {
      p.commits[k] += b[i];
      p.lines[k] += b[3 + i];
    });
  }

  for (const p of points) {
    p.aiShare = round2(
      metric === 'lines' ? pct(p.lines.ai, sum(p.lines)) : pct(p.commits.ai, sum(p.commits)),
    );
    p.empty = sum(p.commits) === 0;
  }
  return { bucket, points };
}
