'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../site-policy.js');

test('recognizes supported routes across chess sites', () => {
  assert.equal(policy.classifyUrl('https://www.chess.com/game/computer/123'), 'practice');
  assert.equal(policy.classifyUrl('https://www.chess.com/analysis'), 'practice');
  assert.equal(policy.classifyUrl('https://lichess.org/study/abcd1234'), 'practice');
  assert.equal(policy.classifyUrl('https://lichess.org/analysis'), 'practice');
  assert.equal(policy.classifyUrl('https://example.org/practice/board'), 'practice');
  assert.equal(policy.classifyUrl('https://example.org/tools/analysis'), 'practice');
});

test('Chess.com and Lichess live, online, tournament, and game routes are eligible', () => {
  for (const url of [
    'https://www.chess.com/game/live/123',
    'https://www.chess.com/play/online',
    'https://www.chess.com/tournament/123',
    'https://lichess.org/abcd1234',
    'https://lichess.org/tournament/abcd',
    'https://lichess.org/swiss/abcd',
    'https://lichess.org/tv'
  ]) {
    assert.equal(policy.classifyUrl(url), 'practice', `${url} should be eligible`);
    assert.equal(policy.canAnalyze(url), true, `${url} should not be rejected by route policy`);
  }
  assert.equal(policy.classifyUrl('chrome://extensions'), 'blocked');
  assert.equal(policy.classifyUrl('file:///tmp/board.html'), 'blocked');
});

test('unfamiliar origins still require approval, which applies to all paths on that origin', () => {
  const url = 'https://example.org/board/demo';
  const liveLikeUrl = 'https://example.org/online/match/123';
  const tournamentUrl = 'https://example.org/tournament/round-2';
  assert.equal(policy.classifyUrl(url), 'unknown');
  assert.equal(policy.canAnalyze(url, []), false);
  assert.equal(policy.canAnalyze(url, ['https://example.org/path/ignored']), true);
  assert.equal(policy.classifyUrl(liveLikeUrl), 'unknown');
  assert.equal(policy.canAnalyze(liveLikeUrl, []), false);
  assert.equal(policy.canAnalyze(liveLikeUrl, ['https://example.org']), true);
  assert.equal(policy.canAnalyze(tournamentUrl, ['https://example.org']), true);
  assert.equal(policy.needsApproval(url, true, []), true);
  assert.equal(policy.needsApproval(url, false, []), false);
  assert.equal(policy.needsApproval(liveLikeUrl, true, ['https://example.org']), false);
});

test('normalizes only standard web origins and deduplicates them', () => {
  assert.deepEqual(policy.normalizedOrigins(['https://example.org/path', 'https://example.org', 'chrome://settings', 'bad', 'file:///tmp']), ['https://example.org']);
  assert.deepEqual(policy.normalizedOrigins(new Set(['https://example.org/path', 'https://example.org'])), ['https://example.org']);
});
