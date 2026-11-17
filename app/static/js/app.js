/* app.js —— 外壳、路由、快捷键 */
'use strict';

const ROUTES = {
  today: { label: '今日工作台', icon: 'home', fn: () => viewToday, group: '工作' },
  board: { label: '看板', icon: 'board', fn: () => viewBoard, group: '工作' },
  clients: { label: '客户库', icon: 'users', fn: () => viewClients, group: '工作' },
  weekly: { label: '周报', icon: 'calendar', fn: () => viewWeekly, group: '分析' },
  insight: { label: '数据洞察', icon: 'chart', fn: () => viewInsight, group: '分析' },
  goals: { label: '目标', icon: 'target', fn: () => viewGoals, group: '分析' },
  quality: { label: '数据质量', icon: 'shield', fn: () => viewQuality, group: '维护' },
  settings: { label: '设置', icon: 'settings', fn: () => viewSettings, group: '维护' },
};
const GROUPS = ['工作', '分析', '维护'];

function go(route) {
  if (!ROUTES[route]) route = 'today';
  if (location.hash === '#/' + route) render();
  else location.hash = '#/' + route;
}

function parseHash() {
  const h = (location.hash || '#/today').replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  S.query = new URLSearchParams(qs || '');
  const parts = path.split('/');
  S.route = ROUTES[parts[0]] ? parts[0] : 'today';
  return parts;
}

/* ── 外壳 ─────────────────────────────────────────── */
function buildShell() {
  const app = $('#app');
  app.innerHTML = `
    <aside class="sidebar" id="sidebar">
      <div class="sb-brand">
        <div class="sb-logo">
          <svg viewBox="0 0 24 24"><path d="M8 19V6h6a4.2 4.2 0 0 1 0 8.4H10"/></svg>
        </div>
        <div>
          <b>客户跟进</b>
          <span>背调业务 · 本机</span>
        </div>
      </div>
      <nav class="sb-nav" id="nav"></nav>
      <div class="sb-foot">
        <div class="sb-actions">
          <button class="sb-mini" data-cmd title="命令面板 (⌘K)">${icon('cmd', 'sm')}<span>命令</span></button>
          <button class="sb-mini" id="theme-btn" title="切换主题">${icon(S.theme === 'dark' ? 'sun' : 'moon', 'sm')}</button>
        </div>
        <div class="sb-me">
          <div class="avatar">${esc((S.settings.owner || '我').slice(0, 1))}</div>
          <div class="grow">
            <div class="who">${esc(S.settings.owner || '我')}</div>
            <div class="meta" id="sb-meta">背调 · 猎查查</div>
          </div>
        </div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <h1 id="tb-title">今日工作台</h1>
        <span class="sub" id="tb-sub"></span>
        <span class="spacer"></span>
        <button class="btn sm ghost" data-cmd style="gap:7px">
          ${icon('search', 'sm')}<span class="dim" style="font-size:12px">搜索</span><kbd>⌘K</kbd>
        </button>
        <button class="btn sm" id="tb-update" style="display:none;gap:5px"
          title="有新版本可用">${icon('download', 'sm')} 更新</button>
        <button class="btn sm ghost icon-only" id="tb-theme" title="切换主题">${icon(S.theme === 'dark' ? 'sun' : 'moon', 'sm')}</button>
        <button class="btn sm primary" id="tb-new">${icon('plus', 'sm')} 新建</button>
      </header>
      <div id="main-body"></div>
    </div>`;

  $('#nav').onclick = (e) => {
    const a = e.target.closest('[data-route]');
    if (a) { e.preventDefault(); go(a.dataset.route); }
  };
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-cmd]')) { e.preventDefault(); openCommand(); }
  });
  $('#tb-theme').onclick = () => { toggleTheme(); syncThemeBtns(); };
  $('#tb-new').onclick = () => openNewCompany();
  const ub = $('#tb-update');
  if (ub) ub.onclick = openUpdateDialog;
  updateNav();
  paintUpdateBadge();
}

function updateNav() {
  const nav = $('#nav');
  if (!nav) return;
  const t = S.today || {};
  nav.innerHTML = GROUPS.map((g) => `
    <div class="sb-group">
      <div class="sb-group-label">${g}</div>
      ${Object.entries(ROUTES).filter(([, r]) => r.group === g).map(([k, r]) => {
        const cnt = k === 'today' ? (t.due_count || 0)
          : k === 'quality' ? (S.qualityN || 0) : 0;
        return `<a class="nav-item ${S.route === k ? 'on' : ''}" href="#/${k}" data-route="${k}">
          ${icon(r.icon)}
          <span class="txt">${r.label}</span>
          ${cnt ? `<span class="count ${k === 'today' ? 'hot' : ''}">${cnt}</span>` : ''}
        </a>`;
      }).join('')}
    </div>`).join('');
}

function updateSidebarCounts() {
  updateNav();
  const t = S.today;
  const m = $('#sb-meta');
  if (m && t) m.textContent = `今日 ${t.planned_minutes} 分钟 · ${t.items.length} 家`;
}

function syncThemeBtns() {
  const a = $('#theme-btn'), b = $('#tb-theme');
  const ic = S.theme === 'dark' ? 'sun' : 'moon';
  if (a) a.innerHTML = icon(ic, 'sm');
  if (b) b.innerHTML = icon(ic, 'sm');
}

/* ── 在线更新 ─────────────────────────────────────── */
function paintUpdateBadge() {
  const b = $('#tb-update');
  if (!b) return;
  const u = S.update;
  b.style.display = (u && u.has_update) ? '' : 'none';
  if (u && u.has_update) b.title = `有新版本 ${u.latest}（当前 ${u.current}）`;
}

async function checkUpdate(quiet = true) {
  try {
    S.update = await api('/update/check');
  } catch (e) {
    S.update = { error: e.message, current: S.settings.version || '', has_update: false };
  }
  paintUpdateBadge();
  return S.update;
}

/* 极简 Markdown → HTML：只处理标题、粗体、行内代码、列表，
   够用来显示 Release 说明，不引入任何解析库 */
function mdish(s) {
  let h = esc(s);
  h = h.replace(/^#{1,6}\s*(.+)$/gm,
    '<div style="font-weight:620;color:var(--text);margin:13px 0 5px">$1</div>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<b style="color:var(--text)">$1</b>');
  h = h.replace(/`([^`]+)`/g,
    '<code style="background:var(--surface-3);padding:1px 4px;border-radius:4px;font-size:11.5px">$1</code>');
  h = h.replace(/^\s*[-*]\s+/gm, '· ');
  h = h.replace(/\n{2,}/g, '<br>').replace(/\n/g, '<br>');
  return h;
}

function openUpdateDialog() {
  const u = S.update || {};
  const has = !!u.has_update;
  const noteHtml = u.notes ? mdish(u.notes) : '<span class="dim">（没有写更新说明）</span>';

  openModal({
    title: has ? `发现新版本 ${esc(u.latest)}` : '检查更新',
    width: 520,
    sub: `当前版本 ${esc(u.current || S.settings.version || '—')}` +
         (u.published ? ` · 发布于 ${esc(u.published)}` : ''),
    body: `
      ${u.error ? `<div class="card pad" style="background:var(--a50);border-color:var(--a100);
        font-size:12.5px;margin-bottom:12px">${icon('alert', 'sm')} ${esc(u.error)}</div>` : ''}
      ${has ? `<div class="field"><label>这个版本更新了什么</label>
        <div class="card pad" style="max-height:200px;overflow:auto;font-size:12.5px;
          line-height:1.7;color:var(--text-2)">${noteHtml}</div></div>` : ''}
      <div class="field">
        <div style="font-size:12.5px;line-height:1.8;color:var(--text-2)">
          <b>更新只替换程序文件</b>（app/ 和 tools/），<br>
          你的客户数据 <span class="mono">data\\crm.db</span> 不会被动到。<br>
          更新前会自动把旧版本备份成 <span class="mono">app.bak</span>。
        </div>
      </div>
      <div id="upd-progress" style="display:none;font-size:12.5px;color:var(--text-2);
        padding:10px 0;line-height:1.7"></div>`,
    footer: `
      <a class="btn ghost sm" href="${esc(u.url || 'https://github.com')}" target="_blank"
         style="margin-right:auto">在 GitHub 上查看</a>
      <button class="btn" data-ucheck>重新检查</button>
      ${has ? '<button class="btn primary" data-uapply>立即更新</button>' : ''}`,
    onMount(root, close) {
      $('[data-ucheck]', root).onclick = async () => {
        const b = $('[data-ucheck]', root);
        b.disabled = true; b.textContent = '检查中…';
        const r = await checkUpdate(false);
        close();
        toast(r && r.has_update ? `有新版 ${r.latest}` :
          (r && r.error ? r.error : '已是最新版本'), r && r.has_update ? '' : 'ok');
        if (r && r.has_update) setTimeout(openUpdateDialog, 220);
      };
      const ap = $('[data-uapply]', root);
      if (ap) ap.onclick = async () => {
        ap.disabled = true;
        ap.textContent = '正在下载…';
        const p = $('#upd-progress', root);
        p.style.display = '';
        p.innerHTML = `正在从 GitHub 下载 ${esc(u.latest)} 的安装包，大约 11 MB…`;
        try {
          const r = await api('/update/apply', { method: 'POST', body: {} });
          if (!r.ok) throw new Error(r.error || '更新失败');
          p.innerHTML = `${icon('check', 'sm')} 已下载 ${r.files} 个文件，正在重启服务…
            <br><span class="dim">这个提示关掉后，几秒内页面会自动刷新。</span>`;
          ap.style.display = 'none';
          waitForRestart();
        } catch (e) {
          p.innerHTML = `<span style="color:var(--r600)">${esc(e.message)}</span>`;
          ap.disabled = false;
          ap.textContent = '重试';
        }
      };
    },
  });
}

function waitForRestart() {
  let tries = 0;
  const timer = setInterval(async () => {
    tries++;
    try {
      const s = await api('/settings');
      if (s && s.version) {
        clearInterval(timer);
        location.reload();
      }
    } catch (e) { /* 还没起来，继续等 */ }
    if (tries > 60) {
      clearInterval(timer);
      toast('服务没有自动起来，请手动双击 start.bat', 'bad');
    }
  }, 1500);
}

/* ── 渲染 ─────────────────────────────────────────── */
async function render() {
  const parts = parseHash();
  if (!$('#sidebar')) buildShell();
  updateNav();
  const r = ROUTES[S.route];
  const title = $('#tb-title'), sub = $('#tb-sub');
  if (title) title.textContent = r.label;
  if (sub) sub.textContent = '';
  const body = $('#main-body');
  body.innerHTML = '';
  body.setAttribute('data-route', S.route);
  try {
    await r.fn()(body);
  } catch (e) {
    console.error(e);
    body.innerHTML = `<div class="page"><div class="empty">
      <div class="ic">${icon('alert', 'lg')}</div>
      <h4>页面加载失败</h4><p>${esc(e.message)}</p>
      <button class="btn sm" style="margin-top:10px" onclick="render()">重试</button>
    </div></div>`;
  }
  syncThemeBtns();
  updateNav();
  window.scrollTo({ top: 0 });

  // 深链接：#/clients?id=12  或  #/today?id=12&log=1
  const qid = S.query.get('id');
  if (qid) {
    const cid = +qid;
    if (S.query.get('log') === '1') openLog(cid);
    else openCompany(cid);
  }
}

/* ── 快捷键 ───────────────────────────────────────── */
let gPending = 0;
function openShortcuts() {
  openModal({
    title: '键盘快捷键',
    width: 440,
    body: `<div style="font-size:13px;line-height:2.2">
      ${[
        ['⌘K / Ctrl+K', '命令面板 · 搜客户'],
        ['G 然后 T', '今日工作台'],
        ['G 然后 B', '看板'],
        ['G 然后 C', '客户库'],
        ['G 然后 I', '数据洞察'],
        ['G 然后 G', '目标'],
        ['G 然后 Q', '数据质量'],
        ['N', '新建客户'],
        ['/', '搜索'],
        ['⌘Enter', '记一笔弹窗内保存'],
        ['Esc', '关闭弹窗'],
      ].map(([k, v]) => `<div class="row"><kbd style="min-width:96px">${esc(k)}</kbd>
        <span class="grow dim">${v}</span></div>`).join('')}
    </div>`,
  });
}

document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault(); openCommand(); return;
  }
  if (typing) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (e.key === '?') { e.preventDefault(); openShortcuts(); return; }
  if (e.key === '/') { e.preventDefault(); openCommand(); return; }
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openNewCompany(); return; }
  if (e.key === 'g' || e.key === 'G') {
    gPending = Date.now();
    return;
  }
  if (Date.now() - gPending < 900) {
    const map = { t: 'today', b: 'board', c: 'clients', i: 'insight', g: 'goals', q: 'quality', s: 'settings' };
    const k = e.key.toLowerCase();
    if (map[k]) { e.preventDefault(); gPending = 0; go(map[k]); }
  }
});

/* ── 启动 ─────────────────────────────────────────── */
window.addEventListener('hashchange', () => {
  const root = $('#modal-root');
  if (root) root.innerHTML = '';
  render();
});

(async function boot() {
  initTheme();
  // 支持 ?theme=dark 深链接（也方便截图调试）
  const qt = new URLSearchParams((location.hash.split('?')[1] || ''));
  if (qt.get('theme') === 'dark' || qt.get('theme') === 'light') applyTheme(qt.get('theme'));
  try {
    const [meta, st] = await Promise.all([api('/meta'), api('/settings')]);
    S.meta = meta; S.settings = st;
    S.minutes = +(st.bd_minutes || 60);
    CACHE.meta = meta;
    if (st.intro_name) document.title = '客户跟进 · ' + st.intro_name;
  } catch (e) { console.error(e); }
  if (!location.hash) location.hash = '#/today';

  await render();
  if (qt.get('cmd') === '1') setTimeout(() => openCommand(), 260);
  // 侧边栏的逾期角标：后台补一次，不阻塞首屏
  api('/stats').then((s) => { S.qualityN = s.overdue; updateNav(); }).catch(() => {});
  // 开屏 4 秒后悄悄查一次新版本，不打扰
  if (qt.get('update') === '1') {
    await checkUpdate(false);
    setTimeout(openUpdateDialog, 150);
  } else {
    setTimeout(() => { checkUpdate(); }, 4000);
  }
})();
