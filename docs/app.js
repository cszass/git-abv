/**
 * git-abv on the web: pour any public GitHub repository, in the browser.
 *
 * No backend. The page asks the public GitHub API for recent commits, then runs the same
 * classifier and label renderer as the CLI (docs/lib is a copy of src/core).
 * Line counts are not available from the commit list, so this "quick taste" measures by commits.
 */

import { createAggregator } from './lib/aggregate.js';
import { renderBadge } from './lib/badge.js';
import { renderCard } from './lib/card.js';
import { formatInt, formatPct } from './lib/format.js';
import { styleName, t as coreText } from './lib/i18n.js';
import { toolColor, toolName } from './lib/signatures.js';

const PROJECT = 'cszass/git-abv';
const FALLBACK_EXAMPLES = ['oven-sh/bun', 'openai/codex', 'vercel/next.js'];
const CACHE_MINUTES = 30;

export const TEXT = {
  en: {
    docTitle: 'git-abv · AI By Volume',
    eyebrow: 'AI BY VOLUME',
    heroTitle: "What's the ABV of your repo?",
    heroSub: 'How much of a codebase was written with AI, read straight from its git history.',
    placeholder: 'owner/repo or a GitHub URL',
    pour: 'Pour',
    try: 'Try',
    distilling: 'Distilling… {n} commits',
    downloadPng: 'Download PNG',
    downloadSvg: 'SVG',
    downloadBadge: 'README badge',
    copyLink: 'Copy link',
    copied: 'Copied',
    copy: 'Copy',
    switchTheme_night: 'Night label',
    switchTheme_paper: 'Paper label',
    tasteNote:
      'A quick taste: the last {n} commits of {repo} ({from} to {to}), measured by commits. For the full-bodied number by volume, run the CLI on a clone:',
    ingredients: 'Ingredients',
    commitsOf: '{ai} of {total} commits carry an AI signature.',
    receipts: 'The receipts',
    receiptsSub: 'Recent commits that counted, and the signature that gave each one away.',
    noReceipts: 'No AI signatures in this sample.',
    topShelf: 'The top shelf',
    shelfSub: 'Well-known repositories, measured on {date}: the share of commits from the last 12 months that carry an AI signature.',
    colRepo: 'Repository',
    colAbv: 'ABV',
    colStyle: 'Style',
    colCommits: 'AI-signed commits',
    colNose: 'On the nose',
    shelfFine: 'Counts explicit signatures only, so every number is a floor. Click a row to pour it live.',
    how: 'How it works',
    how1t: 'It reads signatures, not minds',
    how1: 'AI coding tools sign their work: a Co-authored-by trailer, a bot author, a marker in the message. git-abv knows how dozens of tools sign, and counts the commits that carry a signature.',
    how2t: 'A floor, not a verdict',
    how2: 'Autocomplete and pasted chat answers leave no trace, and signatures can be switched off. The real number is at least this high. It says nothing about quality.',
    how3t: 'Nothing leaves your machine',
    how3: 'The CLI reads your local git history and makes no network requests at all. This page talks to the public GitHub API from your browser, and to nothing else.',
    cliTitle: 'Get the real number',
    cliSub: 'By lines of code, across the whole history, on any repo. Private ones included.',
    cliFine: "Zero dependencies. Works on GitHub, GitLab, Bitbucket and that server under someone's desk.",
    token: 'Hit the rate limit? Use a token',
    tokenHelp:
      'Without a token GitHub allows 60 API requests an hour. A fine-grained token with read-only access to public repositories is enough. It is kept in this tab only and sent to api.github.com, nowhere else.',
    footer: 'MIT licensed. Not affiliated with any AI vendor, or any distillery.',
    errNotFound: 'Repository not found. Is it private, or a typo?',
    errRate: 'GitHub API rate limit reached (60 requests an hour without a token). Try again after {time}, add a token below, or run the CLI.',
    errEmpty: 'This repository has no commits yet.',
    errBad: 'That does not look like owner/repo.',
    errNetwork: 'Could not reach the GitHub API. Check your connection and try again.',
    errOther: 'GitHub API error {status}.',
    rateLeft: '{n} API requests left this hour.',
    langToggle: '中文',
  },
  zh: {
    docTitle: 'git-abv · 含 AI 量',
    eyebrow: 'AI BY VOLUME · 含 AI 量',
    heroTitle: '你的仓库，含 AI 量多少度？',
    heroSub: '直接读 git 历史，测出一个代码库里有多少是 AI 写的。',
    placeholder: 'owner/repo 或 GitHub 链接',
    pour: '开测',
    try: '试试',
    distilling: '蒸馏中… {n} 个提交',
    downloadPng: '下载 PNG',
    downloadSvg: 'SVG',
    downloadBadge: 'README 徽章',
    copyLink: '复制链接',
    copied: '已复制',
    copy: '复制',
    switchTheme_night: '暗色酒标',
    switchTheme_paper: '纸质酒标',
    tasteNote: '快速试饮：{repo} 最近 {n} 个提交（{from} 至 {to}），按提交数计算。想要按代码量算的完整度数，克隆下来跑命令行：',
    ingredients: '配料表',
    commitsOf: '{total} 个提交中有 {ai} 个带 AI 署名。',
    receipts: '凭据',
    receiptsSub: '最近被计入的提交，以及暴露它们的签名。',
    noReceipts: '这批提交里没有发现 AI 签名。',
    topShelf: '名酒榜',
    shelfSub: '知名仓库实测（{date}）：过去 12 个月的提交中，带 AI 签名的比例。',
    colRepo: '仓库',
    colAbv: '含 AI 量',
    colStyle: '酒款',
    colCommits: 'AI 署名提交',
    colNose: '主调',
    shelfFine: '只统计明确的签名，所以每个数字都是下限。点击任意一行可现场开测。',
    how: '原理',
    how1t: '读的是签名，不是读心',
    how1: 'AI 编程工具会给自己的产出署名：Co-authored-by 尾注、机器人作者、提交信息里的标记。git-abv 认识几十种工具的署名方式，统计带签名的提交。',
    how2t: '是下限，不是定论',
    how2: '自动补全、从聊天窗口粘贴的代码不留痕迹，签名也可以关掉。真实数字只会更高。它也不评价代码质量。',
    how3t: '数据不出本机',
    how3: '命令行只读本地 git 历史，不发任何网络请求。这个页面只从你的浏览器访问 GitHub 公开 API，别无其他。',
    cliTitle: '测出真实度数',
    cliSub: '按代码行数、覆盖完整历史，任何仓库都行，私有仓库也行。',
    cliFine: '零依赖。GitHub、GitLab、Bitbucket，还有同事桌子底下那台服务器，都能用。',
    token: '被限流了？用个 token',
    tokenHelp: '不带 token 时 GitHub 每小时只允许 60 次 API 请求。一个只读公开仓库的 fine-grained token 就够了。它只保存在当前标签页，只会发给 api.github.com。',
    footer: 'MIT 许可。与任何 AI 厂商无关，与任何酒厂也无关。',
    errNotFound: '找不到这个仓库。是私有仓库，还是拼错了？',
    errRate: 'GitHub API 限流了（不带 token 每小时 60 次）。{time} 之后再试，或者在下方填个 token，或者直接用命令行。',
    errEmpty: '这个仓库还没有任何提交。',
    errBad: '看起来不像 owner/repo。',
    errNetwork: '连不上 GitHub API。检查一下网络再试。',
    errOther: 'GitHub API 返回错误 {status}。',
    rateLeft: '本小时还剩 {n} 次 API 请求。',
    langToggle: 'English',
  },
};

const $ = (selector) => document.querySelector(selector);
const inBrowser = typeof document !== 'undefined';

/** `kind` is "localStorage" or "sessionStorage". Storage can be missing or blocked; never let that break the page. */
function storageGet(kind, key) {
  try {
    return globalThis[kind].getItem(key);
  } catch {
    return null;
  }
}

function storageSet(kind, key, value) {
  try {
    globalThis[kind].setItem(key, value);
  } catch {
    /* private mode or quota: carry on without it */
  }
}

function prefersDark() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

const state = {
  lang: storageGet('localStorage', 'abv-lang') || (inBrowser && /^zh/i.test(navigator.language || '') ? 'zh' : 'en'),
  theme: prefersDark() ? 'night' : 'paper',
  repo: null,
  depth: 1000,
  report: null,
  labelUrl: null,
  controller: null,
  shelf: null,
};

function tx(key, vars) {
  let s = (TEXT[state.lang] || TEXT.en)[key] ?? TEXT.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, name) => (vars[name] != null ? String(vars[name]) : m));
  return s;
}

// ── Input parsing ─────────────────────────────────────────────────────────────

/** "https://github.com/acme/rocket/pulls" → "acme/rocket". Returns null for anything else. */
export function parseRepo(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  s = s.replace(/^git@github\.com:/i, '').replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '');
  s = s.replace(/[?#].*$/, '').replace(/\.git$/i, '');
  const parts = s.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, name] = parts;
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) return null;
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) return null;
  return `${owner}/${name}`;
}

// ── GitHub API ────────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(kind, detail = {}) {
    super(kind);
    this.kind = kind;
    this.detail = detail;
  }
}

async function fetchCommits(repo, depth, { token, signal, onProgress, onRate }) {
  const commits = [];
  const perPage = 100;
  for (let page = 1; commits.length < depth; page++) {
    let res;
    try {
      res = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=${perPage}&page=${page}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      throw new ApiError('network');
    }
    const remaining = res.headers.get('x-ratelimit-remaining');
    const reset = res.headers.get('x-ratelimit-reset');
    if (remaining != null) onRate?.(Number(remaining));
    if (!res.ok) {
      if (res.status === 404) throw new ApiError('notFound');
      if (res.status === 409) throw new ApiError('empty');
      if ((res.status === 403 || res.status === 429) && (remaining === '0' || res.status === 429)) {
        throw new ApiError('rate', { reset: reset ? Number(reset) : null });
      }
      throw new ApiError('other', { status: res.status });
    }
    const batch = await res.json();
    if (!Array.isArray(batch)) throw new ApiError('other', { status: res.status });
    commits.push(...batch);
    onProgress?.(Math.min(commits.length, depth));
    if (batch.length < perPage) break;
  }
  return commits.slice(0, depth);
}

/** GitHub API commit objects → a report, using the shared classifier. Measured by commits. */
export function analyzeCommits(repo, apiCommits) {
  const aggregator = createAggregator({ metric: 'commits', samples: 12 });
  for (const c of apiCommits) {
    if (!c || !c.commit) continue;
    if (Array.isArray(c.parents) && c.parents.length > 1) continue; // merges, as in the CLI
    const author = c.commit.author || {};
    const message = String(c.commit.message || '');
    aggregator.add({
      hash: c.sha,
      authorName: author.name || '',
      authorEmail: author.email || '',
      time: author.date ? Date.parse(author.date) / 1000 : NaN,
      subject: message.split('\n', 1)[0],
      message,
      added: 0,
      deleted: 0,
    });
  }
  return aggregator.finish({ version: 'web', repo: { name: repo, branch: null, head: null } });
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'style') node.setAttribute('style', value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

function setStatus(message, kind = '') {
  const status = $('#status');
  status.textContent = message || '';
  status.className = `status ${kind}`.trim();
}

function applyText() {
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
  document.title = tx('docTitle');
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = tx(node.dataset.i18n);
  for (const node of document.querySelectorAll('[data-i18n-placeholder]')) node.placeholder = tx(node.dataset.i18nPlaceholder);
  $('#lang-toggle').textContent = tx('langToggle');
  $('#theme-toggle').textContent = tx(state.theme === 'paper' ? 'switchTheme_night' : 'switchTheme_paper');
}

function currentSvg() {
  return renderCard(state.report, { lang: state.lang, theme: state.theme });
}

function renderResult() {
  const report = state.report;
  if (!report) return;
  const repo = state.repo;

  // The label. Shown through an <img>, so nothing inside the SVG can ever run.
  if (state.labelUrl) URL.revokeObjectURL(state.labelUrl);
  state.labelUrl = URL.createObjectURL(new Blob([currentSvg()], { type: 'image/svg+xml' }));
  const img = $('#label-image');
  img.src = state.labelUrl;
  img.alt = `${repo}: ${formatPct(report.abv)}% ${coreText(state.lang, 'title')} (${styleName(state.lang, report.style)})`;

  $('#taste-note').textContent = tx('tasteNote', {
    n: formatInt(report.byCommits.total),
    repo,
    from: report.range.firstCommit || '?',
    to: report.range.lastCommit || '?',
  });
  $('#cli-inline-code').textContent = `git clone https://github.com/${repo} && cd ${repo.split('/')[1]} && npx git-abv`;

  // Ingredients
  const c = report.byCommits;
  const rows = [{ name: coreText(state.lang, 'human'), value: c.human, color: 'var(--ink)' }];
  for (const tool of report.tools) rows.push({ name: toolName(tool.id), value: tool.commits, color: toolColor(tool.id) });
  if (c.bot > 0) rows.push({ name: coreText(state.lang, 'bots'), value: c.bot, color: 'var(--muted)' });
  const ingredients = $('#ingredients');
  ingredients.replaceChildren(
    ...rows.map((row) => {
      const share = c.total > 0 ? (row.value / c.total) * 100 : 0;
      return el('div', { class: 'ingredient' }, [
        el('span', { class: 'name', text: row.name, title: row.name }),
        el('span', { class: 'track' }, el('span', { class: 'fill', style: `display:block;width:${share.toFixed(2)}%;background:${row.color}` })),
        el('span', { class: 'value', text: `${formatPct(share)}%` }),
      ]);
    }),
    el('p', { class: 'ingredient-foot', text: tx('commitsOf', { ai: formatInt(c.ai), total: formatInt(c.total) }) }),
  );

  // Receipts
  const receipts = $('#receipts');
  const samples = report.samples || [];
  if (samples.length === 0) {
    receipts.replaceChildren(el('li', { class: 'empty', text: tx('noReceipts') }));
  } else {
    receipts.replaceChildren(
      ...samples.map((s) =>
        el('li', {}, [
          el('div', { class: 'receipt-head' }, [
            el('a', { href: `https://github.com/${repo}/commit/${s.hash}`, rel: 'noopener', target: '_blank', text: s.hash }),
            el('span', { class: 'when', text: s.date }),
            ...s.tools.map((id) => el('span', { class: 'tag', style: `background:${toolColor(id)}`, text: toolName(id) })),
          ]),
          el('p', { class: 'receipt-subject', text: s.subject }),
          el('p', { class: 'receipt-evidence', text: s.evidence.map((e) => e.match).join('  ·  ') }),
        ]),
      ),
    );
  }

  $('#result').hidden = false;
}

function renderShelf() {
  const shelf = state.shelf;
  if (!shelf || !Array.isArray(shelf.repos) || shelf.repos.length === 0) return;
  $('#shelf-sub').textContent = tx('shelfSub', { date: shelf.measuredOn });
  $('#shelf-body').replaceChildren(
    ...shelf.repos.map((r) => {
      const row = el('tr', { tabindex: '0', 'data-repo': r.repo }, [
        el('td', { class: 'repo', text: r.repo }),
        el('td', { class: 'num abv' }, [
          el('span', { class: 'meter' }, el('i', { style: `width:${Math.min(100, r.abv).toFixed(1)}%` })),
          document.createTextNode(`${formatPct(r.abv)}%`),
        ]),
        el('td', { text: styleName(state.lang, r.style) }),
        el('td', { class: 'num', text: `${formatInt(r.aiCommits)} / ${formatInt(r.commits)}` }),
        el('td', { text: r.topTool ? toolName(r.topTool) : '—' }),
      ]);
      return row;
    }),
  );
  $('#shelf').hidden = false;
}

function renderChips() {
  const fromShelf = (state.shelf?.repos || []).filter((r) => r.abv > 0).slice(0, 4).map((r) => r.repo);
  const examples = fromShelf.length >= 3 ? fromShelf : FALLBACK_EXAMPLES;
  $('#example-chips').replaceChildren(
    ...examples.map((repo) => el('button', { type: 'button', class: 'chip', 'data-repo': repo, text: repo })),
  );
}

// ── Actions ───────────────────────────────────────────────────────────────────

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function svgToPng(svg, scale = 2) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1200 * scale;
    canvas.height = 630 * scale;
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fileStem() {
  return `abv-${state.repo.replace('/', '-')}`;
}

function flash(button, text) {
  const original = button.textContent;
  button.textContent = text;
  setTimeout(() => {
    button.textContent = original;
  }, 1400);
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    if (button) flash(button, tx('copied'));
  } catch {
    window.prompt(tx('copy'), text);
  }
}

function shareUrl() {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('repo', state.repo);
  if (state.depth !== 1000) url.searchParams.set('depth', String(state.depth));
  return url.toString();
}

// ── Pouring ───────────────────────────────────────────────────────────────────

function cacheKey(repo, depth) {
  return `abv:report:${repo.toLowerCase()}:${depth}`;
}

async function pour(repoInput, { depth = state.depth, updateUrl = true } = {}) {
  const repo = parseRepo(repoInput);
  if (!repo) {
    setStatus(tx('errBad'), 'error');
    return;
  }
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  state.repo = repo;
  state.depth = depth;
  $('#repo-input').value = repo;
  $('#depth-select').value = String(depth);
  const button = $('#pour-button');
  button.disabled = true;

  try {
    let report = null;
    const cached = storageGet('sessionStorage', cacheKey(repo, depth));
    if (cached) {
      try {
        const entry = JSON.parse(cached);
        if (Date.now() - entry.at < CACHE_MINUTES * 60000) report = entry.report;
      } catch {
        /* ignore a corrupt cache entry */
      }
    }

    let rateLeft = null;
    if (!report) {
      setStatus(tx('distilling', { n: 0 }));
      const commits = await fetchCommits(repo, depth, {
        token: ($('#token-input').value || '').trim() || undefined,
        signal: controller.signal,
        onProgress: (n) => setStatus(tx('distilling', { n: formatInt(n) })),
        onRate: (n) => {
          rateLeft = n;
        },
      });
      if (commits.length === 0) throw new ApiError('empty');
      report = analyzeCommits(repo, commits);
      storageSet('sessionStorage', cacheKey(repo, depth), JSON.stringify({ at: Date.now(), report }));
    }

    state.report = report;
    renderResult();
    setStatus(rateLeft != null && rateLeft < 20 ? tx('rateLeft', { n: rateLeft }) : '');
    if (updateUrl) window.history.replaceState(null, '', shareUrl());
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    if (err instanceof ApiError) {
      if (err.kind === 'rate') {
        const time = err.detail.reset ? new Date(err.detail.reset * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '…';
        setStatus(tx('errRate', { time }), 'error');
        $('.token').open = true;
      } else if (err.kind === 'notFound') setStatus(tx('errNotFound'), 'error');
      else if (err.kind === 'empty') setStatus(tx('errEmpty'), 'error');
      else if (err.kind === 'network') setStatus(tx('errNetwork'), 'error');
      else setStatus(tx('errOther', { status: err.detail.status ?? '?' }), 'error');
    } else {
      setStatus(String(err && err.message ? err.message : err), 'error');
      throw err;
    }
  } finally {
    if (state.controller === controller) button.disabled = false;
  }
}

// ── Wiring ────────────────────────────────────────────────────────────────────

function init() {
  $('#github-link').href = `https://github.com/${PROJECT}`;
  const savedToken = storageGet('sessionStorage', 'abv-token');
  if (savedToken) $('#token-input').value = savedToken;
  $('#token-input').addEventListener('change', (e) => storageSet('sessionStorage', 'abv-token', e.target.value.trim()));

  applyText();
  renderChips();

  $('#pour-form').addEventListener('submit', (e) => {
    e.preventDefault();
    pour($('#repo-input').value, { depth: Number($('#depth-select').value) || 1000 });
  });

  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-repo]');
    if (target) {
      pour(target.dataset.repo);
      return;
    }
    const copyButton = e.target.closest('[data-copy]');
    if (copyButton) copyText($(copyButton.dataset.copy).textContent, copyButton);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const row = e.target.closest('tr[data-repo]');
    if (row) pour(row.dataset.repo);
  });

  $('#lang-toggle').addEventListener('click', () => {
    state.lang = state.lang === 'zh' ? 'en' : 'zh';
    storageSet('localStorage', 'abv-lang', state.lang);
    applyText();
    renderShelf();
    renderResult();
  });
  $('#theme-toggle').addEventListener('click', () => {
    state.theme = state.theme === 'paper' ? 'night' : 'paper';
    applyText();
    renderResult();
  });
  $('#download-svg').addEventListener('click', () => {
    download(new Blob([currentSvg()], { type: 'image/svg+xml' }), `${fileStem()}.svg`);
  });
  $('#download-png').addEventListener('click', async () => {
    const blob = await svgToPng(currentSvg());
    if (blob) download(blob, `${fileStem()}.png`);
  });
  $('#download-badge').addEventListener('click', () => {
    download(new Blob([renderBadge(state.report, { lang: state.lang })], { type: 'image/svg+xml' }), 'abv-badge.svg');
  });
  $('#copy-link').addEventListener('click', (e) => copyText(shareUrl(), e.currentTarget));

  fetch('data/top-shelf.json')
    .then((res) => (res.ok ? res.json() : null))
    .then((shelf) => {
      if (!shelf) return;
      state.shelf = shelf;
      renderShelf();
      renderChips();
    })
    .catch(() => {});

  const params = new URLSearchParams(window.location.search);
  const repoParam = params.get('repo');
  if (repoParam) {
    const depth = [300, 1000, 3000].includes(Number(params.get('depth'))) ? Number(params.get('depth')) : 1000;
    pour(repoParam, { depth, updateUrl: false });
  }
}

if (inBrowser) init();
