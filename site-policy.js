'use strict';

(function installChessSitePolicy(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChessSitePolicy = api;
})(typeof globalThis === 'object' ? globalThis : this, function createChessSitePolicy() {
  const CHESS_COM_HOSTS = new Set(['chess.com', 'www.chess.com']);
  const LICHESS_HOSTS = new Set(['lichess.org', 'www.lichess.org']);
  const KNOWN_CHESS_HOSTS = new Set([...CHESS_COM_HOSTS, ...LICHESS_HOSTS]);
  const PRACTICE_SEGMENT = /(?:^|\/)(?:analysis|study|practice|training|puzzle|puzzles|editor|computer|bot|learn|lesson|lessons|opening)(?:[-_][a-z0-9]+)*(?:\/|$)/i;

  function parseWebUrl(value) {
    let url;
    try { url = new URL(value); } catch { return null; }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin === 'null') return null;
    return url;
  }

  function classifyUrl(value) {
    const url = parseWebUrl(value);
    if (!url) return 'blocked';

    const host = url.hostname.toLowerCase();
    const path = url.pathname.replace(/\/{2,}/g, '/');

    // Known chess domains are eligible on every HTTP(S) route. Whether analysis
    // can actually run still depends on finding a readable board and usable engine.
    if (KNOWN_CHESS_HOSTS.has(host)) return 'practice';

    // Recognized board routes on other sites can run without an extra approval;
    // unfamiliar routes need an explicit, per-origin approval.
    if (PRACTICE_SEGMENT.test(path)) return 'practice';
    return 'unknown';
  }

  function normalizedOrigins(value) {
    const list = Array.isArray(value) ? value : (value && typeof value[Symbol.iterator] === 'function' ? [...value] : []);
    if (!list.length) return [];
    return [...new Set(list.filter((origin) => typeof origin === 'string').map((origin) => {
      const url = parseWebUrl(origin);
      return url ? url.origin : '';
    }).filter(Boolean))];
  }

  function isOriginApproved(value, approvedOrigins) {
    const url = parseWebUrl(value);
    return Boolean(url && normalizedOrigins(approvedOrigins).includes(url.origin));
  }

  function canAnalyze(value, approvedOrigins = []) {
    const classification = classifyUrl(value);
    if (classification === 'practice') return true;
    if (classification === 'blocked') return false;
    return isOriginApproved(value, approvedOrigins);
  }

  function needsApproval(value, boardDetected, approvedOrigins = []) {
    return Boolean(boardDetected) && classifyUrl(value) === 'unknown' && !isOriginApproved(value, approvedOrigins);
  }

  return Object.freeze({ classifyUrl, normalizedOrigins, isOriginApproved, canAnalyze, needsApproval });
});
