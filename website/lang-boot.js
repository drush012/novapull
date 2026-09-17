// Runs in <head>, before the body paints. Decides the language once so the
// page can mark itself and app.js knows what to apply; the actual text swap
// happens there, after the elements exist.
(function () {
  var saved = null;
  try { saved = localStorage.getItem('novapull.lang'); } catch (e) { /* storage blocked */ }
  var guess = /^zh/i.test(navigator.language || '') ? 'zh' : 'en';
  var lang = saved === 'zh' || saved === 'en' ? saved : guess;
  document.documentElement.setAttribute('data-lang', lang);
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  // Hidden only until app.js has swapped the text, so an English visitor never
  // reads a flash of Chinese. app.js removes it; the CSS below is the fallback.
  if (lang === 'en') document.documentElement.classList.add('i18n-pending');
})();
