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
  'a1': 'Open the app, click the blue “Sign in” at the top right, sign in with a one-time email code (no password to set), then enter the activation code under “Device activation”. Once activated the button shows your email, and the dialog shows how many days are left.',
  'q2': 'What if I change computers or reinstall Windows?',
  'a2': 'A code is bound to this installation on this computer. Reinstalling the app on the same computer and entering the same code costs nothing. If you change computers or reinstall Windows, contact us to move it.',
  'q3': 'Do you collect my data?',
  'a3': 'Signing in sends your email and a one-time code (no password — the code expires in 10 minutes and is never kept afterwards). When activating and re-checking on start, it receives the activation code and a random id the app generated on its first run. <strong>It reads no hardware information and records nothing about what you download</strong> — parsing and downloading happen entirely on your machine, out of the server’s sight. A computer that has never signed in never contacts our server at all.',
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
  'theme.dark': 'Dark',

  'acct.button': 'Sign in',
  'acct.title': 'My account',
  'acct.email': 'Email',
  'acct.emailPlaceholder': 'A mainstream address, e.g. QQ / 163 / Gmail',
  'acct.sendCode': 'Send code',
  'acct.resendIn': 'Resend ({seconds}s)',
  'acct.codePlaceholder': '6-digit code',
  'acct.login': 'Sign in',
  'acct.logout': 'Sign out',
  'acct.empty': 'No device has been activated yet',
  'acct.working': 'Working…',
  'acct.codeSent': 'Code sent — check your inbox',
  'acct.loginFailed': 'Sign-in failed',
  'acct.device': 'Device',
  'acct.activated': 'Activated',
  'acct.statusActive': 'Active',
  'acct.statusRevoked': 'Revoked',
  'acct.statusExpired': 'Expired',
  'acct.daysLeft': '{days} days left',
  'acct.forever': 'No expiry',
  'acct.rebind': 'Move to a new device',
  'acct.rebindCooldown': 'Available again in {days} days',
  'acct.rebindConfirm': 'The current device will lose activation immediately. Continue?',
  'acct.rebindOk': 'Unbound — activate this code on the new device now',
  'plan.3d': '3-day pass',
  'plan.month': 'Monthly',
  'plan.quarter': 'Quarterly',
  'plan.half': 'Half-year',
  'plan.year': 'Yearly',
  'plan.forever': 'Lifetime'
};

// Not sourced from any [data-i18n] node — these are painted directly from JS
// (the theme label, and every string the user centre generates for dynamic
// server data), the same way the app itself never lets the blanket language
// sweep touch a value that a different piece of state also controls.
const ZH_EXTRA = {
  'theme.light': '浅色', 'theme.dark': '深色',
  'acct.button': '登录',
  'acct.resendIn': '重新发送（{seconds}s）',
  'acct.working': '正在处理…',
  'acct.codeSent': '验证码已发送，请查收邮件',
  'acct.loginFailed': '登录失败',
  'acct.device': '设备',
  'acct.activated': '激活于',
  'acct.statusActive': '生效中',
  'acct.statusRevoked': '已吊销',
  'acct.statusExpired': '已到期',
  'acct.daysLeft': '剩余 {days} 天',
  'acct.forever': '永久有效',
  'acct.rebind': '换绑设备',
  'acct.rebindCooldown': '{days} 天后可换绑',
  'acct.rebindConfirm': '换绑后当前设备会立即失去激活状态，确定要换绑吗？',
  'acct.rebindOk': '换绑成功，现在可以在新设备上用这个码激活',
  'plan.3d': '3 天体验', 'plan.month': '月卡', 'plan.quarter': '季卡',
  'plan.half': '半年卡', 'plan.year': '年卡', 'plan.forever': '永久版'
};

/* -------------------------------------------------------------- behaviour */

const root = document.documentElement;
const nodes = Array.from(document.querySelectorAll('[data-i18n]'));
const metaNodes = Array.from(document.querySelectorAll('[data-i18n-content]'));

// Read the Chinese straight out of the markup before anything is replaced.
const ZH = { ...ZH_EXTRA };
for (const node of nodes) ZH[node.dataset.i18n] = node.innerHTML;
for (const node of metaNodes) ZH[node.dataset.i18nContent] = node.getAttribute('content');

let lang = root.getAttribute('data-lang') === 'en' ? 'en' : 'zh';
// Every static [data-i18n] string needed no variables until the account
// section's countdowns and day counts arrived, so substitution was never
// built — a call site passing vars was silently handed back the raw
// "{seconds}" template.
function t(key, vars) {
  const text = (lang === 'en' ? EN : ZH)[key] ?? ZH[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

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
  paintAcctButton();
  // The activation list is built from server data, not [data-i18n] nodes, so
  // the blanket sweep above never touches it — if the dashboard is open when
  // the language changes, it has to be asked again explicitly.
  if (!document.getElementById('acctSignedIn').classList.contains('hidden')) renderDashboard();
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

/* -------------------------------------------------------------- account */

// The same server the desktop app talks to — this page is a thin client over
// the identical API, not a second implementation of any of it.
const ACCOUNT_SERVER = 'https://pull.qike.ccwu.cc';
const TOKEN_KEY = 'novapull.web.token';
const EMAIL_KEY = 'novapull.web.email';

function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
function setToken(token) { try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } }
function setSavedEmail(email) { try { email ? localStorage.setItem(EMAIL_KEY, email) : localStorage.removeItem(EMAIL_KEY); } catch { /* storage blocked */ } }
function getSavedEmail() { try { return localStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; } }

async function api(path, { method = 'POST', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${getToken()}`;
  const response = await fetch(`${ACCOUNT_SERVER}${path}`, {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  if (!response.ok) throw new Error((data && data.message) || `HTTP ${response.status}`);
  return data || {};
}

// The header chip mirrors the app's own toolbar button: plain text when
// signed out, the email once signed in — and like the theme label, that
// depends on account state as well as language, so apply()'s blanket sweep
// must not own it. currentEmail is the single source of truth for the paint.
let currentEmail = '';
function paintAcctButton() {
  document.getElementById('acctToggle').textContent = currentEmail || t('acct.button');
}

/** Validates the stored token, if any, and updates the header chip either way. */
async function checkSession() {
  const token = getToken();
  if (!token) { currentEmail = ''; paintAcctButton(); return false; }
  try {
    const { user } = await api('/api/auth/me', { method: 'GET', auth: true });
    currentEmail = user.email;
    setSavedEmail(currentEmail);
    paintAcctButton();
    return true;
  } catch {
    setToken(''); setSavedEmail(''); currentEmail = '';
    paintAcctButton();
    return false;
  }
}

function acctSay(message, isError) {
  const box = document.getElementById('acctMsg');
  box.textContent = message || '';
  box.classList.toggle('hidden', !message);
  box.classList.toggle('is-error', Boolean(isError));
}

const PLAN_LABEL = plan => (plan ? t(`plan.${plan}`) : '');

function activationRow(item) {
  const status = item.revoked ? { key: 'acct.statusRevoked', cls: 'off' }
    : item.expired ? { key: 'acct.statusExpired', cls: 'off' }
      : { key: 'acct.statusActive', cls: 'ok' };
  const remaining = item.expiresAt
    ? t('acct.daysLeft', { days: Math.max(0, Math.ceil((item.expiresAt - Date.now()) / 86400000)) })
    : t('acct.forever');
  const device = item.deviceId ? `${item.deviceId.slice(0, 8)}…` : '—';
  const activatedDate = item.activatedAt ? new Date(item.activatedAt).toLocaleDateString() : '—';
  const div = document.createElement('div');
  div.className = 'acct-item';
  div.innerHTML = `
    <div class="row"><code>${item.code}</code><span class="badge ${status.cls}">${t(status.key)}</span></div>
    <div class="row"><span>${PLAN_LABEL(item.plan)}</span><span>${remaining}</span></div>
    <div class="row"><span>${t('acct.device')} ${device}</span><span>${t('acct.activated')} ${activatedDate}</span></div>
  `;

  // Only a bound, live code has anything to unbind — a code already waiting
  // for a device, revoked, or expired gets no button at all.
  if (item.deviceId && !item.revoked && !item.expired) {
    const cooldownLeft = item.rebindAvailableAt ? Math.ceil((item.rebindAvailableAt - Date.now()) / 86400000) : 0;
    const row = document.createElement('div');
    row.className = 'row acct-item-actions';
    if (cooldownLeft > 0) {
      row.innerHTML = `<span class="acct-cooldown">${t('acct.rebindCooldown', { days: cooldownLeft })}</span>`;
    } else {
      const button = document.createElement('button');
      button.className = 'secondary btn-sm';
      button.textContent = t('acct.rebind');
      button.addEventListener('click', () => rebindCode(item.code, button));
      row.appendChild(button);
    }
    div.appendChild(row);
  }
  return div;
}

async function rebindCode(code, button) {
  // This immediately kicks the device currently holding the code offline, so
  // it is worth a confirmation rather than a single stray click undoing it.
  if (!window.confirm(t('acct.rebindConfirm'))) return;
  button.disabled = true;
  acctSay(t('acct.working'));
  try {
    await api('/api/activation/rebind', { body: { code }, auth: true });
    acctSay(t('acct.rebindOk'));
    await renderDashboard();
  } catch (error) {
    acctSay(error.message, true);
    button.disabled = false;
  }
}

async function renderDashboard() {
  document.getElementById('acctUserEmail').textContent = getSavedEmail();
  try {
    const { activations } = await api('/api/account/activations', { method: 'GET', auth: true });
    const list = document.getElementById('acctList');
    list.replaceChildren(...activations.map(activationRow));
    document.getElementById('acctEmptyNote').classList.toggle('hidden', activations.length > 0);
  } catch (error) {
    acctSay(error.message, true);
  }
}

async function showSignedIn() {
  document.getElementById('acctSignedOut').classList.add('hidden');
  document.getElementById('acctSignedIn').classList.remove('hidden');
  await renderDashboard();
}

function showSignedOut() {
  document.getElementById('acctSignedIn').classList.add('hidden');
  document.getElementById('acctSignedOut').classList.remove('hidden');
}

const ACCT_COOLDOWN_S = 60;
let acctCooldownTimer = null;

function paintAcctCooldown(secondsLeft) {
  const button = document.getElementById('acctSendCode');
  if (secondsLeft > 0) {
    button.disabled = true;
    button.textContent = t('acct.resendIn', { seconds: secondsLeft });
  } else {
    button.disabled = false;
    button.textContent = t('acct.sendCode');
  }
}

function startAcctCooldown() {
  clearInterval(acctCooldownTimer);
  let left = ACCT_COOLDOWN_S;
  paintAcctCooldown(left);
  acctCooldownTimer = setInterval(() => {
    left -= 1;
    paintAcctCooldown(left);
    if (left <= 0) clearInterval(acctCooldownTimer);
  }, 1000);
}

document.getElementById('acctToggle').addEventListener('click', async () => {
  document.getElementById('acctOverlay').classList.remove('hidden');
  acctSay('');
  if (await checkSession()) await showSignedIn(); else showSignedOut();
});

document.getElementById('acctClose').addEventListener('click', () => document.getElementById('acctOverlay').classList.add('hidden'));
document.getElementById('acctOverlay').addEventListener('click', event => {
  if (event.target.id === 'acctOverlay') document.getElementById('acctOverlay').classList.add('hidden');
});

document.getElementById('acctSendCode').addEventListener('click', async () => {
  const email = document.getElementById('acctEmail').value;
  acctSay(t('acct.working'));
  try {
    await api('/api/auth/request-code', { body: { email, lang } });
    document.getElementById('acctCodeRow').classList.remove('hidden');
    startAcctCooldown();
    acctSay(t('acct.codeSent'));
  } catch (error) { acctSay(error.message, true); }
});

document.getElementById('acctVerify').addEventListener('click', async () => {
  const email = document.getElementById('acctEmail').value;
  const code = document.getElementById('acctCode').value;
  acctSay(t('acct.working'));
  try {
    const data = await api('/api/auth/verify-code', { body: { email, code } });
    setToken(data.token);
    currentEmail = (data.user && data.user.email) || email;
    setSavedEmail(currentEmail);
    paintAcctButton();
    document.getElementById('acctCode').value = '';
    document.getElementById('acctCodeRow').classList.add('hidden');
    clearInterval(acctCooldownTimer);
    paintAcctCooldown(0);
    acctSay('');
    await showSignedIn();
  } catch (error) { acctSay(error.message || t('acct.loginFailed'), true); }
});

document.getElementById('acctLogout').addEventListener('click', async () => {
  await api('/api/auth/logout', { auth: true }).catch(() => {});
  setToken(''); setSavedEmail(''); currentEmail = '';
  paintAcctButton();
  showSignedOut();
});

// Every declaration above must exist first: apply() paints the header chip via
// paintAcctButton(), which reads currentEmail — calling it any earlier is a
// temporal-dead-zone error, since that binding is declared further up in this
// same section, not hoisted the way a function declaration would be.
apply();

// A stored token could be valid, so the header shows the right thing on
// arrival instead of only after the visitor opens the dialog.
checkSession();
