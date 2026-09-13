const { test } = require('node:test');
const assert = require('node:assert/strict');
const { qualityTier, shortSide } = require('../src/quality');

test('标准分辨率映射到常用名称', () => {
  assert.equal(qualityTier(7680, 4320), '8K');
  assert.equal(qualityTier(3840, 2160), '4K');
  assert.equal(qualityTier(2560, 1440), '2K');
  assert.equal(qualityTier(1920, 1080), '1080P');
  assert.equal(qualityTier(1280, 720), '720P');
  assert.equal(qualityTier(854, 480), '480P');
});

test('非标准分辨率就近归档，不再显示 4050p 这种数字', () => {
  // Real values seen on a YouTube master: 7200x4050 and 3600x2026.
  assert.equal(qualityTier(7200, 4050), '8K');
  assert.equal(qualityTier(3600, 2026), '4K');
  assert.equal(qualityTier(2400, 1350), '2K');
  assert.equal(qualityTier(1800, 1012), '1080P');
  assert.equal(qualityTier(1200, 676), '720P');
});

test('竖屏按短边判定，不会把 1080x1920 报成 8K 邻近档', () => {
  assert.equal(qualityTier(1080, 1920), '1080P');
  assert.equal(qualityTier(720, 1280), '720P');
  assert.equal(shortSide(1080, 1920), 1080);
});

test('低于最低档时回落到原始数字', () => {
  assert.equal(qualityTier(160, 120), '120P');
});

test('缺少尺寸时返回空串而不是乱猜', () => {
  assert.equal(qualityTier(0, 0), '');
  assert.equal(qualityTier(undefined, undefined), '');
});

test('只有高度也能判定', () => {
  assert.equal(qualityTier(0, 2160), '4K');
});

test('容差上限：低于档位 10% 仍归入该档，再低则降档', () => {
  assert.equal(qualityTier(0, 1944), '4K');   // 2160 的 90%
  assert.equal(qualityTier(0, 1943), '2K');   // 差一点就降档
});
