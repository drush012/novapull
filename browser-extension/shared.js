// Shared between background.js (importScripts) and popup.js (<script> tag) —
// MV3 service workers and extension pages can both load a plain script this
// way without needing a bundler.
'use strict';

const SUPPORTED_HOSTS = [
  /(^|\.)douyin\.com$/i, /(^|\.)iesdouyin\.com$/i,
  /(^|\.)bilibili\.com$/i, /(^|\.)b23\.tv$/i,
  /(^|\.)youtube\.com$/i, /(^|\.)youtu\.be$/i, /(^|\.)youtube-nocookie\.com$/i,
  /(^|\.)(x\.com|twitter\.com)$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)xiaohongshu\.com$/i, /(^|\.)xhslink\.com$/i,
  /(^|\.)tiktok\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)kuaishou\.com$/i,
  /(^|\.)weibo\.com$/i, /(^|\.)weibo\.cn$/i,
  /(^|\.)vimeo\.com$/i,
  /(^|\.)twitch\.tv$/i
];

function isSupported(url) {
  try { return SUPPORTED_HOSTS.some(re => re.test(new URL(url).hostname)); }
  catch { return false; }
}
