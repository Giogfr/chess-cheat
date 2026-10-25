(() => {
  'use strict';
  const NS = 'CHESS_CHEAT';
  if (window.__ccAnalysisBridgeInstalled) return;
  window.__ccAnalysisBridgeInstalled = true;

  let worker = null;
  let active = false;
  let candidates = [];
  let candidateIndex = 0;
  let attemptTimer = null;
  let attemptId = 0;
  const engineOptionLines = [];
  // A stale or unrelated candidate should not freeze startup for several long waits.
  const ENGINE_STARTUP_TIMEOUT_MS = 2500;
  const MAX_ENGINE_CANDIDATES = 4;

  function notify(type, detail = {}) {
    window.postMessage({ namespace: NS, source: 'page-bridge', type, ...detail }, location.origin);
  }

  function readBoardPosition() {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return null;

    const selector = 'wc-chess-board, chess-board, cg-board, [data-chessboard], [data-chess-board], [data-fen], [data-position-fen], [data-current-fen], [aria-roledescription*="chess" i], [role="grid"][aria-label*="chess" i], .chessboard, .chess-board, [class*="chessboard" i], [class*="chess-board" i]';
    let boards = [];
    try {
      boards = [...document.querySelectorAll(selector)];
      boards.sort((left, right) => {
        const area = (board) => {
          try {
            const rect = board.getBoundingClientRect();
            return rect.width * rect.height;
          } catch (_) { return 0; }
        };
        return area(right) - area(left);
      });
    } catch (_) { return null; }

    for (const board of boards) {
      const nodes = [];
      for (let node = board, depth = 0; node && depth < 4; node = node.parentElement, depth += 1) nodes.push(node);
      for (const node of nodes) {
        for (const attribute of ['data-fen', 'fen', 'data-position-fen', 'data-current-fen']) {
          const fen = node.getAttribute?.(attribute);
          if (typeof fen === 'string' && window.ChessEngineCommands?.validFenCommand(`position fen ${fen.trim()}`)) {
            return { fen: fen.trim(), turn: fen.trim().split(/\s+/)[1] };
          }
        }
      }

      const sources = [];
      for (const node of nodes) {
        sources.push(node);
        for (const property of ['game', 'gameState', 'chessGame', 'position', 'currentPosition']) {
          try { if (node[property]) sources.push(node[property]); } catch (_) { /* Ignore page-owned getters that throw. */ }
        }
      }
      for (const source of sources) {
        if (!source || (typeof source !== 'object' && typeof source !== 'function')) continue;
        for (const name of ['getFEN', 'getFen', 'getPosition', 'getCurrentPosition', 'toFEN', 'toFen', 'fen', 'currentFen', 'positionFen', 'currentPosition']) {
          let value;
          try { value = typeof source[name] === 'function' ? source[name]() : source[name]; }
          catch (_) { continue; }
          if (value && typeof value === 'object') {
            value = value.fen || value.FEN || value.positionFen || value.currentFen;
            if (typeof value !== 'string') {
              for (const method of ['getFEN', 'getFen', 'getPosition', 'getCurrentPosition', 'toFEN', 'toFen']) {
                try {
                  if (typeof source[name]?.[method] === 'function') {
                    value = source[name][method]();
                    break;
                  }
                } catch (_) {}
              }
            }
          }
          if (typeof value !== 'string') continue;
          const fen = value.trim();
          if (window.ChessEngineCommands?.validFenCommand(`position fen ${fen}`)) return { fen, turn: fen.split(/\s+/)[1] };
        }
      }
    }
    // A site may expose its current FEN on a custom node with no recognizable board class.
    try {
      for (const node of document.querySelectorAll('[data-fen], [fen], [data-position-fen], [data-current-fen]')) {
        for (const attribute of ['data-fen', 'fen', 'data-position-fen', 'data-current-fen']) {
          const value = node.getAttribute?.(attribute);
          if (typeof value !== 'string') continue;
          const fen = value.trim();
          if (window.ChessEngineCommands?.validFenCommand(`position fen ${fen}`)) {
            return { fen, turn: fen.split(/\s+/)[1] };
          }
        }
      }
    } catch (_) { /* Custom FEN nodes are optional. */ }
    return null;
  }

  function engineCandidates() {
    const found = [];
    const fallbacks = [];
    const looksLikeEngine = (urlValue) => {
      try {
        const url = new URL(urlValue, location.href);
        if (url.origin !== location.origin || !/\.(?:js|mjs)(?:$|[?#])/i.test(url.href)) return false;
        return /stockfish|jschessengine|chess[-_.]?(?:js[-_.]?)?engine|engine[-_.].*(?:worker|thread)|(?:worker|thread)[-_.].*engine/i.test(url.pathname + url.search);
      } catch (_) { return false; }
    };

    try {
      for (const item of performance.getEntriesByType('resource')) {
        if (looksLikeEngine(item.name)) found.push(new URL(item.name, location.href).href);
      }
    } catch (_) { /* Resource timing is optional and can be restricted. */ }

    try {
      for (const script of document.querySelectorAll('script[src]')) {
        if (looksLikeEngine(script.src)) found.push(new URL(script.src, location.href).href);
      }
    } catch (_) { /* A page may customize its document implementation. */ }

    // Keep known Chess.com and Lichess URLs as fallback candidates when resource discovery misses the current worker.
    if (location.hostname === 'chess.com' || location.hostname === 'www.chess.com') {
      fallbacks.push(new URL('/bundles/app/js/vendor/jschessengine/stockfish.asm.1abfa10c.js', location.origin).href);
      fallbacks.push(new URL('/bundles/app/js/vendor/jschessengine/stockfish.asm.js', location.origin).href);
      fallbacks.push(new URL('/bundles/app/js/vendor/jschessengine/stockfish.js', location.origin).href);
    }
    if (location.hostname === 'lichess.org' || location.hostname === 'www.lichess.org') {
      fallbacks.push(new URL('/assets/vendor/stockfish.js/stockfish.wasm.js', location.origin).href);
      fallbacks.push(new URL('/assets/vendor/stockfish.js/stockfish.js', location.origin).href);
    }

    // Prefer discovered assets, then retain a small number of known Chess.com fallbacks.
    // Bound candidate count so stale asset names cannot create a long sequence of waits.
    const discovered = [...new Set(found)];
    const preferredDiscovered = discovered.slice(0, 2);
    const remainingDiscovered = discovered.slice(2);
    return [...new Set([...preferredDiscovered, ...fallbacks, ...remainingDiscovered])].slice(0, MAX_ENGINE_CANDIDATES);
  }

  function stopAttempt() {
    attemptId += 1;
    if (attemptTimer) clearTimeout(attemptTimer);
    attemptTimer = null;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      try { worker.terminate(); } catch (_) { /* already terminated */ }
    }
    worker = null;
    active = false;
  }

  function tryNextCandidate(lastError) {
    stopAttempt();
    if (candidateIndex >= candidates.length) {
      notify('ENGINE_ERROR', {
        error: 'No compatible chess-engine worker was found on this page. The board may be detectable even when the site does not expose a reusable Stockfish engine.',
        details: lastError || 'No candidate engine URL responded with UCI output.',
        tried: candidates
      });
      return;
    }

    const candidate = candidates[candidateIndex++];
    const thisAttempt = attemptId;
    engineOptionLines.length = 0;
    try {
      worker = new Worker(candidate);
    } catch (error) {
      tryNextCandidate(String(error?.message || error));
      return;
    }

    let receivedUciOk = false;
    worker.onmessage = (event) => {
      if (thisAttempt !== attemptId) return;
      const raw = typeof event.data === 'string' ? event.data : String(event.data ?? '');
      // Some builds post one UCI line per message; others batch lines into one string.
      for (const outputLine of raw.split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean)) {
        if (outputLine.startsWith('option name ')) engineOptionLines.push(outputLine);
        if (outputLine === 'uciok') {
          receivedUciOk = true;
          active = true;
          if (attemptTimer) clearTimeout(attemptTimer);
          attemptTimer = null;
          notify('ENGINE_STARTED', { engineUrl: candidate });
        }
        notify('ENGINE_OUTPUT', { line: outputLine });
      }
    };
    worker.onerror = (event) => {
      if (thisAttempt !== attemptId) return;
      if (!receivedUciOk) {
        tryNextCandidate(event?.message || `Worker failed to load: ${candidate}`);
      } else {
        const error = event?.message || 'Stockfish worker failed after startup.';
        stopAttempt();
        notify('ENGINE_ERROR', { error });
      }
    };
    worker.onmessageerror = () => {
      if (thisAttempt !== attemptId) return;
      if (!receivedUciOk) tryNextCandidate(`Unusable worker response: ${candidate}`);
    };

    // Start the watchdog before sending UCI so synchronous test workers and fast engines
    // can clear it safely as soon as `uciok` arrives.
    attemptTimer = setTimeout(() => {
      if (thisAttempt !== attemptId) return;
      if (!receivedUciOk) tryNextCandidate(`Timed out waiting for UCI response from ${candidate}`);
    }, ENGINE_STARTUP_TIMEOUT_MS);
    try { worker.postMessage('uci'); }
    catch (error) { tryNextCandidate(String(error?.message || error)); }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data;
    if (!message || message.namespace !== NS || message.source !== 'content') return;

    if (message.type === 'READ_POSITION') {
      const position = readBoardPosition();
      notify('POSITION_STATE', {
        requestId: Number.isInteger(message.requestId) ? message.requestId : null,
        fen: position?.fen || '',
        turn: position?.turn || null
      });
    } else if (message.type === 'CREATE_ENGINE') {
      if (active) {
        notify('ENGINE_STARTED', { engineUrl: worker ? 'already running' : '' });
        for (const line of engineOptionLines) notify('ENGINE_OUTPUT', { line });
        notify('ENGINE_OUTPUT', { line: 'uciok' });
        return;
      }
      stopAttempt();
      candidates = engineCandidates();
      candidateIndex = 0;
      tryNextCandidate('Initial engine startup');
    } else if (message.type === 'ENGINE_COMMAND') {
      const command = message.command;
      const allowed = window.ChessEngineCommands?.isAllowed(command) === true;
      if (!allowed) {
        notify('ENGINE_ERROR', { error: 'An unsupported engine command was blocked.' });
        return;
      }
      if (worker && active) {
        try { worker.postMessage(command); }
        catch (error) { notify('ENGINE_ERROR', { error: String(error?.message || error) }); }
      }
    } else if (message.type === 'DESTROY_ENGINE') {
      stopAttempt();
      notify('ENGINE_STOPPED');
    }
  });
})();
