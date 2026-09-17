// Runs in <head>, before first paint, so the page opens in the theme the
// visitor already chose instead of flashing light and then switching to dark.
// app.js owns the toggle button; this only replays what was stored.
(function () {
  var KEY = 'novapull.theme';
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
  if (stored === 'dark' || stored === 'light') {
    document.documentElement.setAttribute('data-theme', stored);
  }
  // No stored choice: leave it unset and let the prefers-color-scheme media
  // query in styles.css decide, same as before this toggle existed.
})();
