// NovaPull account server.
//
// Deliberately dependency-free: it runs on a stock Node install, which keeps a
// small VPS easy to maintain and leaves nothing to audit but this file.
//
// Accounts are identified by email and there is no password: signing in sends
// a one-time code to that address and nothing else proves who you are. A code
// is single-use and expires in CODE_TTL_MS regardless of how many times it is
// requested, so nothing worth calling "storage" exists to leak.
//
// Activation codes are minted out of band with generate-codes.js; this server
// only ever binds an existing one to the first device that redeems it.
'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const MAX_BODY = 4096;
const TOKEN_DAYS = 30;

/* --------------------------------------------------------------- email */

// Sending a code only to a real, receivable inbox is the entire security
// model, so the address must at least look like one — and, since abuse here
// means someone else's inbox gets spammed on our sender reputation, only to a
// short list of providers big enough that a burst of new signups from them
// looks ordinary rather than suspicious.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ALLOWED_EMAIL_DOMAINS = new Set([
  'qq.com', 'foxmail.com', 'vip.qq.com', '163.com', '126.com', 'yeah.net',
  'sina.com', 'sina.cn', 'sohu.com', 'aliyun.com', '139.com', 'wo.cn', '189.cn',
  'gmail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com', 'me.com'
]);

function validateEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!EMAIL_SHAPE.test(email)) throw new Error('请输入有效的邮箱地址');
  const domain = email.split('@')[1];
  if (!ALLOWED_EMAIL_DOMAINS.has(domain)) throw new Error('暂不支持该邮箱服务商，请换一个常用邮箱（QQ/163/126/Gmail/Outlook 等）');
  return email;
}

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

/* --------------------------------------------------- verification codes */

// Kept in memory only, never in data.json: a code is worthless within
// minutes, so there is nothing here worth surviving a restart.
const pendingCodes = new Map(); // email -> { hash, expiresAt, attempts, lastSentAt }

const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

function hashCode(code, email) {
  // Salted with the email so two people who happen to get the same 6 digits
  // at the same moment do not produce identical hashes.
  return crypto.createHash('sha256').update(`${email}:${code}`).digest('hex');
}

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/* ---------------------------------------------------------------- mail */

// Sent through Resend rather than the mailbox on this same domain used for
// human mail — mixing automated verification volume into a personal inbox's
// sending reputation is how that inbox ends up flagged.
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || 'NovaPull <noreply@mail.qike.ccwu.cc>';

async function sendCodeEmail(email, code, lang) {
  if (!RESEND_API_KEY) throw new Error('邮件服务未配置（缺少 RESEND_API_KEY），暂时无法发送验证码');
  const zh = lang !== 'en';
  const subject = zh ? `你的 NovaPull 验证码：${code}` : `Your NovaPull verification code: ${code}`;
  const html = zh
    ? `<p>你的 NovaPull 验证码是 <b style="font-size:20px">${code}</b>，10 分钟内有效，请勿泄露给他人。</p>`
    : `<p>Your NovaPull verification code is <b style="font-size:20px">${code}</b>. It expires in 10 minutes — do not share it with anyone.</p>`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: email, subject, html })
  });
  if (!response.ok) throw new Error(`验证码邮件发送失败（${response.status}），请稍后再试`);
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
  return { email: user.email, createdAt: user.createdAt };
}

/* --------------------------------------------------------- rate limit */

// Enough to blunt abuse without needing a dependency.
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

// The website (a different origin) calls this API straight from the browser,
// so it needs to be told which origins may. Kept to an explicit list rather
// than "*" — nothing here uses cookies, so the risk is low either way, but
// naming the real callers costs nothing.
const ALLOWED_ORIGINS = new Set([
  'https://www.qike.ccwu.cc',
  'https://qike.ccwu.cc',
  'http://localhost:4321' // the website's own local preview server
]);

function send(response, status, body, request) {
  const text = JSON.stringify(body);
  const origin = request && request.headers.origin;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store'
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  response.writeHead(status, headers);
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

async function requestCode(request, response) {
  if (tooManyAttempts(clientIp(request))) return send(response, 429, { message: '尝试过于频繁，请稍后再试' }, request);
  const body = await readBody(request);
  let email;
  try { email = validateEmail(body.email); }
  catch (error) { return send(response, 400, { message: error.message }, request); }

  const pending = pendingCodes.get(email);
  if (pending && Date.now() - pending.lastSentAt < CODE_RESEND_COOLDOWN_MS) {
    return send(response, 429, { message: '验证码刚发送过，请稍后再试' }, request);
  }

  const code = generateCode();
  pendingCodes.set(email, { hash: hashCode(code, email), expiresAt: Date.now() + CODE_TTL_MS, attempts: 0, lastSentAt: Date.now() });

  try { await sendCodeEmail(email, code, body.lang); }
  catch (error) { return send(response, 502, { message: error.message }, request); }
  send(response, 200, { ok: true }, request);
}

async function verifyCode(request, response) {
  if (tooManyAttempts(clientIp(request))) return send(response, 429, { message: '尝试过于频繁，请稍后再试' }, request);
  const body = await readBody(request);
  let email;
  try { email = validateEmail(body.email); }
  catch (error) { return send(response, 400, { message: error.message }, request); }
  const code = String(body.code || '').trim();

  const pending = pendingCodes.get(email);
  if (!pending || Date.now() > pending.expiresAt) return send(response, 400, { message: '验证码不存在或已过期，请重新获取' }, request);
  if (pending.attempts >= MAX_CODE_ATTEMPTS) {
    pendingCodes.delete(email);
    return send(response, 429, { message: '验证码错误次数过多，请重新获取' }, request);
  }

  const a = Buffer.from(hashCode(code, email), 'hex');
  const b = Buffer.from(pending.hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    pending.attempts += 1;
    return send(response, 401, { message: '验证码不正确' }, request);
  }

  pendingCodes.delete(email);
  if (!db.users[email]) db.users[email] = { email, createdAt: Date.now() };
  const token = issueToken(email);
  save();
  send(response, 200, { token, user: publicUser(db.users[email]) }, request);
}

function me(request, response) {
  const user = userForToken(bearer(request));
  if (!user) return send(response, 401, { message: '登录已失效，请重新登录' }, request);
  send(response, 200, { user: publicUser(user) }, request);
}

function logout(request, response) {
  const token = bearer(request);
  if (token && db.tokens[token]) { delete db.tokens[token]; save(); }
  send(response, 200, { ok: true }, request);
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
  if (tooManyAttempts(clientIp(request))) return send(response, 429, { message: '尝试过于频繁，请稍后再试' }, request);
  const user = userForToken(bearer(request));
  if (!user) return send(response, 401, { message: '请先登录再激活' }, request);

  const body = await readBody(request);
  const code = String(body.code || '').trim().toUpperCase();
  const deviceId = String(body.deviceId || '').trim();
  if (!code || !deviceId) return send(response, 400, { message: '缺少激活码或设备标识' }, request);

  adoptNewCodes();
  const entry = db.codes[code];
  if (!entry) return send(response, 404, { message: '激活码不存在' }, request);
  if (entry.revoked) return send(response, 403, { message: '该激活码已被吊销' }, request);
  if (entry.deviceId && entry.deviceId !== deviceId) return send(response, 409, { message: '该激活码已绑定其他设备' }, request);
  if (entry.email && entry.email !== user.email) return send(response, 409, { message: '该激活码已被其他账号使用' }, request);

  if (!entry.deviceId) {
    if (entry.activatedAt) {
      // Freed up by a rebind, not fresh — same clock keeps running, only the
      // device changes. Otherwise every rebind would double as a free renewal.
      if (expired(entry)) return send(response, 403, { message: '该激活码已到期' }, request);
    } else {
      // The plan's clock starts here, not when the code was minted.
      entry.activatedAt = Date.now();
      entry.expiresAt = entry.days ? entry.activatedAt + entry.days * 86400000 : null;
    }
    entry.deviceId = deviceId;
    entry.email = user.email;
    save();
  } else if (expired(entry)) {
    return send(response, 403, { message: '该激活码已到期' }, request);
  }
  send(response, 200, {
    ok: true, activatedAt: entry.activatedAt, expiresAt: entry.expiresAt || null,
    plan: entry.plan || null, licence: issueLicence(code, entry)
  }, request);
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
  }, request);
}

// What the website's user centre shows: every code this account has ever
// redeemed, not just the one device asking about itself.
function myActivations(request, response) {
  const user = userForToken(bearer(request));
  if (!user) return send(response, 401, { message: '登录已失效，请重新登录' }, request);
  adoptNewCodes();
  const list = Object.entries(db.codes)
    .filter(([, entry]) => entry.email === user.email)
    .map(([code, entry]) => ({
      code,
      deviceId: entry.deviceId,
      plan: entry.plan || null,
      activatedAt: entry.activatedAt,
      expiresAt: entry.expiresAt || null,
      revoked: Boolean(entry.revoked),
      expired: expired(entry),
      // null once eligible now, so the client never has to redo this math —
      // just compare it to the current time, or show it as a countdown.
      rebindAvailableAt: entry.lastRebindAt ? entry.lastRebindAt + REBIND_COOLDOWN_DAYS * 86400000 : null
    }));
  send(response, 200, { activations: list }, request);
}

// Changing computers is routine, not a support ticket — but a code that can be
// freely re-pointed at a new device on demand is a code that can be shared
// around a group chat one device at a time. The cooldown is what keeps
// "I got a new laptop" from turning into "we take turns".
const REBIND_COOLDOWN_DAYS = 90;

// Clears the device binding so the same code can be redeemed fresh elsewhere.
// The plan's clock is untouched — moving devices does not refund time, it only
// continues the countdown that already started at first activation.
async function rebindActivation(request, response) {
  if (tooManyAttempts(clientIp(request))) return send(response, 429, { message: '尝试过于频繁，请稍后再试' }, request);
  const user = userForToken(bearer(request));
  if (!user) return send(response, 401, { message: '登录已失效，请重新登录' }, request);

  const body = await readBody(request);
  const code = String(body.code || '').trim().toUpperCase();
  adoptNewCodes();
  const entry = db.codes[code];
  if (!entry || entry.email !== user.email) return send(response, 404, { message: '激活码不存在' }, request);
  if (entry.revoked) return send(response, 403, { message: '该激活码已被吊销' }, request);
  if (!entry.deviceId) return send(response, 400, { message: '这个激活码还没有绑定任何设备' }, request);
  if (expired(entry)) return send(response, 403, { message: '该激活码已到期，换绑无法延长有效期' }, request);

  const availableAt = entry.lastRebindAt ? entry.lastRebindAt + REBIND_COOLDOWN_DAYS * 86400000 : 0;
  if (Date.now() < availableAt) {
    const daysLeft = Math.ceil((availableAt - Date.now()) / 86400000);
    return send(response, 429, { message: `每个激活码 ${REBIND_COOLDOWN_DAYS} 天只能换绑一次，还需等待 ${daysLeft} 天` }, request);
  }

  entry.deviceId = null;
  entry.lastRebindAt = Date.now();
  save();
  send(response, 200, { ok: true }, request);
}

const ROUTES = {
  'POST /api/auth/request-code': requestCode,
  'POST /api/auth/verify-code': verifyCode,
  'GET /api/auth/me': me,
  'POST /api/auth/logout': logout,
  'POST /api/activation/redeem': redeemActivation,
  'POST /api/activation/status': activationStatus,
  'POST /api/activation/rebind': rebindActivation,
  'GET /api/account/activations': myActivations,
  // "mail" and "signing" are here so a deployment that forgot a setup step is
  // obvious from outside rather than only in the log.
  'GET /api/health': (request, response) => send(response, 200, {
    ok: true, users: Object.keys(db.users).length, signing: Boolean(signingKey), mail: Boolean(RESEND_API_KEY)
  }, request)
};

const server = http.createServer(async (request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  if (request.method === 'OPTIONS') {
    const origin = request.headers.origin;
    const headers = { 'Content-Length': 0 };
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Methods'] = 'GET, POST';
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
      headers['Vary'] = 'Origin';
    }
    response.writeHead(204, headers);
    return response.end();
  }
  const handler = ROUTES[`${request.method} ${pathname}`];
  if (!handler) return send(response, 404, { message: '接口不存在' }, request);
  try {
    await handler(request, response);
  } catch (error) {
    send(response, 400, { message: error.message || '请求处理失败' }, request);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`NovaPull account server on http://${HOST}:${PORT} (data: ${DATA_FILE})`);
});
