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
  validateEmail, normalizeServer, resolveServer, normalizeCode, deviceId,
  verifyLicence, DEFAULT_SERVER, GRACE_DAYS, PUBLIC_KEY
} = require('../src/account');
Module._load = originalLoad;

const crypto = require('node:crypto');
const DAY = 86400000;
const NOW = Date.UTC(2026, 8, 17);
const DEVICE = 'device-aaa';

// A stand-in for the server's key: the app is given only the public half, so
// these tests exercise exactly what a user's machine can do.
const pair = crypto.generateKeyPairSync('ed25519');
const publicKey = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const otherKey = crypto.generateKeyPairSync('ed25519').privateKey;

function sign(claims, key = pair.privateKey) {
  const body = Buffer.from(JSON.stringify({
    code: 'ABCD', deviceId: DEVICE, plan: 'month',
    activatedAt: NOW - DAY, expiresAt: NOW + 29 * DAY, issuedAt: NOW, ...claims
  }));
  return `${body.toString('base64url')}.${crypto.sign(null, body, key).toString('base64url')}`;
}
const check = (licence, opts = {}) => verifyLicence(licence, DEVICE, { now: NOW, publicKey, ...opts });

test('服务端签发的凭证验证通过', () => {
  assert.equal(check(sign({})).plan, 'month');
});

// This is the bypass the signature exists to close: before it, writing
// {"active":true} into account.json was enough.
test('没有签名的伪造状态一律不认', () => {
  for (const forged of ['', 'true', '{"active":true}', 'not.alicence', 'a.b.c', null, undefined, 42]) {
    assert.equal(check(forged), null, `不该接受 ${JSON.stringify(forged)}`);
  }
});

test('改过内容的凭证验不过', () => {
  const licence = sign({ expiresAt: NOW + DAY });
  const [body, signature] = licence.split('.');
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  claims.expiresAt = NOW + 9999 * DAY;               // 自己把有效期改长
  const tampered = `${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signature}`;
  assert.equal(check(tampered), null);
});

test('别人用自己的密钥签的凭证不认', () => {
  assert.equal(check(sign({}, otherKey)), null);
});

// Copying account.json to a second machine must not carry the activation with
// it: the claims name one device.
test('凭证换一台设备就失效', () => {
  assert.equal(verifyLicence(sign({}), 'device-bbb', { now: NOW, publicKey }), null);
});

test('套餐到期的凭证失效，永久凭证不受影响', () => {
  assert.equal(check(sign({ expiresAt: NOW - 1 })), null);
  assert.ok(check(sign({ expiresAt: null })), '永久凭证没有到期时间');
});

// Keeps staying offline from outliving a revoked code: the licence is only
// good for as long as the server's last confirmation stands.
test('签发时间过旧的凭证失效', () => {
  assert.ok(check(sign({ issuedAt: NOW - (GRACE_DAYS - 1) * DAY })), '宽限期内仍然有效');
  assert.equal(check(sign({ issuedAt: NOW - (GRACE_DAYS + 1) * DAY })), null);
  assert.equal(check(sign({ issuedAt: 0 })), null, '没有签发时间不能算数');
});

// The address ships with the app so users never see the field; what they type
// only overrides it.
test('留空时用内置地址，填了就用填的', () => {
  assert.equal(resolveServer(''), DEFAULT_SERVER);
  assert.equal(resolveServer('   '), DEFAULT_SERVER);
  assert.equal(resolveServer('https://mine.example.com'), 'https://mine.example.com');
});

// Passwords and activation codes travel over this address, so a build that
// shipped an http:// one would put both on the wire in the clear.
test('内置账号服务器地址是 https', () => {
  assert.match(DEFAULT_SERVER, /^https:\/\//);
});

// Shipping a build with no public key would leave every activated user at the
// free daily limit, because nothing could ever verify.
test('内置公钥存在且是一把能用的 Ed25519 公钥', () => {
  assert.ok(PUBLIC_KEY, 'PUBLIC_KEY 不能为空，否则所有激活都验不过');
  const key = crypto.createPublicKey({
    key: Buffer.from(PUBLIC_KEY, 'base64'), format: 'der', type: 'spki'
  });
  assert.equal(key.asymmetricKeyType, 'ed25519');
});

test('接受主流邮箱并转成小写', () => {
  assert.equal(validateEmail('  Alice@QQ.com '), 'alice@qq.com');
  assert.equal(validateEmail('me@Gmail.com'), 'me@gmail.com');
});

for (const bad of ['', 'not-an-email', 'a@b', 'a b@qq.com', 'a@qq']) {
  test(`拒绝格式不对的邮箱 ${JSON.stringify(bad)}`, () => {
    assert.throws(() => validateEmail(bad), /邮箱/);
  });
}

// The domain allowlist exists so a code lands in an inbox that actually
// checks it, not to be a hurdle — but it does mean a real, valid address on
// an unlisted provider is refused, and the test should say so plainly.
for (const bad of ['me@some-random-domain.xyz', 'me@a-disposable-mail.com']) {
  test(`拒绝不在白名单里的邮箱服务商 ${JSON.stringify(bad)}`, () => {
    assert.throws(() => validateEmail(bad), /邮箱服务商/);
  });
}

for (const good of ['a@163.com', 'a@126.com', 'a@outlook.com', 'a@hotmail.com', 'a@icloud.com', 'a@foxmail.com']) {
  test(`接受主流邮箱服务商 ${JSON.stringify(good)}`, () => {
    assert.equal(validateEmail(good), good);
  });
}

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
