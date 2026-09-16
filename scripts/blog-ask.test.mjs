// blog-ask.js 纯函数单元测试
// 运行：node --test scripts/blog-ask.test.mjs
// 约定：source/js 自定义逻辑超过 ~50 行时必须拆出可导出纯函数并在此补测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { pickLang, toEnUrl, buildUiText } = require('../source/js/blog-ask.js');

test('pickLang: /en/ 前缀识别为英文', () => {
  assert.equal(pickLang('/en/'), 'en');
  assert.equal(pickLang('/en/2026/09/15/xxx/'), 'en');
  assert.equal(pickLang('/en'), 'en');
});

test('pickLang: 中文路径识别为中文', () => {
  assert.equal(pickLang('/'), 'zh');
  assert.equal(pickLang('/2026/09/15/xxx/'), 'zh');
  assert.equal(pickLang('/archives/'), 'zh');
});

test('toEnUrl: 英文站相对路径加 /en 前缀', () => {
  assert.equal(toEnUrl('/2026/09/11/ai-blog-pipeline/', true), '/en/2026/09/11/ai-blog-pipeline/');
});

test('toEnUrl: 英文站绝对 URL 转换域名路径', () => {
  assert.equal(
    toEnUrl('https://mrzhangkris.github.io/2026/09/11/ai-blog-pipeline/', true),
    'https://mrzhangkris.github.io/en/2026/09/11/ai-blog-pipeline/'
  );
});

test('toEnUrl: 中文站不转换', () => {
  assert.equal(toEnUrl('/2026/09/11/ai-blog-pipeline/', false), '/2026/09/11/ai-blog-pipeline/');
  assert.equal(toEnUrl('https://mrzhangkris.github.io/2026/09/11/x/', false), 'https://mrzhangkris.github.io/2026/09/11/x/');
});

test('toEnUrl: 空值透传', () => {
  assert.equal(toEnUrl('', true), '');
  assert.equal(toEnUrl(null, true), null);
  assert.equal(toEnUrl(undefined, true), undefined);
});

test('toEnUrl: 无 scheme 的外链不误伤', () => {
  assert.equal(toEnUrl('soup.jianshi.xyz/page', true), 'soup.jianshi.xyz/page');
});

test('buildUiText: 双语言字典字段完整性一致', () => {
  const zh = buildUiText('zh');
  const en = buildUiText('en');
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  for (const k of Object.keys(zh)) {
    assert.ok(zh[k].length > 0, `zh.${k} 不应为空`);
    assert.ok(en[k].length > 0, `en.${k} 不应为空`);
  }
});

test('buildUiText: 英文字典无中文字符', () => {
  const en = buildUiText('en');
  for (const [k, v] of Object.entries(en)) {
    assert.ok(!/[\u4e00-\u9fff]/.test(v), `en.${k} 不应含中文: ${v}`);
  }
});
