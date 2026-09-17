const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

/* ------------------------------------------------------------------- i18n */

const { t, setLanguage, getLanguage, LANGUAGES } = window.novaI18n;
const LANG_KEY = 'novapull.language';

// Restore the stored choice before anything draws, so the first paint is
// already in the right language rather than flipping a moment later.
(() => {
  let stored = '';
  try { stored = localStorage.getItem(LANG_KEY) || ''; } catch { /* storage can be blocked */ }
  // No stored choice yet: follow the system, defaulting to English elsewhere.
  setLanguage(stored || ((navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'));
})();

const taskModal = $('#taskModal');
const taskRows = $('#taskRows');
const tasks = new Map();
const selected = new Set();
let systemDownloadDir = '';
let currentFilter = 'all';

/* ------------------------------------------------------------------ state */

const SETTING_DEFAULTS = { outputDir: '', filenameTemplate: '{platform}/{user_name}-{content}', updateFeed: '', autoUpdate: true };
const settings = loadSettings();
function loadSettings() {
  try { return { ...SETTING_DEFAULTS, ...JSON.parse(localStorage.getItem('novapull.settings') || '{}') }; }
  catch { return { ...SETTING_DEFAULTS }; }
}
// Cookies are handled automatically: the main process warms up the site in its
// own hidden window. Nothing here for the user to configure.
function cookieOptions() {
  return { cookieMode: 'embedded', template: settings.filenameTemplate };
}
function persistSettings() { localStorage.setItem('novapull.settings', JSON.stringify(settings)); }
function defaultOutputDir() { return settings.outputDir || systemDownloadDir; }

try {
  for (const task of JSON.parse(localStorage.getItem('novapull.tasks') || '[]')) {
    if (task.status === 'downloading' || task.status === 'waiting') task.status = 'paused';
    tasks.set(task.id, task);
  }
} catch { /* Corrupted storage starts from an empty list. */ }

// Progress arrives several times a second; batch the writes instead of
// serialising the whole task list on every tick.
let persistTimer = null;
function persistTasks() {
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
  localStorage.setItem('novapull.tasks', JSON.stringify([...tasks.values()]));
}
function persistSoon() { if (!persistTimer) persistTimer = setTimeout(persistTasks, 1000); }
window.addEventListener('beforeunload', persistTasks);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persistTasks(); });

/* ---------------------------------------------------------------- helpers */

function prettyDuration(seconds) { const m = Math.floor(seconds / 60); const s = seconds % 60; return `${m}:${String(s).padStart(2, '0')}`; }
function prettySize(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
function parseSize(text) {
  const match = String(text || '').match(/([\d.]+)\s*([KMGT])?i?B/i);
  if (!match) return 0;
  return Number(match[1]) * ({ '': 1, K: 1024, M: 1048576, G: 1073741824, T: 1099511627776 }[(match[2] || '').toUpperCase()] || 1);
}
// The real size is known only once the file is on disk; until then show the
// total yt-dlp reports for the stream it is currently fetching.
function sizeText(task) {
  if (task.size) return prettySize(task.size);
  const estimate = parseSize(task.totalText);
  return estimate ? `~${prettySize(estimate)}` : '--';
}
function parseSpeed(text) {
  const match = String(text || '').match(/([\d.]+)\s*([KMG])?i?B\/s/i);
  if (!match) return 0;
  return Number(match[1]) * { '': 1, K: 1024, M: 1048576, G: 1073741824 }[(match[2] || '').toUpperCase()];
}
function statusText(status) { return ['waiting', 'downloading', 'completed', 'paused', 'error'].includes(status) ? t(`state.${status}`) : status; }
function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value ?? ''; return div.innerHTML.replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function matchesFilter(task, filter) {
  if (filter === 'all') return true;
  if (filter === 'kind:video') return !task.audioOnly;
  if (filter === 'kind:audio') return Boolean(task.audioOnly);
  return task.status === filter;
}
function visibleTasks() { return [...tasks.values()].filter(t => matchesFilter(t, currentFilter)); }
function selectedTasks() { return visibleTasks().filter(t => selected.has(t.id)); }

/* ------------------------------------------------------------ parse panel */

// Parsing a link and turning it into a task is the same work on the home page
// as in the add-URL dialog; only the elements it paints into differ. One
// factory drives both so a fix to either lands in both.
function createParser(refs, hooks = {}) {
  const el = key => $(refs[key]);
  const parser = {
    info: null,
    url: '',
    generation: 0,
    busy: false,

    reset() {
      parser.generation++;
      parser.busy = false;
      parser.info = null;
      parser.url = '';
      el('parseBtn').disabled = false;
      el('download').disabled = true;
      el('preview').classList.add('hidden');
      el('state').classList.add('hidden');
      hooks.onReset?.();
    },

    say(message, isError = false) {
      const box = el('state');
      box.textContent = message;
      box.classList.toggle('is-error', isError);
      box.classList.remove('hidden');
    },

    async parse() {
      parser.reset();
      const generation = parser.generation;
      const typed = el('url').value.trim();
      let url;
      try { url = window.novaShare.extractShareUrl(typed); }
      catch (error) { return parser.say(error.message, true); }
      el('url').value = url;
      if (!window.nova) return parser.say(t('parse.previewOnly'), true);
      parser.busy = true;
      parser.say(t(typed === url ? 'parse.working' : 'parse.extracted'));
      el('parseBtn').disabled = true;
      el('download').disabled = true;
      try {
        const info = await window.nova.inspectUrl(url, cookieOptions());
        if (generation !== parser.generation) return;
        parser.info = info; parser.url = url;
        el('thumb').src = info.thumbnail;
        el('title').textContent = info.title;
        el('meta').textContent = [info.uploader, info.duration ? prettyDuration(info.duration) : ''].filter(Boolean).join(' · ');
        // Only recommend a Douyin format after its actual dimensions were read.
        el('format').replaceChildren(
          new Option(t('quality.auto'), ''),
          // The label already carries everything that distinguishes one entry
          // from another (tier, frame rate, HDR) and the list is deduped by it,
          // so no size or bitrate column is needed to tell them apart.
          ...info.formats.map((f, index) => new Option(
            `${index === 0 && (!info.resolutionChecked || f.verified) ? '★ ' : ''}${f.label}`,
            f.id
          ))
        );
        // Preserve the verified format ID rather than reselecting from the
        // extractor's possibly inaccurate dimensions when the download starts.
        if (info.resolutionChecked && info.formats[0]?.verified) el('format').value = info.formats[0].id;
        el('preview').classList.remove('hidden');
        parser.say(t('parse.ok', { count: info.formats.length || t('parse.okMany') }));
        // A sniffed-because-blocked result must not read like a normal success.
        if (info.limited) parser.say(t('parse.limited'), true);
        if (info.viaPageProbe) {
          const top = info.formats[0];
          parser.say(t('parse.okProbe', {
            count: info.formats.length,
            top: top ? top.label : t('parse.unknownTop'),
            audio: info.hasAudioStream ? '' : t('parse.noAudioStream')
          }));
        } else if (info.resolutionChecked) {
          parser.say(t('parse.okVerified', {
            count: info.formats.length,
            verified: info.formats.filter(f => f.verified).length
          }));
        }
        el('download').disabled = false;
        parser.warn();
      } catch (error) { if (generation === parser.generation) parser.say(error.message, true); }
      finally {
        if (generation === parser.generation) { parser.busy = false; el('parseBtn').disabled = false; }
      }
    },

    // A video-only format keeps its quality only if the site also offers a
    // separate audio stream; otherwise the video is downloaded without audio.
    warn() {
      if (!parser.info) return;
      const chosen = parser.info.formats.find(f => f.id === el('format').value);
      if (chosen && !chosen.hasAudio && parser.info.hasAudioStream === false) {
        parser.say(t('parse.noAudioWarn', { label: chosen.label }), true);
      }
    },

    async start() {
      const info = parser.info;
      if (!info || parser.url !== el('url').value.trim()) return parser.say(t('parse.needParseFirst'), true);
      const chosen = info.formats.find(f => f.id === el('format').value);
      const task = {
        id: crypto.randomUUID(), url: parser.url, title: info.title || t('task.new'),
        thumbnail: info.thumbnail || '', outputDir: el('dir').value.trim() || defaultOutputDir(),
        audioOnly: el('type').value === 'audio', formatId: el('format').value,
        size: chosen?.size || 0,
        viaSniffer: Boolean(info.viaSniffer), viaPageProbe: Boolean(info.viaPageProbe),
        // Which YouTube pass the parse used; the download has to repeat it.
        ytAnonymous: Boolean(info.ytAnonymous),
        status: 'waiting', progress: 0, speed: '', eta: '--:--', error: '', warning: '', filePath: ''
      };
      Object.assign(task, cookieOptions());
      tasks.set(task.id, task); persistTasks(); renderTasks();
      hooks.onStarted?.();
      await launch(task);
    }
  };
  return parser;
}

// The home page parses in place: the result panel fills the area the task list
// will occupy, so nothing pops up over it.
const homeParser = createParser({
  url: '#quickUrl', parseBtn: '#quickParse', state: '#quickState', preview: '#quickBody',
  thumb: '#quickThumb', title: '#quickTitle', meta: '#quickMeta',
  type: '#quickType', format: '#quickFormat', dir: '#quickDir', download: '#quickDownload'
}, {
  onReset: () => { $('#quickDir').value = defaultOutputDir(); },
  onStarted: () => { $('#quickUrl').value = ''; homeParser.reset(); }
});

const modalParser = createParser({
  url: '#urlInput', parseBtn: '#parseBtn', state: '#parseState', preview: '#mediaPreview',
  thumb: '#thumb', title: '#mediaTitle', meta: '#mediaMeta',
  type: '#downloadType', format: '#formatSelect', dir: '#outputDir', download: '#downloadBtn'
}, { onStarted: () => closeModal() });

function openModal(prefill = '') {
  modalParser.reset();
  taskModal.classList.remove('hidden');
  $('#urlInput').value = prefill;
  $('#outputDir').value = defaultOutputDir();
  $('#urlInput').focus();
  if (prefill) modalParser.parse();
}
function closeModal() { taskModal.classList.add('hidden'); modalParser.reset(); }

async function launch(task) {
  task.status = 'waiting'; task.error = ''; task.warning = '';
  Object.assign(task, cookieOptions());
  renderTasks();
  try { Object.assign(task, await window.nova.startDownload(task)); }
  catch (error) { task.status = 'error'; task.error = error.message; }
  persistTasks(); renderTasks();
}

/* ----------------------------------------------------------------- render */

function rowMarkup(t) {
  const note = t.error || t.warning || '';
  return `<tr data-id="${t.id}" data-status="${t.status}" class="${selected.has(t.id) ? 'selected ' : ''}${t.status === 'completed' ? 'done' : t.status === 'error' ? 'failed' : ''}">
    <td class="center"><input type="checkbox" class="row-check"${selected.has(t.id) ? ' checked' : ''}></td>
    <td><span class="name" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</span><div class="row-note ${t.error ? 'error' : 'warn'}" data-note${note ? '' : ' hidden'}>${escapeHtml(note)}</div></td>
    <td class="muted" data-size>${sizeText(t)}</td>
    <td><span class="state-${t.status}" data-status-text>${statusText(t.status)}</span></td>
    <td><div class="bar"><i data-bar style="width:${t.progress || 0}%"></i></div><span class="pct" data-percent>${(Number(t.progress) || 0).toFixed(1)}%</span></td>
    <td class="muted" data-speed>${escapeHtml(t.speed || '')}</td>
    <td class="muted" data-eta>${escapeHtml(t.eta || '--:--')}</td>
  </tr>`;
}

// Progress-only updates patch the existing row so the table does not rebuild
// (losing scroll position and selection) several times a second.
function patchRow(task) {
  const row = taskRows.querySelector(`tr[data-id="${task.id}"]`);
  if (!row) return renderTasks();
  row.querySelector('[data-bar]').style.width = `${task.progress || 0}%`;
  row.querySelector('[data-percent]').textContent = `${(Number(task.progress) || 0).toFixed(1)}%`;
  row.querySelector('[data-speed]').textContent = task.speed || '';
  row.querySelector('[data-eta]').textContent = task.eta || '--:--';
  row.querySelector('[data-size]').textContent = sizeText(task);
  const state = row.querySelector('[data-status-text]');
  state.textContent = statusText(task.status);
  state.className = `state-${task.status}`;
  const note = row.querySelector('[data-note]');
  const text = task.error || task.warning || '';
  note.textContent = text;
  note.className = `row-note ${task.error ? 'error' : 'warn'}`;
  note.hidden = !text;
  updateStatusBar();
}

function renderTasks(filter = currentFilter) {
  currentFilter = filter;
  $$('.nav[data-filter]').forEach(nav => nav.classList.toggle('active', nav.dataset.filter === currentFilter));
  const visible = visibleTasks();
  for (const id of [...selected]) if (!tasks.has(id)) selected.delete(id);
  taskRows.innerHTML = visible.map(rowMarkup).join('');
  $('#emptyHint').classList.toggle('hidden', visible.length > 0);
  $('#selectAll').checked = visible.length > 0 && visible.every(t => selected.has(t.id));
  updateStatusBar();
  syncActions();
}

function updateStatusBar() {
  const visible = visibleTasks();
  $('#taskCount').textContent = t('status.tasks', { count: visible.length });
  const total = [...tasks.values()].filter(t => t.status === 'downloading').reduce((sum, t) => sum + parseSpeed(t.speed), 0);
  $('#totalSpeed').textContent = t('status.totalSpeed', { speed: total ? `${prettySize(total)}/s` : '0 B/s' });
}

function syncActions() {
  const picked = selectedTasks();
  const has = picked.length > 0;
  $('#tbResume').disabled = !picked.some(t => ['paused', 'error'].includes(t.status));
  $('#tbStop').disabled = !picked.some(t => t.status === 'downloading');
  $('#tbRemove').disabled = !has;
  $('#tbOpenFolder').disabled = !picked.some(t => t.outputDir);
  $$('.menu-pop button[data-action="resume"], .menu-pop button[data-action="stop"], .menu-pop button[data-action="remove"]')
    .forEach(button => { button.disabled = !has; });
}

/* ---------------------------------------------------------------- actions */

async function actResume() { for (const task of selectedTasks()) if (['paused', 'error'].includes(task.status)) await launch(task); }
async function actStop() { for (const task of selectedTasks()) if (task.status === 'downloading') await window.nova?.stopDownload(task.id); }
async function actStopAll() { for (const task of tasks.values()) if (task.status === 'downloading') await window.nova?.stopDownload(task.id); }
async function actResumeAll() { for (const task of tasks.values()) if (['paused', 'error'].includes(task.status)) await launch(task); }
async function actRemove() {
  for (const task of selectedTasks()) {
    if (task.status === 'downloading') { try { await window.nova.stopDownload(task.id); } catch { /* Removing anyway. */ } }
    tasks.delete(task.id);
    selected.delete(task.id);
  }
  persistTasks();
  renderTasks();
}
async function openDir(dir) {
  if (!dir) return;
  try { await window.nova?.openPath(dir); }
  catch (error) { window.alert(error.message); }
}
async function actOpenFolder() { const task = selectedTasks().find(t => t.outputDir); await openDir(task?.outputDir); }
function actAbout() {
  $('#aboutModal').classList.remove('hidden');
}

const actions = {
  add: () => openModal(),
  resume: actResume,
  stop: actStop,
  'stop-all': actStopAll,
  'resume-all': actResumeAll,
  remove: actRemove,
  'open-folder': () => openDir(defaultOutputDir()),
  options: openSettings,
  'clear-cookies': clearSiteCookies,
  about: actAbout,
  update: () => openUpdate({ recheck: true }),
  quit: () => window.close(),
  filter: button => renderTasks(button.dataset.filter)
};

/* ------------------------------------------------------------------ menus */

function closeMenus() {
  $$('.menu-pop').forEach(pop => pop.classList.add('hidden'));
  $$('.menu-btn').forEach(button => button.classList.remove('open'));
}
$$('.menu-btn').forEach(button => {
  button.onclick = event => {
    event.stopPropagation();
    const pop = document.querySelector(`.menu-pop[data-pop="${button.dataset.menu}"]`);
    const wasOpen = !pop.classList.contains('hidden');
    closeMenus();
    if (!wasOpen) { pop.classList.remove('hidden'); button.classList.add('open'); }
  };
  button.onmouseenter = () => {
    if (!$$('.menu-pop').some(pop => !pop.classList.contains('hidden'))) return;
    closeMenus();
    document.querySelector(`.menu-pop[data-pop="${button.dataset.menu}"]`).classList.remove('hidden');
    button.classList.add('open');
  };
});
$$('.menu-pop button').forEach(button => {
  button.onclick = event => {
    event.stopPropagation();
    closeMenus();
    actions[button.dataset.action]?.(button);
  };
});
document.addEventListener('click', closeMenus);
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  closeMenus();
  if (!taskModal.classList.contains('hidden')) closeModal();
  $('#settingsModal').classList.add('hidden');
  $('#aboutModal').classList.add('hidden');
});

/* ---------------------------------------------------------------- wiring */

/* --------------------------------------------------- empty-state panel */

async function renderSiteTiles() {
  const sites = await window.nova?.browseSites?.().catch(() => []) || [];
  $('#siteTiles').replaceChildren(...sites.map(site => {
    const button = document.createElement('button');
    button.textContent = site.label;
    button.onclick = async () => {
      button.disabled = true;
      try { await window.nova?.openSite(site.id); }
      catch (error) { window.alert(error.message); }
      finally { button.disabled = false; }
    };
    return button;
  }));
}

// The exit address decides whether a site answers at all — on a flagged one
// YouTube refuses every anonymous request — so it is worth showing up front.
async function refreshExitIp() {
  const el = $('#exitIp');
  el.textContent = t('home.exitChecking');
  const info = await window.nova?.exitIp?.().catch(() => null);
  el.textContent = info && info.ip
    ? [info.ip, info.place, info.org].filter(Boolean).join(' · ')
    : t('home.exitUnknown');
}

/* ----------------------------------------------------------------- update */

// The app only ever *reports* that a newer build exists. Downloading and
// installing stays a deliberate act by the user in their own browser.
const UPDATE_CHECKED_KEY = 'novapull.updateCheckedAt';
const UPDATE_SKIPPED_KEY = 'novapull.updateSkipped';
const DAY = 24 * 60 * 60 * 1000;
let updateInfo = null;

function paintUpdate() {
  const state = $('#updateState');
  const facts = $('#updateFacts');
  const notes = $('#updateNotes');
  const offering = Boolean(updateInfo && updateInfo.newer && !updateInfo.error);
  $('#updateOpen').classList.toggle('hidden', !(offering && updateInfo.page));
  $('#updateSkip').classList.toggle('hidden', !offering);
  if (!updateInfo) {
    state.textContent = t('update.checking');
    state.classList.remove('is-error');
    facts.replaceChildren();
    notes.classList.add('hidden');
    return;
  }
  if (updateInfo.error) {
    state.textContent = updateInfo.error;
    state.classList.add('is-error');
    facts.replaceChildren();
    notes.classList.add('hidden');
    return;
  }
  state.classList.remove('is-error');
  state.textContent = updateInfo.newer ? t('update.available', { version: updateInfo.version }) : t('update.upToDate');
  const rows = [[t('update.current'), updateInfo.current], [t('update.latest'), updateInfo.version]];
  if (updateInfo.published) rows.push([t('update.published'), updateInfo.published]);
  if (updateInfo.newer && !updateInfo.page) rows.push(['', t('update.noPage')]);
  facts.replaceChildren(...rows.flatMap(([label, value]) => {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    return [dt, dd];
  }));
  notes.textContent = updateInfo.notes || '';
  notes.classList.toggle('hidden', !updateInfo.notes);
}

async function runUpdateCheck() {
  updateInfo = null;
  paintUpdate();
  try {
    updateInfo = await window.nova.checkUpdate(settings.updateFeed);
  } catch (error) {
    updateInfo = { error: error.message };
  }
  $('#btnUpdate').classList.toggle('hidden', !(updateInfo.newer && !updateInfo.error));
  paintUpdate();
}

// Asking for "检查更新" means check now; clicking the badge just shows what the
// startup check already found.
function openUpdate({ recheck = false } = {}) {
  $('#updateModal').classList.remove('hidden');
  if (recheck || !updateInfo) runUpdateCheck(); else paintUpdate();
}

// A *failed* check stays silent — no feed, no network, a server having a bad
// day must never greet someone who only opened the app to grab a video. A
// successful one that finds a new build does open the dialog, and "skip this
// version" is what stops it asking again for that same build.
async function autoCheckUpdate() {
  if (!settings.autoUpdate) return;
  let last = 0;
  try { last = Number(localStorage.getItem(UPDATE_CHECKED_KEY)) || 0; } catch { /* storage can be blocked */ }
  if (Date.now() - last < DAY) return;
  try { localStorage.setItem(UPDATE_CHECKED_KEY, String(Date.now())); } catch { /* storage can be blocked */ }
  try {
    const info = await window.nova.checkUpdate(settings.updateFeed);
    updateInfo = info;
    $('#btnUpdate').classList.toggle('hidden', !info.newer);
    if (info.newer && info.version !== skippedVersion()) openUpdate();
  } catch { /* silent on startup; the menu item reports properly */ }
}

function skippedVersion() {
  try { return localStorage.getItem(UPDATE_SKIPPED_KEY) || ''; } catch { return ''; }
}

$('#btnUpdate').onclick = () => openUpdate();
$('#updateRecheck').onclick = runUpdateCheck;
$('#updateOpen').onclick = () => {
  if (updateInfo?.page) window.nova.openExternal(updateInfo.page).catch(error => window.alert(error.message));
};
$('#updateSkip').onclick = () => {
  if (updateInfo?.version) {
    try { localStorage.setItem(UPDATE_SKIPPED_KEY, updateInfo.version); } catch { /* storage can be blocked */ }
  }
  $('#updateModal').classList.add('hidden');
};
$$('[data-close-update]').forEach(button => button.onclick = () => $('#updateModal').classList.add('hidden'));

/* ---------------------------------------------------------------- account */

// The renderer only ever holds what publicState() hands over: a name, whether
// this device is activated, and how much of today's free allowance is left.
// The bearer token stays in the main process.
let accountInfo = null;

// A permanent code says so; a timed one says how long is left, rounded up so
// the last partial day still reads as a day rather than zero.
function activeLine(activation) {
  if (!activation.expiresAt) return t('account.activeForever');
  const left = Math.max(0, Math.ceil((Number(activation.expiresAt) - Date.now()) / 86400000));
  return t('account.activeUntil', { days: left, date: new Date(Number(activation.expiresAt)).toLocaleDateString() });
}

function paintAccount() {
  const info = accountInfo;
  const signedIn = Boolean(info && info.signedIn);
  const name = (info && info.user && info.user.username) || '';
  $('#accountName').textContent = signedIn && name ? name : t('account.button');
  // Filled while there is still something to do here, plain once the device is
  // activated and the chip is only telling you who you are.
  $('#btnAccount').classList.toggle('filled', !(info && info.activation && info.activation.active));
  $('#accountWho').textContent = signedIn ? t('account.signedInAs', { name }) : t('account.signedOut');
  $('#accountLogout').classList.toggle('hidden', !signedIn);
  $('#accountForm').classList.toggle('hidden', signedIn);
  $('#accountFormActions').classList.toggle('hidden', signedIn);

  const active = Boolean(info && info.activation && info.activation.active);
  const quota = (info && info.quota) || { limit: 0, remaining: 0 };
  const act = (info && info.activation) || {};
  const why = act.revoked ? 'account.revoked' : act.expired ? 'account.expired' : act.stale ? 'account.stale' : '';
  $('#accountActivationState').textContent = active ? activeLine(act)
    : why ? t(why, { days: (info && info.graceDays) || 14 })
      : quota.remaining > 0 ? t('account.inactive', { remaining: quota.remaining, limit: quota.limit })
        : t('account.quotaGone');
  $('#accountCodeRow').classList.toggle('hidden', active);

  $('#accountServer').value = (info && info.server) || '';
  // These carry a value from the dictionary, so they cannot be data-i18n-placeholder.
  $('#accountUser').placeholder = t('account.usernamePlaceholder');
  $('#accountPass').placeholder = t('account.passwordPlaceholder', { min: (info && info.minPassword) || 8 });
  $('#accountCode').placeholder = t('account.codePlaceholder');
}

function accountSay(message, isError = false) {
  const box = $('#accountState');
  box.textContent = message || '';
  box.classList.toggle('hidden', !message);
  box.classList.toggle('is-error', Boolean(isError));
}

async function accountRun(action, successKey) {
  accountSay(t('account.working'));
  try {
    accountInfo = await action();
    accountSay(successKey ? t(successKey) : '');
  } catch (error) {
    accountSay(error.message, true);
  }
  paintAccount();
}

async function refreshAccount() {
  try { accountInfo = await window.nova?.accountState(); } catch { accountInfo = null; }
  paintAccount();
}

// Revoking a code only means something if the app asks. Opening the dialog is
// far too rare for that, so an activated device re-checks on every start, and
// quietly: a user whose activation is fine should never notice this happening.
async function verifyActivationOnStart() {
  await refreshAccount();
  if (!accountInfo?.activation?.active) return;
  try {
    accountInfo = await window.nova.accountActivationStatus();
    paintAccount();
  } catch { /* offline; account.js decides when a stored activation goes stale */ }
}

$('#btnAccount').onclick = async () => {
  $('#accountModal').classList.remove('hidden');
  accountSay('');
  await refreshAccount();
  // A stored sign-in can have expired and an activation can have been undone on
  // the server, so both are re-checked on opening — silently, because an
  // unreachable server is not a reason to shout at someone.
  if (!accountInfo?.hasServer) return;
  try {
    accountInfo = await window.nova.accountRefresh();
    if (accountInfo.activation.code) accountInfo = await window.nova.accountActivationStatus();
    paintAccount();
  } catch { /* offline: what is stored locally still stands */ }
};

const serverThen = action => async () => {
  // Saved first: signing in or activating is meaningless until the address the
  // request goes to is the one in the box.
  await window.nova.accountSetServer($('#accountServer').value);
  return action();
};

$('#accountLogin').onclick = () => accountRun(serverThen(async () => {
  const state = await window.nova.accountLogin($('#accountUser').value, $('#accountPass').value);
  $('#accountPass').value = '';
  return state;
}), 'account.loginOk');

$('#accountRegister').onclick = () => accountRun(serverThen(async () => {
  const state = await window.nova.accountRegister($('#accountUser').value, $('#accountPass').value);
  $('#accountPass').value = '';
  return state;
}), 'account.registerOk');

$('#accountLogout').onclick = () => accountRun(() => window.nova.accountLogout());

$('#accountActivate').onclick = () => accountRun(serverThen(async () => {
  const state = await window.nova.accountActivate($('#accountCode').value);
  $('#accountCode').value = '';
  return state;
}), 'account.activateOk');

$$('[data-close-account]').forEach(button => button.onclick = () => $('#accountModal').classList.add('hidden'));

/* --------------------------------------------------------------- language */

// Everything the dictionary owns is repainted from one place, so a language
// switch cannot leave half the window in the previous one.
function applyLanguage() {
  document.documentElement.lang = getLanguage() === 'zh' ? 'zh-CN' : 'en';
  for (const el of $$('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of $$('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of $$('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  $('#langName').textContent = t('pref.language');
  $('#btnLang').title = t('pref.language.title');
  paintTheme();
  paintAccount();
  renderTemplatePresets();
  renderTemplateVars();
  if (!$('#settingsModal').classList.contains('hidden')) renderTemplatePreview();
  paintEngineState();
  renderTasks();
}

function renderLangMenu() {
  $('#langMenu').replaceChildren(...LANGUAGES.map(lang => {
    const button = document.createElement('button');
    button.textContent = lang.label;
    button.onclick = event => {
      event.stopPropagation();
      $('#langMenu').classList.add('hidden');
      if (lang.id === getLanguage()) return;
      setLanguage(lang.id);
      try { localStorage.setItem(LANG_KEY, lang.id); } catch { /* storage can be blocked */ }
      // Main-process errors are translated by the same table, so it has to be
      // told as well or a Chinese error would land in an English window.
      window.nova?.setLanguage?.(lang.id).catch(() => {});
      applyLanguage();
    };
    return button;
  }));
}

$('#btnLang').onclick = event => {
  event.stopPropagation();
  // closeMenus() hides this popup too, so remember whether it was open first.
  const wasOpen = !$('#langMenu').classList.contains('hidden');
  closeMenus();
  if (!wasOpen) $('#langMenu').classList.remove('hidden');
};

/* ------------------------------------------------------------------ theme */

// theme-boot.js already stamped the stored choice on <html> before the first
// paint; this only keeps the button in step and writes the new choice back.
const THEME_KEY = 'novapull.theme';

function paintTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  $('#themeIcon').setAttribute('href', dark ? '#ic-moon' : '#ic-sun');
  $('#themeName').textContent = t(dark ? 'pref.theme.dark' : 'pref.theme.light');
  $('#btnTheme').title = t(dark ? 'pref.theme.toLight' : 'pref.theme.toDark');
  // The window buttons are painted by Windows and need telling separately.
  window.nova?.setTheme?.(dark ? 'dark' : 'light').catch(() => {});
}

$('#btnTheme').onclick = () => {
  const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  // An explicit choice is stored either way, so the window stops following the
  // system once the user has picked a side.
  try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch { /* storage can be blocked */ }
  paintTheme();
};
paintTheme();

$('#refreshIp').onclick = refreshExitIp;
$('#quickParse').onclick = () => { if ($('#quickUrl').value.trim()) homeParser.parse(); };
$('#quickUrl').onkeydown = event => { if (event.key === 'Enter') $('#quickParse').click(); };
$('#quickUrl').oninput = () => homeParser.reset();
$('#quickClear').onclick = () => { $('#quickUrl').value = ''; homeParser.reset(); $('#quickUrl').focus(); };
$('#quickFolder').onclick = async () => { const folder = await window.nova?.pickFolder(); if (folder) $('#quickDir').value = folder; };
$('#quickDownload').onclick = () => homeParser.start();
$('#quickFormat').onchange = () => homeParser.warn();
$('#quickType').onchange = event => { $('#quickFormat').disabled = event.target.value === 'audio'; };

$('#tbAdd').onclick = () => openModal();
$('#tbResume').onclick = actResume;
$('#tbStop').onclick = actStop;
$('#tbStopAll').onclick = actStopAll;
$('#tbRemove').onclick = actRemove;
$('#tbOpenFolder').onclick = actOpenFolder;
$('#tbOptions').onclick = () => openSettings();

$$('.nav[data-filter]').forEach(button => button.onclick = () => renderTasks(button.dataset.filter));

$('#selectAll').onchange = event => {
  for (const task of visibleTasks()) { if (event.target.checked) selected.add(task.id); else selected.delete(task.id); }
  renderTasks();
};
taskRows.onclick = event => {
  const row = event.target.closest('tr[data-id]');
  if (!row) return;
  const id = row.dataset.id;
  if (event.target.classList.contains('row-check')) {
    if (event.target.checked) selected.add(id); else selected.delete(id);
  } else {
    selected.clear();
    selected.add(id);
  }
  renderTasks();
};
taskRows.ondblclick = event => {
  const row = event.target.closest('tr[data-id]');
  if (row) openDir(tasks.get(row.dataset.id)?.outputDir);
};

$('#parseBtn').onclick = () => modalParser.parse();
$('#urlInput').oninput = () => modalParser.reset();
$('#urlInput').onkeydown = event => { if (event.key === 'Enter') modalParser.parse(); };
$('#folderBtn').onclick = async () => { const folder = await window.nova?.pickFolder(); if (folder) $('#outputDir').value = folder; };
$('#downloadBtn').onclick = () => modalParser.start();
$('#formatSelect').onchange = () => modalParser.warn();
$('#downloadType').onchange = event => { $('#formatSelect').disabled = event.target.value === 'audio'; };
$$('[data-close]').forEach(button => button.onclick = closeModal);
$$('[data-close-settings]').forEach(button => button.onclick = () => $('#settingsModal').classList.add('hidden'));
$$('[data-close-about]').forEach(button => button.onclick = () => $('#aboutModal').classList.add('hidden'));

/* --------------------------------------------------------------- settings */

// Labels come from the dictionary, so these are rebuilt whenever the language
// changes rather than frozen at load time.
const TEMPLATE_VARS = [
  ['platform', 'naming.var.platform', 'youtube'],
  ['user_name', 'naming.var.userName', 'creator'],
  ['link_id', 'naming.var.linkId', 'dQw4w9WgXcQ'],
  ['date_published', 'naming.var.datePublished', '2026-09-12'],
  ['content', 'naming.var.content', 'sample-video'],
  ['current_time', 'naming.var.currentTime', '20260912-1530'],
  ['index', 'naming.var.index', '00001']
];
const SAMPLES = Object.fromEntries(TEMPLATE_VARS.map(([name, , sample]) => [name, sample]));
// Same sample, but with the fields that sites most often omit left empty —
// this is what proves the separators collapse instead of leaving "NA-".
const SPARSE = { ...SAMPLES, user_name: '', date_published: '' };
const PRESETS = [
  ['preset.minimal', '{content}'],
  ['preset.byPlatform', '{platform}/{content}'],
  ['preset.byAuthor', '{platform}/{user_name}/{content}'],
  ['preset.byDate', '{platform}/{date_published} {content}'],
  ['preset.unique', '{platform}/{user_name}-{content} [{link_id}]']
];
let draft = null;

function renderTemplatePresets() {
  $('#templatePresets').replaceChildren(...PRESETS.map(([key, rule]) => {
    const button = document.createElement('button');
    button.innerHTML = `<b>${escapeHtml(t(key))}</b><small>${escapeHtml(rule)}</small>`;
    button.dataset.rule = rule;
    button.onclick = () => { $('#templateInput').value = rule; renderTemplatePreview(); };
    return button;
  }));
}
renderTemplatePresets();

// Mirrors src/naming.js: inside a filename a separator after an empty variable
// is dropped with it, while a folder falls back to a label so it is never empty.
function fallbackFor(name) {
  const keys = {
    platform: 'naming.fallback.platform', content: 'naming.fallback.content',
    user_name: 'naming.fallback.userName', link_id: 'naming.fallback.linkId',
    date_published: 'naming.fallback.datePublished'
  };
  return name === 'index' ? '0' : (keys[name] ? t(keys[name]) : '');
}

function resolveSegment(segment, values, isDirectory) {
  let out = '';
  let drop = false;
  for (const part of segment.split(/(\{[a-z_]+\})/)) {
    if (!part) continue;
    const name = part.startsWith('{') && part.endsWith('}') ? part.slice(1, -1) : null;
    if (name && name in values) {
      const value = values[name] || (isDirectory ? fallbackFor(name) : '');
      out += value;
      drop = !isDirectory && !value;
      continue;
    }
    if (!drop) out += part;
    drop = false;
  }
  return out;
}

function resolveTemplate(template, values) {
  const segments = template.split('/');
  return segments.map((segment, index) => resolveSegment(segment, values, index < segments.length - 1)).join('/');
}

function renderTemplateVars() {
  $('#templateVars').replaceChildren(...TEMPLATE_VARS.map(([name, key]) => {
    const button = document.createElement('button');
    button.innerHTML = `<b>{${name}}</b><small>${escapeHtml(t(key))}</small>`;
    button.onclick = () => insertVariable(`{${name}}`);
    return button;
  }));
}
renderTemplateVars();

function insertVariable(token) {
  const input = $('#templateInput');
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${token}${input.value.slice(end)}`;
  input.focus();
  input.setSelectionRange(start + token.length, start + token.length);
  renderTemplatePreview();
}

function renderTemplatePreview() {
  const template = $('#templateInput').value;
  const preview = $('#templatePreview');
  preview.replaceChildren();
  // Split on the variables so each resolved value can keep its own colour.
  for (const part of template.split(/(\{[a-z_]+\})/)) {
    if (!part) continue;
    const name = part.startsWith('{') && part.endsWith('}') ? part.slice(1, -1) : '';
    const span = document.createElement('span');
    if (name && name in SAMPLES) { span.className = `tok tok-${name}`; span.textContent = SAMPLES[name]; }
    else { span.className = 'tok-sep'; span.textContent = part; }
    preview.append(span);
  }
  const ext = document.createElement('span');
  ext.className = 'tok-ext';
  ext.textContent = '.mp4';
  preview.append(ext);
  $('#templatePath').textContent = t('settings.pathPreview', { path: resolveTemplate(template, SAMPLES) });
  const sparse = resolveTemplate(template, SPARSE);
  const full = resolveTemplate(template, SAMPLES);
  $('#templateSparse').textContent = sparse === full
    ? ''
    : t('settings.sparseNote', { path: sparse });
  $$('#templatePresets button').forEach(button => button.classList.toggle('on', button.dataset.rule === template));
}

function openSettings() {
  draft = { outputDir: settings.outputDir, filenameTemplate: settings.filenameTemplate };
  $('#settingsOutputDir').textContent = draft.outputDir || systemDownloadDir;
  $('#templateInput').value = draft.filenameTemplate;
  renderTemplatePreview();
  $('#updateFeed').value = settings.updateFeed;
  $('#autoUpdate').checked = settings.autoUpdate;
  $('#settingsModal').classList.remove('hidden');
}
$('#settingsCheckUpdate').onclick = () => {
  // Check what is typed right now, not what was last saved.
  settings.updateFeed = $('#updateFeed').value.trim();
  openUpdate({ recheck: true });
};
$('#templateInput').oninput = renderTemplatePreview;
$('#templateReset').onclick = () => { $('#templateInput').value = SETTING_DEFAULTS.filenameTemplate; renderTemplatePreview(); };
$('#settingsPick').onclick = async () => {
  const folder = await window.nova?.pickFolder();
  if (!folder) return;
  draft.outputDir = folder;
  $('#settingsOutputDir').textContent = folder;
};
$('#settingsOpenDir').onclick = () => openDir(draft?.outputDir || systemDownloadDir);
$('#settingsSave').onclick = () => {
  settings.outputDir = draft.outputDir;
  settings.filenameTemplate = $('#templateInput').value.trim() || SETTING_DEFAULTS.filenameTemplate;
  settings.updateFeed = $('#updateFeed').value.trim();
  settings.autoUpdate = $('#autoUpdate').checked;
  persistSettings();
  $('#settingsModal').classList.add('hidden');
};

/* -------------------------------------------------------- site cookies */

// Browsing a site in the built-in browser is what collects its cookies, so the
// only control still needed is a way to throw them away.
async function clearSiteCookies() {
  const status = await window.nova?.cookiesStatus?.().catch(() => null);
  const count = status?.count || 0;
  if (!count) return window.alert(t('cookies.none'));
  if (!window.confirm(t('cookies.confirm', { count }))) return;
  try { await window.nova.clearLogin(); window.alert(t('cookies.cleared')); }
  catch (error) { window.alert(error.message); }
}
// Stage updates are global; show them wherever a parse is actually running.
window.nova?.onParseStage(({ text }) => {
  for (const parser of [modalParser, homeParser]) if (parser.busy) parser.say(text);
});
window.nova?.onTaskEvent(update => {
  const task = tasks.get(update.id);
  if (!task) return;
  const before = task.status;
  Object.assign(task, update);
  persistSoon();
  if (task.status !== before) renderTasks(); else patchRow(task);
});
window.nova?.onTaskLog(({ id, line }) => { const task = tasks.get(id); if (task && /^ERROR:/i.test(line)) task.error = line; });

// Kept so the status bar and the about box can be redrawn in a new language
// without asking the main process again.
let appInfo = null;
let appInfoFailed = false;

function paintEngineState() {
  if (!window.nova) {
    $('#engineState').textContent = t('status.preview');
    $('#aboutBody').textContent = t('about.preview');
    return;
  }
  if (appInfoFailed) return void ($('#engineState').textContent = t('status.initFailed'));
  if (!appInfo) return void ($('#engineState').textContent = t('status.checking'));
  $('#engineState').textContent = appInfo.ready ? t('status.ready') : t('status.missing', { names: (appInfo.missing || []).join(', ') });
  $('#engineState').title = t('status.engineTitle', { dir: appInfo.toolDir || '?' });
  $('#aboutBody').textContent = t('about.body', { version: appInfo.version, dir: appInfo.toolDir || '?', downloads: defaultOutputDir() });
}

if (window.nova) {
  renderSiteTiles();
  refreshExitIp();
  verifyActivationOnStart();
  window.nova.setLanguage?.(getLanguage()).catch(() => {});
  autoCheckUpdate();
  window.nova.appInfo().then(info => {
    appInfo = info;
    systemDownloadDir = info.downloads;
    $('#outputDir').value = defaultOutputDir();
    $('#quickDir').value = defaultOutputDir();
    $('#settingsOutputDir').value = defaultOutputDir();
    $('#titleVersion').textContent = `v${info.version}`;
    paintEngineState();
  }).catch(() => { appInfoFailed = true; paintEngineState(); });
}
renderLangMenu();
applyLanguage();
