'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const commands = require('../engine-commands.js');

const startFen = 'position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const middleFen = 'position fen r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

test('allows the UCI handshake and supported bounded options', () => {
  for (const command of ['uci', 'isready', 'stop', 'quit', 'setoption name Skill Level value 8', 'setoption name MultiPV value 3', 'go depth 13', startFen]) {
    assert.equal(commands.isAllowed(command), true, command);
  }
});

test('accepts a valid mid-game FEN command', () => {
  assert.equal(commands.isAllowed(middleFen), true);
  assert.equal(commands.validFenCommand(middleFen), true);
});

test('rejects command injection and unsupported UCI features', () => {
  for (const command of [
    'go depth 13\nquit',
    'position fen x; quit',
    'setoption name Threads value 16',
    'setoption name MultiPV value 500',
    'go depth 99',
    'position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1',
    'position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 0'
  ]) {
    assert.equal(commands.isAllowed(command), false, command);
  }
});

test('rejects malformed ranks and positions with missing kings', () => {
  assert.equal(commands.validPlacement('8/8/8/8/8/8/8/8'), false);
  assert.equal(commands.validPlacement('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQ1BNR'), false);
  assert.equal(commands.validPlacement('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPPP/RNBQKBNR'), false);
});

test('rejects empty or incorrectly ordered castling rights', () => {
  const base = 'position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w';
  for (const rights of ['', 'qk', 'KK', 'KqQ']) {
    assert.equal(commands.isAllowed(`${base} ${rights} - 0 1`), false, rights || '(empty)');
  }
  assert.equal(commands.validCastling('KQkq'), true);
  assert.equal(commands.validCastling('Kq'), true);
  assert.equal(commands.validCastling('-'), true);
});

test('rejects impossible en-passant ranks for the side to move', () => {
  assert.equal(commands.isAllowed('position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e3 0 1'), false);
  assert.equal(commands.isAllowed('position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq e6 0 1'), false);
  assert.equal(commands.isAllowed('position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e6 0 1'), true);
  assert.equal(commands.isAllowed('position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq e3 0 1'), true);
});

test('rejects adjacent FEN digits within a rank', () => {
  assert.equal(commands.validPlacement('rnbqkbnr/pppppppp/44/8/8/8/PPPPPPPP/RNBQKBNR'), false);
});
