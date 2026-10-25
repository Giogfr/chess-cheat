'use strict';

importScripts('site-policy.js');

const APPROVED_ORIGINS_KEY = 'approvedPracticeOrigins';
const policy = globalThis.ChessSitePolicy;

function approvedOriginsFromStorage(callback) {
  if (!chrome.storage?.local?.get) return callback([]);
  chrome.storage.local.get([APPROVED_ORIGINS_KEY], (result) => {
    if (chrome.runtime.lastError) return callback([]);
    callback(policy.normalizedOrigins(result?.[APPROVED_ORIGINS_KEY]));
  });
}

function canInjectOnUrl(value, callback) {
  const classification = policy.classifyUrl(value);
  if (classification === 'practice') return callback(true);
  if (classification === 'blocked') return callback(false);
  approvedOriginsFromStorage((origins) => callback(policy.isOriginApproved(value, origins)));
}

function storeApprovedOrigin(value, callback) {
  let origin;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin === 'null') throw new Error('Only standard web origins are supported.');
    origin = url.origin;
  } catch (error) {
    callback({ ok: false, error: error?.message || 'Invalid website origin.' });
    return;
  }

  approvedOriginsFromStorage((existing) => {
    const next = [...new Set([...existing, origin])].slice(-200);
    chrome.storage.local.set({ [APPROVED_ORIGINS_KEY]: next }, () => {
      if (chrome.runtime.lastError) callback({ ok: false, error: chrome.runtime.lastError.message });
      else callback({ ok: true, origin, approvedPracticeOrigins: next });
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'CC_ALLOW_PRACTICE_ORIGIN') {
    // Only messages from this extension's own popup/options pages may add a site.
    let senderUrl;
    try { senderUrl = new URL(sender.url || ''); } catch { return false; }
    if (sender.id !== chrome.runtime.id || senderUrl.protocol !== 'chrome-extension:' || senderUrl.hostname !== chrome.runtime.id) {
      sendResponse({ ok: false, error: 'Only the extension popup can approve a practice site.' });
      return false;
    }
    const candidate = typeof message.origin === 'string' ? message.origin : '';
    storeApprovedOrigin(candidate, sendResponse);
    return true;
  }

  if (message?.type !== 'CC_INJECT_ENGINE_BRIDGE' || !sender.tab?.id || !sender.url) return false;
  if (sender.frameId !== 0) {
    sendResponse({ ok: false, error: 'Analysis is only available in the top-level page frame.' });
    return false;
  }

  canInjectOnUrl(sender.url, (allowed) => {
    if (!allowed) {
      sendResponse({ ok: false, error: 'This page origin has not been approved yet.' });
      return;
    }
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, frameIds: [0] },
      world: 'MAIN',
      files: ['engine-commands.js', 'bridge.js']
    }).then(() => {
      sendResponse({ ok: true });
    }).catch((error) => {
      sendResponse({ ok: false, error: String(error?.message || error) });
    });
  });
  return true;
});
