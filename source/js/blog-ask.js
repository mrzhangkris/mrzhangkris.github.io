/* 站内 AI 问答悬浮窗 · 干将
 * 依赖：无；挂载点：body 末尾注入。接口：jianshi 后端 /jianshi/api/blog/ask
 */
(function () {
  if (document.getElementById('blog-ask-root')) return;

  var ASK_URL = 'https://www.jianshi.xyz/jianshi/api/blog/ask';

  var root = document.createElement('div');
  root.id = 'blog-ask-root';
  root.innerHTML =
    '<button id="blog-ask-btn" type="button" aria-label="站内问答">🤖<span>问干将</span></button>' +
    '<div id="blog-ask-panel" hidden>' +
    '  <div class="ba-head"><b>🤖 干将 · 站内问答</b><button id="blog-ask-close" type="button" aria-label="关闭">✕</button></div>' +
    '  <div class="ba-msgs" id="blog-ask-msgs">' +
    '    <div class="ba-msg ba-ai">你好，我是博客助手「干将」。关于站内文章的问题都可以问我，回答会附上出处。</div>' +
    '  </div>' +
    '  <form id="blog-ask-form">' +
    '    <input id="blog-ask-input" type="text" maxlength="200" placeholder="问点站内的事…（200 字内）" autocomplete="off" />' +
    '    <button type="submit">发送</button>' +
    '  </form>' +
    '  <div class="ba-tip">回答由 AI 生成，依据站内文章内容，请注意甄别。</div>' +
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
        html = html.split(tag).join('<a href="' + s.url + '" target="_blank" rel="noopener">' + tag + '</a>');
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
    var loading = addMsg('ba-ai ba-loading', '翻站内文章中…');

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
          loading.innerHTML = '⚠️ ' + esc(res.data.detail || '服务暂时不可用，稍后再试');
          return;
        }
        var html = linkify(res.data.answer || '', res.data.sources);
        if (res.data.sources && res.data.sources.length) {
          html += '<div class="ba-sources">来源：';
          res.data.sources.forEach(function (s) {
            html += '<a href="' + s.url + '" target="_blank" rel="noopener">' + esc(s.title) + '</a>';
          });
          html += '</div>';
        }
        loading.innerHTML = html;
      })
      .catch(function () {
        loading.innerHTML = '⚠️ 网络异常，稍后再试';
      })
      .finally(function () {
        busy = false;
        msgs.scrollTop = msgs.scrollHeight;
      });
  });
})();
