'use strict';

(function installMoveOverlay(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChessMoveOverlay = api;
})(typeof globalThis === 'object' ? globalThis : this, function createMoveOverlay() {
  const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/i;
  const WEIGHT = Object.freeze({ thin: 6, normal: 10, bold: 14 });
  const SQUARE_STROKE = Object.freeze({ thin: 3, normal: 5, bold: 8 });

  function squareCenter(square, flipped = false) {
    if (!/^[a-h][1-8]$/.test(square || '')) return null;
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]);
    return {
      x: ((flipped ? 7 - file : file) + 0.5) * 100,
      y: ((flipped ? rank - 1 : 8 - rank) + 0.5) * 100
    };
  }

  function squareMarkup(center, color, opacity, weight) {
    const x = center.x - 50;
    const y = center.y - 50;
    const strokeWidth = SQUARE_STROKE[weight] || SQUARE_STROKE.normal;
    return `<rect x="${x}" y="${y}" width="100" height="100" rx="7" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="${strokeWidth}" stroke-opacity=".95"/>`;
  }

  function arrowMarkup(from, to, color, weight) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const startX = from.x + (dx / length) * 20;
    const startY = from.y + (dy / length) * 20;
    const endX = to.x - (dx / length) * 25;
    const endY = to.y - (dy / length) * 25;
    const width = WEIGHT[weight] || WEIGHT.normal;
    const markerId = 'cc-best-arrow-head';

    return `<defs><marker id="${markerId}" markerWidth="30" markerHeight="30" viewBox="0 0 10 10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker></defs><circle cx="${from.x}" cy="${from.y}" r="20" fill="${color}" fill-opacity=".2"/><path d="M ${startX} ${startY} L ${endX} ${endY}" fill="none" stroke="#111827" stroke-width="${width + 7}" stroke-linecap="round" opacity=".62"/><path d="M ${startX} ${startY} L ${endX} ${endY}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" marker-end="url(#${markerId})" opacity=".97"/>`;
  }

  function renderMove(move, flipped = false, rawSettings = {}) {
    if (!UCI_MOVE.test(move || '')) return '';
    const settings = globalThis.ChessVisualSettings
      ? globalThis.ChessVisualSettings.normalizeSettings(rawSettings)
      : {
          displayMode: ['arrow', 'squares', 'both'].includes(rawSettings.displayMode) ? rawSettings.displayMode : 'arrow',
          color: /^#[\da-f]{6}$/i.test(rawSettings.color || '') ? rawSettings.color.toLowerCase() : '#a3e635',
          lineWeight: ['thin', 'normal', 'bold'].includes(rawSettings.lineWeight) ? rawSettings.lineWeight : 'normal'
        };
    const from = squareCenter(move.slice(0, 2), flipped);
    const to = squareCenter(move.slice(2, 4), flipped);
    if (!from || !to || (from.x === to.x && from.y === to.y)) return '';

    const parts = [];
    if (settings.displayMode === 'squares' || settings.displayMode === 'both') {
      parts.push(squareMarkup(from, settings.color, '.24', settings.lineWeight));
      parts.push(squareMarkup(to, settings.color, '.45', settings.lineWeight));
    }
    if (settings.displayMode === 'arrow' || settings.displayMode === 'both') {
      parts.push(arrowMarkup(from, to, settings.color, settings.lineWeight));
    }
    return parts.join('');
  }

  return Object.freeze({ renderMove, squareCenter, UCI_MOVE });
});
