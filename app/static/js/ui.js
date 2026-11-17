/* ui.js —— 通用组件：弹窗、抽屉、菜单、命令面板、骨架 */
'use strict';

const ModalRoot = () => $('#modal-root');

/* ── 弹窗 ─────────────────────────────────────────── */
function openModal({ title, sub, body, footer, width = 540, onMount, closable = true }) {
  const root = ModalRoot();
  root.innerHTML = `<div class="mask" data-mask>
    <div class="modal" style="width:min(${width}px,100%)" role="dialog" aria-modal="true">
      <div class="modal-h">
        <div class="grow">
          <h3>${title}</h3>
          ${sub ? `<div class="sub">${sub}</div>` : ''}
        </div>
        ${closable ? `<button class="btn ghost sm icon-only" data-close aria-label="关闭">${icon('x')}</button>` : ''}
      </div>
      <div class="modal-b">${body || ''}</div>
      ${footer ? `<div class="modal-f">${footer}</div>` : ''}
    </div>
  </div>`;
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && closable) { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey);
  if (closable) $('[data-mask]', root).onclick = (e) => { if (e.target === e.currentTarget) close(); };
  const cb = $('[data-close]', root); if (cb) cb.onclick = close;
  if (onMount) onMount(root, close);
  const first = $('input,textarea,select', root);
  if (first) setTimeout(() => first.focus(), 60);
  return close;
}

function confirmDlg({ title, message, okText = '确定', danger = false }) {
  return new Promise((res) => {
    const close = openModal({
      title: esc(title), width: 420,
      body: `<div style="font-size:13px;line-height:1.65;color:var(--text-2);padding-bottom:6px">${message}</div>`,
      footer: `<button class="btn" data-no>取消</button>
               <button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${okText}</button>`,
      onMount(root, cl) {
        $('[data-no]', root).onclick = () => { cl(); res(false); };
        $('[data-yes]', root).onclick = () => { cl(); res(true); };
      },
    });
  });
}

function promptDlg({ title, label, value = '', placeholder = '', okText = '保存' }) {
  return new Promise((res) => {
    openModal({
      title: esc(title), width: 440,
      body: `<div class="field"><label>${label}</label>
             <input class="input" style="width:100%" value="${esc(value)}" placeholder="${esc(placeholder)}"></div>`,
      footer: `<button class="btn" data-no>取消</button>
               <button class="btn primary" data-yes>${okText}</button>`,
      onMount(root, cl) {
        const inp = $('input', root);
        $('[data-no]', root).onclick = () => { cl(); res(null); };
        $('[data-yes]', root).onclick = () => { cl(); res(inp.value); };
        inp.onkeydown = (e) => { if (e.key === 'Enter') { cl(); res(inp.value); } };
      },
    });
  });
}

/* ── 抽屉 ─────────────────────────────────────────── */
function openDrawer({ body, onMount }) {
  const root = ModalRoot();
  root.innerHTML = `<div class="drawer-mask" data-dmask></div>
    <aside class="drawer" role="dialog">${body}</aside>`;
  const close = () => { root.innerHTML = ''; S.openId = null; onCloseCb && onCloseCb(); };
  const onCloseCb = openDrawer._onClose;
  $('[data-dmask]', root).onclick = close;
  const cb = $('[data-dclose]', root); if (cb) cb.onclick = close;
  if (onMount) onMount(root, close);
  return close;
}

/* ── 下拉菜单 ─────────────────────────────────────── */
let _menuEl = null;
function closeAllMenus() {
  if (_menuEl) { _menuEl.remove(); _menuEl = null; }
}
function openMenu(anchor, items) {
  closeAllMenus();
  const r = anchor.getBoundingClientRect();
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;z-index:150;min-width:180px;background:var(--surface);
    border:1px solid var(--border-2);border-radius:var(--r);box-shadow:var(--sh-lg);padding:4px;
    font-size:13px;animation:pop 130ms var(--ease)`;
  el.innerHTML = items.map((it, i) => it === '-' ? `<div class="hr" style="margin:4px 0"></div>`
    : `<button data-i="${i}" style="display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;
        border-radius:var(--r-xs);text-align:left;color:${it.danger ? 'var(--r600)' : 'var(--text)'};font-size:13px"
        onmouseover="this.style.background='var(--surface-3)'"
        onmouseout="this.style.background='transparent'">
        ${it.icon ? icon(it.icon, 'sm') : ''}<span class="grow">${it.label}</span>
        ${it.kbd ? `<kbd>${it.kbd}</kbd>` : ''}</button>`).join('');
  document.body.appendChild(el);
  const w = el.offsetWidth, h = el.offsetHeight;
  let left = Math.min(r.left, window.innerWidth - w - 8);
  let top = r.bottom + 4;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.onclick = (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const it = items[+b.dataset.i];
    closeAllMenus();
    it && it.onClick && it.onClick();
  };
  _menuEl = el;
  setTimeout(() => {
    const off = (ev) => {
      if (!el.contains(ev.target)) { closeAllMenus(); document.removeEventListener('mousedown', off); }
    };
    document.addEventListener('mousedown', off);
  }, 0);
  return el;
}

/* ── 骨架屏 ───────────────────────────────────────── */
function skeletonList(n = 4) {
  return `<div class="queue">${Array.from({ length: n }).map(() => `
    <div class="card" style="padding:14px 16px">
      <div class="skel skel-line" style="width:38%;height:13px"></div>
      <div class="skel skel-line" style="width:62%;margin-top:10px"></div>
      <div class="skel skel-line" style="width:46%"></div>
    </div>`).join('')}</div>`;
}

/* ── 命令面板 ─────────────────────────────────────── */
function openCommand() {
  if ($('.cmdk-mask')) return;
  const root = document.createElement('div');
  root.className = 'cmdk-mask';
  root.innerHTML = `<div class="cmdk" role="dialog">
    <div class="cmdk-in">
      ${icon('search', 'lg')}
      <input id="cmdk-q" placeholder="搜客户、联系人、手机号，或输入命令…" autocomplete="off" spellcheck="false">
      <kbd>ESC</kbd>
    </div>
    <div class="cmdk-list" id="cmdk-list"></div>
    <div class="cmdk-foot">
      <span><kbd>上下</kbd> 选择</span>
      <span><kbd>回车</kbd> 打开</span>
      <span><kbd>Esc</kbd> 关闭</span>
    </div>
  </div>`;
  document.body.appendChild(root);

  const CMDS = [
    { t: '去今日工作台', d: '导航', ic: 'home', run: () => go('today') },
    { t: '去看板', d: '导航', ic: 'board', run: () => go('board') },
    { t: '去客户库', d: '导航', ic: 'users', run: () => go('clients') },
    { t: '去数据洞察', d: '导航', ic: 'chart', run: () => go('insight') },
    { t: '去目标', d: '导航', ic: 'target', run: () => go('goals') },
    { t: '去数据质量', d: '导航', ic: 'shield', run: () => go('quality') },
    { t: '新建客户', d: '操作', ic: 'plus', run: () => openNewCompany() },
    { t: '导出 CSV', d: '操作', ic: 'download', run: () => { location.href = '/api/export?fmt=csv'; } },
    { t: '切换深色 / 浅色', d: '操作', ic: 'moon', run: () => toggleTheme() },
    { t: '刷新当前页', d: '操作', ic: 'refresh', run: () => render() },
  ];

  const listEl = $('#cmdk-list', root);
  const input = $('#cmdk-q', root);
  let items = [], cur = 0, timer = null;

  const draw = (rows) => {
    items = rows;
    if (!rows.length) {
      listEl.innerHTML = `<div class="cmdk-empty">没有匹配的结果</div>`;
      return;
    }
    let html = '', sect = '';
    rows.forEach((it, i) => {
      if (it.sect !== sect) { sect = it.sect; html += `<div class="cmdk-sec">${esc(sect)}</div>`; }
      html += `<div class="cmdk-item ${i === cur ? 'on' : ''}" data-i="${i}">
        ${icon(it.ic || 'arrow-right')}
        <span class="t">${it.html || esc(it.t)}</span>
        ${it.d ? `<span class="d">${esc(it.d)}</span>` : ''}
      </div>`;
    });
    listEl.innerHTML = html;
    const on = listEl.querySelector('.cmdk-item.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  };

  const runQuery = async (q) => {
    q = q.trim();
    if (!q) { draw(CMDS.map((c) => ({ ...c, sect: '命令', html: c.t }))); return; }
    const hits = await searchAll(q);
    const cmds = CMDS.filter((c) => c.t.includes(q)).map((c) => ({ ...c, sect: '命令', html: c.t }));
    const comps = hits.companies.map((r) => ({
      t: r.name, d: srcLabel(r.source), ic: 'users', sect: '客户',
      html: hl(r.name, q), run: () => openCompany(r.id),
    }));
    const cts = hits.contacts.map((r) => ({
      t: r.name, d: r.company_name, ic: 'phone', sect: '联系人',
      html: `${hl(r.name, q)} <span class="dim" style="font-size:11px">${esc(r.phone || r.wechat || '')}</span>`,
      run: () => openCompany(r.company_id),
    }));
    cur = 0;
    draw([...cmds, ...comps, ...cts].slice(0, 40));
  };

  const hl = (s, q) => {
    const i = String(s).toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(s);
    return esc(s.slice(0, i)) + `<b style="color:var(--brand)">${esc(s.slice(i, i + q.length))}</b>` + esc(s.slice(i + q.length));
  };

  const closeCmd = () => { root.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeCmd(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); cur = Math.min(cur + 1, items.length - 1); draw(items); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cur = Math.max(cur - 1, 0); draw(items); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const it = items[cur];
      if (it && it.run) { closeCmd(); it.run(); }
    }
  };
  document.addEventListener('keydown', onKey);
  root.onclick = (e) => { if (e.target === root) closeCmd(); };
  listEl.onclick = (e) => {
    const d = e.target.closest('[data-i]');
    if (!d) return;
    const it = items[+d.dataset.i];
    if (it && it.run) { closeCmd(); it.run(); }
  };
  input.oninput = () => { clearTimeout(timer); timer = setTimeout(() => runQuery(input.value), 140); };
  setTimeout(() => input.focus(), 30);
  runQuery('');
}

/* ── 快捷日期选择 ─────────────────────────────────── */
function dateChips(id, value) {
  const opts = [['今天', 0], ['明天', 1], ['3天', 3], ['1周', 7], ['2周', 14], ['1月', 30]];
  return `<div class="row tight" style="margin-bottom:6px;flex-wrap:wrap">
    ${opts.map(([l, n]) => `<button type="button" class="btn sm" data-gap="${n}">${l}</button>`).join('')}
  </div>
  <input type="date" class="input" id="${id}" value="${esc(value || '')}" style="width:100%">`;
}

function bindDateChips(scope, id) {
  const inp = $('#' + id, scope);
  $$('[data-gap]', scope).forEach((b) => {
    b.onclick = () => {
      if (inp) inp.value = b.dataset.gap === '-1' ? '' : addDays(todayISO(), +b.dataset.gap);
    };
  });
}
