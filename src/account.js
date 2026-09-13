// Account state for the app's own sign-in.
//
// The app itself is local; accounts only exist on whatever server the user
// points it at, so the server address is configuration rather than a constant.
// Only the returned token is kept on disk — the password is sent once and never
// stored.
'use strict';

const path = require('path');
const fs = require('fs');
const { app, net } = require('electron');
const { t } = require('./i18n');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;
const TIMEOUT_MS = 15000;

function validateCredentials(email, password, { requirePassword = true } = {}) {
  const account = String(email || '').trim();
  if (!EMAIL.test(account)) throw new Error(t('err.badEmail'));
  if (requirePassword && String(password || '').length < MIN_PASSWORD) {
    throw new Error(t('err.shortPassword', { min: MIN_PASSWORD }));
  }
  return account;
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

function readState() {
  try {
    const data = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    return { server: data.server || '', token: data.token || '', user: data.user || null };
  } catch { return { server: '', token: '', user: null }; }
}

function writeState(state) {
  // Contains a bearer token, so keep it out of reach of other local users.
  fs.writeFileSync(statePath(), JSON.stringify(state), { mode: 0o600 });
  return state;
}

/** What the renderer needs to draw the header: never includes the token. */
function publicState() {
  const state = readState();
  return { server: state.server, signedIn: Boolean(state.token), user: state.user };
}

async function call(pathname, { method = 'POST', body, token } = {}) {
  const { server } = readState();
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

async function register(email, password) {
  const account = validateCredentials(email, password);
  const data = await call('/api/auth/register', { body: { email: account, password } });
  if (!data.token) throw new Error(t('err.noToken'));
  return writeState({ ...readState(), token: data.token, user: data.user || { email: account } });
}

async function login(email, password) {
  const account = validateCredentials(email, password);
  const data = await call('/api/auth/login', { body: { email: account, password } });
  if (!data.token) throw new Error(t('err.noToken'));
  return writeState({ ...readState(), token: data.token, user: data.user || { email: account } });
}

async function logout() {
  const state = readState();
  // Best effort: a server-side session may not exist, and the local token is
  // cleared either way.
  if (state.token) await call('/api/auth/logout', { token: state.token }).catch(() => {});
  return writeState({ ...state, token: '', user: null });
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
  // Switching servers invalidates any token issued by the previous one.
  const changed = server !== state.server;
  writeState({ server, token: changed ? '' : state.token, user: changed ? null : state.user });
  return publicState();
}

module.exports = {
  validateCredentials,
  normalizeServer,
  publicState,
  readState,
  writeState,
  register,
  login,
  logout,
  refresh,
  setServer,
  MIN_PASSWORD
};
