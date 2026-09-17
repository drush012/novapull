// Account state for the app's own sign-in, plus this device's activation.
//
// The app itself is local; accounts only exist on whatever server the user
// points it at, so the server address is configuration rather than a constant.
// Only the returned token is kept on disk — the password is sent once and never
// stored.
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app, net } = require('electron');
const { t } = require('./i18n');

const USERNAME = /^[A-Za-z0-9_]{3,20}$/;
const MIN_PASSWORD = 8;
const TIMEOUT_MS = 15000;

// The address shipped with the app: every user talks to the same server, so
// nobody should have to know it exists. The settings field only overrides it.
const DEFAULT_SERVER = 'https://pull.qike.ccwu.cc';

/** Where requests actually go, given whatever the user did or did not type. */
function resolveServer(configured) {
  return String(configured || '').trim() || DEFAULT_SERVER;
}

function validateCredentials(username, password, { requirePassword = true } = {}) {
  // Lower-cased so "Alice" and "alice" cannot become two accounts; the server
  // folds the same way.
  const account = String(username || '').trim().toLowerCase();
  if (!USERNAME.test(account)) throw new Error(t('err.badUsername'));
  if (requirePassword && String(password || '').length < MIN_PASSWORD) {
    throw new Error(t('err.shortPassword', { min: MIN_PASSWORD }));
  }
  return account;
}

// The public half of the server's signing key (server/make-keys.js). It can
// only check a licence, never mint one, so shipping it to every user is safe.
//
// What this buys: the activation state is no longer a boolean in a file anyone
// can edit. Writing {"active":true} into account.json now proves nothing —
// without the server's signature the app does not believe it.
const PUBLIC_KEY = 'MCowBQYDK2VwAyEAecIrb31IEGRdjhWU1qnz1Lc+BLkOES2dwOJL38iE2sc=';

// How long an activation stands without the server confirming it. Long enough
// that a bad week of connectivity goes unnoticed, short enough that staying
// offline is not a way to outlive a revoked code.
const GRACE_DAYS = 14;

/**
 * Checks a licence the server issued: the signature must be ours, the claims
 * must be about this device, the plan must not have run out, and the server
 * must have confirmed it recently enough. Returns the claims, or null.
 *
 * Every branch fails closed — an unreadable licence is not an active one.
 */
function verifyLicence(licence, id, { now = Date.now(), publicKey = PUBLIC_KEY } = {}) {
  if (!publicKey || typeof licence !== 'string') return null;
  const [body, signature] = licence.split('.');
  if (!body || !signature) return null;
  let payload;
  try {
    const data = Buffer.from(body, 'base64url');
    const key = crypto.createPublicKey({
      key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki'
    });
    if (!crypto.verify(null, data, key, Buffer.from(signature, 'base64url'))) return null;
    payload = JSON.parse(data.toString('utf8'));
  } catch { return null; }

  if (payload.deviceId !== id) return null;
  if (payload.expiresAt && now > Number(payload.expiresAt)) return null;
  const issued = Number(payload.issuedAt || 0);
  if (!issued || now - issued > GRACE_DAYS * 86400000) return null;
  return payload;
}

function normalizeCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!code) throw new Error(t('err.badCode'));
  return code;
}

function normalizeServer(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { throw new Error(t('err.badServer')); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(t('err.serverProtocol'));
  return url.origin + url.pathname.replace(/\/+$/, '');
}

function statePath() { return path.join(app.getPath('userData'), 'account.json'); }

function deviceIdPath() { return path.join(app.getPath('userData'), 'device-id.txt'); }

// One activation code binds to one device, so the device needs a stable id.
// A random uuid kept beside the app's own data is enough: it identifies this
// installation without reading anything about the machine itself.
function deviceId() {
  const file = deviceIdPath();
  try {
    const saved = fs.readFileSync(file, 'utf8').trim();
    if (saved) return saved;
  } catch { /* First run, or the file was removed. */ }
  const fresh = crypto.randomUUID();
  fs.writeFileSync(file, fresh, { mode: 0o600 });
  return fresh;
}

function readState() {
  try {
    const data = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    return {
      server: data.server || '',
      token: data.token || '',
      user: data.user || null,
      activation: data.activation || null
    };
  } catch { return { server: '', token: '', user: null, activation: null }; }
}

function writeState(state) {
  // Contains a bearer token, so keep it out of reach of other local users.
  fs.writeFileSync(statePath(), JSON.stringify(state), { mode: 0o600 });
  return state;
}

/** What the renderer needs to draw the header: never includes the token. */
function publicState() {
  const state = readState();
  // Everything shown about the activation comes from the verified licence, so
  // the window cannot be made to say "activated" by editing the file either.
  const claims = state.activation && verifyLicence(state.activation.licence, state.activation.deviceId);
  return {
    // The stored override, which is normally empty, plus whether anything at
    // all is configured once the built-in address is taken into account.
    server: state.server,
    hasServer: Boolean(resolveServer(state.server)),
    signedIn: Boolean(state.token),
    user: state.user,
    minPassword: MIN_PASSWORD,
    graceDays: GRACE_DAYS,
    activation: {
      active: Boolean(claims),
      code: (state.activation && state.activation.code) || '',
      activatedAt: (claims && claims.activatedAt) || 0,
      plan: (claims && claims.plan) || null,
      expiresAt: (claims && claims.expiresAt) || null,
      // Why it is off, so the app can explain rather than just stop working.
      // A licence that no longer verifies while one is stored means the app has
      // been away from the server too long.
      revoked: Boolean(state.activation && state.activation.revoked),
      expired: Boolean(state.activation && state.activation.expired),
      stale: Boolean(!claims && state.activation && state.activation.licence
        && !(state.activation.revoked || state.activation.expired))
    }
  };
}

async function call(pathname, { method = 'POST', body, token } = {}) {
  const server = resolveServer(readState().server);
  if (!server) throw new Error(t('err.noServer'));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await net.fetch(`${server}${pathname}`, {
      method,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  } catch (error) {
    throw new Error(error.name === 'AbortError' ? t('err.serverTimeout') : t('err.serverUnreachable', { message: error.message }));
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* Server may return plain text. */ }
  if (!response.ok) throw new Error((data && data.message) || text.slice(0, 200) || t('err.serverStatus', { status: response.status }));
  return data || {};
}

async function register(username, password) {
  const account = validateCredentials(username, password);
  const data = await call('/api/auth/register', { body: { username: account, password } });
  if (!data.token) throw new Error(t('err.noToken'));
  writeState({ ...readState(), token: data.token, user: data.user || { username: account } });
  return publicState();
}

async function login(username, password) {
  const account = validateCredentials(username, password);
  const data = await call('/api/auth/login', { body: { username: account, password } });
  if (!data.token) throw new Error(t('err.noToken'));
  writeState({ ...readState(), token: data.token, user: data.user || { username: account } });
  return publicState();
}

async function logout() {
  const state = readState();
  // Best effort: a server-side session may not exist, and the local token is
  // cleared either way.
  if (state.token) await call('/api/auth/logout', { token: state.token }).catch(() => {});
  // The activation stays: the code is bound to this device on the server, and
  // signing out of the account does not hand it back.
  writeState({ ...state, token: '', user: null });
  return publicState();
}

async function refresh() {
  const state = readState();
  if (!state.token) return publicState();
  try {
    const data = await call('/api/auth/me', { method: 'GET', token: state.token });
    writeState({ ...state, user: data.user || state.user });
  } catch {
    // An expired or rejected token should not leave a stale signed-in header.
    writeState({ ...state, token: '', user: null });
  }
  return publicState();
}

function setServer(value) {
  const server = normalizeServer(value);
  const state = readState();
  // Switching servers invalidates any token issued by the previous one, and the
  // activation too: codes live in one server's database, not in the app.
  const changed = server !== state.server;
  writeState({
    server,
    token: changed ? '' : state.token,
    user: changed ? null : state.user,
    activation: changed ? null : state.activation
  });
  return publicState();
}

/**
 * What the download gate asks. The answer comes from the signed licence, not
 * from anything the local file merely claims, so editing account.json by hand
 * gets nobody anywhere.
 */
function isActive(now = Date.now()) {
  const { activation } = readState();
  return Boolean(activation && verifyLicence(activation.licence, activation.deviceId, { now }));
}

/** Spends a code on this device. The server refuses one already bound elsewhere. */
async function activate(code) {
  const state = readState();
  if (!state.token) throw new Error(t('err.activateSignIn'));
  const value = normalizeCode(code);
  const id = deviceId();
  const data = await call('/api/activation/redeem', { body: { code: value, deviceId: id }, token: state.token });
  writeState({
    ...state,
    activation: { code: value, deviceId: id, licence: data.licence || '' }
  });
  return publicState();
}

/**
 * Re-checks the binding with the server, which is what makes revoking a code
 * mean anything.
 *
 * An unreachable server does not immediately switch someone off — a flaky
 * network is not a reason to lock a paying user out. But it cannot hold forever
 * either, or staying offline would be a way to keep a revoked code alive, so a
 * stored activation only stands for GRACE_DAYS after its last confirmation.
 */
async function activationStatus() {
  const state = readState();
  if (!state.activation || !state.activation.code) return publicState();
  try {
    const data = await call('/api/activation/status', {
      body: { code: state.activation.code, deviceId: state.activation.deviceId || deviceId() }
    });
    writeState({
      ...state,
      activation: {
        ...state.activation,
        // A refused check hands back no licence, so the old one is dropped and
        // the device goes inactive at once rather than at the end of the grace.
        licence: data.active ? data.licence || '' : '',
        revoked: Boolean(data.revoked),
        expired: Boolean(data.expired)
      }
    });
  } catch {
    // Offline: leave the stored licence alone. It carries its own issuedAt, so
    // it stops verifying by itself once it has gone stale.
  }
  return publicState();
}

module.exports = {
  validateCredentials,
  normalizeServer,
  resolveServer,
  normalizeCode,
  verifyLicence,
  isActive,
  deviceId,
  GRACE_DAYS,
  publicState,
  readState,
  writeState,
  register,
  login,
  logout,
  refresh,
  setServer,
  activate,
  activationStatus,
  MIN_PASSWORD,
  DEFAULT_SERVER,
  PUBLIC_KEY
};
