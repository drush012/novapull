// Floating "download this video" button, shown over any <video> on a
// supported site — same idea as other download-manager extensions: hover a
// video, a button appears in its corner, click it and the page (or, on a
// feed page holding many videos, the specific post) gets sent to NovaPull.
'use strict';

if (window.top === window.self && isSupported(location.href)) {
  const OVERLAY_ID = 'novapull-video-overlay';
  const ICON_URL = chrome.runtime.getURL('icons/icon32.png');
  let overlayEl = null;
  let overlayTarget = null;
  let hideTimer = null;
  let overlayCursor = { x: NaN, y: NaN };

  function isDownloadableVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return false;
    const rect = video.getBoundingClientRect();
    // Ignores tiny/hidden players — ad pixels, zero-size autoplay probes.
    if (rect.width < 120 || rect.height < 80) return false;
    if (video.readyState === 0 && !video.currentSrc && !video.querySelector('source')) return false;
    return true;
  }

  function buildOverlay() {
    if (overlayEl) return overlayEl;
    const el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.innerHTML = `
      <button type="button" class="novapull-dl-btn" title="用 NovaPull 下载此视频">
        <img src="${ICON_URL}" width="16" height="16" alt="">
        <span>用 NovaPull 下载</span>
      </button>`;
    Object.assign(el.style, {
      position: 'fixed', zIndex: '2147483647', display: 'none', pointerEvents: 'auto'
    });
    const button = el.querySelector('.novapull-dl-btn');
    Object.assign(button.style, {
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '7px 12px', border: 'none', borderRadius: '8px',
      background: 'linear-gradient(135deg,#8a5cf6,#5b21b6)', color: '#fff',
      font: '600 13px/1 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif', cursor: 'pointer',
      boxShadow: '0 4px 14px rgba(0,0,0,.35)', whiteSpace: 'nowrap',
      transition: 'transform .12s, box-shadow .12s'
    });
    button.onmouseenter = () => {
      button.style.transform = 'translateY(-1px)';
      button.style.boxShadow = '0 6px 18px rgba(0,0,0,.45)';
    };
    button.onmouseleave = () => {
      button.style.transform = 'none';
      button.style.boxShadow = '0 4px 14px rgba(0,0,0,.35)';
    };
    button.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      const span = button.querySelector('span');
      const url = resolvePostUrl(overlayTarget, overlayCursor.x, overlayCursor.y);
      try {
        chrome.runtime.sendMessage({ type: 'novapull-download', url });
        span.textContent = '已发送 ✓';
      } catch {
        // Reloading the extension orphans every content script already
        // sitting in an open tab — chrome.runtime here is a dead reference
        // until the page itself reloads. Nothing sent; say so plainly
        // instead of failing silently with an uncaught error.
        span.textContent = '请刷新本页后重试';
      }
      setTimeout(() => { span.textContent = '用 NovaPull 下载'; }, 1800);
    };
    el.onmouseenter = () => clearTimeout(hideTimer);
    el.onmouseleave = () => scheduleHide();
    (document.body || document.documentElement).appendChild(el);
    overlayEl = el;
    return el;
  }

  function positionOverlay(video) {
    const el = buildOverlay();
    const rect = video.getBoundingClientRect();
    el.style.display = 'block';
    el.style.top = `${Math.max(6, rect.top + 10)}px`;
    const width = el.offsetWidth || 150;
    el.style.left = `${Math.min(window.innerWidth - width - 6, rect.right - width - 10)}px`;
  }

  function showOverlayFor(video) {
    if (!isDownloadableVideo(video)) return;
    clearTimeout(hideTimer);
    overlayTarget = video;
    positionOverlay(video);
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (overlayEl) overlayEl.style.display = 'none'; }, 600);
  }

  // A feed page (a profile, search results, the home timeline...) holds many
  // videos at once, so location.href is only the right answer to send when
  // this page IS one specific post/watch page already.
  function isPermalinkPage() {
    return /\/status\/\d+/.test(location.pathname) ||
      /\/watch\b/.test(location.pathname) ||
      location.pathname.startsWith('/shorts/') ||
      /\/video\//.test(location.pathname) ||
      /\/(p|reel|tv)\//.test(location.pathname);
  }

  // From an X/Twitter <article>, the timestamp link is the one reliable
  // anchor to this specific tweet's permalink — never a quoted or replied one.
  function statusUrlFromArticle(article) {
    if (!article) return null;
    const timeLink = article.querySelector('a[href*="/status/"] time');
    if (timeLink) {
      const anchor = timeLink.closest('a[href*="/status/"]');
      const match = anchor && anchor.getAttribute('href').match(/\/[^/]+\/status\/\d+/);
      if (match) return location.origin + match[0];
    }
    for (const anchor of article.querySelectorAll('a[href*="/status/"]')) {
      const href = anchor.getAttribute('href') || '';
      if (/\/analytics$|\/likes$|\/retweets$|\/quotes$/.test(href)) continue;
      const match = href.match(/\/[^/]+\/status\/\d+/);
      if (match) return location.origin + match[0];
    }
    return null;
  }

  function resolvePostUrl(video, clientX, clientY) {
    if (isPermalinkPage()) return location.href;

    const host = location.hostname.replace(/^www\./, '');
    const isX = /(^|\.)x\.com$/.test(host) || /twitter\.com$/.test(host);
    const isYouTube = /youtube\.com$/.test(host) || /youtu\.be$/.test(host);
    const isTikTok = /tiktok\.com$/.test(host);

    if (isX) {
      const article = video && video.closest && video.closest('article');
      let url = statusUrlFromArticle(article);
      if (url) return url;

      // The video may sit in an overlay/portal outside its own article, so
      // also check whatever article is under the cursor.
      if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
        for (const el of document.elementsFromPoint(clientX, clientY)) {
          url = statusUrlFromArticle(el.closest && el.closest('article'));
          if (url) return url;
        }
      }

      // Last resort: whichever article sits closest to the video vertically.
      if (video) {
        const videoRect = video.getBoundingClientRect();
        let best = null, bestDistance = Infinity;
        for (const article of document.querySelectorAll('article')) {
          const rect = article.getBoundingClientRect();
          if (rect.height === 0) continue;
          const overlaps = !(videoRect.bottom < rect.top || videoRect.top > rect.bottom);
          const distance = overlaps ? 0 : Math.min(Math.abs(videoRect.top - rect.top), Math.abs(videoRect.top - rect.bottom));
          if (distance < bestDistance) { bestDistance = distance; best = article; }
        }
        url = statusUrlFromArticle(best);
        if (url) return url;
      }
    }

    if (isYouTube && video) {
      const container = video.closest('ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-video-renderer, ytd-grid-video-renderer');
      const anchor = container && container.querySelector('a#thumbnail[href*="watch"], a[href*="/watch?v="], a[href*="/shorts/"]');
      if (anchor) {
        const href = anchor.getAttribute('href');
        return href.startsWith('http') ? href : location.origin + href;
      }
    }

    if (isTikTok) {
      if (video) {
        let node = video;
        for (let depth = 0; node && depth < 25; depth++, node = node.parentElement) {
          if (!node.getAttribute) continue;
          const videoId = node.getAttribute('data-video-id') || node.getAttribute('data-e2e-video-id');
          if (videoId && /^\d{10,}$/.test(videoId)) {
            const anchor = node.querySelector && node.querySelector('a[href*="/@"]');
            const match = anchor && /\/@([\w.-]+)/.exec(anchor.getAttribute('href') || '');
            return `https://www.tiktok.com/@${(match && match[1]) || 'user'}/video/${videoId}`;
          }
        }
      }
      const canonical = document.querySelector('link[rel="canonical"]');
      const ogUrl = document.querySelector('meta[property="og:url"]');
      for (const candidate of [canonical && canonical.href, ogUrl && ogUrl.content]) {
        const match = candidate && /\/@([\w.-]+)\/video\/(\d+)/.exec(candidate);
        if (match) return `https://www.tiktok.com/@${match[1]}/video/${match[2]}`;
      }
    }

    // Generic fallback for anything else on the supported list: the nearest
    // ancestor that links to a post/watch/video permalink.
    if (video) {
      let node = video.parentElement;
      for (let depth = 0; node && depth < 20; depth++, node = node.parentElement) {
        const anchor = node.querySelector && node.querySelector('a[href*="/status/"],a[href*="/watch?v="],a[href*="/video/"],a[href*="/shorts/"]');
        if (anchor) {
          const href = anchor.getAttribute('href');
          const full = href.startsWith('http') ? href : location.origin + href;
          return full.split('?')[0];
        }
      }
    }
    return location.href;
  }

  let allVideos = [];
  function refreshVideoList() {
    allVideos = [...document.querySelectorAll('video')].filter(isDownloadableVideo);
  }
  function videoUnderPoint(x, y) {
    let best = null, bestArea = 0;
    for (const video of allVideos) {
      const rect = video.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        const area = rect.width * rect.height;
        if (area > bestArea) { bestArea = area; best = video; }
      }
    }
    return best;
  }

  // Sites like X/YouTube layer transparent click-catcher controls on top of
  // <video>, so a plain mouseenter on the element never fires — hit-testing
  // by cursor position against every known video's box works regardless of
  // whatever else is stacked above it.
  let lastMove = 0;
  document.addEventListener('mousemove', event => {
    const now = Date.now();
    if (now - lastMove < 60) return;
    lastMove = now;
    const video = videoUnderPoint(event.clientX, event.clientY);
    if (video) {
      overlayCursor = { x: event.clientX, y: event.clientY };
      showOverlayFor(video);
    } else if (overlayEl && overlayEl.style.display !== 'none') {
      const box = overlayEl.getBoundingClientRect();
      const onButton = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
      if (!onButton) scheduleHide();
    }
  }, true);

  window.addEventListener('scroll', () => {
    if (overlayEl && overlayEl.style.display !== 'none' && overlayTarget) positionOverlay(overlayTarget);
  }, true);
  window.addEventListener('resize', () => {
    refreshVideoList();
    if (overlayEl && overlayEl.style.display !== 'none' && overlayTarget) positionOverlay(overlayTarget);
  });
  setInterval(refreshVideoList, 2000);
  refreshVideoList();
}
