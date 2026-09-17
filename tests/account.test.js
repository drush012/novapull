const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The module needs electron for app paths and net; the pure input checks and
// the on-disk device id are exercised here, the network calls are not.
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'novapull-account-'));
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return { app: { getPath: () => userData }, net: {} };
  return originalLoad.call(this, request, ...rest);
};
const {
  validateCredentials, normalizeServer, resolveServer, normalizeCode, deviceId,
  MIN_PASSWORD, DEFAULT_SERVER
} = require('../src/account');
Module._load = originalLoad;

// The address ships with the app so users never see the field; what they type
// only overrides it.
test('留空时用内置地址，填了就用填的', () => {
  assert.equal(resolveServer(''), DEFAULT_SERVER);
  assert.equal(resolveServer('   '), DEFAULT_SERVER);
  assert.equal(resolveServer('https://mine.example.com'), 'https://mine.example.com');
});

test('接受正常用户名并转成小写', () => {
  assert.equal(validateCredentials('  Alice_01 ', 'longenough1'), 'alice_01');
});

for (const bad of ['', 'ab', 'a'.repeat(21), 'has space', 'bad-dash', 'me@example.com', '用户名']) {
  test(`拒绝无效用户名 ${JSON.stringify(bad)}`, () => {
    assert.throws(() => validateCredentials(bad, 'longenough1'), /用户名/);
  });
}

test(`密码短于 ${MIN_PASSWORD} 位被拒绝`, () => {
  assert.throws(() => validateCredentials('alice', 'short'), /密码/);
});

test('只校验用户名时可以不给密码', () => {
  assert.equal(validateCredentials('alice', '', { requirePassword: false }), 'alice');
});

// Codes are read off a screen and typed by hand, so case and stray spaces must
// not decide whether a paid code works.
test('激活码去空格并转成大写', () => {
  assert.equal(normalizeCode('  abcd-efgh '), 'ABCD-EFGH');
});

test('空激活码被拒绝', () => {
  assert.throws(() => normalizeCode('   '), /激活码/);
});

// One code binds one device, so the id must survive restarts — regenerating it
// would strand the user's code on a device that no longer claims it.
test('设备标识写入磁盘后保持不变', () => {
  const first = deviceId();
  assert.match(first, /^[0-9a-f-]{36}$/);
  assert.equal(deviceId(), first);
  assert.equal(fs.readFileSync(path.join(userData, 'device-id.txt'), 'utf8').trim(), first);
});

test('服务器地址去掉末尾斜杠', () => {
  assert.equal(normalizeServer('https://api.example.com/'), 'https://api.example.com');
  assert.equal(normalizeServer('https://api.example.com///'), 'https://api.example.com');
});

test('保留子路径，便于服务端挂在二级目录', () => {
  assert.equal(normalizeServer('https://example.com/nova/'), 'https://example.com/nova');
});

test('空地址表示未配置', () => {
  assert.equal(normalizeServer(''), '');
  assert.equal(normalizeServer('   '), '');
});

for (const bad of ['ftp://example.com', 'file:///c:/x', 'javascript:alert(1)']) {
  test(`拒绝非 HTTP 协议 ${JSON.stringify(bad)}`, () => {
    assert.throws(() => normalizeServer(bad), /http/);
  });
}

test('拒绝无法解析的地址', () => {
  assert.throws(() => normalizeServer('not a url'), /格式/);
});
