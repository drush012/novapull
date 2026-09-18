// Reads the media variant table a site's own player holds.
//
// Why this exists: yt-dlp asks Douyin's detail API from the outside, gets
// blocked by its request signature, and falls back to `download_addr` — which
// tops out at 720p and has the watermark burned in. The page's player has
// already solved the signature, so its config holds the full DASH table
// (verified: up to 3840x2160 h265) with ready-to-use URLs. Those URLs need
// nothing but a Referer header, so we never reproduce the signing algorithm.
//
// The walk is deliberately shape-based rather than site-specific: any player
// that exposes objects carrying width/height plus a URL is understood.
'use strict';
const { t } = require('./i18n');

const { BrowserWindow } = require('electron');
const { qualityTier, qualityName } = require('./quality');

const AUDIO_URL = /media-audio|mime_type=audio/i;
const AUDIO_CODEC = /^(aac|mp4a|opus|mp3|vorbis|flac|ac-?3|ec-?3)/i;

// Runs inside the page. Returns plain data only — no DOM nodes, no functions.
const EXTRACT = `(() => {
  const srcOf = value => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') return item;
        if (item && typeof item.src === 'string') return item.src;
        if (item && typeof item.main === 'string') return item.main;
      }
    }
    if (value && typeof value === 'object') {
      if (typeof value.src === 'string') return value.src;
      if (typeof value.main === 'string') return value.main;
    }
    return null;
  };
  const seen = new WeakSet();
  const video = [];
  const audio = [];
  let durationSeen = 0;
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 12 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const nodeDuration = Number(node.duration) || 0;
    if (nodeDuration > durationSeen && nodeDuration < 86400) durationSeen = nodeDuration;
    const url = srcOf(node.url);
    if (url) {
      const width = Number(node.width) || 0;
      const height = Number(node.height) || 0;
      const common = {
        url,
        bitrate: Number(node.bitrate || node.realBitrate || 0) || 0,
        size: Number(node.size) || 0,
        codec: node.codecType || node.codec_type || (node.isH265 ? 'h265' : ''),
        gear: node.gearName || node.gear_name || ''
      };
      if (width > 0 && height > 0) {
        video.push({ ...common, width, height, fps: Math.round(Number(node.fps) || 0) });
      } else if (node.mediaType === 'audio' || ${AUDIO_URL}.test(url)) {
        audio.push(common);
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'url') continue;
      try { walk(node[key], depth + 1); } catch (error) { /* getters may throw */ }
    }
  };
  const player = window.player;
  try { walk(player && player.config, 0); } catch (error) { /* not ready yet */ }
  try { walk(player && player.videoConfig, 0); } catch (error) { /* not ready yet */ }
  let duration = 0;
  try { duration = Math.round((player && player.duration) || 0); } catch (error) { /* ignore */ }
  // The player reports 0 until playback starts; the variant entries carry it.
  if (!duration) duration = Math.round(durationSeen);
  // The page-probe branch used to return no cover, so its result card showed a
  // broken image. og:image is the reliable one on Douyin; the video's own
  // poster and the player config's cover fields are fallbacks.
  let poster = '';
  try {
    const og = document.querySelector('meta[property="og:image"]');
    const videoEl = document.querySelector('video[poster]');
    const cfg = (player && (player.config || player.videoConfig)) || {};
    poster = (og && og.content)
      || (videoEl && videoEl.getAttribute('poster'))
      || cfg.cover || cfg.poster || cfg.coverUrl || cfg.dynamicCover || '';
  } catch (error) { /* leave poster empty */ }
  return { video, audio, duration, title: document.title || '', poster: String(poster || '') };
})()`;

function dedupe(items, keyOf) {
  const best = new Map();
  for (const item of items) {
    const key = keyOf(item);
    const current = best.get(key);
    if (!current || item.bitrate > current.bitrate || (item.bitrate === current.bitrate && item.size > current.size)) {
      best.set(key, item);
    }
  }
  return [...best.values()];
}

function shortSide(variant) { return Math.min(variant.width, variant.height); }

function qualityLabel(variant) {
  return qualityName(variant) || t('media.unknownRes');
}

/**
 * Loads `url` in a hidden window and returns what the page's player offers.
 * Resolves with { title, duration, video: [...], audio: [...] }.
 */
async function probePageMedia(url, { partition, timeoutMs = 45000, pollMs = 300, settleMs = 3000 } = {}) {
  const win = new BrowserWindow({
    // A realistic viewport: some players pick their variant table by size.
    width: 1600,
    height: 900,
    show: false,
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });
  // The page behind this window autoplays with sound; the window is only
  // ever read from, never shown, so nothing should come out of the speakers.
  win.webContents.setAudioMuted(true);
  const isWeb = target => /^https?:\/\//i.test(target);
  win.webContents.setWindowOpenHandler(({ url: target }) => (isWeb(target) ? { action: 'allow' } : { action: 'deny' }));
  const blockScheme = (event, target) => { if (!isWeb(target)) event.preventDefault(); };
  win.webContents.on('will-navigate', blockScheme);
  win.webContents.on('will-frame-navigate', event => blockScheme(event, event.url));
  win.webContents.on('will-redirect', blockScheme);

  try {
    win.loadURL(url).catch(() => { /* A partial load can still build the player. */ });
    const deadline = Date.now() + timeoutMs;
    let found = { video: [], audio: [], duration: 0, title: '' };
    // The cover often lands in the <head> before any variant does, so it is
    // kept as soon as it appears rather than only when the variant list grows.
    let poster = '';
    let lastGrowth = Date.now();
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, pollMs));
      if (win.isDestroyed()) break;
      const snapshot = await win.webContents.executeJavaScript(EXTRACT).catch(() => null);
      if (!snapshot) continue;
      if (!poster && snapshot.poster) poster = snapshot.poster;
      if (snapshot.video.length > found.video.length || snapshot.audio.length > found.audio.length) {
        found = snapshot;
        lastGrowth = Date.now();
      }
      // The player fills its table progressively — low bitrates land first and
      // the 4K entry arrives seconds later — so wait for it to stop growing
      // instead of leaving as soon as something playable exists.
      if (found.video.length && found.audio.length && Date.now() - lastGrowth >= settleMs) break;
    }

    // Deduped by the displayed name, so the list never shows the same quality
    // twice and therefore needs no size or bitrate column to tell them apart.
    const video = dedupe(found.video, qualityLabel)
      .sort((a, b) => shortSide(b) - shortSide(a) || b.bitrate - a.bitrate)
      .map(v => ({ ...v, label: qualityLabel(v) }));
    // Audio entries sit next to video ones and often carry the video's codec
    // label; passing "h265" as an audio codec would only confuse the muxer.
    const audio = dedupe(found.audio, () => 'audio')
      .sort((a, b) => b.bitrate - a.bitrate)
      .map(a => ({ ...a, codec: AUDIO_CODEC.test(a.codec || '') ? a.codec : 'mp4a.40.2' }));
    if (!video.length) throw new Error(t('err.probeNone'));

    return {
      title: (found.title || '').replace(/\s*-\s*抖音$/, '').trim(),
      duration: found.duration || 0,
      poster,
      video,
      audio
    };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

module.exports = { probePageMedia, qualityLabel, shortSide, dedupe };
