'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const policySource = fs.readFileSync(path.join(root, 'site-policy.js'), 'utf8');

function createBackgroundHarness(initialStore = {}) {
  let listener;
  const injections = [];
  const store = { ...initialStore };
  const chrome = {
    runtime: {
      id: 'test-extension-id',
      onMessage: { addListener(callback) { listener = callback; } }
    },
    storage: {
      local: {
        get(keys, callback) {
          const names = Array.isArray(keys) ? keys : [keys];
          callback(Object.fromEntries(names.map((key) => [key, store[key]])));
        },
        set(values, callback) {
          Object.assign(store, values);
          callback?.();
        }
      }
    },
    scripting: {
      executeScript(details) {
        injections.push(details);
        return Promise.resolve();
      }
    }
  };
  const context = vm.createContext({ chrome, URL, Set, Array, String, Boolean, Object, Promise, Error, globalThis: null });
  context.globalThis = context;
  context.importScripts = (file) => {
    assert.equal(file, 'site-policy.js');
    vm.runInContext(policySource, context, { filename: file });
  };
  vm.runInContext(source, context, { filename: 'background.js' });
  return { get listener() { return listener; }, injections, store, chrome };
}

function send(harness, message, sender) {
  let response;
  const keepChannelOpen = harness.listener(message, sender, (value) => { response = value; });
  return { get response() { return response; }, keepChannelOpen };
}

test('injects the bridge on live and competitive routes but rejects non-top-level frames', async () => {
  const harness = createBackgroundHarness();
  const sender = (url, frameId = 0) => ({ tab: { id: 12 }, url, frameId });
  for (const url of [
    'https://www.chess.com/game/live/123',
    'https://www.chess.com/play/online',
    'https://www.chess.com/tournament/123',
    'https://lichess.org/abcd1234',
    'https://lichess.org/tournament/abcd'
  ]) {
    const result = send(harness, { type: 'CC_INJECT_ENGINE_BRIDGE' }, sender(url));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(result.response?.ok, true, `${url} should be eligible for bridge injection`);
  }
  assert.equal(harness.injections.length, 5);

  const nestedFrame = send(harness, { type: 'CC_INJECT_ENGINE_BRIDGE' }, sender('https://lichess.org/analysis', 2));
  assert.equal(nestedFrame.response?.ok, false);
  assert.equal(harness.injections.length, 5);
});

test('accepts Chess.com computer-game URLs as practice boards', async () => {
  const harness = createBackgroundHarness();
  const result = send(harness,
    { type: 'CC_INJECT_ENGINE_BRIDGE' },
    { tab: { id: 12 }, url: 'https://www.chess.com/game/computer/12345', frameId: 0 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result.keepChannelOpen, true);
  assert.equal(result.response?.ok, true);
  assert.equal(harness.injections.length, 1);
});

test('accepts known Lichess analysis routes', async () => {
  const harness = createBackgroundHarness();
  const result = send(harness,
    { type: 'CC_INJECT_ENGINE_BRIDGE' },
    { tab: { id: 12 }, url: 'https://lichess.org/analysis', frameId: 0 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result.response?.ok, true);
  assert.equal(harness.injections.length, 1);
});

test('requires saved practice approval for an unfamiliar domain', () => {
  const harness = createBackgroundHarness();
  const result = send(harness,
    { type: 'CC_INJECT_ENGINE_BRIDGE' },
    { tab: { id: 12 }, url: 'https://example.org/board/demo', frameId: 0 });
  assert.equal(result.response?.ok, false);
  assert.equal(harness.injections.length, 0);
});

test('allows an unfamiliar origin after it is approved', async () => {
  const harness = createBackgroundHarness({ approvedPracticeOrigins: ['https://example.org'] });
  const result = send(harness,
    { type: 'CC_INJECT_ENGINE_BRIDGE' },
    { tab: { id: 12 }, url: 'https://example.org/board/demo', frameId: 0 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result.response?.ok, true);
  assert.equal(harness.injections.length, 1);
});

test('origin approval applies to live-like and competitive routes on the approved origin', async () => {
  const harness = createBackgroundHarness({ approvedPracticeOrigins: ['https://example.org'] });
  for (const url of [
    'https://example.org/online/match/123',
    'https://example.org/tournament/round-2',
    'https://example.org/challenge/game/123'
  ]) {
    const result = send(harness,
      { type: 'CC_INJECT_ENGINE_BRIDGE' },
      { tab: { id: 12 }, url, frameId: 0 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(result.response?.ok, true, `${url} should be eligible after origin approval`);
  }
  assert.equal(harness.injections.length, 3);
});

test('the extension popup can approve origins for unrecognized routes', () => {
  const harness = createBackgroundHarness();
  const popupSender = { id: 'test-extension-id', url: 'chrome-extension://test-extension-id/popup.html' };
  const approved = send(harness, { type: 'CC_ALLOW_PRACTICE_ORIGIN', origin: 'https://example.org/board' }, popupSender);
  assert.equal(approved.response?.ok, true);
  assert.equal(Array.from(harness.store.approvedPracticeOrigins).join(','), 'https://example.org');

});

test('injects the bridge into only the top-level approved page world', async () => {
  const harness = createBackgroundHarness();
  const result = send(harness,
    { type: 'CC_INJECT_ENGINE_BRIDGE' },
    { tab: { id: 12 }, url: 'https://www.chess.com/play/computer', frameId: 0 });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(result.keepChannelOpen, true);
  assert.equal(result.response?.ok, true);
  assert.equal(JSON.stringify(harness.injections[0]), JSON.stringify({
    target: { tabId: 12, frameIds: [0] },
    world: 'MAIN',
    files: ['engine-commands.js', 'bridge.js']
  }));
});
