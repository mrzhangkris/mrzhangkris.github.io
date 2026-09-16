/**
 * hreflang 条件注入（中文主站）
 * 构建时查 site-en/source/_posts/ 是否存在同名英文版：
 *   - 文章页：有同名英文版才注入 zh/en/x-default 三条
 *   - 首页/归档等公共页：始终注入（英文站必有对应站点级页面）
 * 效果：翻译流水线每落地一批，主站对应文章自动获得双向 hreflang，零维护。
 * 新语言：复制本脚本改 en 段（site-xx 路径与 hreflang 值）。
 */
const fs = require('hexo-fs');
const path = require('path');

const EN_POSTS = path.join(__dirname, '..', 'site-en', 'source', '_posts');

hexo.extend.filter.register('after_render:html', function (str, data) {
  if (!data || !data.path) return str;
  if (data.path.endsWith('.xml') || data.path.endsWith('.json') || !str.includes('</head>')) return str;
  const clean = p => '/' + String(p).replace(/index\.html$/, '');
  const base = 'https://mrzhangkris.github.io';
  const p = clean(data.path);
  // 文章页（形如 2026/09/15/xxx/index.html）需要有英文版才注入
  const isPost = /\/20\d\d\/\//.test(p + 'x') || /^\/20\d\d\//.test(p);
  if (isPost) {
    const name = p.split('/').filter(Boolean).pop();
    if (!name || !fs.existsSync(path.join(EN_POSTS, name + '.md'))) return str;
  }
  const links =
    '\n<link rel="alternate" hreflang="zh" href="' + base + p + '">' +
    '\n<link rel="alternate" hreflang="en" href="' + base + '/en' + p + '">' +
    '\n<link rel="alternate" hreflang="x-default" href="' + base + p + '">\n';
  return str.replace('</head>', links + '</head>');
});
