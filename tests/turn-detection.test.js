'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const turns = require('../turn-detection.js');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BLACK_TO_MOVE = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

test('parses a valid full FEN and exposes side to move', () => {
  assert.equal(turns.parseFen(START_FEN).turn, 'w');
  assert.equal(turns.parseFen(BLACK_TO_MOVE).turn, 'b');
  assert.equal(turns.parseFen(START_FEN).placement, turns.START_PLACEMENT);
});

test('rejects incomplete or structurally invalid FEN values', () => {
  assert.equal(turns.parseFen('8/8/8/8/8/8/8/8 w - - 0 1'), null);
  assert.equal(turns.parseFen('not a fen'), null);
  assert.equal(turns.parseFen(START_FEN.replace(' w ', 'x')), null);
  assert.equal(turns.parseFen(BLACK_TO_MOVE.replace(' b ', ' w ')), null);
});

test('normalizes direct clock values without guessing from arbitrary text', () => {
  assert.equal(turns.normalizeTurn('White'), 'w');
  assert.equal(turns.normalizeTurn('b'), 'b');
  assert.equal(turns.normalizeTurn('white clock'), null);
  assert.equal(turns.normalizeTurn(''), null);
});

test('converts a move-list ply count to the next side to move', () => {
  assert.equal(turns.turnFromPlyCount(0), 'w');
  assert.equal(turns.turnFromPlyCount(1), 'b');
  assert.equal(turns.turnFromPlyCount(42), 'w');
  assert.equal(turns.turnFromPlyCount(43), 'b');
  assert.equal(turns.turnFromPlyCount(-1), null);
});

test('prefers the full board FEN when available', () => {
  const result = turns.inferTurn({ fen: BLACK_TO_MOVE, clockTurn: 'w', moveListPly: 0, trackedTurn: 'w' });
  assert.deepEqual(result, { turn: 'b', source: 'board-fen' });
});

test('uses a detected clock before move-list parity', () => {
  const result = turns.inferTurn({ clockTurn: 'black', moveListPly: 0, placement: 'midgame' });
  assert.deepEqual(result, { turn: 'b', source: 'clock' });
});

test('uses move-list parity when the clock selector is missing', () => {
  assert.deepEqual(turns.inferTurn({ moveListPly: 17, placement: 'midgame' }), { turn: 'b', source: 'move-list' });
  assert.deepEqual(turns.inferTurn({ moveListPly: 18, placement: 'midgame' }), { turn: 'w', source: 'move-list' });
});

test('tracks a single observed move when there is no clock or move list', () => {
  assert.deepEqual(turns.inferTurn({ trackedTurn: 'w', positionChanged: true, placement: 'midgame' }), { turn: 'b', source: 'observed-move' });
  assert.deepEqual(turns.inferTurn({ trackedTurn: 'b', positionChanged: true, placement: 'midgame' }), { turn: 'w', source: 'observed-move' });
});

test('uses White to move at the starting position but does not invent midgame history', () => {
  assert.deepEqual(turns.inferTurn({ placement: turns.START_PLACEMENT }), { turn: 'w', source: 'initial-position' });
  assert.deepEqual(turns.inferTurn({ placement: 'midgame' }), { turn: null, source: 'unknown' });
});


test('uses the last-move highlight fallback when no clock or move list exists', () => {
  assert.deepEqual(turns.inferTurn({ highlightTurn: 'b', placement: 'midgame' }), { turn: 'b', source: 'last-move-highlight' });
});

test('infers the next turn from a detected move when clocks and move lists are missing', () => {
  const before = Object.fromEntries('abcdefgh'.split('').flatMap((file) => Array.from({ length: 8 }, (_, index) => [`${file}${index + 1}`, '.'])));
  const after = { ...before };
  before.e2 = 'P';
  after.e4 = 'P';
  after.e2 = '.';
  assert.equal(turns.inferTurnFromBoardChange(before, after), 'b');
});

test('handles captures and promotions by matching the moving side, not the captured piece', () => {
  const before = Object.fromEntries('abcdefgh'.split('').flatMap((file) => Array.from({ length: 8 }, (_, index) => [`${file}${index + 1}`, '.'])));
  const after = { ...before };
  before.e5 = 'P';
  before.d6 = 'p';
  after.e5 = '.';
  after.d6 = 'P';
  assert.equal(turns.inferTurnFromBoardChange(before, after), 'b');

  const promotionBefore = { ...before, a7: 'P', d6: '.' };
  const promotionAfter = { ...promotionBefore, a7: '.', a8: 'Q' };
  assert.equal(turns.inferTurnFromBoardChange(promotionBefore, promotionAfter), 'b');
});

test('does not guess a mover when a board snapshot changes on both sides', () => {
  const before = Object.fromEntries('abcdefgh'.split('').flatMap((file) => Array.from({ length: 8 }, (_, index) => [`${file}${index + 1}`, '.'])));
  const after = { ...before };
  before.e2 = 'P';
  before.e7 = 'p';
  after.e2 = '.';
  after.e7 = '.';
  after.e4 = 'P';
  after.e5 = 'p';
  assert.equal(turns.inferTurnFromBoardChange(before, after), null);
});

test('prefers an observed piece move after the reliable turn sources are unavailable', () => {
  assert.deepEqual(turns.inferTurn({ observedMoveTurn: 'b', placement: 'midgame' }), {
    turn: 'b',
    source: 'observed-board-change'
  });
});
