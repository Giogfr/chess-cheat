'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const timer = require('../think-timer.js');

test('formats elapsed positions below one minute', () => {
  assert.equal(timer.formatElapsed(0), '00:00');
  assert.equal(timer.formatElapsed(999), '00:00');
  assert.equal(timer.formatElapsed(9_000), '00:09');
  assert.equal(timer.formatElapsed(59_999), '00:59');
});

test('formats minutes and hours without wrapping elapsed time', () => {
  assert.equal(timer.formatElapsed(60_000), '01:00');
  assert.equal(timer.formatElapsed(3_661_000), '1:01:01');
  assert.equal(timer.formatElapsed(7_200_000), '2:00:00');
});

test('invalid and negative durations are treated as zero', () => {
  assert.equal(timer.formatElapsed(-1), '00:00');
  assert.equal(timer.formatElapsed(Number.NaN), '00:00');
  assert.equal(timer.formatElapsed(Number.POSITIVE_INFINITY), '00:00');
});

test('formatRemaining rounds up positive milliseconds to whole seconds and handles zero', () => {
  assert.equal(timer.formatRemaining(0), '00:00');
  assert.equal(timer.formatRemaining(1), '00:01');
  assert.equal(timer.formatRemaining(999), '00:01');
  assert.equal(timer.formatRemaining(1000), '00:01');
  assert.equal(timer.formatRemaining(1001), '00:02');
  assert.equal(timer.formatRemaining(8000), '00:08');
  assert.equal(timer.formatRemaining(60000), '01:00');
  assert.equal(timer.formatRemaining(-100), '00:00');
});

test('counts pieces from placement string accurately', () => {
  assert.equal(timer.countPieces('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'), 32);
  assert.equal(timer.countPieces('8/8/8/4k3/8/8/4K3/8'), 2);
  assert.equal(timer.countPieces(''), 0);
  assert.equal(timer.countPieces(null), 0);
});

test('estimates realistic human think time within 2s to 40s', () => {
  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
  const midgameFen = 'r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R';

  // Opening move (ply 0–2 on start position) — should be at minimum, 2s.
  const startMs = timer.estimateThinkTime({ placement: startFen, ply: 0 });
  assert.ok(startMs >= 2000 && startMs <= 4000, `Expected opening time 2–4s, got ${startMs}ms`);

  // Early development on a non-starting position (ply 6) — 4–8s.
  const earlyMs = timer.estimateThinkTime({ placement: midgameFen, ply: 6 });
  assert.ok(earlyMs >= 3000 && earlyMs <= 9000, `Expected early dev 3–9s, got ${earlyMs}ms`);

  // Middlegame (ply 22) — 8–25s.
  const midgameMs = timer.estimateThinkTime({ placement: midgameFen, ply: 22 });
  assert.ok(midgameMs >= 8000 && midgameMs <= 25000, `Expected middlegame 8–25s, got ${midgameMs}ms`);

  // Recapture — always fast, 2–5s.
  const recaptureMs = timer.estimateThinkTime({ placement: midgameFen, ply: 22, isRecapture: true });
  assert.ok(recaptureMs >= 2000 && recaptureMs <= 5000, `Expected recapture 2–5s, got ${recaptureMs}ms`);

  // Mate in 1 — quick, 2–7s.
  const mate1Ms = timer.estimateThinkTime({ placement: midgameFen, ply: 25, mate: 1 });
  assert.ok(mate1Ms >= 2000 && mate1Ms <= 7000, `Expected mate in 1 time 2–7s, got ${mate1Ms}ms`);

  // Never exceeds 40s.
  const maxMs = timer.estimateThinkTime({ placement: midgameFen, ply: 50, mate: 8 });
  assert.ok(maxMs <= 40000, `Expected max 40s, got ${maxMs}ms`);

  // Always at least 2s.
  const minMs = timer.estimateThinkTime({ placement: startFen, ply: 0, isRecapture: true });
  assert.ok(minMs >= 2000, `Expected min 2s, got ${minMs}ms`);

  // Consistent/deterministic for the same input position.
  const repeatMs = timer.estimateThinkTime({ placement: midgameFen, ply: 22 });
  assert.equal(repeatMs, midgameMs);
});
