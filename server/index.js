// NovaPull account server.
//
// Deliberately dependency-free: it runs on a stock Node install, which keeps a
// small VPS easy to maintain and leaves nothing to audit but this file.
//
// Passwords are stored only as scrypt hashes with a per-user salt. Tokens are
// random bytes; there is no signing key to leak. Run it behind a TLS
// terminator — over plain HTTP the password is readable on the wire.
//
// Activation codes are minted out of band with generate-codes.js; this server
// only ever binds an existing code to the first device that redeems it.
'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const MAX_BODY = 4096;
const MIN_PASSWORD = 8;
const TOKEN_DAYS = 30;
const USERNAME = /^[A-Za-z0-9_]{3,20}$/;

/* ------------------------------------------------------------- storage */

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { users: {}, tokens: {}, codes: {} }; }
}

let db = load();
// Older data files predate activation codes.
if (!db.codes) db.codes = {};

// generate-codes.js writes straight to the data file, so codes minted while
// this process is running are invisible to it — and the next save() would
// overwrite them with the older in-memory copy. Adopting them before every
// activation keeps minting safe without having to stop the server.
function adoptNewCodes() {
  let disk;
  try { disk = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return; }
  for (const [code, entry] of Object.entries((disk && disk.codes) || {})) {
    if (!db.codes[code]) { db.codes[code] = entry; continue; }
    // revoke-code.js flips this on an existing code, so it is the one field the
    // file may know better than memory. The binding stays whatever we hold.
    db.codes[code].revoked = Boolean(entry.revoked);
  }
}

// Written via a temp file so a crash mid-write cannot truncate the database.
function save() {
  // Any write would otherwise overwrite codes minted since this process started.
  adoptNewCodes();
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db), { mode: 0o600 });
  fs.renameSync(temp, DATA_FILE);
}

/* ------------------------------------------------------------ password */

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash: derived };
}

function passwordMatches(password, user) {
  const { hash } = hashPassword(password, user.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(user.hash, 'hex');
  // Length check first: timingSafeEqual throws on a mismatch.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* -------------------------------------------------------------- tokens */

function issueToken(username) {
  const token = crypto.randomBytes(32).toString('hex');
  db.tokens[token] = { username, createdAt: Date.now() };
  return token;
}

function userForToken(token) {
  const entry = token && db.tokens[token];
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TOKEN_DAYS * 86400000) {
    delete db.tokens[token];
    save();
    return null;
  }
  return db.users[entry.username] || null;
}

function publicUser(user) {
  return { username: user.username, createdAt: user.createdAt };
}

/* --------------------------------------------------------- rate limit */

// Enough to blunt credential stuffing without needing a dependency.
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 20;

function tooManyAttempts(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter(time => now - time < WINDOW_MS);
  list.push(now);
  attempts.set(ip, list);
  return list.length > MAX_ATTEMPTS;
}

/* ----------------------------------------------------------- plumbing */

function send(response, status, body) {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store'
  });
  response.end(text);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error('请求体过大')); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('请求体不是合法 JSON')); }
    });
    request.on('error', reject);
  });
}

function bearer(request) {
  const header = request.headers.authorization || '';
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : '';
}

function clientIp(request) {
  return (request.headers['x-forwarded-for'] || '').split(',')[0].trim() || request.socket.remoteAddress || '?';
}

/* ------------------------------------------------------------ handlers */

async function register(request, response) {
  const body = await readBody(request);
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!USERNAME.test(username)) return send(response, 400, { message: '用户名需为 3-20 位字母、数字或下划线' });
  if (password.length < MIN_PASSWORD) return send(response, 400, { message: `密码至少 ${MIN_PASSWORD} 位` });
  if (db.users[username]) return send(response, 409, { message: '该用户名已被注册' });

  const { salt, hash } = hashPassword(password);
  db.users[username] = { username, salt, hash, createdAt: Date.now() };
  const token = issueToken(username);
  save();
  send(response, 201, { token, user: publicUser(db.users[username]) });
}

async function login(request, response) {
  if (tooManyAttempts(clientIp(request))) return send(response, 429, { message: '尝试过于频繁，请稍后再试' });
  const body = await readBody(request);
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const user = db.users[username];
  // One message for both cases: revealing which half was wrong helps an
  // attacker enumerate accounts.
  if (!user || !passwordMatches(password, user)) return send(response, 401, { message: '用户名或密码不正确' });
  const token = issueToken(username);
  save();
  send(response, 200, { token, user: publicUser(user) });
}

function me(request, response) {
  const user = userForToken(bearer(request));
  if (!user) return send(response, 401, { message: '登录已失效，请重新登录' });
  send(response, 200, { user: publicUser(user) });
}

function logout(request, response) {
  const token = bearer(request);
  if (token && db.tokens[token]) { delete db.tokens[token]; save(); }
  send(response, 200, { ok: true });
}

/* --------------------------------------------------------- activation */

/** A code with no expiresAt is a permanent one and never runs out. */
function expired(entry) {
  return Boolean(entry && entry.expiresAt && Date.now() > entry.expiresAt);
}

// The private half of the pair made by make-keys.js. Without it the server
// still runs — it just cannot issue licences, and says so loudly, because a
// deployment that silently stopped signing would leave every client inactive
// with no clue why.
const KEY_FILE = process.env.KEY_FILE || path.join(path.dirname(DATA_FILE), 'signing-key.pem');
let signingKey = null;
try {
  signingKey = crypto.createPrivateKey(fs.readFileSync(KEY_FILE, 'utf8'));
} catch {
  console.error(`!! 找不到签名私钥 ${KEY_FILE}，无法签发激活凭证。先跑 node server/make-keys.js`);
}

/**
 * A licence the app can check on its own: the claims, plus a signature only
 * this server can produce. issuedAt is what stops an old one being kept
 * forever — the app refuses one that has gone stale.
 */
function issueLicence(code, entry) {
  if (!signingKey) return '';
  const payload = Buffer.from(JSON.stringify({
    code,
    deviceId: entry.deviceId,
    plan: entry.plan || null,
    activatedAt: entry.activatedAt,
    expiresAt: entry.expiresAt || null,
    issuedAt: Date.now()
  }));
  const signature = crypto.sign(null, payload, signingKey);
  return `${payload.toString('base64url')}.${signature.toString('base64url')}`;
}

// A code is spent on the first device that redeems it and stays bound to that
// device and account. Redeeming the same pair again succeeds so a reinstall
// does not cost the user their code; anything else is refused.
async function redeemActivation(request, response) {
  if (tooManyAttempts(clientIp(request))) return send(response, 429, { message: '尝试过于频繁，请稍后再试' });
  const user = userForToken(bearer(request));
  if (!user) return send(response, 401, { message: '请先登录再激活' });

  const body = await readBody(request);
  const code = String(body.code || '').trim().toUpperCase();
  const deviceId = String(body.deviceId || '').trim();
  if (!code || !deviceId) return send(response, 400, { message: '缺少激活码或设备标识' });

  adoptNewCodes();
  const entry = db.codes[code];
  if (!entry) return send(response, 404, { message: '激活码不存在' });
  if (entry.revoked) return send(response, 403, { message: '该激活码已被吊销' });
  if (entry.deviceId && entry.deviceId !== deviceId) return send(response, 409, { message: '该激活码已绑定其他设备' });
  if (entry.username && entry.username !== user.username) return send(response, 409, { message: '该激活码已被其他账号使用' });

  if (!entry.deviceId) {
    entry.deviceId = deviceId;
    entry.username = user.username;
    entry.activatedAt = Date.now();
    // The plan's clock starts here, not when the code was minted.
    entry.expiresAt = entry.days ? entry.activatedAt + entry.days * 86400000 : null;
    save();
  } else if (expired(entry)) {
    return send(response, 403, { message: '该激活码已到期' });
  }
  send(response, 200, {
    ok: true, activatedAt: entry.activatedAt, expiresAt: entry.expiresAt || null,
    plan: entry.plan || null, licence: issueLicence(code, entry)
  });
}

async function activationStatus(request, response) {
  const body = await readBody(request);
  const code = String(body.code || '').trim().toUpperCase();
  const deviceId = String(body.deviceId || '').trim();
  adoptNewCodes();
  const entry = db.codes[code];
  const bound = Boolean(entry && deviceId && entry.deviceId === deviceId);
  const revoked = Boolean(entry && entry.revoked);
  const isExpired = bound && expired(entry);
  // Why it is off travels with the answer, so the app can explain itself rather
  // than just going quiet.
  const active = bound && !revoked && !isExpired;
  send(response, 200, {
    active,
    revoked: bound && revoked,
    expired: isExpired,
    plan: bound ? entry.plan || null : null,
    expiresAt: bound ? entry.expiresAt || null : null,
    activatedAt: bound ? entry.activatedAt : null,
    // Re-issued on every check, which is what refreshes issuedAt and keeps a
    // working device working. A revoked one simply stops being handed a new one.
    licence: active ? issueLicence(code, entry) : ''
  });
}

const ROUTES = {
  'POST /api/auth/register': register,
  'POST /api/auth/login': login,
  'GET /api/auth/me': me,
  'POST /api/auth/logout': logout,
  'POST /api/activation/redeem': redeemActivation,
  'POST /api/activation/status': activationStatus,
  // "signing" is here so a deployment that forgot make-keys.js is obvious from
  // outside rather than only in the log.
  'GET /api/health': (_request, response) => send(response, 200, { ok: true, users: Object.keys(db.users).length, signing: Boolean(signingKey) })
};

const server = http.createServer(async (request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  const handler = ROUTES[`${request.method} ${pathname}`];
  if (!handler) return send(response, 404, { message: '接口不存在' });
  try {
    await handler(request, response);
  } catch (error) {
    send(response, 400, { message: error.message || '请求处理失败' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`NovaPull account server on http://${HOST}:${PORT} (data: ${DATA_FILE})`);
});
