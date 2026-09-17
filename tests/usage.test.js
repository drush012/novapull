const { test } = require('node:test');
const assert = require('node:assert/strict');

// The module reads electron only for the userData path; the decision logic it
// is worth testing is pure.
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return { app: { getPath: () => '.' } };
  return originalLoad.call(this, request, ...rest);
};
const { nextUsage, dayKey, FREE_DAILY_LIMIT } = require('../src/usage');
Module._load = originalLoad;

const DAY = '2026-09-17';
const on = (record, id) => nextUsage(record, id, { day: DAY, limit: 3 });

test('第一次下载被允许，并记下任务编号', () => {
  const result = on(null, 'task-a');
  assert.equal(result.allowed, true);
  assert.deepEqual(result.record, { day: DAY, ids: ['task-a'] });
  assert.equal(result.remaining, 2);
});

test('用满当天额度后拒绝新任务', () => {
  const full = { day: DAY, ids: ['a', 'b', 'c'] };
  const result = on(full, 'd');
  assert.equal(result.allowed, false);
  assert.equal(result.remaining, 0);
  assert.deepEqual(result.record.ids, ['a', 'b', 'c'], '被拒绝的任务不该占用名额');
});

// The point of counting task ids rather than starts: a download that dropped
// halfway and is retried must not cost a second slot.
test('重试同一个任务不再扣次数', () => {
  const full = { day: DAY, ids: ['a', 'b', 'c'] };
  const result = on(full, 'b');
  assert.equal(result.allowed, true);
  assert.deepEqual(result.record.ids, ['a', 'b', 'c']);
});

test('跨天后额度重置', () => {
  const yesterday = { day: '2026-09-16', ids: ['a', 'b', 'c'] };
  const result = on(yesterday, 'd');
  assert.equal(result.allowed, true);
  assert.deepEqual(result.record, { day: DAY, ids: ['d'] });
});

test('损坏或缺字段的记录按空额度处理', () => {
  for (const broken of [null, undefined, {}, { day: DAY }, { day: DAY, ids: 'nope' }]) {
    assert.equal(on(broken, 'x').allowed, true);
  }
});

test('按本地日历日计算，不用 UTC', () => {
  const noon = new Date(2026, 8, 17, 12, 0, 0).getTime();
  assert.equal(dayKey(noon), DAY);
  // A late evening stays on the same local day even where UTC has moved on.
  assert.equal(dayKey(new Date(2026, 8, 17, 23, 30, 0).getTime()), DAY);
});

test('免费额度是 3 次', () => {
  assert.equal(FREE_DAILY_LIMIT, 3);
});
