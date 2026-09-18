const { app, BrowserWindow, dialog, ipcMain, net, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const readline = require('readline');
const { extractShareUrl } = require('./share-url');
const { outputTemplate } = require('./naming');
const { qualityTier, qualityName } = require('./quality');
const { sniffMedia } = require('./sniffer');
const { probePageMedia } = require('./media-probe');
const { t, setLanguage } = require('./i18n');
const { normalizeFeed, parseRelease, isNewer, resolveFeed } = require('./update');
const account = require('./account');
const usage = require('./usage');

// One running copy at a time: a second launch — which is exactly what happens
// when the OS opens a novapull:// link while the app is already open — hands
// its argv to the first instance instead of starting a duplicate window.
const DEEP_LINK_SCHEME = 'novapull';
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

let mainWindow = null;
// A deep link can arrive before the window has finished loading (cold start
// via the protocol), so it waits here instead of being dropped on the floor.
let pendingDeepLink = null;

// novapull://download?url=<encoded page url> — anything else is ignored
// rather than guessed at, since this only ever comes from our own extension.
function extractDeepLinkUrl(raw) {
  if (typeof raw !== 'string' || !raw.startsWith(`${DEEP_LINK_SCHEME}://`)) return null;
  try { return new URL(raw).searchParams.get('url') || null; }
  catch { return null; }
}

function deliverDeepLink(url) {
  // did-finish-load below is the actual readiness signal; isLoading() can
  // still briefly read true inside that same handler, so it is only checked
  // here, for a link that arrives with no load in flight to wait for at all.
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) {
    pendingDeepLink = url;
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  mainWindow.webContents.send('deep-link', url);
}

function handleArgv(argv) {
  const found = argv.map(extractDeepLinkUrl).find(Boolean);
  if (found) deliverDeepLink(found);
}

app.on('second-instance', (_event, argv) => handleArgv(argv));
// macOS hands a registered scheme to the running app this way instead.
app.on('open-url', (event, url) => {
  event.preventDefault();
  const found = extractDeepLinkUrl(url);
  if (found) deliverDeepLink(found);
});

// electron-builder's NSIS installer writes the registry keys for a packaged
// build; running from source needs to point them at this checkout instead.
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
} else if (!process.defaultApp) {
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
}

// The protocol above depends on the browser's own external-protocol prompt,
// which turned out not to fire reliably. A loopback HTTP port the extension
// can just POST to needs no such permission from the browser at all — this
// is the primary path while the app is running; the protocol is only what
// gets the app started in the first place when it is not.
const LOCAL_BRIDGE_PORT = 37652;

function startLocalBridge() {
  const server = require('http').createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    if (request.method !== 'POST' || request.url !== '/capture') { response.writeHead(404); response.end(); return; }
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (typeof data.url !== 'string' || !data.url) throw new Error('missing url');
        // The extension reads these off the browser tab the click came from —
        // same "hand it to yt-dlp, never upload it" file the built-in login
        // browser already writes, just a second way of filling it in.
        if (Array.isArray(data.cookies) && data.cookies.length) {
          const lines = data.cookies.map(netscapeLine).filter(Boolean);
          if (lines.length) {
            fs.writeFileSync(loginCookiesPath(),
              `# Netscape HTTP Cookie File\n# Synced from the browser extension\n\n${lines.join('\n')}\n`,
              { mode: 0o600 });
          }
        }
        deliverDeepLink(data.url);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: true }));
      } catch {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: false }));
      }
    });
  });
  // Losing this race to another instance (or anything else already on the
  // port) is fine — that instance's own bridge already covers the same job.
  server.on('error', () => {});
  server.listen(LOCAL_BRIDGE_PORT, '127.0.0.1');
}

// Sites where yt-dlp's own extractor is known to return a worse table than the
// page's player does. For Douyin that gap is 720p+watermark versus 4K clean.
const PAGE_PROBE_HOSTS = /(^|\.)(douyin\.com|iesdouyin\.com)$/i;
const probeCache = new Map();
const PROBE_TTL = 3 * 60 * 1000;

function usePageProbe(href) {
  try { return PAGE_PROBE_HOSTS.test(new URL(href).hostname); } catch { return false; }
}

async function probeFor(url) {
  const result = await probePageMedia(url, { partition: LOGIN_PARTITION });
  probeCache.set(url, { at: Date.now(), result });
  return result;
}

async function freshProbe(url) {
  const cached = probeCache.get(url);
  if (cached && Date.now() - cached.at < PROBE_TTL) return cached.result;
  return probeFor(url);
}

// The variant URLs need only a Referer; sending the page's own origin keeps the
// CDN happy without carrying any session data.
function streamHeaders(url) {
  try { return { Referer: new URL(url).origin + '/' }; }
  catch { return { Referer: 'https://www.douyin.com/' }; }
}

// Builds an info dict so yt-dlp downloads the chosen video plus its audio and
// merges them, reusing the existing progress, naming and resume pipeline.
function writeProbeInfo(url, probe, task) {
  const headers = streamHeaders(url);
  const formats = probe.video.map((v, index) => ({
    format_id: `v${index}`,
    url: v.url,
    ext: 'mp4',
    vcodec: v.codec || 'h264',
    acodec: 'none',
    width: v.width,
    height: v.height,
    fps: v.fps || undefined,
    tbr: v.bitrate ? v.bitrate / 1000 : undefined,
    filesize: v.size || undefined,
    http_headers: headers
  }));
  probe.audio.forEach((a, index) => formats.push({
    format_id: `a${index}`,
    url: a.url,
    ext: 'm4a',
    vcodec: 'none',
    acodec: a.codec || 'mp4a.40.2',
    abr: a.bitrate ? a.bitrate / 1000 : undefined,
    filesize: a.size || undefined,
    http_headers: headers
  }));
  const info = {
    _type: 'video',
    id: String(url.match(/(\d{8,})/)?.[1] || Math.abs([...url].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))),
    title: task.title || probe.title || t('media.untitled'),
    ext: 'mp4',
    extractor: siteLabel(url),
    extractor_key: siteLabel(url),
    webpage_url: url,
    duration: probe.duration || 0,
    formats
  };
  const file = path.join(app.getPath('userData'), `probe-${info.id}.info.json`);
  fs.writeFileSync(file, JSON.stringify(info), 'utf8');
  return { file, formats };
}
const { isDouyin, verifyDouyinFormats, resolutionLabel } = require('./douyin-formats');

// Signed CDN URLs expire quickly, so a sniff result is only reused for a few
// minutes before the page is visited again.
const SNIFF_TTL = 3 * 60 * 1000;
const sniffCache = new Map();

function extFromUrl(url) {
  const match = url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i);
  if (!match) return 'mp4';
  const ext = match[1].toLowerCase();
  return ext === 'm3u8' ? 'mp4' : ext;
}

function siteLabel(href) {
  const host = new URL(href).hostname.replace(/^www\./, '');
  return host.split('.')[0] || 'web';
}

async function sniffFor(url) {
  const result = await sniffMedia(url, { partition: LOGIN_PARTITION });
  sniffCache.set(url, { at: Date.now(), result });
  return result;
}

async function freshSniff(url) {
  const cached = sniffCache.get(url);
  if (cached && Date.now() - cached.at < SNIFF_TTL) return cached.result;
  return sniffFor(url);
}

// Hands the sniffed stream to yt-dlp as a pre-built info dict, so downloads keep
// the same progress reporting, naming rules and post-processing as normal ones.
function writeSniffInfo(url, sniff, title) {
  const ext = extFromUrl(sniff.stream.url);
  const info = {
    _type: 'video',
    id: String(Math.abs([...url].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) | 0, 7))),
    title: title || sniff.title || t('media.untitled'),
    ext,
    extractor: siteLabel(url),
    extractor_key: siteLabel(url),
    webpage_url: url,
    duration: sniff.duration || 0,
    url: sniff.stream.url,
    http_headers: sniff.stream.headers,
    formats: [{ format_id: 'sniffed', url: sniff.stream.url, ext, http_headers: sniff.stream.headers }]
  };
  const file = path.join(app.getPath('userData'), `sniff-${info.id}.info.json`);
  fs.writeFileSync(file, JSON.stringify(info), 'utf8');
  return file;
}

const jobs = new Map();
const parsers = new Set();
if (process.env.NOVAPULL_DATA_DIR) app.setPath('userData', path.resolve(process.env.NOVAPULL_DATA_DIR));

function validateUrl(value) {
  const url = new URL(extractShareUrl(value));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(t('err.badUrl'));
  return url.href;
}

// Only ever the copy shipped with the app. Falling back to PATH would silently
// pick up a separately installed yt-dlp/ffmpeg, so the version actually running
// would depend on the machine rather than on this build.
function toolDirectory() {
  return app.isPackaged ? path.join(process.resourcesPath, 'bin') : path.join(__dirname, '..', 'vendor');
}

function resolveTool(name) {
  const file = path.join(toolDirectory(), `${name}${process.platform === 'win32' ? '.exe' : ''}`);
  return fs.existsSync(file) ? file : null;
}

// yt-dlp needs a JavaScript engine to solve YouTube's "n" challenge — the
// signature its own player computes for every stream URL. Without one, YouTube
// parsing fails outright; every other site is unaffected, so this stays
// optional and simply adds the flag when the engine is there.
function jsRuntimeArgs() {
  const deno = resolveTool('deno');
  return deno ? ['--js-runtimes', `deno:${deno}`] : [];
}

const YOUTUBE_HOSTS = /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i;

function isYouTube(href) {
  try { return YOUTUBE_HOSTS.test(new URL(href).hostname); } catch { return false; }
}

// YouTube is parsed in two passes, and each needs its own client list.
//
// Signed out: the clients that carry the full DASH ladder (up to 8K) refuse
// cookies, so this is the only pass able to reach them. "default" is yt-dlp's
// own set, which includes them; web_safari rides along so a session that has
// SABR forced on web still gets 1080p HLS rather than 360p.
//
// Signed in: those clients are skipped, and some accounts have SABR forced on
// web, so web_safari leads and web follows.
//
// Measured on one video through a clean exit: signed out reached 4320p AV1,
// signed in stopped at 1080p60. Through a flagged exit, signed out is refused
// outright and the signed-in pass is the one that works.
const YT_CLIENTS_SIGNED_OUT = 'default,web_safari';
const YT_CLIENTS_SIGNED_IN = 'web_safari,web';

// The "youtube:" namespace scopes this to the YouTube extractor alone.
function youtubeClientArgs(anonymous) {
  return ['--extractor-args', `youtube:player_client=${anonymous ? YT_CLIENTS_SIGNED_OUT : YT_CLIENTS_SIGNED_IN}`];
}

function bundledTool(name) {
  const file = resolveTool(name);
  if (!file) {
    throw new Error(t('err.noTool', { name, file: `${name}${process.platform === 'win32' ? '.exe' : ''}`, dir: toolDirectory() }));
  }
  return file;
}

// Every message that tells the user to sign in points at the same place: the
// site tiles on the home page open that site in the app's own browser, and the
// session it signs into is exactly the one the downloader uses.
const signInHint = () => t('err.signInHint');

// The app hosts its own login browser in a persistent session partition, so
// cookies can be read straight out of Electron — no extension, no reading (or
// closing) the user's own browser.
const LOGIN_PARTITION = 'persist:novapull-login';

function loginCookiesPath() { return path.join(app.getPath('userData'), 'login-cookies.txt'); }

// Site pages try to deep-link into their native app ("bytedance://…"); left
// alone Chromium hands those to Windows and the user gets a "无法打开此链接"
// dialog out of nowhere — including from our hidden warm-up window.
function blockAppDeepLinks(contents) {
  const isWeb = url => /^https?:\/\//i.test(url);
  contents.setWindowOpenHandler(({ url }) => (isWeb(url) ? { action: 'allow' } : { action: 'deny' }));
  const guard = (event, url) => { if (!isWeb(url)) event.preventDefault(); };
  contents.on('will-navigate', guard);
  contents.on('will-frame-navigate', event => guard(event, event.url));
  contents.on('will-redirect', guard);
}

function netscapeLine(cookie) {
  // Tabs or newlines inside a value would corrupt the file; yt-dlp reads the
  // "#HttpOnly_" prefix, so httpOnly cookies survive the round trip.
  if (!cookie.domain || !cookie.name || /[\t\r\n]/.test(cookie.value ?? '')) return null;
  return [
    `${cookie.httpOnly ? '#HttpOnly_' : ''}${cookie.domain}`,
    cookie.domain.startsWith('.') ? 'TRUE' : 'FALSE',
    cookie.path || '/',
    cookie.secure ? 'TRUE' : 'FALSE',
    Math.floor(cookie.expirationDate || 0),
    cookie.name,
    cookie.value ?? ''
  ].join('\t');
}

async function exportLoginCookies() {
  const all = await session.fromPartition(LOGIN_PARTITION).cookies.get({});
  const lines = all.map(netscapeLine).filter(Boolean);
  const file = loginCookiesPath();
  if (!lines.length) {
    try { fs.rmSync(file, { force: true }); } catch { /* Nothing to clear. */ }
    return { count: 0, updatedAt: 0 };
  }
  fs.writeFileSync(file, `# Netscape HTTP Cookie File\n# Generated by NovaPull\n\n${lines.join('\n')}\n`, { mode: 0o600 });
  return { count: lines.length, updatedAt: Date.now() };
}

// Sites like Douyin reject anonymous requests that carry no session cookie at
// all — "fresh cookies (not necessarily logged in)". Loading the site once in
// our own hidden window mints exactly those, with no account and no extension.
const WARM_TTL = 30 * 60 * 1000;
const warmedOrigins = new Map();

function warmupTarget(href) {
  const { hostname, origin } = new URL(href);
  if (/(^|\.)(douyin|iesdouyin)\.com$/i.test(hostname)) return 'https://www.douyin.com/';
  if (/(^|\.)(bilibili\.com|b23\.tv)$/i.test(hostname)) return 'https://www.bilibili.com/';
  if (/(^|\.)(youtube\.com|youtu\.be)$/i.test(hostname)) return 'https://www.youtube.com/';
  if (/(^|\.)(xiaohongshu\.com|xhslink\.com)$/i.test(hostname)) return 'https://www.xiaohongshu.com/';
  return `${origin}/`;
}

async function ensureSiteCookies(href) {
  const target = warmupTarget(href);
  if (Date.now() - (warmedOrigins.get(target) || 0) < WARM_TTL) return;
  await new Promise(resolve => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { partition: LOGIN_PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true, images: false }
    });
    win.webContents.setAudioMuted(true);
    blockAppDeepLinks(win.webContents);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!win.isDestroyed()) win.destroy();
      resolve();
    };
    const timer = setTimeout(finish, 20000);
    // A short settle gives the page time to set its deferred cookies.
    win.webContents.once('did-finish-load', () => setTimeout(finish, 1500));
    win.webContents.once('did-fail-load', finish);
    win.loadURL(target).catch(finish);
  });
  warmedOrigins.set(target, Date.now());
  await exportLoginCookies();
}

function loginCookiesStatus() {
  const file = loginCookiesPath();
  try {
    const stat = fs.statSync(file);
    const count = fs.readFileSync(file, 'utf8').split('\n').filter(line => line.trim() && !line.startsWith('# ')).length;
    return { count, updatedAt: stat.mtimeMs };
  } catch { return { count: 0, updatedAt: 0 }; }
}

// Many sites (Douyin, and YouTube for most video streams) refuse anonymous
// requests. This file comes from either the app's own built-in login browser
// or the extension syncing the real browser's cookies for a page it was
// asked to send — the app itself still never reads an installed browser.
function cookieArgs(options) {
  if (options?.cookieMode !== 'embedded') return [];
  const file = loginCookiesPath();
  if (!fs.existsSync(file)) throw new Error(t('err.noCookies', { hint: signInHint() }));
  return ['--cookies', file];
}

// Failures a real account would be needed to clear. Matched against yt-dlp's
// own output only — never against our message for it, which is translated and
// would make the app behave differently in each language.
const NEEDS_LOGIN = /Sign in to confirm|not a bot|Private video|members[- ]only|age[- ]restricted|login required|Join this channel/i;

// yt-dlp's cookie failures are opaque; spell out what the user has to do.
function friendlyError(text) {
  const message = String(text || '').trim();
  if (/Sign in to confirm|not a bot/i.test(message)) {
    return t('err.youtubeBot');
  }
  if (/Could not copy .* cookie database|could not find .* cookies database|Failed to decrypt|DPAPI/i.test(message)) {
    return t('err.browserLocked', { message });
  }
  if (/fresh cookies|cookies.*needed|Sign in to confirm|confirm you.re not a bot|HTTP Error 403/i.test(message)) {
    return t('err.needCookies', { message, hint: signInHint() });
  }
  return message;
}

function validateOutputDir(value) {
  if (value === undefined || value === null) return app.getPath('downloads');
  if (typeof value !== 'string') throw new Error(t('err.badDir'));
  const trimmed = value.trim();
  if (!trimmed) return app.getPath('downloads');
  if (!path.isAbsolute(trimmed)) throw new Error(t('err.relativeDir'));
  return path.normalize(trimmed);
}

// The window buttons are drawn by Windows, not by the page, so the theme has to
// be pushed out to them separately or they stay light on a dark window.
// 43 ≈ the 38px CSS title-bar row scaled by the body zoom in styles.css, so
// the native window buttons line up with the app's own title row.
const TITLE_BAR = {
  light: { color: '#f6f7f9', symbolColor: '#1f2328', height: 43 },
  dark: { color: '#1b1f24', symbolColor: '#e6e9ee', height: 43 }
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 920,
    minHeight: 620,
    titleBarStyle: 'hidden',
    titleBarOverlay: TITLE_BAR.light,
    backgroundColor: '#ffffff',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow = win;
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('did-finish-load', () => {
    if (!pendingDeepLink) return;
    const url = pendingDeepLink;
    pendingDeepLink = null;
    if (win.isMinimized()) win.restore();
    win.focus();
    win.webContents.send('deep-link', url);
  });
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  win.loadFile(path.join(__dirname, 'index.html'));
}

function safeSend(sender, channel, payload) {
  if (!sender.isDestroyed()) sender.send(channel, payload);
}

ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

// Opens a site in the app's own browser, sharing the session the downloader
// uses — so simply browsing a site also gives it the anonymous cookies that
// later parses need, and signing in there is what unlocks member content.
// Labels are looked up when asked for, so the tiles follow the language too.
const BROWSE_SITES = {
  douyin: 'https://www.douyin.com/',
  bilibili: 'https://www.bilibili.com/',
  youtube: 'https://www.youtube.com/',
  x: 'https://x.com/',
  instagram: 'https://www.instagram.com/',
  xiaohongshu: 'https://www.xiaohongshu.com/',
  tiktok: 'https://www.tiktok.com/',
  facebook: 'https://www.facebook.com/',
  kuaishou: 'https://www.kuaishou.com/',
  weibo: 'https://weibo.com/',
  vimeo: 'https://vimeo.com/',
  twitch: 'https://www.twitch.tv/'
};
const siteName = id => t(`site.${id}`);

ipcMain.handle('browse-sites', () => Object.keys(BROWSE_SITES).map(id => ({ id, label: siteName(id) })));

ipcMain.handle('open-site', (_event, id) => new Promise(resolve => {
  const url = BROWSE_SITES[id];
  if (!url) throw new Error(t('err.badSite'));
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    title: siteName(id),
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: { partition: LOGIN_PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  blockAppDeepLinks(win.webContents);
  win.on('closed', () => {
    exportLoginCookies().then(resolve, () => resolve({ count: 0, updatedAt: 0 }));
  });
  win.loadURL(url);
}));

// Which address the outside world sees. This is the single biggest factor in
// whether a site answers at all, so it belongs on the front page.
// The renderer owns the choice; the main process only mirrors it so the errors
// it raises come back in the language the window is showing.
ipcMain.handle('set-language', (_event, lang) => setLanguage(lang));

ipcMain.handle('set-theme', (event, theme) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return false;
  const dark = theme === 'dark';
  // setTitleBarOverlay only exists where the overlay does; ignore it elsewhere.
  if (typeof win.setTitleBarOverlay === 'function') {
    try { win.setTitleBarOverlay(dark ? TITLE_BAR.dark : TITLE_BAR.light); } catch { /* not an overlay window */ }
  }
  win.setBackgroundColor(dark ? '#16191d' : '#ffffff');
  return true;
});

ipcMain.handle('exit-ip', async () => {
  const read = async (url, pick) => {
    const response = await net.fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    return pick(await response.text());
  };
  try {
    return await read('https://ipapi.co/json/', text => {
      const data = JSON.parse(text);
      if (!data.ip) throw new Error('no ip');
      return {
        ip: data.ip,
        place: [data.city, data.country_name].filter(Boolean).join(', '),
        org: data.org || ''
      };
    });
  } catch {
    // Geo lookup can be rate-limited; the address alone is still worth showing.
    return read('https://api.ipify.org', text => ({ ip: text.trim(), place: '', org: '' }))
      .catch(() => ({ ip: '', place: '', org: '' }));
  }
});

ipcMain.handle('cookies-status', () => loginCookiesStatus());

ipcMain.handle('clear-login', async () => {
  await session.fromPartition(LOGIN_PARTITION).clearStorageData();
  try { fs.rmSync(loginCookiesPath(), { force: true }); } catch { /* Already gone. */ }
  return { count: 0, updatedAt: 0 };
});

ipcMain.handle('inspect-url', async (_event, payload) => {
  const request = typeof payload === 'string' ? { url: payload } : (payload || {});
  const url = validateUrl(request.url);
  if (request.cookieMode === 'embedded') await ensureSiteCookies(url);

  // Read the player's own table first where yt-dlp is known to do worse.
  if (usePageProbe(url)) {
    safeSend(_event.sender, 'parse-stage', { text: t('stage.probing') });
    const probe = await probeFor(url).catch(() => null);
    if (probe && probe.video.length) {
      return {
        title: probe.title || t('media.untitled'),
        thumbnail: probe.poster || '',
        duration: probe.duration || 0,
        uploader: '',
        hasAudioStream: probe.audio.length > 0,
        viaPageProbe: true,
        formats: probe.video.map((v, index) => ({
          id: `v${index}`,
          label: v.label,
          ext: 'mp4',
          size: v.size,
          rate: Math.round(v.bitrate / 1000),
          fps: v.fps,
          codec: v.codec,
          hasAudio: probe.audio.length > 0,
          verified: true
        }))
      };
    }
  }

  try {
    // YouTube goes signed out first. On a clean exit that is the only pass able
    // to reach the 4K/8K clients, which refuse cookies — sending the login would
    // lock them out and leave 1080p HLS. Only when YouTube asks for a sign-in
    // does the second pass bring the cookies.
    if (isYouTube(url)) {
      try {
        return { ...(await inspectWithYtDlp(url, request, { anonymous: true })), ytAnonymous: true };
      } catch (anonymousError) {
        if (!anonymousError.needsLogin) throw anonymousError;
      }
    }
    return await inspectWithYtDlp(url, request);
  } catch (error) {
    // yt-dlp cannot sign Douyin's web API (and similar); fall back to watching
    // what the page itself plays. Site-agnostic, so no per-site parser.
    safeSend(_event.sender, 'parse-stage', { text: t('stage.sniffing') });
    const sniff = await sniffFor(url).catch(() => null);
    // Behind a login wall the page only plays what the signed-out session is
    // allowed to see. That is still worth offering — but it is not the best
    // quality the video has, so the result says so instead of implying it is.
    if (!sniff) throw error;
    return {
      title: sniff.title || t('media.untitled'),
      thumbnail: sniff.poster || '',
      duration: sniff.duration || 0,
      uploader: '',
      hasAudioStream: true,
      viaSniffer: true,
      limited: Boolean(error.needsLogin),
      formats: [{ id: '', label: t('media.sniffed'), ext: extFromUrl(sniff.stream.url), size: 0, hasAudio: true }]
    };
  }
});

const inspectWithYtDlp = (url, request, { anonymous = false } = {}) => new Promise((resolve, reject) => {
  const cookies = anonymous ? [] : cookieArgs(request);
  const child = spawn(bundledTool('yt-dlp'), ['--ignore-config', ...cookies, ...jsRuntimeArgs(), ...youtubeClientArgs(anonymous), '--dump-single-json', '--no-playlist', '--no-warnings', '--socket-timeout', '20', '--', url], { windowsHide: true });
  parsers.add(child);
  const timeout = setTimeout(() => { child.kill(); reject(new Error(t('err.parseTimeout'))); }, 90000);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', error => reject(new Error(t('err.spawnFailed', { message: error.message }))));
  child.on('close', async code => {
    clearTimeout(timeout);
    parsers.delete(child);
    if (code !== 0) {
      const failure = new Error(friendlyError(stderr) || t('err.parseFailed', { code }));
      // Carried as a flag rather than re-read from the message later: the
      // message is translated, the raw output is not.
      failure.needsLogin = NEEDS_LOGIN.test(stderr);
      return reject(failure);
    }
    try {
      const info = await verifyDouyinFormats(JSON.parse(stdout), bundledTool('ffprobe'));
      const douyin = isDouyin(info);
      const all = info.formats || [];
      // A separate audio stream must exist before a video-only format can be merged.
      const hasAudioStream = all.some(f => f.acodec && f.acodec !== 'none');
      // For Douyin, prefer measured dimensions. Bitrate only breaks ties
      // within a resolution; it cannot establish a stream's pixel dimensions.
      const duration = info.duration || 0;
      const best = new Map();
      for (const f of all) {
        if (f.vcodec === 'none') continue;
        const size = f.filesize || f.filesize_approx || 0;
        const rate = f.tbr || f.vbr || (size && duration ? (size * 8) / duration / 1000 : 0);
        const hdr = /hdr/i.test(String(f.dynamic_range || '')) || /hdr/i.test(String(f.format_note || ''));
        // Everything that tells two entries apart goes in the name, so the name
        // itself can be the dedupe key and the list needs no numeric columns.
        const label = douyin && f.resolutionVerified !== true
          ? resolutionLabel(f)
          : qualityName({ width: f.width, height: f.height, fps: f.fps, hdr }) || f.format_note || f.ext;
        const current = best.get(label);
        if (!current || rate > current.rate || (rate === current.rate && size > current.size)) {
          best.set(label, {
            id: f.format_id,
            height: douyin && f.width && f.height ? Math.min(f.width, f.height) : f.height || 0,
            verified: f.resolutionVerified === true,
            label,
            ext: f.ext,
            size,
            rate,
            hasAudio: Boolean(f.acodec && f.acodec !== 'none')
          });
        }
      }
      const formats = [...best.values()]
        // Resolution first, bitrate only as a tie-break: a bloated 4K stream can
        // out-bitrate an 8K one (YouTube's VP9 2160p hits 142 Mbps against 55
        // for AV1 4320p), and ranking by bitrate alone buried the 8K entry.
        // Douyin additionally floats probe-verified entries above unverified
        // ones, because its declared heights cannot be trusted.
        .sort((a, b) => (douyin ? Number(b.verified) - Number(a.verified) : 0) || b.height - a.height || b.rate - a.rate || b.size - a.size)
        .slice(0, douyin ? undefined : 12)
        .map(({ height, rate, ...rest }) => ({ ...rest, rate: Math.round(rate) }));
      resolve({ title: info.title || t('media.untitled'), thumbnail: info.thumbnail || '', duration: info.duration || 0, uploader: info.uploader || '', hasAudioStream, formats, resolutionChecked: douyin });
    } catch (error) { reject(new Error(t('err.readFailed', { message: error.message }))); }
  });
});

ipcMain.handle('start-download', async (event, task) => {
  const id = task.id;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error(t('err.badTaskId'));
  if (jobs.has(id)) throw new Error(t('err.stillRunning'));
  // An activated device downloads freely; anything else spends one of the
  // day's free slots. Claimed before any work starts so a refused task never
  // touches the network.
  if (!account.isActive() && !usage.claim(id).allowed) {
    throw new Error(t('err.dailyLimit', { limit: usage.FREE_DAILY_LIMIT }));
  }
  const url = validateUrl(task.url);
  if (task.cookieMode === 'embedded') await ensureSiteCookies(url);
  if (task.formatId && !/^[a-zA-Z0-9_.-]+$/.test(task.formatId)) throw new Error(t('err.badFormat'));
  const outputDir = validateOutputDir(task.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });
  const args = [
    // A YouTube task parsed signed out is downloaded signed out as well: the
    // format it picked may exist only on clients that refuse cookies.
    '--ignore-config', ...(task.ytAnonymous ? [] : cookieArgs(task)), ...jsRuntimeArgs(), ...youtubeClientArgs(Boolean(task.ytAnonymous)),
    '--no-playlist', '--newline', '--no-colors', '--progress', '--socket-timeout', '20',
    '--progress-template', 'download:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress._total_bytes_str)s',
    '--concurrent-fragments', String(Math.min(Math.max(Number(task.fragments) || 8, 1), 64)),
    '--retries', '10', '--fragment-retries', '10', '--retry-sleep', 'exp=1:30',
    '--merge-output-format', 'mp4',
    '--ffmpeg-location', bundledTool('ffmpeg'),
    '-P', outputDir,
    '-o', outputTemplate(task.template),
    '--continue', '--no-overwrites'
  ];
  let infoFile = '';
  if (task.viaPageProbe) {
    // Variant URLs are short-lived, so the table is read again right before the
    // download rather than reusing what the parse showed.
    const probe = await freshProbe(url);
    const { file, formats } = writeProbeInfo(url, probe, task);
    infoFile = file;
    const videos = formats.filter(f => f.acodec === 'none');
    const audios = formats.filter(f => f.vcodec === 'none');
    const chosen = videos.find(f => f.format_id === task.formatId) || videos[0];
    if (!chosen) throw new Error(t('err.noFormats'));
    if (task.audioOnly && audios.length) args.push('-f', audios[0].format_id, '-x', '--audio-format', 'mp3');
    else args.push('-f', audios.length ? `${chosen.format_id}+${audios[0].format_id}/${chosen.format_id}` : chosen.format_id);
    args.push('--load-info-json', infoFile, '--', url);
  } else if (task.viaSniffer) {
    const sniff = await freshSniff(url);
    infoFile = writeSniffInfo(url, sniff, task.title);
    if (task.audioOnly) args.push('-x', '--audio-format', 'mp3');
    args.push('--load-info-json', infoFile, '--', url);
  } else {
    if (task.audioOnly) args.push('-f', 'bestaudio/best', '-x', '--audio-format', 'mp3');
    else if (task.formatId) args.push('-f', `${task.formatId}+bestaudio/${task.formatId}`);
    // Resolution first: a lower-resolution stream can carry a far higher
    // bitrate (YouTube ships a 2160p VP9 at 142 Mbps next to a 4320p AV1 at
    // 55), so ranking by size or bitrate picks the smaller picture. Douyin's
    // unreliable heights are handled by the page probe instead of here.
    else args.push('-f', 'bv*+ba/b', '-S', 'res,tbr,size');
    args.push('--', url);
  }

  const child = spawn(bundledTool('yt-dlp'), args, { windowsHide: true });
  const job = { child, paused: false, error: '', filePath: '' };
  jobs.set(id, job);
  safeSend(event.sender, 'task-event', { id, status: 'downloading', outputDir, error: '', warning: '' });
  const consume = line => {
      if (line.startsWith('ERROR:')) job.error = line;
      // Remember the file yt-dlp actually produced so the UI can locate it.
      const destination = line.match(/^\[(?:download|ExtractAudio)\] Destination: (.+)$/) || line.match(/^\[Merger\] Merging formats into "(.+)"$/);
      if (destination) {
        job.filePath = destination[1].trim();
        safeSend(event.sender, 'task-event', { id, filePath: job.filePath });
      }
      // yt-dlp announces the streams it settled on; warn when the requested
      // quality was silently replaced by the "/best" fallback.
      // --no-overwrites skips silently; say so instead of reporting success.
      if (/has already been downloaded/i.test(line)) {
        safeSend(event.sender, 'task-event', { id, warning: t('warn.duplicate') });
      }
      const chosen = line.match(/Downloading \d+ format\(s\): (.+)$/);
      if (chosen && task.formatId && !chosen[1].trim().split('+').includes(task.formatId)) {
        safeSend(event.sender, 'task-event', { id, warning: t('warn.formatFallback', { format: chosen[1].trim() }) });
      }
      const match = line.match(/^\s*([\d.]+)%\|([^|]*)\|([^|]*)\|(.*)$/);
      if (match) safeSend(event.sender, 'task-event', { id, status: 'downloading', progress: Number(match[1]), speed: match[2].trim(), eta: match[3].trim(), totalText: match[4].trim() });
      else if (line.trim()) safeSend(event.sender, 'task-log', { id, line: line.trim() });
  };
  readline.createInterface({ input: child.stdout }).on('line', consume);
  readline.createInterface({ input: child.stderr }).on('line', consume);
  child.on('error', error => { job.error = error.message; });
  child.on('close', code => {
    jobs.delete(id);
    if (infoFile) { try { fs.rmSync(infoFile, { force: true }); } catch { /* Already gone. */ } }
    const done = code === 0 && !job.paused;
    // The merged/converted file is the only accurate size; per-stream totals
    // reported during download are just an estimate.
    let size = 0;
    if (done && job.filePath) { try { size = fs.statSync(job.filePath).size; } catch { /* File may have been renamed by a post-processor. */ } }
    safeSend(event.sender, 'task-event', {
      id,
      status: job.paused ? 'paused' : code === 0 ? 'completed' : 'error',
      ...(done ? { progress: 100 } : {}),
      ...(size ? { size } : {}),
      speed: '',
      eta: '--:--',
      error: job.paused ? '' : friendlyError(job.error) || (code !== 0 ? t('err.downloadFailed', { code }) : '')
    });
  });
  return { id, outputDir };
});

ipcMain.handle('stop-download', (_event, id) => {
  const job = jobs.get(id);
  if (!job) return false;
  job.paused = true;
  if (process.platform === 'win32') {
    spawn('taskkill.exe', ['/PID', String(job.child.pid), '/T', '/F'], { windowsHide: true }).on('error', () => job.child.kill());
    return true;
  }
  return job.child.kill();
});

// Only ever reveals a directory: shell.openPath on a file would launch it
// through its system association.
ipcMain.handle('open-path', (_event, target) => {
  if (typeof target !== 'string' || !target.trim()) throw new Error(t('err.badPath'));
  const resolved = path.resolve(target);
  let stat;
  try { stat = fs.statSync(resolved); } catch { throw new Error(t('err.dirGone')); }
  if (!stat.isDirectory()) throw new Error(t('err.notDir'));
  return shell.openPath(resolved);
});

// Asking a remote server what the newest version is, and nothing more: the
// answer is shown to the user, never acted on automatically.
ipcMain.handle('check-update', async (_event, feed) => {
  const address = normalizeFeed(resolveFeed(feed));
  if (!address) throw new Error(t('err.noFeed'));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await net.fetch(address, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': `NovaPull/${app.getVersion()}` }
    });
  } catch (error) {
    throw new Error(error.name === 'AbortError' ? t('err.feedTimeout') : t('err.feedUnreachable', { message: error.message }));
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(t('err.feedStatus', { status: response.status }));
  let data;
  try { data = await response.json(); } catch { throw new Error(t('err.feedShape')); }
  // A feed that lists several releases: take the first non-draft entry.
  const release = parseRelease(Array.isArray(data) ? data.find(item => item && !item.draft) : data);
  const current = app.getVersion();
  return { ...release, current, newer: isNewer(release.version, current) };
});

// Only ever an https page the update check itself returned, so a compromised or
// mistyped feed cannot talk the app into launching something local.
ipcMain.handle('open-external', async (_event, target) => {
  const raw = String(target || '').trim();
  let url;
  try { url = new URL(raw); } catch { throw new Error(t('err.badExternal')); }
  if (url.protocol !== 'https:') throw new Error(t('err.badExternal'));
  await shell.openExternal(url.href);
  return true;
});

// Account and activation. Every handler answers with account.publicState(), so
// the renderer never sees the bearer token.
const withQuota = state => ({ ...state, quota: usage.state() });
ipcMain.handle('account-state', () => withQuota(account.publicState()));
ipcMain.handle('account-refresh', async () => withQuota(await account.refresh()));
ipcMain.handle('account-set-server', (_event, value) => withQuota(account.setServer(value)));
ipcMain.handle('account-request-code', async (_event, email) => { await account.requestCode(email); return true; });
ipcMain.handle('account-verify-code', async (_event, { email, code } = {}) => withQuota(await account.verifyCode(email, code)));
ipcMain.handle('account-logout', async () => withQuota(await account.logout()));
ipcMain.handle('account-activate', async (_event, code) => withQuota(await account.activate(code)));
ipcMain.handle('account-activation-status', async () => withQuota(await account.activationStatus()));

ipcMain.handle('app-info', () => {
  const tools = ['yt-dlp', 'ffmpeg', 'ffprobe'].map(name => ({ name, path: resolveTool(name) }));
  return {
    downloads: app.getPath('downloads'),
    version: app.getVersion(),
    ready: tools.every(tool => tool.path !== null),
    toolDir: toolDirectory(),
    missing: tools.filter(tool => !tool.path).map(tool => tool.name),
    // Optional: only YouTube needs it, so its absence is not "not ready".
    jsRuntime: Boolean(resolveTool('deno'))
  };
});

// Preview thumbnails are direct CDN links yt-dlp scraped off the page; sites
// that check a Referer on their images (Douyin's included) refuse a plain
// <img> load from a file:// page and the renderer shows a broken-image icon.
// Sending the image's own origin as its Referer is the same trick
// streamHeaders already uses for the actual video/audio streams.
function attachThumbnailReferer(ses) {
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    if (details.resourceType === 'image') {
      try {
        callback({ requestHeaders: { ...details.requestHeaders, Referer: `${new URL(details.url).origin}/` } });
        return;
      } catch { /* not a URL worth touching, fall through unmodified */ }
    }
    callback({ requestHeaders: details.requestHeaders });
  });
}

app.on('web-contents-created', (_event, contents) => blockAppDeepLinks(contents));
app.whenReady().then(() => {
  attachThumbnailReferer(session.defaultSession);
  createWindow();
  handleArgv(process.argv);
  startLocalBridge();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => {
  for (const { child } of jobs.values()) {
    if (process.platform === 'win32' && child.pid) spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).on('error', () => child.kill());
    else child.kill();
  }
  for (const child of parsers) child.kill();
});
