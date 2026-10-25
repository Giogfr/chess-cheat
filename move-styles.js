'use strict';

(function installMoveStyles(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChessMoveStyles = api;
})(typeof globalThis === 'object' ? globalThis : this, function createMoveStyles() {
  const MAX_EVALUATION_LOSS = 65;
  const TEMPERATURE = 24;
  const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/i;

  function scoreValue(candidate) {
    if (Number.isFinite(candidate?.cp)) return candidate.cp;
    if (Number.isFinite(candidate?.mate)) {
      const distance = Math.min(Math.abs(candidate.mate), 200);
      return Math.sign(candidate.mate || 1) * (30000 - distance * 100);
    }
    return Number.NEGATIVE_INFINITY;
  }

  function choose(candidates, _style = 'human', _boardMap = {}, random = Math.random) {
    const valid = (Array.isArray(candidates) ? candidates : [])
      .filter((candidate) => candidate && UCI_MOVE.test(String(candidate.pv || '').trim().split(/\s+/)[0] || ''))
      .map((candidate) => ({
        ...candidate,
        uci: String(candidate.pv).trim().split(/\s+/)[0],
        value: scoreValue(candidate)
      }))
      .filter((candidate) => Number.isFinite(candidate.value))
      .sort((a, b) => b.value - a.value || (a.rank || 99) - (b.rank || 99));

    if (!valid.length) return null;
    const best = valid[0].value;
    const plausible = valid.filter((candidate) => best - candidate.value <= MAX_EVALUATION_LOSS);
    if (plausible.length === 1) return plausible[0];

    const topValue = plausible[0].value;
    const weights = plausible.map((candidate) => Math.exp((candidate.value - topValue) / TEMPERATURE));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const rawDraw = Number(random());
    let needle = Math.max(0, Math.min(0.999999999, Number.isFinite(rawDraw) ? rawDraw : 0)) * total;

    for (let index = 0; index < plausible.length; index += 1) {
      needle -= weights[index];
      if (needle <= 0) return plausible[index];
    }
    return plausible[0];
  }

  return Object.freeze({ choose, scoreValue, MAX_EVALUATION_LOSS });
});
