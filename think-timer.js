'use strict';

// Loaded before content.js in both the browser (as a plain script) and in unit
// tests (via require()). The UMD wrapper keeps the module self-contained while
// exposing a frozen API under window.ChessThinkTimer.
(function installThinkTimer(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChessThinkTimer = api;
})(typeof globalThis === 'object' ? globalThis : this, function createThinkTimer() {

  const MIN_SECONDS = 2;
  const MAX_SECONDS = 30;

  // Count material on the board from a FEN placement string.
  function countPieces(placement) {
    let n = 0;
    for (const ch of placement || '') {
      if (/[prnbqkPRNBQK]/.test(ch)) n += 1;
    }
    return n;
  }

  // Cheap position hash used to seed per-position jitter.
  // Same position always yields the same think time; adjacent moves vary naturally.
  function hashPlacement(placement) {
    let h = 0;
    for (let i = 0; i < (placement || '').length; i += 1) {
      h = (h * 31 + placement.charCodeAt(i)) | 0;
    }
    return h;
  }

  // Estimate how long a typical online player would spend on this move.
  // Returns milliseconds. Inputs:
  //   placement   FEN piece-placement string (required)
  //   ply         half-move count since game start (optional)
  //   isRecapture true when the previous move was a capture (reflex response)
  //   isCastling  true when this is a castling move (pre-planned)
  //   isCheck     true when the player must respond to a check
  //   mate        engine mate score (positive = player wins, negative = player loses)
  function estimateThinkTime(input) {
    const opts = (typeof input === 'string') ? { placement: input } : (input || {});
    const placement = opts.placement || '';
    const pieces = countPieces(placement);
    const ply = Number.isInteger(opts.ply) ? Math.max(0, opts.ply) : null;
    const isOpening = placement.startsWith('rnbqkbnr/pppppppp/');

    // Base think time derived from game phase.
    let base;
    if (isOpening || (ply !== null && ply <= 2)) {
      // Pure book territory — near-instant.
      base = 2;
    } else if (ply !== null && ply <= 8) {
      // Early development: each half-move adds a little deliberation.
      base = 2 + (ply - 2) * 0.4;         // 2s → ~4.4s
    } else if (ply !== null && ply <= 20) {
      // Transition and middlegame entry.
      base = 4 + (ply - 8) * 0.5;         // 4s → ~10s
    } else if (ply !== null && ply <= 40) {
      // Complex middlegame — tactical calculation peaks here.
      base = 9 + Math.min(9, (ply - 20) * 0.45); // 9s → ~18s
    } else if (ply !== null) {
      // Late game: fewer pieces, simpler patterns.
      base = pieces <= 8 ? 6 : pieces <= 14 ? 9 : 12;
    } else {
      // No ply information — use piece density as a rough proxy.
      if (pieces >= 28) base = 3;
      else if (pieces >= 20) base = 7;
      else if (pieces >= 10) base = 11;
      else base = 7;
    }

    // Situational modifiers — apply only the most significant one.
    if (opts.isCastling) {
      // Castling is almost always planned ahead; the execution is quick.
      base = Math.min(base * 0.45, 6);
    } else if (opts.isRecapture) {
      // Recaptures are near-reflex — the direction is obvious.
      base = Math.min(base * 0.30, 4);
    } else if (opts.isCheck) {
      // The king is in check; options are limited, focus is high.
      base = Math.min(base * 0.45, 6);
    } else if (opts.mate != null) {
      if (Math.abs(opts.mate) === 1) {
        // Mate in one is quick once spotted.
        base = Math.min(base * 0.4, 5);
      } else if (Math.abs(opts.mate) <= 3) {
        // Short forced sequence; still needs verification.
        base = Math.max(base, 8);
      } else {
        // Longer combination — requires careful calculation.
        base = Math.max(base, 14);
      }
    }

    // ±8% deterministic jitter keeps consecutive moves from feeling robotic
    // while ensuring the same position always produces the same suggestion.
    const jitter = 0.92 + ((Math.abs(hashPlacement(placement)) % 1000) / 1000) * 0.16;
    const seconds = Math.round(Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, base * jitter)));
    return seconds * 1000;
  }

  // Format a duration in milliseconds as MM:SS (or H:MM:SS for anything over an hour).
  function formatElapsed(ms) {
    const safe = Number.isFinite(ms) ? Math.max(0, ms) : 0;
    const total = Math.floor(safe / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  // Like formatElapsed but rounds up to the next whole second so the display
  // reads "00:08" for anything between 7001 ms and 8000 ms.
  function formatRemaining(ms) {
    const safe = Number.isFinite(ms) ? Math.max(0, ms) : 0;
    return formatElapsed(Math.ceil(safe / 1000) * 1000);
  }

  return Object.freeze({ estimateThinkTime, formatElapsed, formatRemaining, countPieces });
});
