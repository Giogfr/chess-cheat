'use strict';

(function installEngineCommands(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChessEngineCommands = api;
})(typeof globalThis === 'object' ? globalThis : this, function createEngineCommands() {
  const BASIC_COMMANDS = new Set(['uci', 'isready', 'stop', 'quit']);
  const PLACEMENT_RE = /^[rnbqkpRNBQKP1-8/]+$/;

  function validPlacement(placement) {
    const ranks = placement.split('/');
    if (ranks.length !== 8) return false;
    let whiteKings = 0;
    let blackKings = 0;

    for (const rank of ranks) {
      if (!rank || /[1-8]{2}/.test(rank)) return false;
      let squares = 0;
      for (const token of rank) {
        if (/^[1-8]$/.test(token)) {
          squares += Number(token);
        } else if (/^[rnbqkpRNBQKP]$/.test(token)) {
          squares += 1;
          if (token === 'K') whiteKings += 1;
          if (token === 'k') blackKings += 1;
        } else {
          return false;
        }
      }
      if (squares !== 8) return false;
    }

    return whiteKings === 1 && blackKings === 1;
  }

  function validCastling(castling) {
    if (castling === '-') return true;
    if (!castling || !/^[KQkq]+$/.test(castling)) return false;
    if (new Set(castling).size !== castling.length) return false;
    return [...castling].every((letter, index, letters) => 'KQkq'.indexOf(letter) > (index ? 'KQkq'.indexOf(letters[index - 1]) : -1));
  }

  function validFenCommand(command) {
    const fields = command.slice('position fen '.length).split(/\s+/);
    if (fields.length !== 6) return false;
    const [placement, turn, castling, enPassant, halfmove, fullmove] = fields;
    if (!PLACEMENT_RE.test(placement) || !validPlacement(placement)) return false;
    if (!/^[wb]$/.test(turn)) return false;
    if (!validCastling(castling)) return false;
    if (!/^(?:-|[a-h][36])$/.test(enPassant)) return false;
    if (enPassant !== '-' && enPassant[1] !== (turn === 'w' ? '6' : '3')) return false;
    if (!/^\d{1,4}$/.test(halfmove) || !/^[1-9]\d{0,4}$/.test(fullmove)) return false;
    return true;
  }

  function isAllowed(command) {
    if (typeof command !== 'string' || command.length > 220 || /[\r\n\0]/.test(command)) return false;
    if (BASIC_COMMANDS.has(command)) return true;
    if (/^position fen /.test(command)) return validFenCommand(command);

    let match = command.match(/^setoption name Skill Level value (\d{1,2})$/);
    if (match) return Number(match[1]) <= 20;

    match = command.match(/^setoption name MultiPV value (\d{1,2})$/);
    if (match) return Number(match[1]) >= 1 && Number(match[1]) <= 5;

    match = command.match(/^go depth (\d{1,2})$/);
    if (match) return Number(match[1]) >= 1 && Number(match[1]) <= 20;

    return false;
  }

  return Object.freeze({ isAllowed, validFenCommand, validPlacement, validCastling });
});
