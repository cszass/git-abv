/**
 * Programmatic API.
 *
 *   import { analyze, renderCard } from 'git-abv';
 *   const report = await analyze('.');
 *   console.log(report.abv, report.style);
 */

export { analyze, version } from './analyze.js';
export { createAggregator } from './core/aggregate.js';
export { renderBadge, badgeMarkdown } from './core/badge.js';
export { renderCard, THEMES } from './core/card.js';
export { classifyCommit, parseIdentity, parseTrailers } from './core/classify.js';
export { createExcluder, isDefaultExcluded } from './core/excludes.js';
export { styleName, styleTagline, tastingNotes } from './core/i18n.js';
export { TOOLS, describeSignatures, isAutomation, matchAiIdentity } from './core/signatures.js';
export { STYLES, proofFor, styleFor } from './core/styles.js';
export { renderExplain, renderReport, renderSuspects } from './render-terminal.js';
