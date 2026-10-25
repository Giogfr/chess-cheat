'use strict';

const ENABLED_KEY = 'enabled';
const VISUAL_SETTINGS_KEY = 'visualSettings';
const DEFAULT_ENABLED = true;
const toggleButton = document.querySelector('#toggle');
const allowSiteButton = document.querySelector('#allow-site');
const stateDot = document.querySelector('#state-dot');
const stateTitle = document.querySelector('#state-title');
const stateDetail = document.querySelector('#state-detail');
const displayMode = document.querySelector('#display-mode');
const markerColor = document.querySelector('#marker-color');
const lineWeight = document.querySelector('#line-weight');
const showThinkTimer = document.querySelector('#show-think-timer');

let enabled = DEFAULT_ENABLED;
let visualSettings = window.ChessVisualSettings.DEFAULT_SETTINGS;
let currentTabId = null;
let currentTabUrl = '';
let currentStatus = null;
let refreshTimer = null;

function renderToggle() {
  toggleButton.disabled = false;
  toggleButton.textContent = enabled ? 'Turn off' : 'Turn on';
  toggleButton.setAttribute('aria-pressed', String(enabled));
}

function renderVisualSettings() {
  displayMode.value = visualSettings.displayMode;
  markerColor.value = visualSettings.color;
  lineWeight.value = visualSettings.lineWeight;
  showThinkTimer.checked = visualSettings.showThinkTimer;
}

function setVisualInputsDisabled(disabled) {
  displayMode.disabled = disabled;
  markerColor.disabled = disabled;
  lineWeight.disabled = disabled;
  showThinkTimer.disabled = disabled;
}

function renderStatus(status = {}) {
  currentStatus = status;
  stateDot.className = 'state-dot';
  allowSiteButton.hidden = !(enabled && status.requiresApproval && status.boardDetected);

  if (!enabled) {
    stateDot.classList.add('off');
    stateTitle.textContent = 'Chess Cheat is off';
    stateDetail.textContent = 'No move hints will be calculated.';
    return;
  }

  if (status.pageUnavailable) {
    stateDot.classList.add('warn');
    stateTitle.textContent = 'Page unavailable to extensions';
    stateDetail.textContent = status.message || 'Chrome and Edge restrict extension scripts on browser-internal and other protected pages. Open a normal website tab.';
    return;
  }

  if (status.blockedPage) {
    stateDot.classList.add('warn');
    stateTitle.textContent = 'Analysis unavailable';
    stateDetail.textContent = 'This page type is not available to extension scripts. Open a normal http(s) website tab with a chessboard.';
    return;
  }

  if (status.statusUnavailable) {
    stateDot.classList.add('warn');
    stateTitle.textContent = status.practicePage ? 'Supported page not responding' : 'Extension status unavailable';
    stateDetail.textContent = status.message || 'The page did not respond to the extension. Confirm it is enabled and has access to this site, then refresh the tab.';
    return;
  }

  if (status.requiresApproval && status.boardDetected) {
    stateDot.classList.add('warn');
    stateTitle.textContent = 'Chessboard detected';
    stateDetail.textContent = `Detected ${status.boardKind || 'a chessboard'} on an unfamiliar route. Approve this site origin to enable analysis on its pages.`;
    return;
  }

  if (status.active) {
    stateDot.classList.add('on');
    stateTitle.textContent = 'Analysis is running';
    stateDetail.textContent = status.message || 'Analyzing the current position.';
    return;
  }

  if (status.practicePage) {
    stateDot.classList.add('on');
    stateTitle.textContent = status.boardDetected ? 'Chessboard detected' : 'Looking for a chessboard';
    stateDetail.textContent = status.message || 'Waiting for a supported board and compatible engine.';
    return;
  }

  if (status.boardDetected) {
    stateDot.classList.add('warn');
    stateTitle.textContent = 'Chessboard detected';
    stateDetail.textContent = status.message || 'Approve this site origin before hints can start.';
    return;
  }

  stateDot.classList.add('warn');
  stateTitle.textContent = 'No chessboard detected yet';
  stateDetail.textContent = status.message || 'Open a recognizable chessboard on a supported page.';
}

function queryActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) return resolve(null);
      resolve(tabs?.[0] || null);
    });
  });
}

function queryContentStatus(tabId) {
  return new Promise((resolve) => {
    if (!Number.isInteger(tabId)) return resolve(null);
    chrome.tabs.sendMessage(tabId, { type: 'CC_GET_STATUS' }, (response) => {
      if (chrome.runtime.lastError) return resolve(null);
      resolve(response || null);
    });
  });
}

function diagnoseMissingContentScript() {
  if (!currentTabUrl) {
    return { statusUnavailable: true, message: 'The active tab URL is unavailable. Select a normal browser tab and open the popup again.' };
  }

  let url;
  try { url = new URL(currentTabUrl); }
  catch { return { pageUnavailable: true, message: 'The active tab URL could not be read. Select a normal webpage and open the popup again.' }; }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { pageUnavailable: true, message: 'Chrome and Edge do not allow extension content scripts on browser-internal pages such as chrome://extensions, or on some protected pages. Open a normal website tab.' };
  }

  const protectedStorePage = url.hostname === 'chromewebstore.google.com' ||
    (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore')) ||
    (url.hostname === 'microsoftedge.microsoft.com' && url.pathname.startsWith('/addons'));
  if (protectedStorePage) {
    return { pageUnavailable: true, message: 'Browser extension stores restrict content scripts on their own pages. Open a normal website tab with a chessboard.' };
  }

  const classification = window.ChessSitePolicy?.classifyUrl(currentTabUrl) || 'unknown';
  if (classification === 'blocked') {
    return { blockedPage: true, practicePage: false, boardDetected: false, active: false };
  }
  if (classification === 'practice') {
    return { statusUnavailable: true, practicePage: true, boardDetected: false, active: false, message: 'This route is eligible, but its content script did not respond. Make sure the extension is enabled and allowed on this site, then reload the tab. If you just reloaded the extension, refresh the page too.' };
  }
  return { statusUnavailable: true, practicePage: false, boardDetected: false, active: false, message: 'The page has not responded to the extension. Confirm the extension is enabled and has site access, then refresh the tab. On unfamiliar sites, approval is offered after a chessboard is detected.' };
}

async function refreshStatus(attempt = 0) {
  const tab = await queryActiveTab();
  currentTabId = Number.isInteger(tab?.id) ? tab.id : null;
  currentTabUrl = typeof tab?.url === 'string' ? tab.url : '';
  const status = await queryContentStatus(currentTabId);
  if (!status && attempt < 5) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshStatus(attempt + 1), 300);
    return;
  }
  renderStatus(status || diagnoseMissingContentScript());
}

function loadSettings() {
  chrome.storage.local.get([ENABLED_KEY, VISUAL_SETTINGS_KEY], (result) => {
    if (chrome.runtime.lastError) {
      stateTitle.textContent = 'Could not read settings';
      stateDetail.textContent = chrome.runtime.lastError.message;
      toggleButton.disabled = true;
      setVisualInputsDisabled(true);
      return;
    }
    enabled = typeof result[ENABLED_KEY] === 'boolean' ? result[ENABLED_KEY] : DEFAULT_ENABLED;
    visualSettings = window.ChessVisualSettings.normalizeSettings(result[VISUAL_SETTINGS_KEY]);
    renderToggle();
    renderVisualSettings();
    refreshStatus();
  });
}

function saveVisualSettings() {
  visualSettings = window.ChessVisualSettings.normalizeSettings({
    displayMode: displayMode.value,
    color: markerColor.value,
    lineWeight: lineWeight.value,
    showThinkTimer: showThinkTimer.checked
  });
  renderVisualSettings();
  // Save immediately: browser popups can close before a debounce timer fires.
  chrome.storage.local.set({ [VISUAL_SETTINGS_KEY]: visualSettings }, () => {
    if (chrome.runtime.lastError) {
      stateTitle.textContent = 'Could not save marker settings';
      stateDetail.textContent = chrome.runtime.lastError.message;
    }
  });
}

toggleButton.addEventListener('click', () => {
  toggleButton.disabled = true;
  const next = !enabled;
  chrome.storage.local.set({ [ENABLED_KEY]: next }, () => {
    if (chrome.runtime.lastError) {
      stateTitle.textContent = 'Could not save setting';
      stateDetail.textContent = chrome.runtime.lastError.message;
      toggleButton.disabled = false;
      return;
    }
    enabled = next;
    renderToggle();
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshStatus, 250);
  });
});


allowSiteButton.addEventListener('click', () => {
  if (!currentStatus?.requiresApproval || !currentStatus?.boardDetected || !currentTabUrl) return;
  let origin;
  try {
    const url = new URL(currentTabUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('This page cannot be approved.');
    origin = url.origin;
  } catch (error) {
    stateTitle.textContent = 'Could not approve this site';
    stateDetail.textContent = error?.message || 'The current tab URL is unavailable.';
    return;
  }

  allowSiteButton.disabled = true;
  chrome.runtime.sendMessage({ type: 'CC_ALLOW_PRACTICE_ORIGIN', origin }, (response) => {
    allowSiteButton.disabled = false;
    if (chrome.runtime.lastError || !response?.ok) {
      stateTitle.textContent = 'Could not approve this site';
      stateDetail.textContent = chrome.runtime.lastError?.message || response?.error || 'The request failed.';
      return;
    }
    stateTitle.textContent = 'Site approved';
    stateDetail.textContent = 'Starting analysis if a compatible engine and position are available.';
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshStatus, 250);
  });
});

displayMode.addEventListener('change', saveVisualSettings);
markerColor.addEventListener('input', saveVisualSettings);
lineWeight.addEventListener('change', saveVisualSettings);
showThinkTimer.addEventListener('change', saveVisualSettings);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[ENABLED_KEY]) {
    enabled = typeof changes[ENABLED_KEY].newValue === 'boolean' ? changes[ENABLED_KEY].newValue : DEFAULT_ENABLED;
    renderToggle();
    refreshStatus();
  }
  if (changes[VISUAL_SETTINGS_KEY]) {
    visualSettings = window.ChessVisualSettings.normalizeSettings(changes[VISUAL_SETTINGS_KEY].newValue);
    renderVisualSettings();
  }
});

loadSettings();

const statusPoll = setInterval(() => {
  if (enabled) refreshStatus();
}, 1000);
window.addEventListener('pagehide', () => clearInterval(statusPoll), { once: true });
