const { test } = require('node:test');
const assert = require('node:assert/strict');
const { outputTemplate, DEFAULT_TEMPLATE } = require('../src/naming');

const at = new Date(2026, 8, 12, 15, 30);

test('默认规则编译为条件分隔符形式', () => {
  assert.equal(
    outputTemplate(DEFAULT_TEMPLATE, at),
    '%(extractor)s/%(uploader,uploader_id,channel,creator|)s%(uploader,uploader_id,channel,creator&-|)s%(title).120B.%(ext)s'
  );
});

test('作者后面的分隔符绑定在作者上，缺作者时会一起消失', () => {
  const compiled = outputTemplate('{user_name} - {content}', at);
  assert.match(compiled, /%\(uploader,uploader_id,channel,creator& - \|\)s/);
});

test('平台等必然存在的字段后面的分隔符保持无条件', () => {
  assert.match(outputTemplate('{platform}/{content}', at), /%\(extractor\)s\/%\(title\)\.120B/);
});

test('日期使用格式化并带条件', () => {
  const compiled = outputTemplate('{date_published} {content}', at);
  assert.match(compiled, /%\(upload_date>%Y-%m-%d\|\)s%\(upload_date& \|\)s/);
});

test('current_time 在编译期求值', () => {
  assert.equal(outputTemplate('{current_time}-{content}', at), '20260912-1530-%(title).120B.%(ext)s');
});

test('总是补上扩展名', () => {
  assert.ok(outputTemplate('{content}', at).endsWith('.%(ext)s'));
});

test('目录段的可选变量使用兜底名，避免空文件夹', () => {
  assert.ok(outputTemplate('{user_name}/{content}', at).startsWith('%(uploader,uploader_id,channel,creator|未知作者)s/'));
});

test('目录分隔符永远不进条件语法，否则会被净化成 ⧸ 而建不出文件夹', () => {
  const compiled = outputTemplate('{platform}/{user_name}/{content}', at);
  assert.ok(!/&[^)]*\//.test(compiled), `条件语法里混入了斜杠：${compiled}`);
  assert.equal(compiled.split('/').length, 3);
});

test('文件名段仍然使用条件分隔符收敛', () => {
  assert.match(outputTemplate('{user_name}-{content}', at), /&-\|\)s/);
});

test('反斜杠归一为正斜杠，前导斜杠被去掉', () => {
  assert.equal(outputTemplate('\\\\{platform}\\{content}', at), '%(extractor)s/%(title).120B.%(ext)s');
});

test('字面量百分号被转义', () => {
  assert.match(outputTemplate('100%{content}', at), /^100%%/);
});

test('未知变量原样保留，不会被当成字段', () => {
  assert.match(outputTemplate('{content}{nope}', at), /\{nope\}/);
});

for (const [name, rule, pattern] of [
  ['非法字符', '{content}:1', /不允许的字符/],
  ['上级目录', '../{content}', /上级目录/],
  ['没有变量', 'plain-name', /至少要包含一个变量/]
]) {
  test(`拒绝${name}`, () => assert.throws(() => outputTemplate(rule, at), pattern));
}

test('空规则回退到默认值', () => {
  assert.equal(outputTemplate('   ', at), outputTemplate(DEFAULT_TEMPLATE, at));
});
