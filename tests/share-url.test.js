const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractShareUrl } = require('../src/share-url');
const video = 'https://www.bilibili.com/video/BV17xGq6PE1e/?spm_id_from=333.1007';
const douyinVideo = 'https://www.douyin.com/video/7565332559501020431';
const douyinSearch = 'https://www.douyin.com/jingxuan/search/4k?aid=f033027d-399f-4d18-ab67-7a7e4bf99a74&modal_id=7565332559501020431&type=general';
const cases = [
  ['抖音精选搜索页转换为具体视频', douyinSearch, douyinVideo],
  ['抖音分享文案转换且保留长视频编号精度', `【16K超清震撼来袭】 ${douyinSearch} 复制打开`, douyinVideo],
  ['抖音首页弹窗链接', 'https://douyin.com/?modal_id=7565332559501020431', douyinVideo],
  ['抖音标准视频链接保持不变', douyinVideo, douyinVideo],
  ['抖音短链接保持不变', 'https://v.douyin.com/abc123/', 'https://v.douyin.com/abc123/'],
  ['没有视频编号的搜索页保持不变', 'https://www.douyin.com/jingxuan/search/4k', 'https://www.douyin.com/jingxuan/search/4k'],
  ['非数字视频编号不转换', 'https://www.douyin.com/?modal_id=123abc', 'https://www.douyin.com/?modal_id=123abc'],
  ['相似域名不转换', 'https://notdouyin.com/?modal_id=123', 'https://notdouyin.com/?modal_id=123'],
  ['伪装子域名不转换', 'https://douyin.com.example.com/?modal_id=123', 'https://douyin.com.example.com/?modal_id=123'],
  ['YouTube链接及分享参数保持不变', 'https://youtu.be/kKLSuRrZwwE?si=LRlgWswj-OtxAzY6', 'https://youtu.be/kKLSuRrZwwE?si=LRlgWswj-OtxAzY6'],
  ['纯链接', video, video],
  ['截图中的标题加链接', `【Codex 额度不够了？让 ChatGPT 无缝接着开发本地项目】 ${video}`, video],
  ['标题与链接紧挨着', `视频分享${video}`, video],
  ['链接前后有文字', `看看这个视频 ${video} 复制链接打开`, video],
  ['换行文案', `标题\n${video}\n快来看看`, video],
  ['中文括号', `推荐（${video}）。`, video],
  ['中文句号紧挨链接', `${video}。去看看`, video],
  ['英文括号和标点', `(${video}).`, video],
  ['Markdown', `[视频](${video})`, video],
  ['短链接', '分享 https://b23.tv/abc123 复制打开', 'https://b23.tv/abc123'],
  ['HTTP', '标题 http://example.com/video', 'http://example.com/video'],
  ['大小写协议', '标题 HTTPS://example.com/video', 'HTTPS://example.com/video'],
  ['保留签名与参数', '分享 https://example.com/a.mp4?token=a%2Fb%3D&ts=123#part', 'https://example.com/a.mp4?token=a%2Fb%3D&ts=123#part'],
  ['保留路径中的成对括号', '[链接](https://example.com/watch_(2026))', 'https://example.com/watch_(2026)'],
  ['保留中文路径', '下载 https://example.com/测试视频.mp4', 'https://example.com/测试视频.mp4'],
  ['IPv6', '视频 http://[::1]:8766/sample.mp4', 'http://[::1]:8766/sample.mp4'],
  ['零宽字符', `\uFEFF【分享】${video}\u200B`, video],
  ['重复链接只取一个', `${video} ${video}`, video],
];
for (const [name, text, expected] of cases) test(name, () => assert.equal(extractShareUrl(text), expected));
test('不同链接不会静默选择错误视频', () => assert.throws(() => extractShareUrl(`${video} https://b23.tv/other`), /多个不同链接/));
for (const input of ['', '只有标题', 'https://', 'file:///C:/test', 'javascript:alert(1)']) {
  test(`拒绝无效输入 ${JSON.stringify(input)}`, () => assert.throws(() => extractShareUrl(input), /没有找到有效链接/));
}
