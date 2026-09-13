const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// main.js needs Electron, so these read the source. The point is not to retest
// what yt-dlp does — it is to catch a silent regression: the JS runtime flag
// going missing from one of the two places that spawn yt-dlp, which would look
// like "YouTube broke again" long after the change that caused it.
const MAIN = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

test('JS 运行时参数同时接在解析和下载两条路径上', () => {
  const spawns = MAIN.split('\n').filter(line => /spawn\(bundledTool\('yt-dlp'\)/.test(line));
  assert.ok(spawns.length >= 1, '找不到 yt-dlp 的启动点');

  // The parse path passes its arguments inline on the spawn line; the download
  // path builds an args array first. Both must include the flag.
  const parseLine = spawns.find(line => line.includes('--dump-single-json'));
  assert.ok(parseLine, '找不到解析路径');
  assert.match(parseLine, /jsRuntimeArgs\(\)/, '解析路径缺少 JS 运行时参数');

  const argsBlock = MAIN.slice(MAIN.indexOf('const args = ['), MAIN.indexOf("'--continue', '--no-overwrites'"));
  assert.match(argsBlock, /jsRuntimeArgs\(\)/, '下载路径缺少 JS 运行时参数');
});

test('缺少 deno 时只是不加参数，不会抛错', () => {
  const fn = MAIN.slice(MAIN.indexOf('function jsRuntimeArgs()'), MAIN.indexOf('function bundledTool('));
  // bundledTool() throws when a binary is missing; the JS runtime must not,
  // because only YouTube needs it and the other sites still work without.
  assert.doesNotMatch(fn, /bundledTool|throw/, 'JS 运行时应当是可选的');
  assert.match(fn, /resolveTool\('deno'\)/);
  assert.match(fn, /\[\]/, '缺失时应返回空参数数组');
});

test('deno 不计入「内核缺失」，但状态里要能看到', () => {
  const info = MAIN.slice(MAIN.indexOf("ipcMain.handle('app-info'"), MAIN.indexOf("ipcMain.handle('app-info'") + 700);
  assert.doesNotMatch(info.slice(0, info.indexOf('jsRuntime')), /'deno'/, 'deno 不应算进必需内核');
  assert.match(info, /jsRuntime:\s*Boolean\(resolveTool\('deno'\)\)/);
});

test('CI 会下载 deno 并校验官方哈希', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'build.yml'), 'utf8');
  assert.match(workflow, /deno-x86_64-pc-windows-msvc\.zip/);
  assert.match(workflow, /deno-x86_64-pc-windows-msvc\.zip\.sha256sum/);
  assert.match(workflow, /Copy-Item deno-temp\/deno\.exe vendor\/deno\.exe/);
  // The checksum must actually be compared, not just downloaded and printed.
  assert.match(workflow, /deno\.zip 校验失败/);
});

// YouTube is parsed signed out first. On a clean exit that is the only pass
// able to reach the 4K/8K clients, which refuse cookies — measured: 4320p signed
// out against 1080p60 signed in, same video, same exit. These pin each piece of
// that, because breaking any one of them silently caps YouTube at 1080p again.
test('YouTube 两套客户端链：未登录那轮够得着高画质客户端，登录那轮以 web_safari 开头', () => {
  const signedOut = MAIN.match(/const YT_CLIENTS_SIGNED_OUT = '([^']+)'/);
  const signedIn = MAIN.match(/const YT_CLIENTS_SIGNED_IN = '([^']+)'/);
  assert.ok(signedOut && signedIn, '找不到两套客户端链');
  assert.match(signedOut[1], /(^|,)(default|android_vr|visionos)(,|$)/, '未登录那轮必须包含能出 DASH 高画质的客户端');
  assert.match(signedIn[1], /^web_safari(,|$)/, '登录那轮必须以 web_safari 开头');
});

test('解析：YouTube 先不带 Cookie，只有被要求登录时才带 Cookie 重试', () => {
  const start = MAIN.indexOf("ipcMain.handle('inspect-url'");
  const handler = MAIN.slice(start, MAIN.indexOf('const inspectWithYtDlp', start));
  assert.match(handler, /isYouTube\(url\)/);
  assert.match(handler, /anonymous:\s*true/);
  assert.match(handler, /ytAnonymous:\s*true/);
  // Only a login wall justifies bringing the cookies; any other failure goes to
  // the ordinary fallback instead of a pointless second attempt.
  assert.match(handler, /if \(!anonymousError\.needsLogin\) throw anonymousError/);

  const at = MAIN.indexOf('const inspectWithYtDlp');
  const inspect = MAIN.slice(at, at + 700);
  assert.match(inspect, /anonymous \? \[\] : cookieArgs\(request\)/, '未登录那轮不能带 Cookie');
  assert.match(inspect, /youtubeClientArgs\(anonymous\)/);
});

test('下载沿用解析时的方式：未登录解析出来的任务，下载也不带 Cookie', () => {
  const argsBlock = MAIN.slice(MAIN.indexOf('const args = ['), MAIN.indexOf("'--continue', '--no-overwrites'"));
  assert.match(argsBlock, /task\.ytAnonymous \? \[\] : cookieArgs\(task\)/);
  assert.match(argsBlock, /youtubeClientArgs\(Boolean\(task\.ytAnonymous\)\)/);

  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer.js'), 'utf8');
  assert.match(renderer, /ytAnonymous:\s*Boolean\(info\.ytAnonymous\)/, '渲染层建任务时必须把解析方式带过去');
});
