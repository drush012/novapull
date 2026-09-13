// Update checking, kept to the parts that can be reasoned about on their own:
// comparing two versions and reading a release feed. The network call and the
// window live in main.js.
//
// The app never downloads or installs an update itself. It tells the user a
// newer version exists and opens the release page in their own browser — what
// gets run on their machine stays their decision.
'use strict';

const { t } = require('./i18n');

// The address shipped with the app, so nobody has to configure anything to be
// told about a new build. The settings field only overrides it.
//
// >>> Fill this in once the repository exists: <<<
//   https://api.github.com/repos/<owner>/<repo>/releases/latest
// While it is empty the app simply never checks, which is why the check is
// written to fail silently rather than complain on every launch.
const DEFAULT_FEED = '';

// What the app should actually ask, given whatever the user did or did not type.
function resolveFeed(configured) {
  return String(configured || '').trim() || DEFAULT_FEED;
}

// Accepts the shapes a release tag actually takes ("v0.1.2", "0.1.2-beta.1").
// Anything after the numbers is treated as a pre-release and sorts *before* the
// same numbers without it, which is what semver says and what users expect.
function parseVersion(value) {
  const text = String(value || '').trim().replace(/^v/i, '');
  const match = text.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+](.+))?$/);
  if (!match) return null;
  return {
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] || ''
  };
}

// Returns >0 when a is newer, <0 when b is newer, 0 when equal.
// An unparsable version is treated as the oldest thing there is, so a malformed
// tag on the server can never claim to be newer than what is installed.
function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  for (let i = 0; i < 3; i++) {
    if (left.parts[i] !== right.parts[i]) return left.parts[i] - right.parts[i];
  }
  if (left.pre === right.pre) return 0;
  if (!left.pre) return 1;
  if (!right.pre) return -1;
  return left.pre < right.pre ? -1 : 1;
}

function isNewer(candidate, current) { return compareVersions(candidate, current) > 0; }

// Only https, and only a host that looks like a release feed the user typed —
// the answer decides what URL we later offer to open, so it is not somewhere to
// be relaxed about.
function normalizeFeed(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { throw new Error(t('err.badFeed')); }
  if (url.protocol !== 'https:') throw new Error(t('err.feedProtocol'));
  return url.origin + url.pathname.replace(/\/+$/, '') + url.search;
}

// Understands a GitHub "releases/latest" payload, and the same three fields in
// a plain JSON file for anyone self-hosting the feed.
function parseRelease(data) {
  if (!data || typeof data !== 'object') throw new Error(t('err.feedShape'));
  if (data.draft) throw new Error(t('err.feedShape'));
  const version = String(data.tag_name || data.version || '').trim();
  if (!parseVersion(version)) throw new Error(t('err.feedVersion', { value: version || '?' }));
  const page = String(data.html_url || data.url || data.page || '').trim();
  return {
    version: version.replace(/^v/i, ''),
    notes: String(data.body || data.notes || '').trim().slice(0, 4000),
    published: String(data.published_at || data.published || '').slice(0, 10),
    page: /^https:\/\//i.test(page) ? page : ''
  };
}

module.exports = { parseVersion, compareVersions, isNewer, normalizeFeed, parseRelease, resolveFeed, DEFAULT_FEED };
