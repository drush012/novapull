const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { DICT, LANGUAGES, t, setLanguage, getLanguage } = require('../src/i18n');

const SOURCE = path.join(__dirname, '..', 'src');
const KEYS = Object.keys(DICT.zh);

test('每种语言都出现在语言列表里', () => {
  assert.deepEqual(LANGUAGES.map(l => l.id).sort(), Object.keys(DICT).sort());
});

// A key present in one language and missing in another is the failure mode
// that silently leaves half a window untranslated.
for (const lang of Object.keys(DICT)) {
  test(`${lang} 的词条与中文一一对应`, () => {
    assert.deepEqual(Object.keys(DICT[lang]).sort(), KEYS.slice().sort());
  });

  test(`${lang} 没有空词条`, () => {
    const empty = KEYS.filter(key => !String(DICT[lang][key]).trim());
    assert.deepEqual(empty, []);
  });
}

// A translator can easily drop a {placeholder}; that would print a literal hole
// in the message instead of the file name or count it is meant to carry.
test('各语言的占位符集合一致', () => {
  const holes = text => (String(text).match(/\{(\w+)\}/g) || []).sort().join(',');
  for (const key of KEYS) {
    // {link_id} in the duplicate-file warning names a template variable the
    // user types, not a value substituted here, so both sides keep it as text.
    if (key === 'warn.duplicate') continue;
    for (const lang of Object.keys(DICT)) {
      assert.equal(holes(DICT[lang][key]), holes(DICT.zh[key]), `${key} (${lang})`);
    }
  }
});

test('默认是中文，切换后生效，未知语言回落中文', () => {
  assert.equal(getLanguage(), 'zh');
  setLanguage('en');
  assert.equal(t('action.save'), 'Save');
  setLanguage('de');
  assert.equal(getLanguage(), 'zh');
  assert.equal(t('action.save'), '保存');
});

test('替换占位符，缺少的变量原样保留', () => {
  setLanguage('zh');
  assert.equal(t('status.tasks', { count: 3 }), '3 个任务');
  assert.match(t('status.tasks', {}), /\{count\}/);
});

test('未知键返回键名本身，便于一眼看出漏翻', () => {
  assert.equal(t('nope.not.here'), 'nope.not.here');
});

// The point of the dictionary is that no user-facing string is left behind in
// the source; a new hard-coded Chinese literal should fail here, not in review.
test('源码里不再残留硬编码的中文界面文案', () => {
  const files = fs.readdirSync(SOURCE).filter(name => /\.(js|html)$/.test(name) && name !== 'i18n.js');
  const offenders = [];
  for (const name of files) {
    const lines = fs.readFileSync(path.join(SOURCE, name), 'utf8').split('\n');
    lines.forEach((line, index) => {
      const code = line
        .replace(/^\s*(\/\/|\*|<!--).*/, '')
        // CJK inside a regex matches what a *site* wrote (a page title suffix,
        // say); it is pattern data, not something shown to the user.
        .replace(/\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g, '');
      // Quoted runs of CJK are strings; a stray 、 or · used as a separator is not.
      if (/['"`][^'"`]*[一-龥]{2,}[^'"`]*['"`]/.test(code)) {
        offenders.push(`${name}:${index + 1} ${line.trim().slice(0, 60)}`);
      }
    });
  }
  assert.deepEqual(offenders, []);
});

// The bug this guards against: the "needs login" gate was matched against our
// own error message, which is translated — so the app skipped the sniffer
// fallback in Chinese and took it in English, from the very same link.
// Control flow must branch on what yt-dlp printed, never on what we wrote.
test('登录墙判定只看 yt-dlp 原始输出，不看翻译后的文案', () => {
  const main = fs.readFileSync(path.join(SOURCE, 'main.js'), 'utf8');
  const line = main.split('\n').find(l => l.startsWith('const NEEDS_LOGIN'));
  assert.ok(line, '找不到 NEEDS_LOGIN');
  assert.doesNotMatch(line, /[一-龥]/, 'NEEDS_LOGIN 不能包含中文，否则行为会随语言变化');

  // And it must not be applied to a message that went through the dictionary.
  const uses = main.split('\n').filter(l => l.includes('NEEDS_LOGIN.test('));
  assert.ok(uses.length > 0, 'NEEDS_LOGIN 没有被使用');
  for (const use of uses) {
    assert.doesNotMatch(use, /\.message/, `不能拿翻译后的消息去匹配：${use.trim()}`);
  }

  // Both translations of the bot-gate message must be equally unmatched by it.
  const pattern = new RegExp(line.slice(line.indexOf('/') + 1, line.lastIndexOf('/')), 'i');
  for (const lang of Object.keys(DICT)) {
    assert.equal(pattern.test(DICT[lang]['err.youtubeBot']), false, `${lang} 的文案被误判为 yt-dlp 原始输出`);
  }
});
