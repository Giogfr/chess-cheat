(() => {
  'use strict';

  const NS = 'CHESS_CHEAT';
  const ENABLED_KEY = 'enabled';
  const VISUAL_SETTINGS_KEY = 'visualSettings';
  const APPROVED_ORIGINS_KEY = 'approvedPracticeOrigins';
  const DEFAULT_ENABLED = true;
  const ENGINE_SKILL = 7;
  const DEFAULT_MULTIPV = 1;
  const MIN_DEPTH = 8;
  const MAX_DEPTH = 10;
  const START_PLACEMENT = window.ChessTurnDetection.START_PLACEMENT;

  const state = {
    enabled: DEFAULT_ENABLED,
    visualSettings: window.ChessVisualSettings.DEFAULT_SETTINGS,
    practicePage: false,
    approvedOrigins: [],
    boardKind: 'none',
    running: false,
    engineInjected: false,
    engineReady: false,
    board: null,
    svg: null,
    info: new Map(),
    recommendation: null,
    searchComplete: false,
    supportsSkillLevel: false,
    skillLevelMax: 20,
    appliedSkillLevel: null,
    supportsMultiPV: false,
    depth: MIN_DEPTH,
    multipv: DEFAULT_MULTIPV,
    fen: '',
    pageFen: '',
    positionRequestId: 0,
    pendingPositionRequestId: null,
    positionRequestTimer: null,
    boardMap: null,
    lastSentFen: '',
    lastBoardMap: null,
    castlingRights: null,
    enPassantSquare: '-',
    trackedTurn: null,
    searchBusy: false,
    stopRequested: false,
    pendingSearch: null,
    discardSearchResult: false,
    runToken: 0,
    observer: null,
    boardObserver: null,
    resizeObserver: null,
    thinkTimerElement: null,
    thinkTimerInterval: null,
    thinkTimerStartedAt: 0,
    thinkTimerTargetMs: 0,
    thinkTimerPosition: '',
    debounce: null,
    pollTimer: null,
    pageTimer: null,
    statusMessage: 'Ready to detect a chessboard.',
    lastPath: location.pathname,
    lastSearch: location.search
  };

  const MOVE_STYLE = 'human';

  function postMain(type, extra = {}) {
    window.postMessage({ namespace: NS, source: 'content', type, ...extra }, location.origin);
  }

  function clearPositionRequest() {
    if (state.positionRequestTimer) clearTimeout(state.positionRequestTimer);
    state.positionRequestTimer = null;
    state.pendingPositionRequestId = null;
    state.positionRequestId += 1;
  }

  function requestPagePosition() {
    if (!state.engineInjected || state.pendingPositionRequestId !== null) return;
    const requestId = ++state.positionRequestId;
    state.pendingPositionRequestId = requestId;
    state.positionRequestTimer = setTimeout(() => {
      if (state.pendingPositionRequestId === requestId) state.pendingPositionRequestId = null;
      state.positionRequestTimer = null;
    }, 500);
    postMain('READ_POSITION', { requestId });
  }

  function setStatus(message) {
    state.statusMessage = String(message || '');
  }

  function pageClassification() {
    return window.ChessSitePolicy?.classifyUrl(location.href) || 'unknown';
  }

  function practicePageForUrl(url) {
    return window.ChessSitePolicy?.classifyUrl(url) === 'practice';
  }

  function isPracticePage() {
    const localSmokeFixture = location.hostname === '127.0.0.1' && window.__CHESS_CHEAT_TEST_MODE__ === true;
    if (localSmokeFixture || practicePageForUrl(location.href)) return true;
    if (pageClassification() === 'blocked') return false;
    return Boolean(state.board?.isConnected && window.ChessSitePolicy?.isOriginApproved(location.href, state.approvedOrigins));
  }

  function getProfileLabel() {
    return 'Human-like';
  }

  function getBoard() {
    return window.ChessBoardAdapter?.findBoard(document) || null;
  }

  function parsePiece(element) {
    return window.ChessBoardAdapter?.parsePiece(element) || null;
  }

  function readBoardMap() {
    return window.ChessBoardAdapter?.readPieceMap(state.board) || {};
  }

  function placementFromMap(map) {
    return window.ChessBoardAdapter?.placementFromMap(map) || '';
  }

  function mapIsValid(map) {
    const pieces = Object.values(map).filter((piece) => piece && piece !== '.');
    return pieces.filter((piece) => piece === 'K').length === 1 &&
      pieces.filter((piece) => piece === 'k').length === 1 && pieces.length >= 2;
  }

  function sameMap(left, right) {
    if (!left || !right) return false;
    return Object.keys(left).every((square) => left[square] === right[square]);
  }

  function changedSquareCount(left, right) {
    if (!left || !right) return 64;
    return Object.keys(left).reduce((n, sq) => n + (left[sq] !== right[sq] ? 1 : 0), 0);
  }

  // Return true when the transition from prevMap to currMap looks like a castling move.
  // Castling changes exactly four squares: the king and its rook both relocate.
  function detectCastlingMove(prevMap, currMap) {
    if (!prevMap || !currMap) return false;
    let diffs = 0;
    for (const sq of Object.keys(prevMap)) {
      if (prevMap[sq] !== currMap[sq]) {
        diffs += 1;
        if (diffs > 4) return false;
      }
    }
    if (diffs !== 4) return false;
    return (
      (prevMap.e1 === 'K' && currMap.e1 !== 'K' &&
        ((prevMap.h1 === 'R' && currMap.h1 !== 'R') || (prevMap.a1 === 'R' && currMap.a1 !== 'R'))) ||
      (prevMap.e8 === 'k' && currMap.e8 !== 'k' &&
        ((prevMap.h8 === 'r' && currMap.h8 !== 'r') || (prevMap.a8 === 'r' && currMap.a8 !== 'r')))
    );
  }

  function inferCastlingRights(map) {
    let rights = '';
    if (map.e1 === 'K' && map.h1 === 'R') rights += 'K';
    if (map.e1 === 'K' && map.a1 === 'R') rights += 'Q';
    if (map.e8 === 'k' && map.h8 === 'r') rights += 'k';
    if (map.e8 === 'k' && map.a8 === 'r') rights += 'q';
    return rights || '-';
  }

  function updateMoveHistory(map, placement) {
    if (sameMap(state.lastBoardMap, map)) return;
    if (!state.lastBoardMap || placement === START_PLACEMENT) {
      // Rights cannot be reconstructed from piece placement alone in a mid-game position.
      state.castlingRights = placement === START_PLACEMENT ? 'KQkq' : '-';
      state.enPassantSquare = '-';
      state.lastBoardMap = { ...map };
      return;
    }

    const previous = state.lastBoardMap;
    const changed = changedSquareCount(previous, map);
    if (changed > 4) {
      state.castlingRights = placement === START_PLACEMENT ? 'KQkq' : '-';
      state.enPassantSquare = '-';
      state.lastBoardMap = { ...map };
      return;
    }

    let ep = '-';
    for (const file of 'abcdefgh') {
      if (previous[`${file}2`] === 'P' && map[`${file}2`] === '.' && map[`${file}4`] === 'P') ep = `${file}3`;
      if (previous[`${file}7`] === 'p' && map[`${file}7`] === '.' && map[`${file}5`] === 'p') ep = `${file}6`;
    }
    state.enPassantSquare = ep;

    let rights = state.castlingRights || inferCastlingRights(previous);
    const remove = (letters) => { for (const letter of letters) rights = rights.replace(letter, ''); };
    if (previous.e1 === 'K' && map.e1 !== 'K') remove('KQ');
    if (previous.e8 === 'k' && map.e8 !== 'k') remove('kq');
    if (previous.h1 === 'R' && map.h1 !== 'R') remove('K');
    if (previous.a1 === 'R' && map.a1 !== 'R') remove('Q');
    if (previous.h8 === 'r' && map.h8 !== 'r') remove('k');
    if (previous.a8 === 'r' && map.a8 !== 'r') remove('q');
    state.castlingRights = rights || '-';
    state.lastBoardMap = { ...map };
  }

  function readNativeFen() {
    return window.ChessBoardAdapter?.readFen(state.board, window.ChessTurnDetection.parseFen) || null;
  }

  function readColorFromNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
    const classText = typeof node.className === 'string'
      ? node.className
      : (node.getAttribute('class') || '');
    if (/(^|[\s_-])(?:clock-)?white(?:-clock)?($|[\s_-])/i.test(classText)) return 'w';
    if (/(^|[\s_-])(?:clock-)?black(?:-clock)?($|[\s_-])/i.test(classText)) return 'b';

    const attributes = ['data-color', 'data-player-color', 'data-side', 'data-turn', 'clock-color', 'data-player-side'];
    for (const name of attributes) {
      const value = window.ChessTurnDetection.normalizeTurn(node.getAttribute(name) || '');
      if (value) return value;
    }
    for (const name of ['aria-label', 'title']) {
      const value = node.getAttribute(name) || '';
      if (/\bwhite(?:'s)?\b/i.test(value)) return 'w';
      if (/\bblack(?:'s)?\b/i.test(value)) return 'b';
    }
    return null;
  }

  function detectClockTurn() {
    const directHint = window.ChessBoardAdapter?.readTurnHint(state.board, window.ChessTurnDetection.normalizeTurn);
    if (directHint) return directHint;
    const roots = [];
    let parent = state.board?.parentElement;
    for (let depth = 0; parent && depth < 5; depth++, parent = parent.parentElement) roots.push(parent);
    roots.push(document);

    const selector = '.clock-player-turn, [class*="clock-player-turn"], [aria-current="true"][class*="clock"]';
    for (const root of [...new Set(roots)]) {
      const activeNodes = [...root.querySelectorAll(selector)];
      for (const active of activeNodes) {
        let node = active;
        for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
          const turn = readColorFromNode(node);
          if (turn) return turn;
        }
      }
    }

    for (const attribute of ['data-turn', 'data-side-to-move', 'turn']) {
      const turn = window.ChessTurnDetection.normalizeTurn(state.board?.getAttribute(attribute) || '');
      if (turn) return turn;
    }
    return null;
  }

  function isInSideVariation(node, root) {
    for (let parent = node.parentElement; parent && parent !== root; parent = parent.parentElement) {
      const classes = typeof parent.className === 'string' ? parent.className : parent.getAttribute('class') || '';
      if (/variation|side-line|subline/i.test(classes)) return true;
    }
    return false;
  }

  function readMoveListPly() {
    const roots = [...document.querySelectorAll('wc-simple-move-list')];
    roots.push(...document.querySelectorAll('wc-move-list'));
    roots.push(...document.querySelectorAll('.vertical-move-list, .move-list, [class*="move-list"], .moves, .tview2, l4x, rm6'));
    for (const root of [...new Set(roots)]) {
      const allNodes = [...root.querySelectorAll('.node, [data-ply], u8t, move, [class*="move-text"]')];
      const nodes = [...new Set(allNodes)].filter((node) => !isInSideVariation(node, root));
      if (!nodes.length) continue;

      const active = nodes.find((node) => node.matches('.current, .active, .selected, [aria-current="true"], [data-current="true"]'));
      if (active) {
        const index = nodes.indexOf(active);
        if (index >= 0) return index + 1;
      }

      return nodes.length;
    }
    return null;
  }

  function detectTurnFromLastMove(map) {
    if (!state.board) return null;
    const squares = window.ChessBoardAdapter?.highlightedSquares(state.board) || [];
    const occupied = squares.map((square) => ({ square, piece: map[square] }))
      .filter((entry) => entry.piece && entry.piece !== '.');
    if (occupied.length !== 1) return null;
    return occupied[0].piece === occupied[0].piece.toUpperCase() ? 'b' : 'w';
  }

  function makeFen() {
    if (!state.board?.isConnected) return { error: 'Waiting for the chessboard to load.' };
    const map = readBoardMap();
    if (!mapIsValid(map)) return { error: 'Waiting for the board pieces to finish loading.' };

    const placement = placementFromMap(map);
    // Set boardMap now so updateThinkTimerPosition can compare the previous and
    // current maps when classifying the move (castling, recapture, etc.).
    state.boardMap = map;
    updateThinkTimerPosition(placement);
    const previousMap = state.lastBoardMap;
    const positionChanged = Boolean(previousMap && !sameMap(previousMap, map));
    const changed = positionChanged ? changedSquareCount(previousMap, map) : 0;
    const pageFen = window.ChessTurnDetection.parseFen(state.pageFen);
    const nativeFen = readNativeFen();
    const usableNativeFen = pageFen?.placement === placement
      ? pageFen.fen
      : nativeFen?.placement === placement ? nativeFen.fen : null;
    const clockTurn = detectClockTurn();
    const moveListPly = readMoveListPly();
    const highlightTurn = detectTurnFromLastMove(map);

    if (positionChanged && changed > 4 && !usableNativeFen && !clockTurn && !Number.isInteger(moveListPly) && !highlightTurn) {
      state.trackedTurn = null;
    }

    const observedMoveTurn = positionChanged && changed <= 4
      ? window.ChessTurnDetection.inferTurnFromBoardChange(previousMap, map)
      : null;
    const turnResult = window.ChessTurnDetection.inferTurn({
      fen: usableNativeFen,
      clockTurn,
      moveListPly,
      highlightTurn,
      observedMoveTurn,
      trackedTurn: state.trackedTurn,
      positionChanged: positionChanged && changed <= 4,
      placement
    });

    // Keep a snapshot even while the side to move is unknown. A later board move may
    // identify the mover's color without requiring a clock or move-list element.
    updateMoveHistory(map, placement);
    if (!turnResult.turn) {
      return { error: 'Waiting for whose turn it is. The extension will retry when the board or move list updates.' };
    }

    state.trackedTurn = turnResult.turn;

    if (usableNativeFen) return { fen: usableNativeFen, turn: turnResult.turn, map, source: turnResult.source };
    const rights = state.castlingRights || inferCastlingRights(map);
    let ep = state.enPassantSquare || '-';
    if (ep !== '-' && ep[1] !== (turnResult.turn === 'w' ? '6' : '3')) ep = '-';
    const halfmove = '0';
    const fullmove = String(Math.max(1, Math.floor((moveListPly || 0) / 2) + 1));
    return { fen: `${placement} ${turnResult.turn} ${rights} ${ep} ${halfmove} ${fullmove}`, turn: turnResult.turn, map, source: turnResult.source };
  }

  function updateOverlayBounds() {
    if (!state.svg?.isConnected || !state.board?.isConnected) return;
    const rect = state.board.getBoundingClientRect();
    state.svg.style.left = `${rect.left}px`;
    state.svg.style.top = `${rect.top}px`;
    state.svg.style.width = `${rect.width}px`;
    state.svg.style.height = `${rect.height}px`;
  }

  function thinkTimerIsEnabled() {
    return Boolean(state.visualSettings?.showThinkTimer && state.enabled && state.running &&
      state.practicePage && state.board?.isConnected && Boolean(state.thinkTimerPosition));
  }

  function removeThinkTimer() {
    if (state.thinkTimerInterval) clearInterval(state.thinkTimerInterval);
    state.thinkTimerInterval = null;
    state.thinkTimerElement?.remove();
    state.thinkTimerElement = null;
    state.thinkTimerStartedAt = 0;
    state.thinkTimerTargetMs = 0;
  }

  function updateThinkTimerBounds() {
    const timer = state.thinkTimerElement;
    if (!timer?.isConnected || !state.board?.isConnected) return;

    const rect = state.board.getBoundingClientRect();
    const width = Math.max(148, Math.round(timer.getBoundingClientRect().width || 148));
    const height = 30;
    const gap = 8;
    const margin = 8;
    let left;
    let top;

    if (rect.right + width + gap <= window.innerWidth - margin) {
      left = rect.right + gap;
      top = Math.max(margin, Math.min(window.innerHeight - height - margin, rect.top));
    } else if (rect.left - width - gap >= margin) {
      left = rect.left - width - gap;
      top = Math.max(margin, Math.min(window.innerHeight - height - margin, rect.top));
    } else if (rect.bottom + height + gap <= window.innerHeight - margin) {
      left = Math.min(Math.max(margin, rect.right - width), window.innerWidth - width - margin);
      top = rect.bottom + gap;
    } else {
      left = Math.min(Math.max(margin, rect.right - width), window.innerWidth - width - margin);
      top = Math.min(Math.max(margin, rect.top + margin), window.innerHeight - height - margin);
    }

    timer.style.left = `${Math.round(left)}px`;
    timer.style.top = `${Math.round(top)}px`;
  }

  function renderThinkTimer() {
    if (!thinkTimerIsEnabled()) {
      removeThinkTimer();
      return;
    }

    if (!state.thinkTimerElement?.isConnected) {
      const timer = document.createElement('div');
      timer.className = 'cc-position-timer';
      timer.setAttribute('role', 'status');
      timer.setAttribute('aria-live', 'off');
      timer.setAttribute('aria-label', 'Recommended human thinking time on current position');
      timer.title = 'Recommended human thinking time for this position';
      timer.style.cssText = [
        'position:fixed',
        'z-index:2147483001',
        'min-width:148px',
        'height:30px',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'padding:0 12px',
        'border:1px solid #3f4b60',
        'border-radius:8px',
        'background:rgba(12,18,32,.94)',
        'color:#f8fafc',
        'box-shadow:0 4px 16px rgba(0,0,0,.24)',
        'font:600 12px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        'font-variant-numeric:tabular-nums',
        'white-space:nowrap',
        'pointer-events:none',
        'user-select:none',
        'transition:border-color .2s ease,color .2s ease'
      ].join(';');
      (document.body || document.documentElement).appendChild(timer);
      state.thinkTimerElement = timer;
    }

    if (!state.thinkTimerStartedAt) state.thinkTimerStartedAt = Date.now();
    // Target is always set by updateThinkTimerPosition; only fall back if somehow unset.
    if (!state.thinkTimerTargetMs) state.thinkTimerTargetMs = 6000;

    const updateText = () => {
      if (!state.thinkTimerElement?.isConnected || !state.thinkTimerStartedAt) return;
      const targetMs = state.thinkTimerTargetMs || 6000;
      const elapsed = Date.now() - state.thinkTimerStartedAt;
      const remaining = Math.max(0, targetMs - elapsed);
      const isReady = remaining <= 0;
      const timeStr = window.ChessThinkTimer?.formatRemaining
        ? window.ChessThinkTimer.formatRemaining(remaining)
        : window.ChessThinkTimer.formatElapsed(remaining);

      state.thinkTimerElement.textContent = isReady
        ? `Position time · ${timeStr} (Ready)`
        : `Position time · ${timeStr}`;

      state.thinkTimerElement.style.borderColor = isReady ? '#22c55e' : '#3f4b60';
      state.thinkTimerElement.style.color = isReady ? '#4ade80' : '#f8fafc';
      const targetSec = Math.round(targetMs / 1000);
      const remSec = Math.ceil(remaining / 1000);
      state.thinkTimerElement.title = `Suggested human think time: ${targetSec}s · ${
        isReady ? 'Ready to play move!' : `${remSec}s remaining before move`
      }`;

      updateThinkTimerBounds();
    };

    updateText();
    if (!state.thinkTimerInterval) {
      state.thinkTimerInterval = setInterval(() => {
        if (!thinkTimerIsEnabled()) {
          removeThinkTimer();
          return;
        }
        if (!state.thinkTimerElement?.isConnected) {
          state.thinkTimerElement = null;
          renderThinkTimer();
          return;
        }
        updateText();
      }, 1000);
    }
  }

  function updateThinkTimerPosition(position) {
    if (!position) return;
    if (position !== state.thinkTimerPosition) {
      const prevMap = state.lastBoardMap;
      const currMap = state.boardMap;

      // Piece count comparison tells us whether a capture happened.
      const prevPieces = prevMap ? Object.values(prevMap).filter((p) => p && p !== '.').length : 0;
      const currPieces = currMap ? Object.values(currMap).filter((p) => p && p !== '.').length : 0;
      const isRecapture = prevPieces > 0 && currPieces < prevPieces;
      const isCastling = detectCastlingMove(prevMap, currMap);

      state.thinkTimerPosition = position;
      state.thinkTimerStartedAt = thinkTimerIsEnabled() ? Date.now() : 0;
      state.thinkTimerTargetMs = window.ChessThinkTimer?.estimateThinkTime
        ? window.ChessThinkTimer.estimateThinkTime({
            placement: position,
            ply: readMoveListPly(),
            isRecapture,
            isCastling,
            mate: state.recommendation?.mate ?? null
          })
        : 5000;
    }
    if (thinkTimerIsEnabled()) renderThinkTimer();
  }

  function ensureSvg() {
    if (!state.board) return;
    if (state.svg?.isConnected && state.svg.parentElement === document.body) {
      updateOverlayBounds();
      return;
    }
    state.svg?.remove();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('cc-analysis-arrow-layer');
    svg.setAttribute('viewBox', '0 0 800 800');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483000;overflow:visible;';
    (document.body || document.documentElement).appendChild(svg);
    state.svg = svg;
    updateOverlayBounds();
  }

  function renderArrows() {
    if (!state.board) return;
    ensureSvg();
    if (!state.svg) return;
    updateOverlayBounds();
    if (!state.running) {
      state.svg.replaceChildren();
      return;
    }
    const move = state.recommendation?.pv?.trim().split(/\s+/)[0] || '';
    const settings = window.ChessVisualSettings.normalizeSettings(state.visualSettings);
    const markup = window.ChessMoveOverlay.renderMove(move, window.ChessBoardAdapter?.isFlipped(state.board) || false, settings);
    state.svg.innerHTML = markup;
  }

  function adaptiveDepth(map) {
    const pieceCount = Object.values(map || {}).filter((piece) => piece && piece !== '.').length;
    if (pieceCount <= 8) return 10;
    if (pieceCount <= 18) return 9;
    return 8;
  }

  function clearSearchDisplay() {
    state.info.clear();
    state.recommendation = null;
    state.searchComplete = false;
    renderArrows();
  }

  function beginSearch(fen) {
    if (!state.engineReady || !state.running || !fen) return;
    state.fen = fen;
    state.lastSentFen = fen;
    state.pendingSearch = null;
    state.stopRequested = false;
    state.discardSearchResult = false;
    state.searchBusy = true;
    state.depth = adaptiveDepth(state.boardMap);
    clearSearchDisplay();

    if (state.supportsMultiPV) postMain('ENGINE_COMMAND', { command: `setoption name MultiPV value ${DEFAULT_MULTIPV}` });
    postMain('ENGINE_COMMAND', { command: `position fen ${fen}` });
    postMain('ENGINE_COMMAND', { command: `go depth ${Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, state.depth))}` });
    setStatus(`Analyzing the position (${getProfileLabel().toLowerCase()} mode).`);
  }

  function sendSearch(fen, force = false) {
    if (!state.engineReady || !state.running || !fen) return;
    if (!force && (state.pendingSearch?.fen === fen || (!state.pendingSearch && fen === state.lastSentFen))) return;

    if (state.searchBusy) {
      state.pendingSearch = { fen };
      state.lastSentFen = fen;
      state.discardSearchResult = false;
      clearSearchDisplay();
      if (!state.stopRequested) {
        state.stopRequested = true;
        postMain('ENGINE_COMMAND', { command: 'stop' });
      }
      setStatus('Updating the position…');
      return;
    }
    beginSearch(fen);
  }

  function scheduleSnapshot(force = false) {
    requestPagePosition();
    if (state.debounce) clearTimeout(state.debounce);
    state.debounce = setTimeout(() => {
      state.debounce = null;
      const foundBoard = getBoard();
      if (foundBoard !== state.board) {
        observeBoard();
        return;
      }
      if (!state.board) {
        setStatus('Looking for a recognizable chessboard on this page.');
        return;
      }
      ensureSvg();
      updateOverlayBounds();
      if (!state.running) return;
      const result = makeFen();
      if (result.error) {
        invalidatePosition(result.error);
        return;
      }
      sendSearch(result.fen, force);
    }, 120);
  }

  function startAnalysis() {
    if (!state.enabled || !isPracticePage()) {
      state.practicePage = isPracticePage();
      stopAnalysis(state.practicePage ? 'Chess Cheat is off.' : (pageClassification() === 'blocked'
        ? 'This browser page is not supported by the extension.'
        : (state.board ? 'Board detected. Approve this site origin to enable analysis here.' : 'Waiting for a recognizable chessboard on this page.')));
      return;
    }
    if (state.running) {
      scheduleSnapshot(true);
      return;
    }

    state.practicePage = true;
    state.running = true;
    state.pageFen = '';
    clearPositionRequest();
    state.engineReady = false;
    state.lastSentFen = '';
    state.searchBusy = false;
    state.stopRequested = false;
    state.pendingSearch = null;
    state.discardSearchResult = false;
    state.runToken += 1;
    state.info.clear();
    state.recommendation = null;
    state.searchComplete = false;
    state.supportsSkillLevel = false;
    state.supportsMultiPV = false;
    state.skillLevelMax = 20;
    state.appliedSkillLevel = null;
    renderArrows();
    setStatus('Connecting to a compatible engine on this page…');

    const runToken = state.runToken;
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      state.running = false;
      setStatus('The extension runtime is unavailable. Reload the extension and the board tab.');
      return;
    }

    chrome.runtime.sendMessage({ type: 'CC_INJECT_ENGINE_BRIDGE' }, (response) => {
      if (runToken !== state.runToken || !state.running) return;
      if (chrome.runtime.lastError) {
        state.running = false;
        removeThinkTimer();
        setStatus(`Could not initialize the engine bridge: ${chrome.runtime.lastError.message}`);
        renderArrows();
        return;
      }
      if (!response?.ok) {
        state.running = false;
        removeThinkTimer();
        setStatus(`Could not initialize the engine bridge: ${response?.error || 'unknown error'}`);
        renderArrows();
        return;
      }
      state.engineInjected = true;
      postMain('CREATE_ENGINE');
      scheduleSnapshot(true);
    });
  }

  function stopAnalysis(message = 'Chess Cheat is off.') {
    const wasActive = state.running || state.engineInjected;
    state.running = false;
    clearPositionRequest();
    state.pageFen = '';
    state.runToken += 1;
    state.engineReady = false;
    state.lastSentFen = '';
    state.searchBusy = false;
    state.stopRequested = false;
    state.pendingSearch = null;
    state.discardSearchResult = false;
    state.info.clear();
    state.recommendation = null;
    state.searchComplete = false;
    if (state.svg) state.svg.replaceChildren();
    removeThinkTimer();
    if (wasActive) postMain('DESTROY_ENGINE');
    state.engineInjected = false;
    setStatus(message);
  }

  function parseInfo(line) {
    if (!line.startsWith('info ')) return;
    const depthMatch = line.match(/\bdepth\s+(\d+)/);
    const multipvMatch = line.match(/\bmultipv\s+(\d+)/);
    const pvMatch = line.match(/\bpv\s+(.+)$/);
    if (!depthMatch || !pvMatch) return;
    const rank = Number(multipvMatch?.[1] || 1);
    const scoreCp = line.match(/\bscore\s+cp\s+(-?\d+)/);
    const scoreMate = line.match(/\bscore\s+mate\s+(-?\d+)/);
    let cp = null;
    let mate = null;
    if (scoreMate) mate = Number(scoreMate[1]);
    else if (scoreCp) cp = Number(scoreCp[1]);

    state.info.set(rank, {
      rank,
      depth: Number(depthMatch[1]),
      cp,
      mate,
      score: cp == null ? (mate == null ? '—' : `M${mate}`) : `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(2)}`,
      pv: pvMatch[1].trim()
    });

    // Show a provisional line as soon as the engine has a minimally useful PV.
    // The final bestmove replaces it when the search completes.
    if (rank === 1 && Number(depthMatch[1]) >= 4 && state.running && !state.stopRequested) {
      chooseRecommendation();
    }
  }

  function chooseRecommendation() {
    const entries = [...state.info.entries()].map(([rank, item]) => ({ ...item, rank }));
    if (!entries.length || !window.ChessMoveStyles) return;
    const bestDepth = Math.max(...entries.map((entry) => entry.depth || 0));
    const currentLines = entries.filter((entry) => (entry.depth || 0) >= bestDepth - 1);
    state.recommendation = window.ChessMoveStyles.choose(currentLines, MOVE_STYLE, state.boardMap) || entries[0];
    renderArrows();
  }

  function onEngineOutput(line) {
    const text = String(line || '').trim();
    const optionMatch = text.match(/^option name (.+?) type\b/);
    if (optionMatch) {
      const optionName = optionMatch[1].trim();
      if (optionName === 'Skill Level') {
        state.supportsSkillLevel = true;
        const maximum = text.match(/\bmax\s+(\d+)/);
        if (maximum) state.skillLevelMax = Math.max(0, Math.min(20, Number(maximum[1])));
      }
      if (optionName === 'MultiPV') state.supportsMultiPV = true;
      return;
    }

    if (text === 'uciok') {
      if (state.supportsSkillLevel) {
        state.appliedSkillLevel = Math.min(ENGINE_SKILL, state.skillLevelMax);
        postMain('ENGINE_COMMAND', { command: `setoption name Skill Level value ${state.appliedSkillLevel}` });
      }
      if (state.supportsMultiPV) postMain('ENGINE_COMMAND', { command: `setoption name MultiPV value ${DEFAULT_MULTIPV}` });
      postMain('ENGINE_COMMAND', { command: 'isready' });
      return;
    }

    if (text === 'readyok') {
      state.engineReady = true;
      if (!state.running) return;
      const result = makeFen();
      if (result.error) setStatus(result.error);
      else sendSearch(result.fen, true);
      return;
    }

    if (text.startsWith('info ')) {
      if (!state.stopRequested && !state.discardSearchResult && state.running) parseInfo(text);
      return;
    }

    if (text.startsWith('bestmove ')) {
      const move = text.split(/\s+/)[1];
      if (state.stopRequested) {
        state.searchBusy = false;
        state.stopRequested = false;
        if (state.pendingSearch && state.running) {
          const pending = state.pendingSearch;
          state.pendingSearch = null;
          beginSearch(pending.fen);
          return;
        }
        if (state.discardSearchResult || !state.running) {
          state.discardSearchResult = false;
          state.searchComplete = false;
          return;
        }
        return;
      }

      state.searchBusy = false;
      if (!state.running || state.discardSearchResult) return;
      if (!move || move === '(none)' || move === '0000') {
        state.searchComplete = true;
        state.recommendation = null;
        renderArrows();
        setStatus('No legal move is available in this position.');
        return;
      }

      if (state.supportsSkillLevel) {
        const leading = state.info.get(1);
        state.recommendation = { ...(leading || {}), rank: 1, pv: move };
        state.searchComplete = true;
        renderArrows();
      } else {
        if (!state.info.size) state.info.set(1, { depth: state.depth, score: '—', cp: 0, mate: null, pv: move });
        state.searchComplete = true;
        chooseRecommendation();
      }
      setStatus(`Move hint ready · ${getProfileLabel().toLowerCase()} selection.`);
    }
  }

  function invalidatePosition(message) {
    state.lastSentFen = '';
    state.pendingSearch = null;
    state.info.clear();
    state.recommendation = null;
    state.searchComplete = false;
    renderArrows();
    if (state.searchBusy) {
      state.discardSearchResult = true;
      if (!state.stopRequested) {
        state.stopRequested = true;
        postMain('ENGINE_COMMAND', { command: 'stop' });
      }
    }
    setStatus(message);
  }

  function observeBoard() {
    const found = getBoard();
    if (found === state.board && state.board?.isConnected) return;
    state.boardObserver?.disconnect();
    state.resizeObserver?.disconnect();
    const previousBoard = state.board;
    state.board = found;
    state.boardKind = window.ChessBoardAdapter?.kind(found) || 'none';
    state.pageFen = '';
    clearPositionRequest();
    state.lastBoardMap = null;
    state.thinkTimerPosition = '';
    state.thinkTimerTargetMs = 0;
    removeThinkTimer();
    state.castlingRights = null;
    state.enPassantSquare = '-';
    state.trackedTurn = null;
    state.svg?.remove();
    state.svg = null;

    if (previousBoard && previousBoard !== found && state.running) {
      invalidatePosition('Board changed. Waiting for its position to settle…');
    }
    if (!state.board) {
      setStatus('Looking for a recognizable chessboard on this page.');
      return;
    }

    ensureSvg();
    state.boardObserver = new MutationObserver(() => scheduleSnapshot());
    state.boardObserver.observe(state.board, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'orientation', 'data-orientation', 'fen', 'data-fen', 'data-turn', 'data-side-to-move', 'data-position', 'data-position-fen', 'data-square', 'data-piece', 'data-role', 'data-ply']
    });
    if (typeof ResizeObserver === 'function') {
      state.resizeObserver = new ResizeObserver(() => {
        updateOverlayBounds();
        updateThinkTimerBounds();
        renderArrows();
      });
      state.resizeObserver.observe(state.board);
    }
    if (state.running) scheduleSnapshot(true);
    else if (state.enabled && isPracticePage()) startAnalysis();
  }

  function syncMode() {
    state.practicePage = isPracticePage();
    if (!state.enabled) {
      stopAnalysis('Chess Cheat is off.');
      return;
    }
    if (!state.practicePage) {
      stopAnalysis('This page origin needs approval before analysis can start.');
      return;
    }
    startAnalysis();
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data;
    if (!message || message.namespace !== NS || message.source !== 'page-bridge') return;

    if (message.type === 'POSITION_STATE') {
      if (message.requestId !== state.pendingPositionRequestId) return;
      if (state.positionRequestTimer) clearTimeout(state.positionRequestTimer);
      state.positionRequestTimer = null;
      state.pendingPositionRequestId = null;
      const parsed = window.ChessTurnDetection.parseFen(message.fen);
      const nextFen = parsed?.fen || '';
      const changed = nextFen !== state.pageFen;
      state.pageFen = nextFen;
      if (changed && nextFen && state.running) scheduleSnapshot(true);
    } else if (message.type === 'ENGINE_STARTED') {
      setStatus('Engine connected. Preparing move hints…');
    } else if (message.type === 'ENGINE_OUTPUT') {
      onEngineOutput(message.line);
    } else if (message.type === 'ENGINE_ERROR') {
      state.engineReady = false;
      state.running = false;
      state.runToken += 1;
      state.lastSentFen = '';
      state.searchBusy = false;
      state.stopRequested = false;
      state.pendingSearch = null;
      state.discardSearchResult = false;
      state.info.clear();
      state.recommendation = null;
      state.searchComplete = false;
      state.appliedSkillLevel = null;
      state.engineInjected = false;
      removeThinkTimer();
      renderArrows();
      postMain('DESTROY_ENGINE');
      setStatus(`${message.error || 'Engine error'}${message.details ? ` ${message.details}` : ''}`);
    } else if (message.type === 'ENGINE_STOPPED') {
      state.engineReady = false;
      state.engineInjected = false;
      // If we were running (e.g. worker crashed), attempt to reconnect after a short delay.
      if (state.running) {
        state.running = false;
        setTimeout(() => { if (!state.running && state.enabled && state.practicePage) startAnalysis(); }, 1200);
      }
    }
  });

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== 'CC_GET_STATUS') return false;
      sendResponse({
        enabled: state.enabled,
        active: state.running && state.engineReady,
        practicePage: isPracticePage(),
        blockedPage: pageClassification() === 'blocked',
        boardDetected: Boolean(state.board?.isConnected),
        positionDetected: Boolean(state.board?.isConnected && mapIsValid(readBoardMap())),
        boardKind: window.ChessBoardAdapter?.kind(state.board) || 'none',
        requiresApproval: Boolean(window.ChessSitePolicy?.needsApproval(location.href, Boolean(state.board?.isConnected), state.approvedOrigins)),
        message: state.statusMessage
      });
      return false;
    });
  }

  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[ENABLED_KEY]) {
        const nextValue = changes[ENABLED_KEY].newValue;
        state.enabled = typeof nextValue === 'boolean' ? nextValue : DEFAULT_ENABLED;
        syncMode();
      }
      if (changes[APPROVED_ORIGINS_KEY]) {
        state.approvedOrigins = window.ChessSitePolicy.normalizedOrigins(changes[APPROVED_ORIGINS_KEY].newValue);
        syncMode();
      }
      if (changes[VISUAL_SETTINGS_KEY]) {
        state.visualSettings = window.ChessVisualSettings.normalizeSettings(changes[VISUAL_SETTINGS_KEY].newValue);
        renderArrows();
        renderThinkTimer();
      }
    });
  }

  async function boot() {
    state.practicePage = isPracticePage();
    try {
      const result = await new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) return resolve({});
        chrome.storage.local.get([ENABLED_KEY, VISUAL_SETTINGS_KEY, APPROVED_ORIGINS_KEY], (values) => resolve(chrome.runtime.lastError ? {} : (values || {})));
      });
      state.enabled = typeof result[ENABLED_KEY] === 'boolean' ? result[ENABLED_KEY] : DEFAULT_ENABLED;
      state.visualSettings = window.ChessVisualSettings.normalizeSettings(result[VISUAL_SETTINGS_KEY]);
      state.approvedOrigins = window.ChessSitePolicy.normalizedOrigins(result[APPROVED_ORIGINS_KEY]);
    } catch (_) {
      state.enabled = DEFAULT_ENABLED;
    }

    observeBoard();
    state.observer = new MutationObserver((records) => {
      if (!state.board?.isConnected) {
        observeBoard();
        return;
      }
      const boardChanged = records.some((record) => {
        if (record.type !== 'childList') return false;
        return [...record.addedNodes, ...record.removedNodes].some((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return false;
          return node.matches?.(window.ChessBoardAdapter.BOARD_SELECTOR) ||
            Boolean(node.querySelector?.(window.ChessBoardAdapter.BOARD_SELECTOR));
        });
      });
      if (boardChanged && getBoard() !== state.board) observeBoard();
    });
    state.observer.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('resize', () => {
      updateOverlayBounds();
      updateThinkTimerBounds();
      renderArrows();
    }, { passive: true });
    window.addEventListener('scroll', () => {
      updateOverlayBounds();
      updateThinkTimerBounds();
    }, { passive: true, capture: true });
    window.addEventListener('pagehide', (event) => {
      // On bfcache entry (persisted) we will get pageshow later — don't fully destroy.
      state.observer?.disconnect();
      state.boardObserver?.disconnect();
      state.resizeObserver?.disconnect();
      if (state.pollTimer) clearInterval(state.pollTimer);
      state.pollTimer = null;
      if (state.pageTimer) clearInterval(state.pageTimer);
      state.pageTimer = null;
      removeThinkTimer();
      if (!event.persisted) postMain('DESTROY_ENGINE');
    });

    // bfcache restore: re-attach observers and restart analysis if page was suspended.
    window.addEventListener('pageshow', (event) => {
      if (!event.persisted) return; // Normal navigation — content script re-runs from scratch.
      // Restore observers and re-boot analysis after bfcache restore.
      state.observer?.disconnect();
      state.boardObserver?.disconnect();
      state.resizeObserver?.disconnect();
      state.engineReady = false;
      state.engineInjected = false;
      state.running = false;
      state.searchBusy = false;
      state.lastSentFen = '';
      state.lastPath = location.pathname;
      state.lastSearch = location.search;
      observeBoard();
      state.observer = new MutationObserver((records) => {
        if (!state.board?.isConnected) { observeBoard(); return; }
        const boardChanged = records.some((record) => {
          if (record.type !== 'childList') return false;
          return [...record.addedNodes, ...record.removedNodes].some((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return false;
            return node.matches?.(window.ChessBoardAdapter.BOARD_SELECTOR) ||
              Boolean(node.querySelector?.(window.ChessBoardAdapter.BOARD_SELECTOR));
          });
        });
        if (boardChanged && getBoard() !== state.board) observeBoard();
      });
      state.observer.observe(document.documentElement, { childList: true, subtree: true });
      state.pollTimer = setInterval(() => {
        if (getBoard() !== state.board) observeBoard();
        if (state.running && !state.searchBusy) scheduleSnapshot();
      }, 650);
      state.pageTimer = setInterval(() => {
        if (location.pathname === state.lastPath && location.search === state.lastSearch) return;
        state.lastPath = location.pathname;
        state.lastSearch = location.search;
        syncMode();
      }, 800);
      syncMode();
    });

    state.pollTimer = setInterval(() => {
      if (getBoard() !== state.board) observeBoard();
      if (state.running && !state.searchBusy) scheduleSnapshot();
    }, 650);
    state.pageTimer = setInterval(() => {
      if (location.pathname === state.lastPath && location.search === state.lastSearch) return;
      state.lastPath = location.pathname;
      state.lastSearch = location.search;
      syncMode();
    }, 800);

    if (!state.enabled) setStatus('Chess Cheat is off.');
    else if (!state.practicePage) setStatus(pageClassification() === 'blocked'
      ? 'This browser page is not supported by the extension.'
      : (state.board ? 'Board detected. Approve this site origin to enable analysis here.' : 'Looking for a recognizable chessboard on this page.'));
    else setStatus('Starting analysis automatically…');
    syncMode();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
