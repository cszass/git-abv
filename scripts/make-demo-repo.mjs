#!/usr/bin/env node
/**
 * Generate fictional repositories to demo git-abv on.
 *
 *   node scripts/make-demo-repo.mjs            # builds all three under .demo/
 *   node scripts/make-demo-repo.mjs moonshine  # builds one
 *
 * The histories are invented, deterministic, and exist only to show what the output looks like.
 * No real project is represented.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRepo, filler, rng } from './lib/fake-repo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86400;
const utc = (y, m, d = 1) => Date.UTC(y, m - 1, d) / 1000;

const SUBJECTS = [
  'Fix flaky retry in upload worker',
  'Add pagination to the orders endpoint',
  'Refactor config loading',
  'Handle empty payloads gracefully',
  'Bump timeout for slow regions',
  'Add integration tests for billing',
  'Speed up cold start',
  'Remove dead feature flag',
  'Tidy up error messages',
  'Cache tenant lookups',
  'Support CSV export',
  'Fix off-by-one in the date picker',
  'Wire up the audit log',
  'Make the importer idempotent',
  'Document the webhook contract',
  'Fix race in session refresh',
  'Add dark mode to settings',
  'Migrate cron jobs to the queue',
  'Validate webhook signatures',
  'Trim bundle size',
  'Rework onboarding copy',
  'Add rate limiting to public API',
  'Fix memory leak in the stream parser',
  'Split the monolith router',
];

const HUMANS = [
  { name: 'Ada Park', email: 'ada@example.com', ai: 0.95 },
  { name: 'Bao Nguyen', email: 'bao@example.com', ai: 0.8 },
  { name: 'Carmen Ortiz', email: 'carmen@example.com', ai: 0.55 },
  { name: '林晓雨', email: 'xiaoyu@example.com', ai: 0.7 },
  { name: 'Dmitri Volkov', email: 'dmitri@example.com', ai: 0.3 },
  { name: 'Efua Mensah', email: 'efua@example.com', ai: 0 },
  { name: "Finn O'Brien", email: 'finn@example.com', ai: 0 },
];

const SIGN = {
  claude: (human) => ({
    ...human,
    trailer:
      '🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
  }),
  copilot: (human) => ({
    ...human,
    trailer: 'Co-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>',
  }),
  copilotAgent: (human) => ({
    name: 'copilot-swe-agent[bot]',
    email: '198982749+Copilot@users.noreply.github.com',
    trailer: `Co-authored-by: ${human.name} <${human.email}>`,
  }),
  cursor: (human) => ({ ...human, trailer: 'Co-authored-by: Cursor <cursoragent@cursor.com>' }),
  codex: (human) => ({ ...human, trailer: 'Co-authored-by: Codex <noreply@openai.com>' }),
  aider: (human) => ({ ...human, name: `${human.name} (aider)`, trailer: '' }),
  devin: () => ({
    name: 'devin-ai-integration[bot]',
    email: '158243242+devin-ai-integration[bot]@users.noreply.github.com',
    trailer: '',
  }),
};

/** Which tool signs an AI commit, by era. Returns a key of SIGN. */
function pickTool(time, r) {
  const x = r();
  if (time < utc(2024, 7)) return x < 0.6 ? 'copilot' : 'aider';
  if (time < utc(2025, 3)) return x < 0.45 ? 'cursor' : x < 0.8 ? 'copilot' : 'aider';
  if (time < utc(2025, 9)) return x < 0.5 ? 'claude' : x < 0.75 ? 'cursor' : x < 0.93 ? 'copilot' : 'devin';
  return x < 0.62 ? 'claude' : x < 0.76 ? 'codex' : x < 0.88 ? 'cursor' : x < 0.96 ? 'copilotAgent' : 'devin';
}

const PROFILES = {
  /** A team that discovered agents in 2024 and never looked back. */
  moonshine: {
    remote: 'https://github.com/acme/rocket.git',
    seed: 7,
    start: utc(2023, 3, 6),
    end: utc(2026, 11, 9),
    perMonth: 26,
    humans: HUMANS,
    bots: true,
    // Share of commits made with AI at time t: a slow start, then a steep climb.
    aiRate: (t) => {
      const years = (t - utc(2024, 1)) / (365 * DAY);
      if (years < 0) return 0;
      return 0.86 / (1 + Math.exp(-2.6 * (years - 1.35)));
    },
  },
  /** An old-school project. No signatures anywhere. */
  handmade: {
    remote: 'https://github.com/acme/abacus.git',
    seed: 11,
    start: utc(2019, 5, 2),
    end: utc(2026, 10, 30),
    perMonth: 9,
    humans: HUMANS.slice(2).map((h) => ({ ...h, ai: 0 })),
    bots: false,
    aiRate: () => 0,
  },
  /** A weekend project, prompted into existence. */
  vibes: {
    remote: 'https://github.com/acme/todo-app-final-v2.git',
    seed: 23,
    start: utc(2026, 8, 14),
    end: utc(2026, 11, 8),
    perMonth: 70,
    humans: [{ name: 'Ada Park', email: 'ada@example.com', ai: 1 }],
    bots: false,
    aiRate: () => 0.985,
  },
};

function generate(profile) {
  const r = rng(profile.seed);
  const commits = [];
  const span = profile.end - profile.start;
  const total = Math.round((span / (30.4 * DAY)) * profile.perMonth);
  const times = Array.from({ length: total }, () => Math.floor(profile.start + r() * span)).sort((a, b) => a - b);

  let n = 0;
  for (const time of times) {
    n += 1;
    const human = profile.humans[Math.floor(r() * profile.humans.length)];
    const subject = SUBJECTS[Math.floor(r() * SUBJECTS.length)];
    const useAi = r() < profile.aiRate(time) * human.ai * (human.ai >= 1 ? 1 : 1.25);
    let who = { ...human, trailer: '' };
    let lines = Math.round(6 + r() ** 2 * 140);
    if (useAi) {
      who = SIGN[pickTool(time, r)](human);
      lines = Math.round(20 + r() ** 1.6 * 420);
    }
    commits.push({
      name: who.name,
      email: who.email,
      time,
      message: who.trailer ? `${subject}\n\n${who.trailer}\n` : `${subject}\n`,
      files: [{ path: `src/${subject.split(' ')[0].toLowerCase()}/change-${n}.ts`, content: filler(lines, `// ${n}`) }],
    });

    // A dependency bot shows up every so often and rewrites the lockfile.
    if (profile.bots && r() < 0.045) {
      commits.push({
        name: 'dependabot[bot]',
        email: '49699333+dependabot[bot]@users.noreply.github.com',
        time: time + 60,
        message: `Bump some-package from 1.${n}.0 to 1.${n}.1\n\nSigned-off-by: dependabot[bot] <support@github.com>\n`,
        files: [
          { path: 'package-lock.json', content: filler(900, `lock ${n}`) },
          { path: 'package.json', content: `{ "version": "1.${n}.1" }\n` },
        ],
      });
    }
  }
  return commits;
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const names = wanted.length > 0 ? wanted : Object.keys(PROFILES);
for (const name of names) {
  const profile = PROFILES[name];
  if (!profile) {
    console.error(`Unknown demo "${name}". Choose from: ${Object.keys(PROFILES).join(', ')}`);
    process.exit(2);
  }
  const dir = path.join(ROOT, '.demo', name);
  const commits = generate(profile);
  buildRepo(dir, commits, { remote: profile.remote });
  console.log(`${name}: ${commits.length} commits → ${path.relative(ROOT, dir)}`);
}
