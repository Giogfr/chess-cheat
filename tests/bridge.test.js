'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const commands = require('../engine-commands.js');

const source = fs.readFileSync(path.join(__dirname, '..', 'bridge.js'), 'utf8');
const namespace = 'CHESS_CHEAT';

function createBridgeHarness(boards = [], options = {}) {
  const messages = [];
  const listeners = new Map();
  const workers = [];
  const attemptedUrls = [];
  const timerTasks = new Map();
  let nextTimerId = 1;
  const fakeSetTimeout = (callback, delay) => {
    const id = nextTimerId++;
    timerTasks.set(id, { callback, delay });
    return id;
  };
  const fakeClearTimeout = (id) => timerTasks.delete(id);
  const location = {
    origin: 'https://www.chess.com',
    hostname: 'www.chess.com',
    href: 'https://www.chess.com/play/computer'
  };
  const window = {
    __ccAnalysisBridgeInstalled: false,
    ChessEngineCommands: commands,
    addEventListener(type, listener) { listeners.set(type, listener); },
    postMessage(message) { messages.push(message); }
  };

  class FakeWorker {
    constructor(url) {
      attemptedUrls.push(url);
      if (options.workerThrows) throw new Error('simulated unavailable worker');
      this.url = url;
      this.commands = [];
      this.terminated = false;
      workers.push(this);
    }

    postMessage(command) {
      this.commands.push(command);
      if (command === 'uci' && !options.silentWorker) {
        this.onmessage?.({ data: [
          'option name Skill Level type spin default 20 min 0 max 20',
          'option name MultiPV type spin default 1 min 1 max 500',
          'uciok'
        ].join('\n') });
      }
    }

    terminate() { this.terminated = true; }
  }

  const context = vm.createContext({
    window,
    document: { querySelectorAll: (selector) => selector === 'script[src]' ? (options.scriptUrls || []).map((src) => ({ src })) : boards },
    location,
    URL,
    Worker: FakeWorker,
    performance: { getEntriesByType: () => (options.resourceUrls || []).map((name) => ({ name })) },
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout
  });
  vm.runInContext(source, context, { filename: 'bridge.js' });

  function send(type, extra = {}) {
    const listener = listeners.get('message');
    assert.equal(typeof listener, 'function', 'bridge message listener should be registered');
    listener({
      source: window,
      origin: location.origin,
      data: { namespace, source: 'content', type, ...extra }
    });
  }

  return { messages, workers, attemptedUrls, timerTasks, send, runTimer(id) {
    const task = timerTasks.get(id);
    if (!task) return false;
    timerTasks.delete(id);
    task.callback();
    return true;
  } };
}

test('discovers a known page worker and completes the UCI handshake', () => {
  const harness = createBridgeHarness();
  harness.send('CREATE_ENGINE');

  assert.equal(harness.workers.length, 1);
  assert.match(harness.workers[0].url, /stockfish\.asm\.1abfa10c\.js/);
  assert.deepEqual(harness.workers[0].commands, ['uci']);
  assert.ok(harness.messages.some((message) => message.type === 'ENGINE_STARTED'));
  assert.ok(harness.messages.some((message) => message.type === 'ENGINE_OUTPUT' && message.line === 'uciok'));
});

test('forwards approved UCI commands to an active worker', () => {
  const harness = createBridgeHarness();
  harness.send('CREATE_ENGINE');
  harness.send('ENGINE_COMMAND', { command: 'go depth 13' });
  harness.send('ENGINE_COMMAND', { command: 'position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' });

  assert.deepEqual(harness.workers[0].commands, [
    'uci',
    'go depth 13',
    'position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  ]);
});

test('rejects unsupported commands and terminates the worker on destroy', () => {
  const harness = createBridgeHarness();
  harness.send('CREATE_ENGINE');
  const worker = harness.workers[0];
  harness.send('ENGINE_COMMAND', { command: 'setoption name Threads value 64' });

  assert.ok(harness.messages.some((message) => message.type === 'ENGINE_ERROR' && /blocked/.test(message.error)));
  assert.deepEqual(worker.commands, ['uci']);

  harness.send('DESTROY_ENGINE');
  assert.equal(worker.terminated, true);
  assert.ok(harness.messages.some((message) => message.type === 'ENGINE_STOPPED'));
});

test('ignores late events from a superseded worker attempt', () => {
  const harness = createBridgeHarness();
  harness.send('CREATE_ENGINE');
  const oldWorker = harness.workers[0];
  const lateError = oldWorker.onerror;
  harness.send('DESTROY_ENGINE');

  lateError?.({ message: 'late failure from an already stopped worker' });

  assert.equal(oldWorker.terminated, true);
  assert.equal(harness.messages.some((message) => message.type === 'ENGINE_ERROR'), false);
});


test('uses a short watchdog for page engine startup rather than waiting eight seconds per candidate', () => {
  const harness = createBridgeHarness([], { silentWorker: true });
  harness.send('CREATE_ENGINE');
  assert.equal(harness.timerTasks.size, 1);
  const watchdog = [...harness.timerTasks.values()][0];
  assert.equal(watchdog.delay, 2500);
  assert.ok(watchdog.delay < 8000);
});

test('caps stale engine-worker candidates to four attempts', () => {
  const urls = Array.from({ length: 12 }, (_, index) => `https://www.chess.com/assets/stockfish-worker-${index}.js`);
  const harness = createBridgeHarness([], { workerThrows: true, resourceUrls: urls });
  harness.send('CREATE_ENGINE');
  assert.equal(harness.attemptedUrls.length, 4);
  assert.ok(harness.messages.some((message) => message.type === 'ENGINE_ERROR'));
});

test('clears the startup watchdog immediately after a successful UCI handshake', () => {
  const harness = createBridgeHarness();
  harness.send('CREATE_ENGINE');
  assert.equal(harness.timerTasks.size, 0);
  assert.ok(harness.messages.some((message) => message.type === 'ENGINE_STARTED'));
});

test('reads the current full FEN through the page-world bridge', () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
  const board = {
    getBoundingClientRect: () => ({ width: 800, height: 800 }),
    game: { getFEN: () => fen, getTurn: () => 2 }
  };
  const harness = createBridgeHarness([board]);
  harness.send('READ_POSITION', { requestId: 42 });
  assert.ok(harness.messages.some((message) => message.type === 'POSITION_STATE' && message.requestId === 42 && message.fen === fen && message.turn === 'b'));
});

test('returns an empty position when the page does not expose a valid full FEN', () => {
  const board = {
    getBoundingClientRect: () => ({ width: 800, height: 800 }),
    game: { getFEN: () => '8/8/8/8/8/8/8/8' }
  };
  const harness = createBridgeHarness([board]);
  harness.send('READ_POSITION', { requestId: 43 });
  assert.ok(harness.messages.some((message) => message.type === 'POSITION_STATE' && message.requestId === 43 && message.fen === '' && message.turn === null));
});

test('reads the current full FEN through alternate property names like chessGame.getPosition', () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
  const board = {
    getBoundingClientRect: () => ({ width: 800, height: 800 }),
    chessGame: { getPosition: () => fen }
  };
  const harness = createBridgeHarness([board]);
  harness.send('READ_POSITION', { requestId: 99 });
  assert.ok(harness.messages.some((message) => message.type === 'POSITION_STATE' && message.requestId === 99 && message.fen === fen && message.turn === 'b'));
});
