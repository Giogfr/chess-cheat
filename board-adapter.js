'use strict';

(function installChessBoardAdapter(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChessBoardAdapter = api;
})(typeof globalThis === 'object' ? globalThis : this, function createChessBoardAdapter() {
  const FILES = 'abcdefgh';
  const PIECE_NAMES = Object.freeze({ king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' });
  const UNICODE_PIECES = Object.freeze({
    '♔': 'K', '♕': 'Q', '♖': 'R', '♗': 'B', '♘': 'N', '♙': 'P',
    '♚': 'k', '♛': 'q', '♜': 'r', '♝': 'b', '♞': 'n', '♟': 'p'
  });
  const BOARD_SELECTOR = [
    'wc-chess-board', 'chess-board', 'cg-board', '[data-chessboard]', '[data-chess-board]', '[data-fen]', '[fen]', '[data-position-fen]', '[data-current-fen]',
    '[aria-label*="chess board" i]', '[aria-label*="chessboard" i]', '[aria-roledescription*="chess" i]', '[role="grid"][aria-label*="chess" i]', '.chessboard', '.chess-board',
    '[class*="chessboard" i]', '[class*="chess-board" i]', '[data-board]', '#board', '.board', '[id*="chessboard" i]', '[id*="chess-board" i]'
  ].join(',');
  const PIECE_SELECTOR = 'piece, .piece, [data-piece], [data-chess-piece], [data-role], [data-square], [data-coordinate], [class*="square-"], [aria-label], [title], img[alt], [class*="piece" i]';
  const GENERIC_SCAN_INTERVAL_MS = 2500;
  const GENERIC_SCAN_MAX_NODES = 8000;
  const GENERIC_SCAN_MAX_CANDIDATES = 160;
  let lastGenericScanAt = 0;
  let lastGenericRoot = null;
  let lastGenericResult = null;

  function classString(element) {
    if (!element) return '';
    if (typeof element.className === 'string') return element.className;
    return element.getAttribute?.('class') || '';
  }

  function parsePieceText(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const raw = value.trim();
    const token = raw.match(/(?:^|[^a-z])([wb])([prnbqk])(?:$|[^a-z])/i);
    if (token) return token[1].toLowerCase() === 'w' ? token[2].toUpperCase() : token[2].toLowerCase();
    const normalized = raw.toLowerCase().replace(/[_\s]+/g, '-');
    const color = /(?:^|[^a-z])white(?:$|[^a-z-])|^white-|(?:^|-)white(?:-|$)/i.test(normalized) || /^(?:w|white)[-:]?/i.test(normalized)
      ? 'w'
      : /(?:^|[^a-z])black(?:$|[^a-z-])|^black-|(?:^|-)black(?:-|$)/i.test(normalized) || /^(?:b|black)[-:]?/i.test(normalized)
        ? 'b' : null;
    const shorthand = normalized.match(/(?:^|[^a-z])([wb])[-_:]?([prnbqk])(?:$|[^a-z])/i);
    if (shorthand) return shorthand[1].toLowerCase() === 'w' ? shorthand[2].toUpperCase() : shorthand[2].toLowerCase();
    let kind = null;
    for (const [name, letter] of Object.entries(PIECE_NAMES)) {
      if (new RegExp(`(?:^|[- ])${name}(?:$|[- ])`, 'i').test(normalized) || new RegExp(`(?:^|[^a-z])${letter}(?:$|[^a-z])`, 'i').test(raw)) {
        kind = letter;
        break;
      }
    }
    if (color && kind) return color === 'w' ? kind.toUpperCase() : kind;
    for (const [glyph, piece] of Object.entries(UNICODE_PIECES)) if (raw.includes(glyph)) return piece;
    return null;
  }

  function parsePiece(element) {
    if (!element) return null;
    for (const attribute of ['data-piece', 'data-chess-piece', 'data-role', 'piece', 'aria-label', 'title', 'alt']) {
      const piece = parsePieceText(element.getAttribute?.(attribute) || '');
      if (piece) return piece;
    }
    const fromClass = parsePieceText(classString(element));
    if (fromClass) return fromClass;
    const text = (element.textContent || '').trim();
    if (text.length <= 4) return parsePieceText(text);
    return null;
  }

  function parseSquareText(value) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    const algebraic = text.match(/(?:^|[^a-z])([a-h][1-8])(?:$|[^a-z0-9])/i);
    if (algebraic) return algebraic[1].toLowerCase();
    const numeric = text.match(/(?:^|[\s_-])square-?([1-8])([1-8])(?:$|[\s_-])/i);
    if (numeric) return `${FILES[Number(numeric[1]) - 1]}${numeric[2]}`;
    const named = text.match(/(?:^|[\s_-])square-([a-h][1-8])(?:$|[\s_-])/i);
    if (named) return named[1].toLowerCase();
    return null;
  }

  function parseSquareAttributes(element) {
    for (const name of ['data-square', 'data-position', 'data-coordinate', 'data-coord', 'data-square-name', 'square']) {
      const square = parseSquareText(element?.getAttribute?.(name) || '');
      if (square) return square;
    }
    const file = element?.getAttribute?.('data-file');
    const rank = element?.getAttribute?.('data-rank');
    if (/^[a-h]$/i.test(file || '') && /^[1-8]$/.test(rank || '')) return `${file.toLowerCase()}${rank}`;
    return null;
  }

  function parseSquareTokens(element) {
    const square = parseSquareText(classString(element));
    if (square) return square;
    const tokens = [...(element?.classList || [])];
    for (const token of tokens) {
      const found = parseSquareText(token);
      if (found) return found;
    }
    return null;
  }

  function isFlipped(board) {
    for (let node = board, depth = 0; node && depth < 5; node = node.parentElement, depth += 1) {
      const classes = classString(node).toLowerCase();
      const orientation = (node.getAttribute?.('data-orientation') || node.getAttribute?.('orientation') || '').toLowerCase();
      if (orientation === 'black' || /(?:^|[\s_-])orientation-black(?:$|[\s_-])/.test(classes) || /(?:^|[\s_-])black-bottom(?:$|[\s_-])/.test(classes) || /(?:^|[\s_-])flipped(?:$|[\s_-])/.test(classes)) return true;
      if (orientation === 'white' || /(?:^|[\s_-])orientation-white(?:$|[\s_-])/.test(classes) || /(?:^|[\s_-])white-bottom(?:$|[\s_-])/.test(classes)) return false;
    }
    return false;
  }

  function squareFromRect(element, board) {
    const boardRect = board?.getBoundingClientRect?.();
    const pieceRect = element?.getBoundingClientRect?.();
    if (!boardRect || !pieceRect || boardRect.width < 100 || boardRect.height < 100 || pieceRect.width <= 0 || pieceRect.height <= 0) return null;
    const x = (pieceRect.left + pieceRect.width / 2 - boardRect.left) / boardRect.width;
    const y = (pieceRect.top + pieceRect.height / 2 - boardRect.top) / boardRect.height;
    if (x < -0.025 || x > 1.025 || y < -0.025 || y > 1.025) return null;
    const col = Math.max(0, Math.min(7, Math.floor(x * 8)));
    const row = Math.max(0, Math.min(7, Math.floor(y * 8)));
    if (isFlipped(board)) return `${FILES[7 - col]}${row + 1}`;
    return `${FILES[col]}${8 - row}`;
  }

  function resolveSquare(element, board) {
    for (let node = element, depth = 0; node && depth < 5; node = node.parentElement, depth += 1) {
      const attribute = parseSquareAttributes(node);
      if (attribute) return attribute;
      const token = parseSquareTokens(node);
      if (token) return token;
      if (node === board) break;
    }
    return squareFromRect(element, board);
  }

  function nodeVisible(element) {
    if (!element?.isConnected) return false;
    try {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    } catch { return true; }
  }

  function boundedDescendants(element, limit = 1200) {
    try { return [...(element?.querySelectorAll?.('*') || [])].slice(0, limit); }
    catch { return []; }
  }

  function geometry(element) {
    try {
      const rect = element?.getBoundingClientRect?.();
      if (!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
      const ratio = rect.width / rect.height;
      if (rect.width < 180 || rect.height < 180 || rect.width > 1800 || rect.height > 1800 || ratio < 0.76 || ratio > 1.32) return null;
      return { rect, ratio, area: rect.width * rect.height };
    } catch { return null; }
  }

  function exposesPositionApi(element) {
    const methods = ['getFen', 'getFEN', 'getPosition', 'getCurrentPosition', 'toFEN', 'toFen'];
    const properties = ['fen', 'currentFen', 'positionFen', 'currentPosition'];
    for (let node = element, depth = 0; node && depth < 4; node = node.parentElement, depth += 1) {
      for (const name of methods) {
        try { if (typeof node[name] === 'function') return true; } catch { /* Page getters may throw. */ }
      }
      for (const name of properties) {
        try {
          const value = node[name];
          if (typeof value === 'string' && value.trim().split(/\s+/).length === 6) return true;
          if (value && typeof value === 'object' && ['fen', 'FEN', 'positionFen', 'currentFen'].some((key) => typeof value[key] === 'string')) return true;
        } catch { /* Page getters may throw. */ }
      }
    }
    return false;
  }

  function candidateScore(element, genericNodes = null) {
    if (!nodeVisible(element)) return -Infinity;
    const shape = geometry(element);
    if (!shape) return -Infinity;
    const tag = (element.tagName || '').toLowerCase();
    const classes = classString(element).toLowerCase();
    let score = Math.min(24, shape.area / 26000);
    const explicitRoot = ['wc-chess-board', 'chess-board', 'cg-board'].includes(tag) ||
      /chess.?board|chessboard/.test(classes) || element.hasAttribute?.('data-chessboard') || element.hasAttribute?.('data-chess-board');
    if (['wc-chess-board', 'chess-board', 'cg-board'].includes(tag)) score += 85;
    if (/chess.?board|chessboard/.test(classes) || element.hasAttribute?.('data-chessboard') || element.hasAttribute?.('data-chess-board')) score += 45;
    if (['data-fen', 'fen', 'data-position', 'data-position-fen'].some((name) => element.hasAttribute?.(name))) score += 30;
    if (!explicitRoot) score += 12;

    let descendants = genericNodes;
    if (!descendants) {
      try { descendants = [...element.querySelectorAll(PIECE_SELECTOR)].slice(0, 240); }
      catch { descendants = []; }
    }
    // Fall back to all descendants so unnamed DOM boards with Unicode pieces or alt text are discoverable.
    if (descendants.length < 12) descendants = boundedDescendants(element, 1200);

    const occupiedSquares = new Set();
    let parsedPieces = 0;
    for (const node of descendants) {
      const piece = parsePiece(node);
      if (!piece) continue;
      parsedPieces += 1;
      const square = resolveSquare(node, element);
      if (square) occupiedSquares.add(square);
    }
    score += Math.min(44, parsedPieces * 2);
    score += Math.min(38, occupiedSquares.size * 2);
    if (occupiedSquares.size >= 8) score += 12;
    if (occupiedSquares.size >= 16) score += 12;

    // An eight-by-eight grid often exposes square coordinates even when its pieces are anonymous.
    let squareTokens = 0;
    try {
      for (const node of [...element.querySelectorAll('[data-square], [data-coordinate], [class*="square-"]')].slice(0, 80)) {
        if (parseSquareAttributes(node) || parseSquareTokens(node)) squareTokens += 1;
      }
    } catch { /* Generic grid evidence is optional. */ }
    score += Math.min(28, squareTokens / 2);
    let hasFen = false;
    for (let node = element, depth = 0; node && depth < 4; node = node.parentElement, depth += 1) {
      if (['data-fen', 'fen', 'data-position', 'data-position-fen', 'data-current-fen'].some((name) => node.hasAttribute?.(name))) { hasFen = true; break; }
    }
    const hasPositionApi = exposesPositionApi(element);
    if (hasPositionApi) score += 32;
    const hasBoardLabel = explicitRoot || element.hasAttribute?.('data-board') || element.getAttribute?.('role') === 'grid' && /chess|board/i.test(element.getAttribute?.('aria-label') || '');

    try {
      const children = element.children?.length || 0;
      if (children >= 8 && children <= 80) score += 5;
    } catch { /* Some test doubles do not expose children. */ }
    const hasMeaningfulEvidence = hasBoardLabel || hasFen || hasPositionApi || parsedPieces >= 2 || occupiedSquares.size >= 2 || squareTokens >= 8;
    return score >= (hasMeaningfulEvidence ? 35 : 50) ? score : -Infinity;
  }

  function findBoard(root = typeof document !== 'undefined' ? document : null) {
    if (!root?.querySelectorAll) return null;
    let candidates = [];
    try { candidates = [...root.querySelectorAll(BOARD_SELECTOR)]; } catch { return null; }
    const scored = candidates.map((element) => ({ element, score: candidateScore(element) }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort((a, b) => b.score - a.score);
    if (scored[0]) return scored[0].element;

    // Broad fallback for boards whose site uses no chess-specific class or custom element.
    // Cache the scan briefly because findBoard is also polled while a position is analyzed.
    const now = Date.now();
    if (root === lastGenericRoot && now - lastGenericScanAt < GENERIC_SCAN_INTERVAL_MS && (!lastGenericResult || lastGenericResult.isConnected !== false)) return lastGenericResult;
    lastGenericRoot = root;
    lastGenericScanAt = now;
    lastGenericResult = null;

    let all;
    try { all = [...root.querySelectorAll('*')].slice(0, GENERIC_SCAN_MAX_NODES); }
    catch { return null; }
    const geometries = [];
    for (const element of all) {
      const shape = geometry(element);
      if (!shape || !nodeVisible(element)) continue;
      geometries.push({ element, area: shape.area, ratioDelta: Math.abs(1 - shape.ratio) });
    }
    geometries.sort((a, b) => a.ratioDelta - b.ratioDelta || b.area - a.area);
    const shortlist = geometries.slice(0, GENERIC_SCAN_MAX_CANDIDATES);
    const genericScored = shortlist.map(({ element }) => {
      const nodes = boundedDescendants(element, 1200);
      return { element, score: candidateScore(element, nodes) };
    }).filter((entry) => Number.isFinite(entry.score));
    genericScored.sort((a, b) => b.score - a.score);

    // If scores tie, prefer the smaller square root: it is more likely to be the actual board
    // rather than a page wrapper that happens to contain it.
    genericScored.sort((a, b) => {
      const scoreDelta = b.score - a.score;
      if (Math.abs(scoreDelta) > 1) return scoreDelta;
      return (geometry(a.element)?.area || Infinity) - (geometry(b.element)?.area || Infinity);
    });
    lastGenericResult = genericScored[0]?.element || null;
    return lastGenericResult;
  }

  function readPieceMap(board) {
    const map = Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`${FILES[i % 8]}${Math.floor(i / 8) + 1}`, '.']));
    if (!board?.querySelectorAll) return map;
    const nodes = [];
    if (parsePiece(board)) nodes.push(board);
    try {
      nodes.push(...board.querySelectorAll(PIECE_SELECTOR));
      // Some sites use only anonymous divs with Unicode piece glyphs. Inspect the board subtree
      // as a fallback, bounded to keep large pages from causing an expensive DOM walk.
      const selectedPieces = nodes.reduce((count, node) => count + (parsePiece(node) ? 1 : 0), 0);
      if (selectedPieces < 12) nodes.push(...boundedDescendants(board, 1200));
    } catch { return map; }
    const seen = new Set();
    for (const node of nodes) {
      const piece = parsePiece(node);
      if (!piece) continue;
      const square = resolveSquare(node, board);
      if (!square || seen.has(`${square}:${piece}`)) continue;
      seen.add(`${square}:${piece}`);
      // If multiple layered nodes map to the same square, prefer the most explicit token.
      if (map[square] === '.' || /square|data-square|data-position/i.test(`${classString(node)} ${node.getAttribute?.('data-square') || ''}`)) map[square] = piece;
    }
    return map;
  }

  function placementFromMap(map) {
    const ranks = [];
    for (let rank = 8; rank >= 1; rank -= 1) {
      let row = '';
      let empty = 0;
      for (const file of FILES) {
        const piece = map[`${file}${rank}`] || '.';
        if (piece === '.') empty += 1;
        else {
          if (empty) row += String(empty);
          empty = 0;
          row += piece;
        }
      }
      if (empty) row += String(empty);
      ranks.push(row);
    }
    return ranks.join('/');
  }

  function validPieceMap(map) {
    const pieces = Object.values(map || {}).filter((piece) => piece && piece !== '.');
    return pieces.filter((piece) => piece === 'K').length === 1 && pieces.filter((piece) => piece === 'k').length === 1 && pieces.length >= 2;
  }

  function readFen(board, parseFen) {
    if (!board) return null;
    const nodes = [];
    for (let node = board, depth = 0; node && depth < 4; node = node.parentElement, depth += 1) nodes.push(node);
    for (const node of nodes) {
      for (const attribute of ['data-fen', 'fen', 'data-position-fen', 'data-position', 'data-current-fen']) {
        const value = node.getAttribute?.(attribute);
        const parsed = parseFen?.(value);
        if (parsed) return parsed;
      }
      for (const method of ['getFen', 'getFEN', 'getPosition', 'getCurrentPosition', 'toFEN', 'toFen']) {
        try {
          if (typeof node[method] === 'function') {
            const value = node[method]();
            if (typeof value === 'string') {
              const parsed = parseFen?.(value);
              if (parsed) return parsed;
            }
          }
        } catch { /* Site APIs are not standardized. */ }
      }
      for (const property of ['game', 'gameState', 'chessGame', 'position', 'currentPosition']) {
        try {
          const value = node[property];
          if (typeof value === 'string') {
            const parsed = parseFen?.(value);
            if (parsed) return parsed;
          } else if (value && typeof value === 'object') {
            for (const key of ['fen', 'FEN', 'positionFen', 'currentFen']) {
              const parsed = parseFen?.(value[key]);
              if (parsed) return parsed;
            }
            for (const method of ['getFen', 'getFEN', 'getPosition', 'getCurrentPosition', 'toFen', 'toFEN']) {
              try {
                if (typeof value[method] === 'function') {
                  const parsed = parseFen?.(value[method]());
                  if (parsed) return parsed;
                }
              } catch { /* Site APIs are not standardized. */ }
            }
          }
        } catch { /* Private state may be a getter that throws. */ }
      }
    }
    return null;
  }

  function readTurnHint(board, normalizeTurn) {
    for (let node = board, depth = 0; node && depth < 4; node = node.parentElement, depth += 1) {
      for (const name of ['data-turn', 'data-side-to-move', 'turn', 'data-player-to-move', 'data-active-color']) {
        const value = normalizeTurn?.(node.getAttribute?.(name) || '');
        if (value) return value;
      }
    }
    return null;
  }

  function highlightedSquares(board) {
    if (!board?.querySelectorAll) return [];
    const selectors = '.highlight, .last-move, .last-move-highlight, [class*="last-move" i], [data-last-move="true"], [data-highlight="last-move"]';
    let nodes = [];
    try { nodes = [...board.querySelectorAll(selectors)]; } catch { return []; }
    const result = new Set();
    for (const node of nodes) {
      const square = resolveSquare(node, board);
      if (square) result.add(square);
      for (let parent = node.parentElement, depth = 0; parent && parent !== board && depth < 3; parent = parent.parentElement, depth += 1) {
        const parentSquare = parseSquareAttributes(parent) || parseSquareTokens(parent);
        if (parentSquare) result.add(parentSquare);
      }
    }
    return [...result];
  }

  function kind(board) {
    if (!board) return 'none';
    const tag = (board.tagName || '').toLowerCase();
    const classes = classString(board).toLowerCase();
    if (tag === 'wc-chess-board' || tag === 'chess-board' || board.querySelector?.('.piece.square-11')) return 'chesscom-style';
    if (tag === 'cg-board' || board.closest?.('.cg-wrap') || /chessground|cg-board/.test(classes)) return 'chessground-style';
    if (board.hasAttribute?.('data-fen') || board.hasAttribute?.('fen') || board.hasAttribute?.('data-position')) return 'fen-exposed';
    return 'generic-dom';
  }

  return Object.freeze({
    BOARD_SELECTOR, PIECE_SELECTOR, parsePieceText, parsePiece, parseSquareText, parseSquareAttributes,
    parseSquareTokens, resolveSquare, isFlipped, findBoard, readPieceMap, placementFromMap,
    validPieceMap, readFen, readTurnHint, highlightedSquares, kind
  });
});
