const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { probeVideo, verifyDouyinFormats, resolutionLabel } = require('../src/douyin-formats');
const fixture = () => ({ extractor_key: 'Douyin', formats: [
  { format_id: 'original', url: 'https://example.invalid/a', width: 720, height: 405, vcodec: 'h264' },
  { format_id: 'backup', url: 'https://example.invalid/a', width: 720, height: 405, vcodec: 'h264' },
  { format_id: 'audio', url: 'https://example.invalid/b', vcodec: 'none' }
] });

test('读取实际尺寸，保留格式编号，不修改原数据', async () => {
  const input = fixture();
  const result = await verifyDouyinFormats(input, 'ffprobe', { probe: async () => ({ width: 1280, height: 720, fps: 60 }) });
  assert.equal(result.formats[0].height, 720);
  assert.equal(result.formats[0].format_id, 'original');
  assert.equal(result.formats[0].resolutionVerified, true);
  assert.equal(input.formats[0].height, 405);
});
test('相同媒体地址只校验一次，纯音频不校验', async () => {
  let calls = 0;
  await verifyDouyinFormats(fixture(), 'ffprobe', { probe: async () => { calls++; return null; } });
  assert.equal(calls, 1);
});
test('校验失败不编造高清尺寸', async () => {
  const result = await verifyDouyinFormats(fixture(), 'ffprobe', { probe: async () => { throw Error('offline'); } });
  assert.equal(result.formats[0].height, 405);
  assert.equal(result.formats[0].resolutionVerified, false);
  assert.equal(resolutionLabel(result.formats[0]), '405p（未核验）');
});
test('总预算耗尽后不再启动请求', async () => {
  let calls = 0;
  const result = await verifyDouyinFormats(fixture(), 'ffprobe', { budgetMs: 0, probe: async () => { calls++; } });
  assert.equal(calls, 0);
  assert.equal(result.formats[0].resolutionVerified, false);
});
test('其他平台不触发额外校验', async () => {
  const input = { ...fixture(), extractor_key: 'Youtube' };
  assert.equal(await verifyDouyinFormats(input, 'ffprobe', { probe: () => assert.fail('unexpected probe') }), input);
});
test('核验过的按短边给出档位名', () => {
  assert.equal(resolutionLabel({ width: 3840, height: 2160, resolutionVerified: true }), '4K');
  assert.equal(resolutionLabel({ width: 1080, height: 1920, resolutionVerified: true }), '1080P');
  assert.equal(resolutionLabel({ width: 7680, height: 4320, resolutionVerified: true }), '8K');
});

test('未核验的保留站点声称的原始数值，不套用档位名', () => {
  // Douyin declares a real 1280x720 stream as "405p"; dressing that up as
  // "360P" would lend a wrong number an air of authority.
  assert.equal(resolutionLabel({ width: 720, height: 405 }), '405p（未核验）');
  assert.equal(resolutionLabel({}), '未知分辨率（未核验）');
});
function fakeSpawn(output, code = 0, onArgs = () => {}) {
  return (exe, args, options) => {
    onArgs(args, options);
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => child.emit('close', null);
    process.nextTick(() => { child.stdout.write(output); child.emit('close', code); });
    return child;
  };
}
test('ffprobe输出读取视频尺寸和帧率，过滤非法请求头', async () => {
  const spawn = fakeSpawn(JSON.stringify({ streams: [
    { codec_type: 'audio' }, { codec_type: 'video', width: 1280, height: 720, r_frame_rate: '60000/1001' }
  ] }), 0, (args, options) => {
    assert.equal(options.windowsHide, true);
    assert.ok(args.includes('-protocol_whitelist'));
    assert.equal(args[args.indexOf('-headers') + 1], 'Referer: https://www.douyin.com/\r\n');
  });
  const result = await probeVideo(fixture().formats[0], { http_headers: { Referer: 'https://www.douyin.com/', Bad: 'x\r\ny' } }, 'ffprobe', 1000, spawn);
  assert.equal(result.height, 720);
  assert.ok(result.fps > 59 && result.fps < 60);
});
test('ffprobe错误或无有效尺寸时返回未核验', async () => {
  for (const data of ['not json', '{"streams":[]}', '{"streams":[{"codec_type":"video","width":0,"height":0}]}']) {
    assert.equal(await probeVideo(fixture().formats[0], {}, 'ffprobe', 1000, fakeSpawn(data)), null);
  }
});
test('拒绝本地文件媒体URL', async () => {
  assert.equal(await probeVideo({ url: 'file:///C:/secret' }, {}, 'ffprobe', 1000, () => assert.fail('spawned')), null);
});
test('超时终止ffprobe进程', async () => {
  let killed = false;
  const spawn = () => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { killed = true; };
    return child;
  };
  assert.equal(await probeVideo(fixture().formats[0], {}, 'ffprobe', 10, spawn), null);
  assert.equal(killed, true);
});
