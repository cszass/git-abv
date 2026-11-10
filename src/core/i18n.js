/**
 * Every user-facing string, in English and Simplified Chinese.
 * Pure data and string helpers, shared by the terminal report, the SVG label and the web app.
 */

import { ageBetween } from './format.js';
import { toolName } from './signatures.js';

export const LANGS = ['en', 'zh'];

const STRINGS = {
  en: {
    title: 'AI BY VOLUME',
    abvUnit: 'ABV',
    byVolume: 'By volume',
    byCommits: 'By commits',
    lately: 'Lately',
    aiLines: 'AI-signed lines',
    aiCommits: 'AI-signed commits',
    of: 'of',
    lastNDays: 'last {n} days',
    stronger: 'getting stronger',
    mellower: 'mellowing out',
    steady: 'holding steady',
    ingredients: 'INGREDIENTS',
    linesAdded: 'lines added',
    commitsUnit: 'commits',
    human: 'Human',
    bots: 'Bots',
    botsNote: 'dependency and CI bots. Not AI.',
    otherTools: 'Other AI',
    vintage: 'VINTAGE',
    sharePer_month: 'AI share per month',
    sharePer_quarter: 'AI share per quarter',
    sharePer_year: 'AI share per year',
    peak: 'peak',
    pourers: 'HEAVIEST POURERS',
    pourersNote: 'share of their own work that carries an AI signature',
    drivers: 'DESIGNATED DRIVERS',
    driversNote: 'no AI signatures at all',
    more: '+{n} more',
    firstPour: 'FIRST POUR',
    tastingNotes: 'TASTING NOTES',
    proof: '{n} proof',
    agentAuthored: '{n} of those commits were authored by an agent outright.',
    caveat:
      'Counts commits that say they had AI help: co-author trailers, agent authors, tool markers. Autocomplete and pasted chat answers leave no trace, so read this as a floor, not a verdict.',
    caveatShort: 'Measured from explicit git signatures. A floor, not a verdict.',
    commitsOnly: 'Line counts unavailable here, so ABV is measured by commits.',
    shareIt: 'Share it',
    badge: 'README badge',
    noCommits: 'No commits found in this range. Nothing to distill.',
    scanning: 'Distilling… {n} commits',
    distilledFrom: 'Distilled from {commits} commits',
    andLines: '{lines} lines',
    bottled: 'Bottled {date}',
    aged_years: 'Aged {n} years',
    aged_year: 'Aged 1 year',
    aged_months: 'Aged {n} months',
    aged_month: 'Aged 1 month',
    aged_days: 'Aged {n} days',
    aged_day: 'Aged 1 day',
    aged_fresh: 'Fresh from the still',
    byCommitsNote: 'by commits',
    byVolumeNote: 'by volume',
    wroteCard: 'Label written to {file}',
    wroteBadge: 'Badge written to {file}',
    explainTitle: 'WHY THESE COMMITS COUNT',
    signaturesTitle: 'SIGNATURES FOUND',
    suspectsTitle: 'SUSPECTS',
    suspectsNote: 'Bot-looking identities that are not in the signature database. Know one? Open a PR.',
    suspectsNone: 'No unrecognised bot-looking identities. Clean bar.',
    shallow: 'Heads up: this is a shallow clone, so only part of the history was measured. In CI, set fetch-depth: 0.',
    gateAbove: 'ABV {abv}% is above the allowed maximum of {limit}%.',
    gateBelow: 'ABV {abv}% is below the required minimum of {limit}%.',
    authored: 'authored',
    assisted: 'assisted',
  },
  zh: {
    title: '含 AI 量',
    abvUnit: 'ABV',
    byVolume: '按代码量',
    byCommits: '按提交数',
    lately: '近期',
    aiLines: 'AI 署名代码行',
    aiCommits: 'AI 署名提交',
    of: '/',
    lastNDays: '最近 {n} 天',
    stronger: '越来越烈',
    mellower: '越来越淡',
    steady: '基本持平',
    ingredients: '配料表',
    linesAdded: '新增行数',
    commitsUnit: '提交数',
    human: '人类',
    bots: '机器人',
    botsNote: '依赖更新、CI 等自动化账号，不算 AI',
    otherTools: '其他 AI',
    vintage: '年份',
    sharePer_month: '每月含 AI 量',
    sharePer_quarter: '每季度含 AI 量',
    sharePer_year: '每年含 AI 量',
    peak: '峰值',
    pourers: '倒酒最猛',
    pourersNote: '各自产出中带 AI 署名的比例',
    drivers: '代驾（滴酒不沾）',
    driversNote: '没有任何 AI 署名',
    more: '等 {n} 人',
    firstPour: '第一杯',
    tastingNotes: '品鉴笔记',
    proof: '{n} 度',
    agentAuthored: '其中 {n} 个提交由 Agent 直接署名为作者。',
    caveat:
      '只统计明确署名的 AI 参与：Co-authored-by、Agent 作者、工具标记。自动补全和从聊天窗口粘贴的代码不留痕迹，所以这是下限，不是定论。',
    caveatShort: '依据 git 中的明确署名测得。是下限，不是定论。',
    commitsOnly: '此处拿不到行数，含 AI 量按提交数计算。',
    shareIt: '晒一下',
    badge: 'README 徽章',
    noCommits: '这个范围内没有提交，无酒可蒸。',
    scanning: '蒸馏中… {n} 个提交',
    distilledFrom: '由 {commits} 个提交蒸馏而成',
    andLines: '{lines} 行代码',
    bottled: '装瓶于 {date}',
    aged_years: '陈酿 {n} 年',
    aged_year: '陈酿 1 年',
    aged_months: '陈酿 {n} 个月',
    aged_month: '陈酿 1 个月',
    aged_days: '陈酿 {n} 天',
    aged_day: '陈酿 1 天',
    aged_fresh: '刚出蒸馏器',
    byCommitsNote: '按提交数',
    byVolumeNote: '按代码量',
    wroteCard: '酒标已写入 {file}',
    wroteBadge: '徽章已写入 {file}',
    explainTitle: '这些提交为什么算数',
    signaturesTitle: '发现的签名',
    suspectsTitle: '嫌疑名单',
    suspectsNote: '看起来像机器人、但签名库里还没有的账号。认识的话，欢迎提 PR。',
    suspectsNone: '没有发现未识别的可疑账号。',
    shallow: '注意：这是浅克隆，只统计到部分历史。在 CI 里请设置 fetch-depth: 0。',
    gateAbove: '含 AI 量 {abv}% 高于允许的上限 {limit}%。',
    gateBelow: '含 AI 量 {abv}% 低于要求的下限 {limit}%。',
    authored: '直接提交',
    assisted: '协作',
  },
};

const STYLE_STRINGS = {
  en: {
    'alcohol-free': ['Alcohol-Free', "No AI signatures found. Hand-squeezed, or nobody's telling."],
    kombucha: ['Kombucha', 'May contain traces of AI.'],
    shandy: ['Shandy', 'Mostly lemonade, with a splash of AI.'],
    lager: ['Lager', 'Light and sessionable. Humans still do the heavy lifting.'],
    wine: ['Wine', 'A glass with dinner. AI is a regular at the table.'],
    port: ['Port', 'Fortified. The AI is doing real work now.'],
    whisky: ['Whisky', "Proper spirit. Sip, don't chug."],
    cask: ['Cask Strength', 'Uncut and unfiltered. Humans are the mixer.'],
    absinthe: ['Absinthe', 'The green fairy writes most of the code.'],
    rectified: ['Rectified Spirit', 'Nearly pure. Keep away from open flames and unreviewed PRs.'],
    'rocket-fuel': ['Rocket Fuel', 'Pure, uncut vibes. A human pressed Enter.'],
  },
  zh: {
    'alcohol-free': ['无醇', '没发现任何 AI 署名。纯手工，或者没人承认。'],
    kombucha: ['康普茶', '可能含有微量 AI。'],
    shandy: ['果啤', '基本是汽水，只兑了一点 AI。'],
    lager: ['啤酒', '清爽不上头，活儿主要还是人干的。'],
    wine: ['葡萄酒', '佐餐一杯刚刚好，AI 已是桌上常客。'],
    port: ['黄酒', '度数上来了，AI 开始干正事。'],
    whisky: ['威士忌', '正经烈酒，小口慢品。'],
    cask: ['高度白酒', '原浆不勾兑，人类只负责兑水。'],
    absinthe: ['烧刀子', '一口下去，代码大半是 AI 写的。'],
    rectified: ['生命之水', '接近纯酒精。远离明火，以及没人 review 的 PR。'],
    'rocket-fuel': ['火箭燃料', '纯 vibe，零添加。人类只负责按回车。'],
  },
};

export function normalizeLang(lang) {
  const l = String(lang || '').toLowerCase();
  if (l.startsWith('zh') || l === 'cn' || l === 'chinese') return 'zh';
  return 'en';
}

/** Look up a string and fill in `{placeholders}`. Falls back to English, then to the key. */
export function t(lang, key, vars) {
  const table = STRINGS[normalizeLang(lang)] || STRINGS.en;
  let s = table[key] ?? STRINGS.en[key] ?? key;
  if (vars) {
    s = s.replace(/\{(\w+)\}/g, (m, name) => (vars[name] != null ? String(vars[name]) : m));
  }
  return s;
}

export function styleName(lang, styleId) {
  const table = STYLE_STRINGS[normalizeLang(lang)] || STYLE_STRINGS.en;
  return (table[styleId] || STYLE_STRINGS.en[styleId] || [styleId])[0];
}

export function styleTagline(lang, styleId) {
  const table = STYLE_STRINGS[normalizeLang(lang)] || STYLE_STRINGS.en;
  return (table[styleId] || STYLE_STRINGS.en[styleId] || ['', ''])[1];
}

/** "Aged 3 years" / "陈酿 3 年", from the first to the last commit in the report. */
export function agedText(lang, report) {
  const { firstCommitTime: a, lastCommitTime: b } = report.range || {};
  if (a == null || b == null) return '';
  const age = ageBetween(a, b);
  if (age.years >= 1) return t(lang, age.years === 1 ? 'aged_year' : 'aged_years', { n: age.years });
  if (age.months >= 1) return t(lang, age.months === 1 ? 'aged_month' : 'aged_months', { n: age.months });
  if (age.days >= 1) return t(lang, age.days === 1 ? 'aged_day' : 'aged_days', { n: age.days });
  return t(lang, 'aged_fresh');
}

/** The human share of the headline metric, 0–100. */
export function humanShare(report) {
  const src = report.metric === 'lines' ? report.byLines : report.byCommits;
  return src.total > 0 ? (src.human / src.total) * 100 : 0;
}

/** -1, 0 or 1: is the recent window weaker, about the same, or stronger than the whole? */
export function trendOf(report) {
  if (!report.recent) return 0;
  const delta = report.recent.abv - report.abv;
  if (delta >= 5) return 1;
  if (delta <= -5) return -1;
  return 0;
}

/**
 * Sommelier mode. One sentence built from the top tools, the human share and the trend.
 * @param {object} report  a report from the aggregator
 * @param {string} lang
 */
export function tastingNotes(report, lang) {
  const l = normalizeLang(lang);
  // Only name a tool if you could actually taste it: at least a tenth of the leading one.
  const weight = (x) => (report.metric === 'lines' ? x.lines : x.commits) || 0;
  const all = (report.tools || []).filter((x) => weight(x) > 0 || x.share > 0);
  const lead = all.length > 0 ? weight(all[0]) : 0;
  const names = all
    .filter((x, i) => i === 0 || weight(x) >= lead * 0.1)
    .slice(0, 3)
    .map((x) => toolName(x.id));
  const human = humanShare(report);
  const trend = trendOf(report);

  if (l === 'zh') {
    if (names.length === 0) return '入口干净，带着咖啡、deadline 和人类手滑的味道。';
    let finish;
    if (human >= 70) finish = '人类的余韵悠长';
    else if (human >= 30) finish = '人类的余韵尚在';
    else if (human >= 5) finish = '人类的余韵很短';
    else finish = '几乎尝不出人类的味道';
    let s = `前调是浓郁的 ${names[0]}`;
    if (names[1]) s += `，中段带出 ${names[1]}`;
    if (names[2]) s += `，隐约一丝 ${names[2]}`;
    s += `，${finish}。`;
    if (trend > 0) s += '越陈越烈。';
    if (trend < 0) s += '越陈越柔。';
    return s;
  }

  if (names.length === 0) return 'Clean and dry. Notes of coffee, deadlines and honest human error.';
  let finish;
  if (human >= 70) finish = 'with a long human finish';
  else if (human >= 30) finish = 'with a balanced human finish';
  else if (human >= 5) finish = 'with a short human finish';
  else finish = 'and barely a trace of human';
  let s = `Bold ${names[0]} on the nose`;
  if (names[1]) s += `, ${names[1]} on the palate`;
  if (names[2]) s += `, a hint of ${names[2]}`;
  s += `, ${finish}.`;
  if (trend > 0) s += ' Getting stronger with age.';
  if (trend < 0) s += ' Mellowing with age.';
  return s;
}
