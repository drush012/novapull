const { qualityTier } = require('./quality');
const { t } = require('./i18n');
const { spawn } = require('child_process');

function isDouyin(info) {
  return /^douyin$/i.test(info.extractor_key || info.extractor || '');
}

function probeVideo(format, info, executable, timeout, spawnProcess = spawn) {
  return new Promise(resolve => {
    if (!/^https?:\/\//i.test(format.url || '')) return resolve(null);
    const headers = Object.entries({ ...info.http_headers, ...format.http_headers })
      .filter(([key, value]) => /^[\w-]+$/.test(key) && !/[\r\n]/.test(String(value)))
      .map(([key, value]) => `${key}: ${value}\r\n`).join('');
    const args = ['-v', 'error', '-rw_timeout', String(timeout * 1000),
      '-analyzeduration', '1000000', '-probesize', '1048576',
      '-protocol_whitelist', 'http,https,tcp,tls,crypto',
      ...(headers ? ['-headers', headers] : []),
      '-show_entries', 'stream=codec_type,width,height,r_frame_rate', '-of', 'json', format.url];
    let child, timer, output = '', settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    try { child = spawnProcess(executable, args, { windowsHide: true }); }
    catch { return finish(null); }
    timer = setTimeout(() => { finish(null); child.kill(); }, timeout);
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > 256000) { finish(null); child.kill(); }
    });
    child.stderr.on('data', () => {}); // Drain without exposing signed URLs or headers.
    child.on('error', () => finish(null));
    child.on('close', code => {
      if (settled) return;
      try {
        const stream = code === 0 && JSON.parse(output).streams?.find(s =>
          s.codec_type === 'video' && Number.isInteger(s.width) && s.width > 0 &&
          Number.isInteger(s.height) && s.height > 0);
        if (!stream) return finish(null);
        const [num, den] = String(stream.r_frame_rate || '').split('/').map(Number);
        finish({ width: stream.width, height: stream.height,
          ...(num > 0 && den > 0 ? { fps: num / den } : {}) });
      } catch { finish(null); }
    });
  });
}

async function verifyDouyinFormats(info, executable, options = {}) {
  if (!isDouyin(info)) return info;
  const probe = options.probe || probeVideo;
  const deadline = Date.now() + (options.budgetMs ?? 15000);
  const formats = (info.formats || []).map(f => ({ ...f }));
  const videos = formats.filter(f => f.vcodec !== 'none');
  const pending = new Map();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, videos.length) }, async () => {
    while (next < videos.length) {
      const f = videos[next++];
      f.resolutionVerified = false;
      const remaining = deadline - Date.now();
      if (remaining <= 0) continue;
      // Same URL can appear under several format IDs; inspect it only once.
      if (!pending.has(f.url)) pending.set(f.url,
        Promise.resolve().then(() => probe(f, info, executable, Math.min(8000, remaining))).catch(() => null));
      const actual = await pending.get(f.url);
      if (actual) Object.assign(f, actual, { resolutionVerified: true });
    }
  }));
  return { ...info, formats };
}

function resolutionLabel(f) {
  // Unverified entries keep the site's own declared number: turning an
  // untrusted 405 into a tidy "360P" would dress up a figure we know Douyin
  // gets wrong. Only measured dimensions earn a quality name.
  if (f.resolutionVerified !== true) return t('media.unverified', { label: f.height ? `${f.height}p` : t('media.unknownRes') });
  return qualityTier(f.width, f.height) || t('media.unknownRes');
}

module.exports = { isDouyin, probeVideo, verifyDouyinFormats, resolutionLabel };
