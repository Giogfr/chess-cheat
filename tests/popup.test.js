'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const popupHtml = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
const popupJs = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
const contentJs = fs.readFileSync(path.join(root, 'content.js'), 'utf8');

function extractFunction(source, name, nextFunction) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextFunction}(`, start + 1);
  assert.notEqual(start, -1, `${name} function should exist`);
  assert.notEqual(end, -1, `${nextFunction} function should follow ${name}`);
  return source.slice(start, end);
}

test('toolbar icon opens the popup with a master switch and compact visual controls', () => {
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.match(popupHtml, /id="toggle"/);
  assert.match(popupHtml, /id="display-mode"/);
  assert.match(popupHtml, /value="arrow"/);
  assert.match(popupHtml, /value="squares"/);
  assert.match(popupHtml, /value="both"/);
  assert.match(popupHtml, /id="marker-color"/);
  assert.match(popupHtml, /id="line-weight"/);
  assert.match(popupHtml, /id="show-think-timer" type="checkbox" checked/);
  assert.match(popupJs, /showThinkTimer\.checked = visualSettings\.showThinkTimer/);
  assert.match(popupJs, /showThinkTimer: showThinkTimer\.checked/);
  assert.match(popupJs, /const DEFAULT_ENABLED = true/);
  assert.match(popupJs, /chrome\.storage\.local\.set\(\{ \[ENABLED_KEY\]: next \}/);
  assert.match(popupJs, /chrome\.storage\.local\.set\(\{ \[VISUAL_SETTINGS_KEY\]: visualSettings \}/);
  assert.match(popupJs, /Save immediately: browser popups can close before a debounce timer fires/);
  assert.doesNotMatch(popupJs, /saveTimer|setTimeout\(\(\) => \{[\s\S]{0,100}VISUAL_SETTINGS_KEY/);
});

test('popup does not claim live and competitive routes are blocked', () => {
  assert.match(popupJs, /This page type is not available to extension scripts/);
  assert.doesNotMatch(popupJs, /Live and competitive games are unsupported/);
  assert.doesNotMatch(popupHtml, /live and competitive routes are blocked/i);
  assert.doesNotMatch(popupJs, /The current browser page cannot run extension scripts/);
});

test('missing content-script responses get route-aware diagnostics instead of a misleading browser-script error', () => {
  assert.match(popupHtml, /<script src="site-policy\.js"><\/script>/);
  assert.ok(popupHtml.indexOf('site-policy.js') < popupHtml.indexOf('popup.js'));
  assert.match(popupJs, /function diagnoseMissingContentScript\(\)/);
  assert.match(popupJs, /classification === 'blocked'/);
  assert.match(popupJs, /classification === 'practice'/);
  assert.match(popupJs, /pageUnavailable: true/);
  assert.match(popupJs, /Supported page not responding/);
  assert.match(popupJs, /refresh the tab/i);
  assert.doesNotMatch(popupJs, /The current browser page cannot run extension scripts/);
});

test('page source does not inject a floating analysis panel', () => {
  assert.doesNotMatch(contentJs, /cc-analysis-panel|buildPanel|Start analysis/);
  assert.match(contentJs, /cc-analysis-arrow-layer/);
});

test('content source uses cross-site board adapters and exposes origin approval for unfamiliar routes', () => {
  assert.match(contentJs, /ChessBoardAdapter/);
  assert.match(contentJs, /ChessSitePolicy/);
  assert.match(popupHtml, /id=\"allow-site\"/);
  assert.match(popupJs, /Approve this site origin/);
  assert.match(popupHtml, /Approve this site/);
});

test('early principal variations can render a provisional recommendation before bestmove', () => {
  const parseInfo = extractFunction(contentJs, 'parseInfo', 'chooseRecommendation');
  assert.match(parseInfo, /state\.info\.set\(rank/);
  assert.match(parseInfo, /Number\(depthMatch\[1\]\) >= 4/);
  assert.match(parseInfo, /chooseRecommendation\(\)/);
  assert.match(contentJs, /if \(text\.startsWith\('bestmove '\)\)/);
});

test('turn-detection failures clear stale arrows and stop a search for an old position', () => {
  assert.match(contentJs, /if \(result\.error\) \{\s*invalidatePosition\(result\.error\);/);
  assert.match(contentJs, /inferTurnFromBoardChange\(previousMap, map\)/);
});

test('content script requests full position FEN through the page-world bridge', () => {
  const bridge = fs.readFileSync(path.join(root, 'bridge.js'), 'utf8');
  assert.match(contentJs, /postMain\('READ_POSITION'/);
  assert.match(contentJs, /message\.type === 'POSITION_STATE'/);
  assert.match(bridge, /message\.type === 'READ_POSITION'/);
  assert.match(bridge, /getFEN/);
});

test('visual settings and move overlay are loaded before the content script', () => {
  const files = manifest.content_scripts[0].js;
  assert.ok(files.indexOf('visual-settings.js') < files.indexOf('content.js'));
  assert.ok(files.indexOf('move-overlay.js') < files.indexOf('content.js'));
  assert.ok(files.indexOf('think-timer.js') < files.indexOf('content.js'));
  assert.match(popupHtml, /visual-settings\.js/);
  assert.match(popupHtml, /Counts down to zero/);
  assert.match(contentJs, /Position time ·/);
  assert.match(contentJs, /updateThinkTimerPosition\(placement\)/);
  assert.match(contentJs, /removeThinkTimer\(\)/);
});
