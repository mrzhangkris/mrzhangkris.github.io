/* 站内 AI 问答悬浮窗 · 干将
 * 依赖：无；挂载点：body 末尾注入。接口：jianshi 后端 /jianshi/api/blog/ask
 * 双语：路径以 /en 开头自动切英文 UI（后端按提问语言回答）；来源链接智能转英文站路径
 *
 * 可测性设计：纯函数（pickLang / toEnUrl / buildUiText）通过 module.exports 暴露，
 * Node 单测见 scripts/blog-ask.test.mjs；浏览器中走 IIFE 挂载分支。
 */
(function () {
  // ---- 纯函数区（可在 Node 中单测） ----
  function pickLang(pathname) {
    return pathname.indexOf('/en/') === 0 || pathname === '/en' || pathname === '/en/' ? 'en' : 'zh';
  }

  function toEnUrl(url, isEN) {
    if (!isEN || !url) return url;
    if (url.indexOf('://') !== -1) {
      return url.replace('mrzhangkris.github.io/', 'mrzhangkris.github.io/en/');
    }
    return url.charAt(0) === '/' ? '/en' + url : url;
  }

  function buildUiText(lang) {
    return lang === 'en' ? {
      btnLabel: 'Ask Ganjiang',
      btnAria: 'On-site Q&A',
      headTitle: '🤖 Ganjiang · Blog Q&A',
      closeAria: 'Close',
      welcome: "Hi, I'm Ganjiang, the blog assistant. Ask me anything about the articles on this site — answers come with sources.",
      placeholder: 'Ask about this blog… (within 200 chars)',
      send: 'Send',
      loading: 'Searching the blog…',
      errService: 'Service temporarily unavailable, please try again later',
      errNetwork: 'Network error, please try again later',
      sourcesLabel: 'Sources: ',
      tip: 'Answers are AI-generated based on site articles — use your own judgment.',
    } : {
      btnLabel: '问干将',
      btnAria: '站内问答',
      headTitle: '🤖 干将 · 站内问答',
      closeAria: '关闭',
      welcome: '你好，我是博客助手「干将」。关于站内文章的问题都可以问我，回答会附上出处。',
      placeholder: '问点站内的事…（200 字内）',
      send: '发送',
      loading: '翻站内文章中…',
      errService: '服务暂时不可用，稍后再试',
      errNetwork: '网络异常，稍后再试',
      sourcesLabel: '来源：',
      tip: '回答由 AI 生成，依据站内文章内容，请注意甄别。',
    };
  }

  // ---- Node 测试与导出 ----
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pickLang, toEnUrl, buildUiText };
    return;
  }

  // ---- 浏览器挂载区 ----
  if (document.getElementById('blog-ask-root')) return;

  var ASK_URL = 'https://www.jianshi.xyz/jianshi/api/blog/ask';
  var isEN = pickLang(location.pathname) === 'en';
  var T = buildUiText(isEN ? 'en' : 'zh');

  var root = document.createElement('div');
  root.id = 'blog-ask-root';
  root.innerHTML =
    '<button id="blog-ask-btn" type="button" aria-label="' + T.btnAria + '">🤖<span>' + T.btnLabel + '</span></button>' +
    '<div id="blog-ask-panel" hidden>' +
    '  <div class="ba-head"><b>' + T.headTitle + '</b><button id="blog-ask-close" type="button" aria-label="' + T.closeAria + '">✕</button></div>' +
    '  <div class="ba-msgs" id="blog-ask-msgs">' +
    '    <div class="ba-msg ba-ai">' + T.welcome + '</div>' +
    '  </div>' +
    '  <form id="blog-ask-form">' +
    '    <input id="blog-ask-input" type="text" maxlength="200" placeholder="' + T.placeholder + '" autocomplete="off" />' +
    '    <button type="submit">' + T.send + '</button>' +
    '  </form>' +
    '  <div class="ba-tip">' + T.tip + '</div>' +
    '</div>';
  document.body.appendChild(root);

  var panel = document.getElementById('blog-ask-panel');
  var msgs = document.getElementById('blog-ask-msgs');
  var form = document.getElementById('blog-ask-form');
  var input = document.getElementById('blog-ask-input');
  var btn = document.getElementById('blog-ask-btn');

  function open() {
    panel.hidden = false;
    btn.classList.add('active');
    input.focus();
  }
  function close() {
    panel.hidden = true;
    btn.classList.remove('active');
  }
  btn.addEventListener('click', function () {
    panel.hidden ? open() : close();
  });
  document.getElementById('blog-ask-close').addEventListener('click', close);

  function addMsg(cls, html) {
    var d = document.createElement('div');
    d.className = 'ba-msg ' + cls;
    d.innerHTML = html;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  /* 把回答里的【n】编号替换为来源链接 */
  function linkify(answer, sources) {
    var html = esc(answer);
    (sources || []).forEach(function (s, i) {
      var tag = '【' + (i + 1) + '】';
      if (html.indexOf(tag) !== -1) {
        html = html.split(tag).join('<a href="' + toEnUrl(s.url, isEN) + '" target="_blank" rel="noopener">' + tag + '</a>');
      }
    });
    return html;
  }

  var busy = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q || busy) return;
    busy = true;
    input.value = '';
    addMsg('ba-user', esc(q));
    var loading = addMsg('ba-ai ba-loading', T.loading);

    fetch(ASK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q }),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, data: d };
        });
      })
      .then(function (res) {
        if (!res.ok) {
          loading.innerHTML = '⚠️ ' + esc(res.data.detail || T.errService);
          return;
        }
        var html = linkify(res.data.answer || '', res.data.sources);
        if (res.data.sources && res.data.sources.length) {
          html += '<div class="ba-sources">' + T.sourcesLabel;
          res.data.sources.forEach(function (s) {
            html += '<a href="' + toEnUrl(s.url, isEN) + '" target="_blank" rel="noopener">' + esc(s.title) + '</a>';
          });
          html += '</div>';
        }
        loading.innerHTML = html;
      })
      .catch(function () {
        loading.innerHTML = '⚠️ ' + T.errNetwork;
      })
      .finally(function () {
        busy = false;
        msgs.scrollTop = msgs.scrollHeight;
      });
  });
})();
