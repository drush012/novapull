// Shared by the renderer and main process so both accept the same share text.
(function (root) {
  const { t } = typeof module === 'object' && module.exports ? require('./i18n') : root.novaI18n;

  function extractShareUrl(value) {
    const text = String(value ?? '').replace(/[\u200B\u2060\uFEFF]/g, '').trim();
    const candidates = text.match(/https?:\/\/[^\s<>"'`，。！？、；：…【】《》“”‘’（）]+/gi) || [];
    const urls = [];
    for (let candidate of candidates) {
      // Remove sentence punctuation and unmatched closing Markdown brackets.
      // Balanced parentheses inside paths and all query parameters stay intact.
      candidate = candidate.replace(/[.,;!]+$/, '');
      let previous;
      do {
        previous = candidate;
        for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
          const count = character => candidate.split(character).length - 1;
          while (candidate.endsWith(close) && count(close) > count(open)) candidate = candidate.slice(0, -1);
        }
        candidate = candidate.replace(/[.,;!]+$/, '');
      } while (candidate !== previous);
      try {
        const parsed = new URL(candidate);
        if (!parsed.hostname || !['http:', 'https:'].includes(parsed.protocol)) continue;
        if (!urls.includes(candidate)) urls.push(candidate);
      } catch { /* Ignore malformed candidates, never pass them to the downloader. */ }
    }
    if (!urls.length) throw new Error(t('err.noLink'));
    if (urls.length > 1) throw new Error(t('err.manyLinks'));
    const parsed = new URL(urls[0]);
    if (/(^|\.)douyin\.com$/i.test(parsed.hostname)) {
      // Search/home pages identify the opened video through modal_id.
      // Keep the ID as text: Douyin IDs exceed JavaScript's safe integer range.
      const videoId = parsed.searchParams.get('modal_id');
      if (videoId && /^\d+$/.test(videoId)) return `https://www.douyin.com/video/${videoId}`;
    }
    return urls[0];
  }
  if (typeof module === 'object' && module.exports) module.exports = { extractShareUrl };
  else root.novaShare = { extractShareUrl };
})(globalThis);
