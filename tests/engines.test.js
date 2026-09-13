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
