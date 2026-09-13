const { test } = require('node:test');
const assert = require('node:assert/strict');

// The module needs electron for app paths and net; only the pure input checks
// are exercised here.
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return { app: { getPath: () => '.' }, net: {} };
  return originalLoad.call(this, request, ...rest);
};
const { validateCredentials, normalizeServer, MIN_PASSWORD } = require('../src/account');
Module._load = originalLoad;

test('接受正常邮箱并返回去空格后的值', () => {
  assert.equal(validateCredentials('  me@example.com ', 'longenough1'), 'me@example.com');
});

for (const bad of ['', 'not-an-email', 'a@b', 'a b@example.com', 'a@example']) {
  test(`拒绝无效邮箱 ${JSON.stringify(bad)}`, () => {
    assert.throws(() => validateCredentials(bad, 'longenough1'), /邮箱/);
  });
}

test(`密码短于 ${MIN_PASSWORD} 位被拒绝`, () => {
  assert.throws(() => validateCredentials('me@example.com', 'short'), /密码/);
});

test('只校验邮箱时可以不给密码', () => {
  assert.equal(validateCredentials('me@example.com', '', { requirePassword: false }), 'me@example.com');
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
