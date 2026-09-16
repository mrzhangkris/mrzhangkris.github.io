/**
 * hreflang 注入（英文站）
 * 英文站是主站的子集，每篇英文页的中文对应页必定存在，
 * 所以在英文站侧声明双向 hreflang 是安全的；中文站侧等翻译覆盖完整后再声明。
 * 新语言：在对应 site-xx/scripts/ 复制本脚本，把 hreflang 列表扩一项。
 */
hexo.extend.filter.register('after_render:html', function (str, data) {
  if (!data || !data.path) return str;
  if (data.path.endsWith('.xml') || data.path.endsWith('.json') || !str.includes('</head>')) return str;
  const clean = p => '/' + String(p).replace(/index\.html$/, '');
  const base = 'https://mrzhangkris.github.io';
  const enPath = base + '/en' + clean(data.path);
  const zhPath = base + clean(data.path);
  const links =
    '\n<link rel="alternate" hreflang="zh" href="' + zhPath + '">' +
    '\n<link rel="alternate" hreflang="en" href="' + enPath + '">' +
    '\n<link rel="alternate" hreflang="x-default" href="' + zhPath + '">\n';
  return str.replace('</head>', links + '</head>');
});
