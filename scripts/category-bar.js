/**
 * 首页分类栏（2026-10-07）
 *
 * 背景：Butterfly 5.7.0 没有内置首页分类栏组件（无 category_bar 配置项、无对应
 * 模板），而 125 篇文章分散在 17 个真实分类里（4 个一级 + 技术下的 13 个二级），
 * 新访客在首页只能看到一列文章列表，看不出内容分块。
 *
 * 显示完整分类树，不是只列一级：每个一级分类一张卡，技术类下把 13 个二级分类
 * 全部列成可点标签。英文名不硬编码，直接从 site-en/source/_posts/ 的 front
 * matter 建中→英映射（与 scripts/hreflang-zh.js 读 site-en 的做法一致），
 * 以后补翻译会自动同步。
 *
 * 五个实测踩过的坑，改动时务必保留（写在对应代码处）：
 * 1. after_render 阶段 hexo.locals.get('site') 为 undefined，用它抛
 *    ReferenceError，首页渲染成 0 字节 → 改走 hexo.model()。
 * 2. Category._id 是 ObjectId 不是文章集合，cat._id.length 会让所有分类
 *    都得到同一个数 → 篇数按文章实际关联统计。
 * 3. p.categories 元素是 Document，String(c) 触发 toJSON 循环引用 → 先取 _id。
 * 4. 分类 URL 必须用模型自带 path（slugize 把空格转连字符），手写
 *    encodeURIComponent 得到 %20 会 404 → 用 path 再逐段编码。
 * 5. 二级分类的 path 自带父级前缀（categories/技术/Linux/），别自己拼。
 */
const nodeFs = require('fs');
const path = require('path');
const escapeHTML = require('hexo-util').escapeHTML;

const ZH_POSTS = path.join(__dirname, '..', 'source', '_posts');
const EN_POSTS = path.join(__dirname, '..', 'site-en', 'source', '_posts');

function readCategories(file) {
  const text = nodeFs.readFileSync(file, 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const m = fm[1].match(/^categories:\s*\[([^\]]*)\]/m);
  if (!m) return null;
  return m[1].split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}

// 建「中文分类名 → 英文分类名」映射：两站文章文件名同构，按同名文件配对，
// 再按 categories 数组的位置一一对应。
// （只读英文站会拿到英文→英文的恒等映射，中文名一个都命中不了——踩过。）
function buildEnMap() {
  const map = {};
  let files;
  try {
    // 用 node 的 readdirSync：hexo-fs 没有 listSync，调用会抛 TypeError
    files = nodeFs.readdirSync(ZH_POSTS).filter(function (f) { return f.slice(-3) === '.md'; });
  } catch (e) {
    return map;
  }
  files.forEach(function (f) {
    let zh, en;
    try {
      zh = readCategories(path.join(ZH_POSTS, f));
      en = readCategories(path.join(EN_POSTS, f));
    } catch (e) {
      return; // 英文站没有同名文章（翻译缺口），跳过
    }
    if (!zh || !en || zh.length !== en.length) return;
    zh.forEach(function (z, i) {
      if (z && en[i] && !map[z]) map[z] = en[i];
    });
  });
  return map;
}

// 分类链接：用模型自带的 path（slugize 已把空格转连字符），再逐段百分号编码
function catHref(catPath) {
  return '/' + String(catPath).replace(/^\//, '')
    .split('/').filter(Boolean)
    .map(encodeURIComponent).join('/') + '/';
}

hexo.extend.filter.register('after_render:html', function (str, data) {
  if (!data || data.path !== 'index.html') return str;
  if (!str.includes('</head>')) return str;

  const cats = hexo.model('Category').toArray();
  const enMap = buildEnMap();

  // 预先算出每篇文章的分类 id 列表，避免在 filter 里反复解 Document
  // （见坑 2、3：_id 是 ObjectId，String(Document) 会触发 toJSON 循环引用）
  const postCatIds = hexo.model('Post').toArray().map(function (p) {
    return (p.categories || []).map(function (c) {
      return String((c && c._id !== undefined) ? c._id : c);
    });
  });
  function countOf(cat) {
    const id = String(cat._id);
    let n = 0;
    for (let i = 0; i < postCatIds.length; i++) {
      if (postCatIds[i].indexOf(id) >= 0) n++;
    }
    return n;
  }

  const tops = cats.filter(function (c) { return !c.parent; });

  // 二级分类按父级归组
  const byParent = {};
  cats.forEach(function (c) {
    if (!c.parent) return;
    const k = String(c.parent);
    (byParent[k] = byParent[k] || []).push(c);
  });

  function renderGroup(top) {
    const kids = (byParent[String(top._id)] || [])
      .map(function (c) { return { name: c.name, count: countOf(c), href: catHref(c.path) }; })
      .filter(function (k) { return k.count > 0; })
      .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });

    const kidsHtml = kids.length
      ? '<div class="cat-bar-subs">' + kids.map(function (k) {
          return '<a class="cat-bar-sub" href="' + k.href + '" title="' +
            escapeHTML(k.name) + '">' + escapeHTML(k.name) +
            '<span class="cat-bar-sub-n">' + k.count + '</span></a>';
        }).join('') + '</div>'
      : '';

    const en = enMap[top.name]
      ? '<span class="cat-bar-en">' + escapeHTML(enMap[top.name]) + '</span>'
      : '';

    return '<div class="cat-bar-group">' +
      '<a class="cat-bar-top" href="' + catHref(top.path) + '">' +
        '<span class="cat-bar-name">' + escapeHTML(top.name) + '</span>' + en +
        '<span class="cat-bar-count">' + countOf(top) + ' 篇</span>' +
      '</a>' + kidsHtml +
      '</div>';
  }

  const groups = tops
    .map(function (t) { return { top: t, total: countOf(t) }; })
    .sort(function (a, b) { return b.total - a.total || a.top.name.localeCompare(b.top.name); })
    .map(function (x) { return renderGroup(x.top); })
    .join('');

  const bar = '<section id="cat-bar" aria-label="Categories">' +
    '<div class="cat-bar-inner">' +
    '<h2 class="cat-bar-title">按分类浏览</h2>' +
    '<div class="cat-bar-groups">' + groups + '</div>' +
    '</div></section>';

  const anchor = '<main class="layout" id="content-inner">';
  if (!str.includes(anchor)) return str;
  return str.replace(anchor, anchor + bar);
});