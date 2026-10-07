/**
 * 首页分类栏（2026-10-07）
 *
 * 背景：Butterfly 5.7.0 没有内置首页分类栏组件（无 category_bar 配置项、无对应
 * 模板），而本站 125 篇文章分散在 4 个一级分类与 13 个二级分类里，新访客在首页
 * 只能看到一列文章列表，看不出内容分块。本脚本在构建期为首页注入一排一级分类卡片。
 *
 * 只取一级分类（parent 为空），二级分类仍在 /categories/ 与标签页里。
 * 注入位置：首页文章列表之前（<main class="layout" id="content-inner"> 之后）。
 *
 * 两个实测踩过的坑，改动时务必保留：
 * 1. after_render 阶段 hexo.locals.get('site') 返回 undefined，必须走
 *    hexo.model('Category')；写 siteLocals 会抛 ReferenceError，
 *    首页渲染成 0 字节（日志里是 ERROR Render HTML failed: index.html）。
 * 2. 篇数取 cat._id.length（Category 模型里文章集合挂在 _id 上），不是 cat.length。
 *
 * 新语言：复制到对应 site-xx/scripts/，改 CAT_LABELS 与 HREF_PREFIX。
 */
const escapeHTML = require('hexo-util').escapeHTML;

// 一级分类的英文副标签（本站有独立英文版，副标签用英文更好读）
const CAT_LABELS = {
  '技术': 'Operations & Infrastructure',
  'AI 工程': 'AI Engineering',
  '独立开发': 'Indie Development',
  '随笔': 'Essays'
};

// 语言子站的站点挂在子路径下，分类链接要带前缀
const HREF_PREFIX = '';

hexo.extend.filter.register('after_render:html', function (str, data) {
  if (!data || data.path !== 'index.html') return str;
  if (!str.includes('</head>')) return str;

  const cats = hexo.model('Category').toArray();
  // Category 模型的 _id 是 ObjectId，不是文章集合，篇数要按文章实际关联统计。
  // （误用 cat._id.length 会让所有分类都得到同一个数，实测踩过。）
  const posts = hexo.model('Post').toArray();
  const topCats = cats
    .filter(function (cat) { return !cat.parent; })
    .map(function (cat) {
      const id = String(cat._id);
      const count = posts.filter(function (p) {
        // c 可能是 Document，直接 String(c) 会触发 toJSON 造成循环引用报错，
        // 必须取 _id 再比（实测踩过）
        return (p.categories || []).some(function (c) {
          const cid = (c && c._id !== undefined) ? String(c._id) : String(c);
          return cid === id;
        });
      }).length;
      return { name: cat.name, count: count, path: cat.path };
    });

  if (!topCats.length) return str;
  topCats.sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });

  const cards = topCats.map(function (c) {
    const label = CAT_LABELS[c.name] || c.name;
    // 用 Category 模型自带的 path 虚拟属性（Hexo 内部用 slugize 生成，
    // 空格转连字符）。手写 encodeURIComponent 会得到 %20 而不是 -，
    // 与 /categories/ 实际路径不符，点进去直接 404。
    // 逐段 encodeURIComponent：保留 Hexo slugize 生成的连字符（空格→-），
    // 同时把中文按全站一致的百分号编码输出
    const href = HREF_PREFIX + '/' + String(c.path).replace(/^\//, '')
      .split('/').filter(Boolean)
      .map(encodeURIComponent).join('/') + '/';
    return '<a class="cat-bar-item" href="' + href + '">' +
      '<span class="cat-bar-name">' + escapeHTML(c.name) + '</span>' +
      '<span class="cat-bar-en">' + escapeHTML(label) + '</span>' +
      '<span class="cat-bar-count">' + c.count + ' 篇</span>' +
      '</a>';
  }).join('');

  const bar = '<section id="cat-bar" aria-label="Categories">' +
    '<div class="cat-bar-inner">' +
    '<h2 class="cat-bar-title">按分类浏览</h2>' +
    '<div class="cat-bar-grid">' + cards + '</div>' +
    '</div></section>';

  const anchor = '<main class="layout" id="content-inner">';
  if (!str.includes(anchor)) return str;
  return str.replace(anchor, anchor + bar);
});