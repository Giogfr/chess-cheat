'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const settings = require('../visual-settings.js');

test('default marker settings use arrows, lime color, normal weight and the position timer', () => {
  assert.deepEqual(settings.normalizeSettings(null), {
    displayMode: 'arrow', color: '#a3e635', lineWeight: 'normal', showThinkTimer: true
  });
});

test('valid user settings are preserved', () => {
  assert.deepEqual(settings.normalizeSettings({
    displayMode: 'squares', color: '#0066ff', lineWeight: 'bold', showThinkTimer: false
  }), { displayMode: 'squares', color: '#0066ff', lineWeight: 'bold', showThinkTimer: false });
});

test('bad values are replaced individually with defaults', () => {
  assert.deepEqual(settings.normalizeSettings({
    displayMode: 'anything', color: '#123', lineWeight: 'wide', showThinkTimer: 'yes'
  }), { displayMode: 'arrow', color: '#a3e635', lineWeight: 'normal', showThinkTimer: true });
});
