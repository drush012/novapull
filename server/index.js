// NovaPull account server.
//
// Deliberately dependency-free: it runs on a stock Node install, which keeps a
// small VPS easy to maintain and leaves nothing to audit but this file.
//
// Passwords are stored only as scrypt hashes with a per-user salt. Tokens are
// random bytes; there is no signing key to leak. Run it behind a TLS
// terminator — over plain HTTP the password is readable on the wire.
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
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ------------------------------------------------------------- storage */

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { users: {}, tokens: {} }; }
}

let db = load();

// Written via a temp file so a crash mid-write cannot truncate the database.
function save() {
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

function issueToken(email) {
  const token = crypto.randomBytes(32).toString('hex');
  db.tokens[token] = { email, createdAt: Date.now() };
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
  return db.users[entry.email] || null;
}

function publicUser(user) {
  return { email: user.email, name: user.name || user.email.split('@')[0], createdAt: user.createdAt };
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
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!EMAIL.test(email)) return send(response, 400, { message: '邮箱格式不正确' });
  if (password.length < MIN_PASSWORD) return send(response, 400, { message: `密码至少 ${MIN_PASSWORD} 位` });
  if (db.users[email]) return send(response, 409, { message: '该邮箱已注册' });

  const { salt, hash } = hashPassword(password);
  db.users[email] = { email, salt, hash, createdAt: Date.now() };
  const token = issueToken(email);
  save();
  send(response, 201, { token, user: publicUser(db.users[email]) });
}

async function login(request, response) {
  if (tooManyAttempts(clientIp(request))) return send(response, 429, { message: '尝试过于频繁，请稍后再试' });
  const body = await readBody(request);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const user = db.users[email];
  // One message for both cases: revealing which half was wrong helps an
  // attacker enumerate accounts.
  if (!user || !passwordMatches(password, user)) return send(response, 401, { message: '邮箱或密码不正确' });
  const token = issueToken(email);
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

const ROUTES = {
  'POST /api/auth/register': register,
  'POST /api/auth/login': login,
  'GET /api/auth/me': me,
  'POST /api/auth/logout': logout,
  'GET /api/health': (_request, response) => send(response, 200, { ok: true, users: Object.keys(db.users).length })
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
