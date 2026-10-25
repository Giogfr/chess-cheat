'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const styles = require('../move-styles.js');

function candidate(rank, cp, pv, extra = {}) {
  return { rank, depth: 12, cp, mate: null, pv, ...extra };
}

test('human-like selection uses the top candidate when it is the only plausible line', () => {
  const lines = [candidate(1, 100, 'e2e4'), candidate(2, -30, 'd2d4')];
  assert.equal(styles.choose(lines, 'human', {}, () => 0.99).uci, 'e2e4');
});

test('human-like selection can vary among candidates close to the best evaluation', () => {
  const lines = [candidate(1, 100, 'e2e4'), candidate(2, 90, 'd2d4')];
  assert.equal(styles.choose(lines, 'human', {}, () => 0.999).uci, 'd2d4');
});

test('candidate parsing rejects malformed moves and missing evaluations', () => {
  const lines = [
    candidate(1, 80, 'not-a-move'),
    candidate(2, null, 'g1f3 b8c6'),
    candidate(3, 20, 'g1f3 b8c6')
  ];
  assert.equal(styles.choose(lines, 'human', {}, () => 0).uci, 'g1f3');
  assert.equal(styles.choose([], 'human'), null);
});

test('mate scores are ranked ahead of ordinary centipawn scores', () => {
  const lines = [candidate(1, 2400, 'e2e4'), { rank: 2, depth: 12, cp: null, mate: 3, pv: 'd2d4' }];
  assert.equal(styles.choose(lines, 'human', {}, () => 0).uci, 'd2d4');
});

test('random-source errors fall back to a bounded deterministic value', () => {
  const lines = [candidate(1, 100, 'e2e4'), candidate(2, 95, 'd2d4')];
  assert.equal(styles.choose(lines, 'human', {}, () => Number.NaN).uci, 'e2e4');
});

test('move-selection window stays bounded', () => {
  const lines = [candidate(1, 100, 'e2e4'), candidate(2, 35, 'd2d4'), candidate(3, 20, 'g1f3')];
  assert.equal(styles.choose(lines, 'human', {}, () => 0.999).uci, 'd2d4');
  assert.equal(styles.MAX_EVALUATION_LOSS, 65);
});
