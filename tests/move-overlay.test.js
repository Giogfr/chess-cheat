'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.ChessVisualSettings = require('../visual-settings.js');
const overlay = require('../move-overlay.js');
const defaults = globalThis.ChessVisualSettings.DEFAULT_SETTINGS;

test('arrow mode renders a source marker and stable arrow using the selected color', () => {
  const markup = overlay.renderMove('e2e4', false, { ...defaults, color: '#ff8800', displayMode: 'arrow' });
  assert.match(markup, /stroke="#ff8800"/);
  assert.match(markup, /marker-end=/);
  assert.match(markup, /stroke-width="17"/);
  assert.doesNotMatch(markup, /<rect\b/);
});

test('square mode highlights the source and destination without drawing an arrow', () => {
  const markup = overlay.renderMove('e2e4', false, { ...defaults, displayMode: 'squares', color: '#22cc88' });
  assert.equal((markup.match(/<rect\b/g) || []).length, 2);
  assert.match(markup, /fill="#22cc88"/);
  assert.match(markup, /stroke-width="5"/);
  assert.doesNotMatch(markup, /<path\b/);
  const boldMarkup = overlay.renderMove('e2e4', false, { ...defaults, displayMode: 'squares', lineWeight: 'bold' });
  assert.match(boldMarkup, /stroke-width="8"/);
});

test('combined mode renders both square highlights and arrow paths', () => {
  const markup = overlay.renderMove('e2e4', false, { ...defaults, displayMode: 'both' });
  assert.equal((markup.match(/<rect\b/g) || []).length, 2);
  assert.ok((markup.match(/<path\b/g) || []).length >= 2);
});

test('board flipping mirrors the source and destination squares', () => {
  assert.deepEqual(overlay.squareCenter('a1', false), { x: 50, y: 750 });
  assert.deepEqual(overlay.squareCenter('a1', true), { x: 750, y: 50 });
  assert.deepEqual(overlay.squareCenter('h8', true), { x: 50, y: 750 });
});

test('invalid moves do not create overlay markup', () => {
  assert.equal(overlay.renderMove('not-a-move', false, defaults), '');
  assert.equal(overlay.renderMove('e2e2', false, defaults), '');
});

test('marker settings fall back safely and normalize hex colors', () => {
  assert.deepEqual(globalThis.ChessVisualSettings.normalizeSettings({
    displayMode: 'script', color: 'red', lineWeight: 'huge'
  }), defaults);
  assert.equal(globalThis.ChessVisualSettings.normalizeSettings({ color: '#AbCdEf' }).color, '#abcdef');
});
