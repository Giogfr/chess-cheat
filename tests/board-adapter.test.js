'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const adapter = require('../board-adapter.js');

const START_PLACEMENT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

test('parses common short piece tokens, class names, and accessible piece labels', () => {
  assert.equal(adapter.parsePieceText('wP'), 'P');
  assert.equal(adapter.parsePieceText('bK'), 'k');
  assert.equal(adapter.parsePieceText('white king'), 'K');
  assert.equal(adapter.parsePieceText('black rook'), 'r');
  assert.equal(adapter.parsePieceText('piece white knight'), 'N');
  assert.equal(adapter.parsePieceText('♟'), 'p');
});

test('parses both numeric square classes and algebraic square attributes', () => {
  assert.equal(adapter.parseSquareText('square-11'), 'a1');
  assert.equal(adapter.parseSquareText('square-84'), 'h4');
  assert.equal(adapter.parseSquareText('square-e4'), 'e4');
  assert.equal(adapter.parseSquareText('e4'), 'e4');
  assert.equal(adapter.parseSquareText('not-a-square'), null);
});

test('converts a piece map to a placement FEN and validates both kings', () => {
  const map = {};
  for (const file of 'abcdefgh') for (let rank = 1; rank <= 8; rank += 1) map[`${file}${rank}`] = '.';
  const rows = START_PLACEMENT.split('/');
  rows.forEach((row, rowIndex) => {
    let file = 0;
    for (const token of row) {
      if (/^[1-8]$/.test(token)) file += Number(token);
      else map[`${'abcdefgh'[file++]}${8 - rowIndex}`] = token;
    }
  });
  assert.equal(adapter.placementFromMap(map), START_PLACEMENT);
  assert.equal(adapter.validPieceMap(map), true);
  map.e1 = '.';
  assert.equal(adapter.validPieceMap(map), false);
});

test('reads explicit Chess.com-style square tokens from generic piece nodes', () => {
  const pieces = [
    { className: 'piece wK square-51' },
    { className: 'piece bK square-41' },
    { className: 'piece wQ square-44' },
    { className: 'piece bP square-55' }
  ].map((properties) => ({
    ...properties,
    isConnected: true,
    textContent: '',
    classList: properties.className.split(/\s+/),
    getAttribute(name) { return name === 'class' ? this.className : null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1, height: 1 }; }
  }));
  const board = {
    tagName: 'DIV',
    querySelectorAll() { return pieces; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 800 }; }
  };
  const map = adapter.readPieceMap(board);
  assert.equal(map.e1, 'K');
  assert.equal(map.d1, 'k');
  assert.equal(map.d4, 'Q');
  assert.equal(map.e5, 'p');
});

test('names supported DOM board families and distinguishes orientation when exposed', () => {
  const board = {
    tagName: 'CG-BOARD',
    className: '',
    parentElement: { className: 'cg-wrap orientation-black', parentElement: null, getAttribute() { return null; } },
    getAttribute() { return null; },
    querySelector() { return null; }
  };
  assert.equal(adapter.kind(board), 'chessground-style');
  assert.equal(adapter.isFlipped(board), true);
  assert.equal(adapter.BOARD_SELECTOR.includes('cg-board'), true);
});

test('maps piece positions from element geometry for white and flipped board orientations', () => {
  const board = {
    className: '',
    parentElement: null,
    getAttribute() { return null; },
    getBoundingClientRect() { return { left: 100, top: 100, width: 800, height: 800 }; }
  };
  const piece = {
    className: 'piece white king',
    parentElement: null,
    getAttribute(name) { return name === 'class' ? this.className : null; },
    getBoundingClientRect() { return { left: 101, top: 801, width: 98, height: 98 }; }
  };
  assert.equal(adapter.resolveSquare(piece, board), 'a1');
  board.parentElement = { className: 'orientation-black', parentElement: null, getAttribute() { return null; } };
  assert.equal(adapter.resolveSquare(piece, board), 'h8');
});

test('reads FEN from generic board attributes and exposed page APIs', () => {
  const parse = (value) => typeof value === 'string' && value.split(/\s+/).length === 6 ? { fen: value.trim() } : null;
  const board = {
    parentElement: null,
    getAttribute(name) { return name === 'data-position' ? '8/8/8/8/8/8/4K3/7k w - - 0 1' : null; }
  };
  assert.deepEqual(adapter.readFen(board, parse), { fen: '8/8/8/8/8/8/4K3/7k w - - 0 1' });
  const apiBoard = { parentElement: null, getAttribute() { return null; }, getFen() { return '8/8/8/8/8/8/4K3/7k b - - 0 1'; } };
  assert.deepEqual(adapter.readFen(apiBoard, parse), { fen: '8/8/8/8/8/8/4K3/7k b - - 0 1' });
});

test('includes common generic board roots in the cross-site selector', () => {
  assert.match(adapter.BOARD_SELECTOR, /\[data-board\]/);
  assert.match(adapter.BOARD_SELECTOR, /#board/);
  assert.match(adapter.BOARD_SELECTOR, /\.chess-board/);
});


test('discovers an unclassified DOM board from rendered chess glyphs and geometry', () => {
  const glyphs = [
    { glyph: '♔', x: 50, y: 750 },
    { glyph: '♚', x: 50, y: 50 },
    { glyph: '♙', x: 150, y: 650 },
    { glyph: '♟', x: 150, y: 150 }
  ].map(({ glyph, x, y }) => ({
    isConnected: true,
    textContent: glyph,
    parentElement: null,
    getAttribute() { return null; },
    getBoundingClientRect() { return { left: x, top: y, width: 80, height: 80 }; }
  }));
  const board = {
    tagName: 'DIV',
    className: '',
    isConnected: true,
    parentElement: null,
    children: glyphs,
    hasAttribute() { return false; },
    getAttribute() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 800 }; },
    querySelectorAll(selector) {
      if (selector === '*') return glyphs;
      return [];
    }
  };
  const root = {
    querySelectorAll(selector) {
      if (selector === '*') return [board];
      return [];
    }
  };

  assert.equal(adapter.findBoard(root), board);
  const map = adapter.readPieceMap(board);
  assert.equal(map.a1, 'K');
  assert.equal(map.a8, 'k');
  assert.equal(map.b2, 'P');
  assert.equal(map.b7, 'p');
});

test('does not accept a generic square container without chess-position evidence', () => {
  const container = {
    tagName: 'DIV',
    className: '',
    isConnected: true,
    getAttribute() { return null; },
    hasAttribute() { return false; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 800 }; },
    querySelectorAll() { return []; }
  };
  const root = { querySelectorAll(selector) { return selector === '*' ? [container] : []; } };
  assert.equal(adapter.findBoard(root), null);
});


test('discovers a custom square element that exposes a position API', () => {
  const fen = '8/8/8/8/8/8/4K3/7k w - - 0 1';
  const board = {
    tagName: 'DIV', className: '', isConnected: true, parentElement: null,
    getAttribute() { return null; }, hasAttribute() { return false; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 600, height: 600 }; },
    getFen() { return fen; },
    querySelectorAll() { return []; }
  };
  const root = { querySelectorAll(selector) { return selector === '*' ? [board] : []; } };
  assert.equal(adapter.findBoard(root), board);
  assert.deepEqual(adapter.readFen(board, (value) => value === fen ? { fen, placement: fen.split(' ')[0] } : null), {
    fen, placement: fen.split(' ')[0]
  });
});

test('reads FEN from nested game objects exposing getPosition', () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
  const parse = (value) => value === fen ? { fen } : null;
  const board = {
    parentElement: null,
    getAttribute() { return null; },
    game: { getPosition() { return fen; } }
  };
  assert.deepEqual(adapter.readFen(board, parse), { fen });
});
