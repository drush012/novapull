const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseVersion, compareVersions, isNewer, normalizeFeed, parseRelease } = require('../src/update');

test('认识常见的版本号写法', () => {
  assert.deepEqual(parseVersion('0.1.2').parts, [0, 1, 2]);
  assert.deepEqual(parseVersion('v0.1.2').parts, [0, 1, 2]);
  assert.deepEqual(parseVersion('V10.20.30').parts, [10, 20, 30]);
  assert.equal(parseVersion('0.1.2-beta.1').pre, 'beta.1');
});

for (const bad of ['', '1.2', 'latest', 'v1', '1.2.3.4', 'abc']) {
  test(`拒绝无法识别的版本号 ${JSON.stringify(bad)}`, () => {
    assert.equal(parseVersion(bad), null);
  });
}

test('逐段比较，不是按字符串比', () => {
  // The string comparison that this replaces would call 0.1.10 older than 0.1.9.
  assert.ok(compareVersions('0.1.10', '0.1.9') > 0);
  assert.ok(compareVersions('0.2.0', '0.10.0') < 0);
  assert.equal(compareVersions('1.2.3', 'v1.2.3'), 0);
});

test('预发布版排在同号正式版之前', () => {
  assert.ok(compareVersions('1.0.0-beta', '1.0.0') < 0);
  assert.ok(compareVersions('1.0.0', '1.0.0-beta') > 0);
  assert.ok(compareVersions('1.0.0-alpha', '1.0.0-beta') < 0);
});

// A malformed tag on the server must never be able to claim it is newer, or a
// broken feed would nag every user to "upgrade" to something unparsable.
test('无法识别的版本一律当作更旧', () => {
  assert.equal(isNewer('garbage', '0.1.2'), false);
  assert.equal(isNewer('', '0.1.2'), false);
  assert.equal(isNewer('0.1.3', '0.1.2'), true);
  assert.equal(isNewer('0.1.2', '0.1.2'), false);
});

test('更新源地址去掉末尾斜杠并保留查询串', () => {
  assert.equal(normalizeFeed('https://api.github.com/repos/a/b/releases/latest/'), 'https://api.github.com/repos/a/b/releases/latest');
  assert.equal(normalizeFeed('https://example.com/feed?channel=beta'), 'https://example.com/feed?channel=beta');
});

test('空地址表示不检查更新', () => {
  assert.equal(normalizeFeed(''), '');
  assert.equal(normalizeFeed('  '), '');
});

// The address decides which page the app later offers to open, so plain HTTP
// (and anything more exotic) is refused outright rather than upgraded.
for (const bad of ['http://example.com/feed', 'file:///c:/feed.json', 'javascript:alert(1)', 'ftp://example.com']) {
  test(`拒绝非 https 更新源 ${JSON.stringify(bad)}`, () => {
    assert.throws(() => normalizeFeed(bad), /https|格式/);
  });
}

test('读取 GitHub 的 releases/latest 结构', () => {
  const release = parseRelease({
    tag_name: 'v0.2.0',
    html_url: 'https://github.com/a/b/releases/tag/v0.2.0',
    body: '修复若干问题',
    published_at: '2026-09-20T10:00:00Z',
    draft: false
  });
  assert.deepEqual(release, {
    version: '0.2.0',
    notes: '修复若干问题',
    published: '2026-09-20',
    page: 'https://github.com/a/b/releases/tag/v0.2.0'
  });
});

test('也接受自建的简单 JSON', () => {
  const release = parseRelease({ version: '1.4.0', page: 'https://example.com/dl', notes: 'hi' });
  assert.equal(release.version, '1.4.0');
  assert.equal(release.page, 'https://example.com/dl');
});

test('草稿版本不算发布', () => {
  assert.throws(() => parseRelease({ tag_name: 'v9.9.9', draft: true }), /发布信息|release data/);
});

test('版本号无法识别时拒绝整条记录', () => {
  assert.throws(() => parseRelease({ tag_name: 'nightly' }), /版本号|version/);
});

// A non-https download page would be dropped rather than handed to the shell.
test('丢弃非 https 的下载页地址', () => {
  assert.equal(parseRelease({ tag_name: '1.0.0', html_url: 'http://example.com/x' }).page, '');
  assert.equal(parseRelease({ tag_name: '1.0.0', html_url: 'javascript:alert(1)' }).page, '');
});

test('更新说明被截断，避免超长正文塞满界面', () => {
  const release = parseRelease({ tag_name: '1.0.0', body: 'x'.repeat(9000) });
  assert.equal(release.notes.length, 4000);
});

for (const bad of [null, undefined, 'string', 42]) {
  test(`拒绝不是对象的响应 ${JSON.stringify(bad)}`, () => {
    assert.throws(() => parseRelease(bad), /发布信息|release data/);
  });
}

test('留空时用内置地址，填了就用填的', () => {
  const { resolveFeed, DEFAULT_FEED } = require('../src/update');
  assert.equal(resolveFeed(''), DEFAULT_FEED);
  assert.equal(resolveFeed('   '), DEFAULT_FEED);
  assert.equal(resolveFeed('https://example.com/f'), 'https://example.com/f');
  assert.equal(resolveFeed(null), DEFAULT_FEED);
});

// A typo here would be invisible: the check fails silently by design, so the
// app would simply never find an update and nobody would notice for months.
test('内置更新源指向本仓库的 releases 接口', () => {
  const { DEFAULT_FEED, normalizeFeed } = require('../src/update');
  assert.ok(DEFAULT_FEED, '内置更新源不应为空');
  // normalizeFeed is what the app actually runs it through; it rejects
  // anything that is not https or not a URL at all.
  assert.doesNotThrow(() => normalizeFeed(DEFAULT_FEED));
  assert.match(DEFAULT_FEED, /^https:\/\/api\.github\.com\/repos\/[\w.-]+\/[\w.-]+\/releases\/latest$/);
});
