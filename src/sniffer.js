// Site-agnostic media sniffer.
//
// Instead of scraping a site's DOM (which breaks on every redesign and needs
// per-site code), we load the page in our own hidden window and watch what it
// requests. The page's own JavaScript has already solved whatever signing or
// anti-bot challenge the site uses; we just take the URL it ended up fetching.
'use strict';
const { t } = require('./i18n');

const { BrowserWindow, session } = require('electron');

const MEDIA_EXTENSION = /\.(mp4|m3u8|flv|webm|mov|m4s|mpd|ts)(\?|$)/i;
// Sticker/effect/avatar assets are media-shaped but are never the video.
const JUNK_URL = /(effectcdn|ies\.fe\.effect|\/obj\/ies-|sticker|avatar|emoji|\/img\/|favicon)/i;
const IGNORED_HEADERS = /^(range|if-|accept-encoding|host|content-length|connection|sec-fetch|sec-ch)/i;

function scoreCandidate(candidate) {
  let score = 0;
  if (candidate.resourceType === 'media') score += 100;
  if (candidate.hasRange) score += 40;
  if (/\.m3u8(\?|$)/i.test(candidate.url)) score += 30;
  if (candidate.referer) score += 10;
  if (MEDIA_EXTENSION.test(candidate.url)) score += 5;
  return score;
}

function keepHeaders(headers = {}) {
  const kept = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!IGNORED_HEADERS.test(name) && typeof value === 'string') kept[name] = value;
  }
  return kept;
}

/**
 * Loads `url` in a hidden window and returns the media stream it plays.
 * Resolves with { title, duration, poster, stream } or throws.
 */
async function sniffMedia(url, { partition, settleMs = 1500, timeoutMs = 30000 } = {}) {
  const jar = session.fromPartition(partition);
  const win = new BrowserWindow({
    show: false,
    // Images are never the target and the page is heavy without them.
    webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true, images: false, backgroundThrottling: false }
  });
  // Captured up front: reading win.webContents after destroy throws.
  const contentsId = win.webContents.id;
  const candidates = new Map();
  const headersByUrl = new Map();
  let done = false;

  const isWeb = target => /^https?:\/\//i.test(target);
  win.webContents.setWindowOpenHandler(({ url: target }) => (isWeb(target) ? { action: 'allow' } : { action: 'deny' }));
  const blockScheme = (event, target) => { if (!isWeb(target)) event.preventDefault(); };
  win.webContents.on('will-navigate', blockScheme);
  win.webContents.on('will-frame-navigate', event => blockScheme(event, event.url));
  win.webContents.on('will-redirect', blockScheme);

  const onHeaders = (details, callback) => {
    if (!done && details.webContentsId === contentsId) headersByUrl.set(details.url, details.requestHeaders || {});
    callback({ requestHeaders: details.requestHeaders });
  };
  const onRequest = (details, callback) => {
    callback({});
    if (done || details.webContentsId !== contentsId) return;
    const isMedia = details.resourceType === 'media' || MEDIA_EXTENSION.test(details.url);
    if (!isMedia || JUNK_URL.test(details.url)) return;
    const key = details.url.split('?')[0];
    if (!candidates.has(key)) candidates.set(key, { url: details.url, resourceType: details.resourceType });
  };

  jar.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, onHeaders);
  jar.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, onRequest);

  const cleanup = () => {
    done = true;
    jar.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, null);
    jar.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, null);
    if (!win.isDestroyed()) win.destroy();
  };

  try {
    // Deliberately not awaited: the media request usually fires long before the
    // page finishes loading, and waiting for did-finish-load costs seconds.
    let loadFailed = false;
    win.loadURL(url).catch(() => { loadFailed = true; });

    const deadline = Date.now() + timeoutMs;
    let settleUntil = 0;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 400));
      if (win.isDestroyed()) break;
      if (loadFailed && !candidates.size) break;
      const hasMedia = [...candidates.values()].some(item => item.resourceType === 'media');
      if (hasMedia) {
        // Keep listening briefly: sites often start with a low-quality probe.
        if (!settleUntil) settleUntil = Date.now() + settleMs;
        if (Date.now() >= settleUntil) break;
      }
    }

    let meta = {};
    if (!win.isDestroyed()) {
      meta = await win.webContents.executeJavaScript(`(() => {
        const v = document.querySelector('video');
        return {
          title: document.title || '',
          duration: v && isFinite(v.duration) ? Math.round(v.duration) : 0,
          poster: (v && v.poster) || ''
        };
      })()`).catch(() => ({}));
    }

    const ranked = [...candidates.values()]
      .map(item => {
        const headers = headersByUrl.get(item.url) || {};
        return { ...item, hasRange: Boolean(headers.Range || headers.range), referer: headers.Referer || headers.referer || '' , headers };
      })
      .sort((a, b) => scoreCandidate(b) - scoreCandidate(a));

    const best = ranked[0];
    if (!best) throw new Error(t('err.sniffNone'));

    return {
      title: (meta.title || '').replace(/\s*-\s*抖音$/, '').trim(),
      duration: meta.duration || 0,
      poster: meta.poster || '',
      stream: { url: best.url, headers: { ...keepHeaders(best.headers), Referer: best.referer || url } },
      candidateCount: ranked.length
    };
  } finally {
    cleanup();
  }
}

module.exports = { sniffMedia, MEDIA_EXTENSION, JUNK_URL, scoreCandidate };
