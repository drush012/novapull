'use strict';

/* ---------------------------------------------------------------- english */

// Chinese is the page's own markup, read back at load time, so it is never
// written down twice and cannot drift from what the HTML says. Only English
// lives here.
const EN = {
  'meta.title': 'NovaPull | Video downloader for Windows · 4K/8K without watermarks',
  'meta.description': 'NovaPull is a video downloader for Windows: paste a link and get the best quality the site offers — Douyin in 4K/8K without the watermark, YouTube up to 8K HDR, audio and video merged into one MP4.',

  'nav.features': 'Features',
  'nav.tested': 'Measured',
  'nav.faq': 'FAQ',
  'nav.download': 'Download',

  'hero.pill': 'Video downloader for Windows · v1.2.0',
  'hero.title': 'Parse and download',
  'hero.lead': 'Paste a link and get the <strong>best quality</strong> the site will give. Douyin in 4K/8K without the watermark, YouTube up to 8K HDR, audio and video merged into one MP4. Parsing and downloading happen entirely <strong>on your own computer</strong>.',
  'hero.download': 'Download for Windows',
  'hero.tested': 'See measured quality →',
  'hero.note': '// portable build available · engines bundled · no ads',
  'win.ok': 'Parsed · 54 formats available',

  'strip.title': 'One window for links from all of these',
  'site.douyin': 'Douyin',
  'site.bilibili': 'Bilibili',
  'site.xhs': 'RED',
  'site.kuaishou': 'Kuaishou',
  'site.weibo': 'Weibo',

  'features.title': 'Not just another wrapper',
  'f1.title': 'Quality named by tier',
  'f1.body': 'Not pixel counts but 8K / 4K / 2K / 1080P, sorted by resolution with the best one already selected. You see at a glance what you can get.',
  'f2.title': 'Real 4K from Douyin',
  'f2.body': 'Ordinary parsing reaches a watermarked 720p. NovaPull reads the quality table the page’s own player holds and gets the clean 4K/8K original stream.',
  'f3.title': 'Three routes, picked for you',
  'f3.body': 'yt-dlp extraction, player probing and media sniffing, chosen per site. When it falls back to sniffing it says so, instead of passing a lower quality off as the best.',
  'f4.title': 'Audio and video merged',
  'f4.body': 'High qualities usually come as separate video and audio tracks; FFmpeg merges them into a standard MP4. Only want the sound? Pick audio only and get an mp3.',
  'f5.title': 'Stop and pick up again',
  'f5.body': 'Stopping keeps what has downloaded, and resuming or retrying carries on from there. If the chosen quality is unavailable it tells you rather than quietly swapping it.',
  'f6.title': 'Works the moment it installs',
  'f6.body': 'yt-dlp, FFmpeg and Deno all ship with the app, and only those copies are used — never another one installed on your machine. English and Chinese, light and dark.',

  'stat.sites': 'popular sites, one click',
  'stat.quality': 'best quality measured',
  'stat.routes': 'parsing routes',
  'stat.ads': 'ads or bundleware',

  'how.title': 'Three steps from link to file',
  'how1.title': 'Paste',
  'how1.body': 'A link, or a whole “title + link” share blurb — the app digs the URL out itself.',
  'how2.title': 'Parse',
  'how2.body': 'It visits the site once as a guest to pick up anonymous cookies, then lists every quality it can download. Most sites need no sign-in.',
  'how3.title': 'Download',
  'how3.body': 'Pick one; the video and audio tracks download separately and are merged into an MP4 in the folder you chose.',

  'tested.title': 'Measured quality, not marketing numbers',
  'tested.sub': 'One computer, one exit IP, <strong>no sign-in and no cookies at all</strong>. How high you get depends on what the site serves; we only list what we measured.',
  't.site': 'Site',
  't.anon': 'Works signed out',
  't.best': 'Best quality measured',
  't.wm': 'Watermark removal',
  't.yes': 'Yes',
  't.support': 'Supported',
  't.nosupport': 'Not supported',
  't.bili': '1080p30 (higher tiers need a membership)',
  't.source': 'Source resolution',

  'dl.title': 'Download NovaPull 1.2.0',
  'dl.sub': 'For Windows 10 / 11, 64-bit. Both builds have exactly the same features.',
  'dl.setup': 'Installer',
  'dl.setupMeta': 'Choose where to install, get a desktop shortcut, and start faster.',
  'dl.setupBtn': 'Download installer · 203 MB',
  'dl.portable': 'Portable',
  'dl.portableMeta': 'Double-click to run, nothing written to the system. The first start takes a few seconds to unpack.',
  'dl.portableBtn': 'Download portable · 203 MB',

  'faq.title': 'Frequently asked',
  'q1': 'How do I use an activation code?',
  'a1': 'Open the app, click the blue “Sign in” at the top right, create a username, then enter the code under “Device activation”. Once activated the button shows your username, and the dialog shows how many days are left.',
  'q2': 'What if I change computers or reinstall Windows?',
  'a2': 'A code is bound to this installation on this computer. Reinstalling the app on the same computer and entering the same code costs nothing. If you change computers or reinstall Windows, contact us to move it.',
  'q3': 'Do you collect my data?',
  'a3': 'When you register or sign in, the server receives your username and password (sent over HTTPS; the server keeps only a hash of the password, never the password itself). When activating and re-checking on start, it receives the code and a random id the app generated on its first run. <strong>It reads no hardware information and records nothing about what you download</strong> — parsing and downloading happen entirely on your machine, out of the server’s sight. A computer that has never signed in never contacts our server at all.',
  'q4': 'Does it work offline?',
  'a4': 'An activated computer keeps working for 14 days without reaching the server, so a bad connection does not interrupt you. After 14 days it pauses, and resumes by itself once back online.',
  'q5': 'Why does YouTube sometimes stop at 1080p?',
  'a5': 'YouTube judges by exit IP whether you are a bot. Datacenter IPs — most proxy nodes — are easily flagged, and then only the signed-in 1080p60 is available. A clean node usually reaches 8K directly.',
  'q6': 'Windows says “Unknown publisher”?',
  'a6': 'NovaPull does not have a code-signing certificate yet, so Windows shows that warning. Click “More info → Run anyway”. Please download the installer only from this site.',

  'foot.how': 'How it works',
  'foot.platforms': 'Platforms',
  'foot.contact': 'Contact',

  'theme.light': 'Light',
  'theme.dark': 'Dark'
};

// Not sourced from any [data-i18n] node — the theme label is painted directly
// by paintTheme(), the same way the app itself never lets the blanket
// language sweep touch a value that a different piece of state also controls.
const ZH_EXTRA = { 'theme.light': '浅色', 'theme.dark': '深色' };

/* -------------------------------------------------------------- behaviour */

const root = document.documentElement;
const nodes = Array.from(document.querySelectorAll('[data-i18n]'));
const metaNodes = Array.from(document.querySelectorAll('[data-i18n-content]'));

// Read the Chinese straight out of the markup before anything is replaced.
const ZH = { ...ZH_EXTRA };
for (const node of nodes) ZH[node.dataset.i18n] = node.innerHTML;
for (const node of metaNodes) ZH[node.dataset.i18nContent] = node.getAttribute('content');

let lang = root.getAttribute('data-lang') === 'en' ? 'en' : 'zh';
const t = key => (lang === 'en' ? EN : ZH)[key] ?? ZH[key] ?? key;

function apply() {
  // innerHTML is safe here: every string is this file's own constant or the
  // page's own markup, never anything a visitor supplied.
  for (const node of nodes) node.innerHTML = t(node.dataset.i18n);
  for (const node of metaNodes) node.setAttribute('content', t(node.dataset.i18nContent));
  root.lang = lang === 'en' ? 'en' : 'zh-CN';
  root.setAttribute('data-lang', lang);
  document.getElementById('langToggle').textContent = lang === 'en' ? '中文' : 'EN';
  root.classList.remove('i18n-pending');
  paintTheme();
}

document.getElementById('langToggle').addEventListener('click', () => {
  lang = lang === 'en' ? 'zh' : 'en';
  try { localStorage.setItem('novapull.lang', lang); } catch { /* storage blocked */ }
  apply();
});

/* ------------------------------------------------------------------ theme */

// Same two glyphs the app itself uses (its own icon sprite), so the toggle
// reads the same way in both places.
const MOON = '<path d="M20 14.2A8.2 8.2 0 019.8 4 8.4 8.4 0 1020 14.2z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>';
const SUN = '<circle cx="12" cy="12" r="4.1" stroke="currentColor" stroke-width="1.7"/><path d="M12 2.6v2.5M12 18.9v2.5M2.6 12h2.5M18.9 12h2.5M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>';

// theme-boot.js already stamped a stored choice before first paint; this only
// keeps the button in step and, on the very first visit, follows the system.
function isDark() {
  const stamped = root.getAttribute('data-theme');
  if (stamped === 'dark') return true;
  if (stamped === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function paintTheme() {
  const dark = isDark();
  document.getElementById('themeIcon').innerHTML = dark ? MOON : SUN;
  document.getElementById('themeLabel').textContent = t(dark ? 'theme.dark' : 'theme.light');
}

document.getElementById('themeToggle').addEventListener('click', () => {
  const dark = !isDark();
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  try { localStorage.setItem('novapull.theme', dark ? 'dark' : 'light'); } catch { /* storage blocked */ }
  paintTheme();
});

apply();
