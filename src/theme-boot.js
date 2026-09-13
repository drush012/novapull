// Runs from <head>, before anything is drawn, so the window opens in the theme
// the user chose instead of flashing the light one first. renderer.js owns the
// toggle; this file only replays what was stored.
(() => {
  const KEY = 'novapull.theme';
  let stored = '';
  try { stored = localStorage.getItem(KEY) || ''; } catch { /* storage can be blocked */ }
  const dark = stored === 'dark'
    || (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
})();
