const { test } = require('node:test');
const assert = require('node:assert/strict');

// The module pulls in electron for BrowserWindow, which is unavailable under
// plain node; only the pure helpers are exercised here.
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return { BrowserWindow: function () {} };
  return originalLoad.call(this, request, ...rest);
};
const { qualityLabel, shortSide, dedupe } = require('../src/media-probe');
Module._load = originalLoad;

test('横屏视频按短边判定档位', () => {
  assert.equal(qualityLabel({ width: 3840, height: 2160 }), '4K');
  assert.equal(qualityLabel({ width: 2560, height: 1440 }), '2K');
  assert.equal(qualityLabel({ width: 1920, height: 1080 }), '1080P');
});

test('竖屏视频同样按短边判定，不会误报成 4K', () => {
  // A 1080x1920 portrait clip is 1080P, not "1920p".
  assert.equal(qualityLabel({ width: 1080, height: 1920 }), '1080P');
  assert.equal(shortSide({ width: 1080, height: 1920 }), 1080);
});

test('8K 与 4K 的阈值', () => {
  assert.equal(qualityLabel({ width: 7680, height: 4320 }), '8K');
  assert.equal(qualityLabel({ width: 4096, height: 2160 }), '4K');
});

test('同一档位保留码率更高的那条', () => {
  const kept = dedupe([
    { key: 'a', bitrate: 500, size: 10 },
    { key: 'a', bitrate: 900, size: 20 },
    { key: 'a', bitrate: 300, size: 99 }
  ], () => 'a');
  assert.equal(kept.length, 1);
  assert.equal(kept[0].bitrate, 900);
});

test('码率相同时按体积取大', () => {
  const kept = dedupe([
    { bitrate: 500, size: 10 },
    { bitrate: 500, size: 80 }
  ], () => 'same');
  assert.equal(kept[0].size, 80);
});

test('不同 key 各自保留', () => {
  const kept = dedupe([
    { k: '2160', bitrate: 100 },
    { k: '1080', bitrate: 200 }
  ], item => item.k);
  assert.equal(kept.length, 2);
});
