'use strict';

(function installTurnDetection(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChessTurnDetection = api;
})(typeof globalThis === 'object' ? globalThis : this, function createTurnDetection() {
  const START_PLACEMENT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

  function parseFen(value) {
    if (typeof value !== 'string') return null;
    const fields = value.trim().split(/\s+/);
    if (fields.length !== 6 || !/^[wb]$/.test(fields[1])) return null;
    const ranks = fields[0].split('/');
    if (ranks.length !== 8) return null;

    let whiteKings = 0;
    let blackKings = 0;
    for (const rank of ranks) {
      let squares = 0;
      for (const token of rank) {
        if (/^[1-8]$/.test(token)) squares += Number(token);
        else if (/^[prnbqkPRNBQK]$/.test(token)) {
          squares += 1;
          if (token === 'K') whiteKings += 1;
          if (token === 'k') blackKings += 1;
        } else return null;
      }
      if (squares !== 8) return null;
    }
    if (whiteKings !== 1 || blackKings !== 1) return null;
    if (!/^(?:-|K?Q?k?q?)$/.test(fields[2])) return null;
    if (!/^(?:-|[a-h][36])$/.test(fields[3])) return null;
    if (fields[3] !== '-' && fields[3][1] !== (fields[1] === 'w' ? '6' : '3')) return null;
    if (!/^\d{1,4}$/.test(fields[4]) || !/^[1-9]\d{0,4}$/.test(fields[5])) return null;
    return { fen: fields.join(' '), placement: fields[0], turn: fields[1], fields };
  }

  function normalizeTurn(value) {
    if (typeof value !== 'string') return null;
    const token = value.trim().toLowerCase();
    if (['w', 'white', 'white-to-move', 'white to move'].includes(token)) return 'w';
    if (['b', 'black', 'black-to-move', 'black to move'].includes(token)) return 'b';
    return null;
  }

  function turnFromPlyCount(count) {
    if (!Number.isInteger(count) || count < 0) return null;
    return count % 2 === 0 ? 'w' : 'b';
  }

  function opposite(turn) {
    if (turn === 'w') return 'b';
    if (turn === 'b') return 'w';
    return null;
  }

  function pieceColor(piece) {
    if (typeof piece !== 'string' || !/^[prnbqk]$/i.test(piece)) return null;
    return piece === piece.toUpperCase() ? 'w' : 'b';
  }

  function inferTurnFromBoardChange(previousMap, currentMap) {
    if (!previousMap || !currentMap) return null;
    const squares = [];
    for (let rank = 1; rank <= 8; rank++) {
      for (const file of 'abcdefgh') squares.push(`${file}${rank}`);
    }

    const removed = squares.filter((square) => {
      const before = previousMap[square];
      const after = currentMap[square];
      return typeof before === 'string' && before !== '.' && after === '.';
    });
    const arrivals = squares.filter((square) => {
      const before = previousMap[square] || '.';
      const after = currentMap[square];
      return typeof after === 'string' && after !== '.' && after !== before;
    });
    const moverColors = new Set();

    for (const source of removed) {
      const color = pieceColor(previousMap[source]);
      if (!color) continue;
      if (arrivals.some((destination) => pieceColor(currentMap[destination]) === color)) {
        moverColors.add(color);
      }
    }

    if (moverColors.size !== 1) return null;
    return opposite([...moverColors][0]);
  }

  function inferTurn({ fen, clockTurn, moveListPly, highlightTurn, observedMoveTurn, trackedTurn, positionChanged, placement }) {
    const parsedFen = parseFen(fen);
    if (parsedFen) return { turn: parsedFen.turn, source: 'board-fen' };

    const clock = normalizeTurn(clockTurn);
    if (clock) return { turn: clock, source: 'clock' };

    const moveListTurn = turnFromPlyCount(moveListPly);
    if (moveListTurn) return { turn: moveListTurn, source: 'move-list' };

    const highlightedTurn = normalizeTurn(highlightTurn);
    if (highlightedTurn) return { turn: highlightedTurn, source: 'last-move-highlight' };

    const observedTurn = normalizeTurn(observedMoveTurn);
    if (observedTurn) return { turn: observedTurn, source: 'observed-board-change' };

    if (placement === START_PLACEMENT) return { turn: 'w', source: 'initial-position' };

    if (positionChanged && trackedTurn) {
      return { turn: opposite(trackedTurn), source: 'observed-move' };
    }
    if (trackedTurn) return { turn: trackedTurn, source: 'tracked' };
    return { turn: null, source: 'unknown' };
  }

  return Object.freeze({ parseFen, normalizeTurn, turnFromPlyCount, opposite, inferTurnFromBoardChange, inferTurn, START_PLACEMENT });
});
