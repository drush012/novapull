// Sniffing here means "is this a page NovaPull already knows how to parse",
// not actually inspecting the page — the desktop app owns all real parsing,
// this extension only ever hands it a page URL to open on its own.
'use strict';

importScripts('shared.js');

async function refreshAction(tabId, url) {
  const supported = isSupported(url || '');
  try {
    await chrome.action.setTitle({
      tabId,
      title: supported ? '用 NovaPull 下载这个视频' : 'NovaPull（当前页面暂不支持一键下载）'
    });
  } catch { /* the tab may have closed already */ }
}

async function syncActiveTabs() {
  const tabs = await chrome.tabs.query({ active: true });
  for (const tab of tabs) refreshAction(tab.id, tab.url);
}

chrome.runtime.onInstalled.addListener(syncActiveTabs);
chrome.runtime.onStartup.addListener(syncActiveTabs);
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then(tab => refreshAction(tabId, tab.url)).catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') refreshAction(tabId, tab.url);
});

// Getting the browser to offer its "Open NovaPull?" prompt turned out not to
// be reliable no matter how the navigation was triggered — background tab,
// injected location.href, even a real <a> click in a popup. NovaPull's own
// desktop process listens on this loopback port instead (see
// startLocalBridge in src/main.js): an ordinary POST needs no such prompt.
// The protocol is only the fallback below, for the one case a loopback port
// can't cover — the app not running yet to listen on it.
const BRIDGE_URL = 'http://127.0.0.1:37652/capture';

// Many of these sites refuse to serve member-only quality or age-gated video
// to a signed-out request. The desktop app already has a place for exactly
// this — the same login-cookies file its own built-in browser writes — so
// handing it these instead of making the user sign in a second time there.
async function cookiesForUrl(url) {
  try {
    const cookies = await chrome.cookies.getAll({ url });
    return cookies.map(cookie => ({
      domain: cookie.domain, path: cookie.path, secure: cookie.secure,
      httpOnly: cookie.httpOnly, expirationDate: cookie.expirationDate || 0,
      name: cookie.name, value: cookie.value
    }));
  } catch { return []; }
}

// YouTube's own cookies are just visitor/AB-test bookkeeping — the actual
// sign-in lives under Google's shared login (accounts.google.com sets it on
// .google.com), so a YouTube page needs a second read to actually be signed
// in for yt-dlp rather than just quieter about being signed out.
async function collectCookies(url) {
  const own = await cookiesForUrl(url);
  let host = '';
  try { host = new URL(url).hostname; } catch { /* keep own-only */ }
  if (!/(^|\.)(youtube\.com|youtu\.be)$/i.test(host)) return own;
  const google = await cookiesForUrl('https://www.google.com/');
  return [...own, ...google];
}

// Shared by the toolbar click and the in-page overlay button (content.js) —
// same destination, same fallback, just two different ways of picking a URL.
async function sendToDesktop(url, tabId) {
  try {
    const cookies = await collectCookies(url);
    const response = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, cookies })
    });
    if (!response.ok) throw new Error('bad status');
    if (tabId != null) {
      chrome.action.setBadgeText({ tabId, text: '✓' });
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#1a73e8' });
    }
  } catch {
    // The app isn't running (or isn't listening yet) — try to start it via
    // the registered protocol. This may or may not prompt anything visible;
    // either way there is nothing more reliable to fall back to here.
    chrome.tabs.create({ url: `novapull://download?url=${encodeURIComponent(url)}`, active: false })
      .then(created => setTimeout(() => chrome.tabs.remove(created.id).catch(() => {}), 2000))
      .catch(() => {});
    if (tabId != null) {
      chrome.action.setBadgeText({ tabId, text: '!' });
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#f0a020' });
      chrome.action.setTitle({ tabId, title: 'NovaPull 没有在运行，正在尝试启动…' });
    }
  }
  if (tabId != null) setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 1500);
}

chrome.action.onClicked.addListener(tab => {
  if (tab.url && tab.id != null) sendToDesktop(tab.url, tab.id);
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message && message.type === 'novapull-download' && message.url) {
    sendToDesktop(message.url, sender.tab && sender.tab.id);
  }
});
