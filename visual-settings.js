'use strict';

(function installVisualSettings(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChessVisualSettings = api;
})(typeof globalThis === 'object' ? globalThis : this, function createVisualSettings() {
  const DEFAULT_SETTINGS = Object.freeze({
    displayMode: 'arrow',
    color: '#a3e635',
    lineWeight: 'normal',
    showThinkTimer: true
  });
  const DISPLAY_MODES = new Set(['arrow', 'squares', 'both']);
  const LINE_WEIGHTS = new Set(['thin', 'normal', 'bold']);
  const COLOR_PATTERN = /^#[\da-f]{6}$/i;

  function normalizeSettings(value) {
    const input = value && typeof value === 'object' ? value : {};
    return {
      displayMode: DISPLAY_MODES.has(input.displayMode) ? input.displayMode : DEFAULT_SETTINGS.displayMode,
      color: typeof input.color === 'string' && COLOR_PATTERN.test(input.color)
        ? input.color.toLowerCase()
        : DEFAULT_SETTINGS.color,
      lineWeight: LINE_WEIGHTS.has(input.lineWeight) ? input.lineWeight : DEFAULT_SETTINGS.lineWeight,
      showThinkTimer: typeof input.showThinkTimer === 'boolean'
        ? input.showThinkTimer
        : DEFAULT_SETTINGS.showThinkTimer
    };
  }

  return Object.freeze({ DEFAULT_SETTINGS, normalizeSettings });
});
