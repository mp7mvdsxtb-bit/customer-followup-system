/* view.clients.js —— 客户库 + 详情抽屉 */
'use strict';

const DEF_FILTER = { q: '', source: '', stage: '', industry: '', size: '', third: '', nf: '', flag: '', sort: 'next' };
const FLAG_LABEL = {
  no_phone: '缺手机号', no_industry: '缺行业', no_size: '缺规模',
  overdue: '逾期未跟', never: '从未跟进',
};

async function viewClients(main) {
  const f = S.filters || (S.filters = { ...DEF_FILTER });
  if (!S.meta) S.meta = await api('/meta');
  main.innerHTML = `<div class="page">${skeletonList(3)}</div>`;
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const d = await api('/companies?' + qs + '&limit=1000');
  S.clients = d;
  const rows = d.rows;
  const sel = S.sel;
  const noFilter = Object.entries(f).every(([k, v]) => !v || (k === 'sort' && v === 'next'));
  const isBlank = d.total === 0 && noFilter;

  main.innerHTML = `<div class="page">
    <div class="row wrap" style="margin-bottom:12px">
      <div class="search" style="flex:1;min-width:220px;max-width:340px">
        ${icon('search', 'sm')}
        <input class="input" id="f-q" placeholder="搜公司 / 行业 / 联系人 / 手机号" value="${esc(f.q)}">
      </div>
      <select class="select" id="f-source">
        <option value="">全部来源</option>
        ${SOURCES.map((s) => `<option value="${s.k}" ${f.source === s.k ? 'selected' : ''}>${s.label}</option>`).join('')}
      </select>
      <select class="select" id="f-stage">
        <option value="">全部阶段</option>
        ${STAGES.map((s) => `<option value="${s.k}" ${f.stage === s.k ? 'selected' : ''}>${s.label}</option>`).join('')}
      </select>
      <select class="select" id="f-third">
        <option value="">三方不限</option>
        <option value="yes" ${f.third === 'yes' ? 'selected' : ''}>有三方</option>
        <option value="no" ${f.third === 'no' ? 'selected' : ''}>无三方</option>
        <option value="unknown" ${f.third === 'unknown' ? 'selected' : ''}>三方未知</option>
      </select>
      <select class="select" id="f-size">
        <option value="">规模不限</option>
        ${['10000+', '1000-9999', '100-999', '100以下'].map((s) => `<option value="${s}" ${f.size === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <select class="select" id="f-sort">
        <option value="next" ${f.sort === 'next' ? 'selected' : ''}>按下次跟进</option>
        <option value="last" ${f.sort === 'last' ? 'selected' : ''}>按最近跟进</option>
        <option value="size" ${f.sort === 'size' ? 'selected' : ''}>按人数</option>
        <option value="name" ${f.sort === 'name' ? 'selected' : ''}>按名称</option>
        <option value="stage" ${f.sort === 'stage' ? 'selected' : ''}>按阶段</option>
      </select>
      <label class="switch"><input type="checkbox" id="f-nf" ${f.nf === '1' ? 'checked' : ''}> 只看已停跟</label>
      ${f.flag ? `<button class="btn sm soft" id="f-flag">
        ${icon('filter', 'sm')} ${FLAG_LABEL[f.flag] || f.flag} ${icon('x', 'sm')}</button>` : ''}
      <span class="grow"></span>
      <span class="dim" style="font-size:12px">${d.total} 家</span>
      <a class="btn sm" href="/api/export?fmt=csv">${icon('download', 'sm')} 导出</a>
      <button class="btn sm primary" id="btn-new">${icon('plus', 'sm')} 新建</button>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr>
          <th style="width:34px"><input type="checkbox" class="check" id="ck-all"
            ${sel.size && sel.size === rows.length ? 'checked' : ''}></th>
          <th class="sortable" data-sort="name">公司</th>
          <th>来源</th>
          <th class="sortable" data-sort="size">规模</th>
          <th>地区</th>
          <th>三方</th>
          <th>阶段</th>
          <th class="sortable" data-sort="next">下次跟进</th>
          <th>联系人</th>
        </tr></thead>
        <tbody>
          ${rows.map((r) => clientRow(r, sel.has(r.id))).join('') ||
            `<tr><td colspan="9" style="height:auto"><div class="empty" style="border:0;background:none">
              <div class="ic">${icon(isBlank ? 'inbox' : 'search', 'lg')}</div>
              <h4>${isBlank ? '还没有客户' : '没有符合条件的客户'}</h4>
              <p>${isBlank
                ? '点右上角「新建」加第一家；在客户详情里可以直接粘贴「姓名 手机号 职位」，会自动拆开。'
                : '换个关键词，或清空筛选试试。'}</p>
              ${isBlank ? `<button class="btn primary sm" style="margin-top:12px" onclick="openNewCompany()">+ 新建客户</button>` : ''}
            </div></td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;

  /* 筛选绑定 */
  const re = () => viewClients(main);
  $('#f-q').oninput = debounce((e) => { S.filters.q = e.target.value; re(); $('#f-q') && $('#f-q').focus(); }, 300);
  ['source', 'stage', 'third', 'size', 'sort'].forEach((k) => {
    const el = $('#f-' + k); if (!el) return;
    el.onchange = () => { S.filters[k] = el.value; re(); };
  });
  $('#f-nf').onchange = (e) => { S.filters.nf = e.target.checked ? '1' : ''; re(); };
  const fgetFlag = $('#f-flag');
  if (fgetFlag) fgetFlag.onclick = () => { S.filters.flag = ''; re(); };
  $('#btn-new').onclick = openNewCompany;

  /* 排序 */
  $$('th.sortable').forEach((th) => {
    th.onclick = () => { S.filters.sort = th.dataset.sort; re(); };
  });

  /* 选择 */
  const bulk = $('#bulkbar') || (() => {
    const b = document.createElement('div');
    b.className = 'bulkbar'; b.id = 'bulkbar';
    document.body.appendChild(b); return b;
  })();

  const syncBulk = () => {
    const n = sel.size;
    bulk.classList.toggle('on', n > 0);
    bulk.innerHTML = `<span class="n">已选 ${n} 家</span>
      <span class="sep"></span>
      <button class="btn sm ghost" data-b="stage">${icon('board', 'sm')} 改阶段</button>
      <button class="btn sm ghost" data-b="next">${icon('calendar', 'sm')} 排下次</button>
      <button class="btn sm ghost" data-b="nf">${icon('x', 'sm')} 停跟</button>
      <button class="btn sm ghost" data-b="del" style="color:var(--r600)">${icon('trash', 'sm')} 删除</button>
      <span class="sep"></span>
      <button class="btn sm ghost" data-b="clear">取消</button>`;
  };
  syncBulk();

  bulk.onclick = async (e) => {
    const b = e.target.closest('[data-b]');
    if (!b) return;
    const ids = [...sel];
    const act = b.dataset.b;
    if (act === 'clear') { sel.clear(); re(); return; }
    if (act === 'stage') {
      openMenu(b, STAGES.map((s) => ({
        label: s.label,
        onClick: async () => {
          await api('/bulk', { method: 'POST', body: { ids, action: 'stage', value: s.k } });
          toast(`已把 ${ids.length} 家改为「${s.label}」`, 'ok');
          sel.clear(); re();
        },
      })));
    } else if (act === 'next') {
      const v = await promptDlg({ title: '批量排下次跟进', label: '日期（YYYY-MM-DD）', value: addDays(todayISO(), 3) });
      if (v === null) return;
      await api('/bulk', { method: 'POST', body: { ids, action: 'next_at', value: v.trim() } });
      toast('已更新', 'ok'); sel.clear(); re();
    } else if (act === 'nf') {
      const ok = await confirmDlg({ title: '批量停跟', message: `把这 ${ids.length} 家移出跟进队列？`, okText: '停跟', danger: true });
      if (!ok) return;
      await api('/bulk', { method: 'POST', body: { ids, action: 'no_follow', value: 1 } });
      toast('已停跟', 'ok'); sel.clear(); re();
    } else if (act === 'del') {
      const ok = await confirmDlg({ title: '批量删除', message: `删除这 ${ids.length} 家及其全部联系人和记录？不可撤销。`, okText: '删除', danger: true });
      if (!ok) return;
      await api('/bulk', { method: 'POST', body: { ids, action: 'delete' } });
      toast('已删除', 'ok'); sel.clear(); re();
    }
  };

  $('#ck-all').onchange = (e) => {
    if (e.target.checked) rows.forEach((r) => sel.add(r.id));
    else sel.clear();
    re();
  };
  $('tbody').onclick = (e) => {
    const ck = e.target.closest('.check');
    const tr = e.target.closest('tr[data-id]');
    if (ck && tr) {
      const id = +tr.dataset.id;
      e.stopPropagation();
      if (ck.checked) sel.add(id); else sel.delete(id);
      re();
      return;
    }
    if (tr) openCompany(+tr.dataset.id);
  };
}

function clientRow(r, on) {
  const od = relDue(r.next_at);
  const overdue = r.next_at && r.next_at < todayISO() && !r.no_follow;
  return `<tr data-id="${r.id}" class="${on ? 'sel' : ''}">
    <td><input type="checkbox" class="check" ${on ? 'checked' : ''}></td>
    <td><span class="co" title="${esc(r.name)}">${esc(r.name)}</span></td>
    <td><span class="pill">${srcLabel(r.source)}</span></td>
    <td class="cell-dim num">${r.headcount ? num(r.headcount) : (r.size_band || '—')}</td>
    <td class="cell-dim">${esc(r.region || '—')}</td>
    <td><span class="pill ${tpCls(r.third_party)}">${tpLabel(r.third_party)}</span></td>
    <td><span class="pill brand">${esc(r.stage_label || stageLabel(r.stage))}</span></td>
    <td class="${overdue ? 'num' : 'cell-dim num'}"
        style="${overdue ? 'color:var(--a600);font-weight:600' : ''}">${r.next_at ? md(r.next_at) : '—'}</td>
    <td class="cell-dim">${r.n_contacts || 0}</td>
  </tr>`;
}

/* ── 详情抽屉 ─────────────────────────────────────── */
async function openCompany(id) {
  S.openId = id;
  const d = await api('/company/' + id);
  const st = STAGE_MAP[d.stage] || { label: d.stage, color: '#a3adbb' };

  const body = `
    <div class="drawer-h">
      <div class="grow">
        <h2>${esc(d.name)}</h2>
        <div class="wrap" style="margin-top:8px">
          <span class="pill">${srcLabel(d.source)}</span>
          <span class="pill" style="background:${st.color}1a;color:${st.color};border-color:${st.color}33">${esc(d.stage_label)}</span>
          <span class="pill ${tpCls(d.third_party)}">${tpLabel(d.third_party)}</span>
          ${d.no_follow ? '<span class="pill danger">已停跟</span>' : ''}
        </div>
      </div>
      <button class="btn primary sm" data-dlog>${icon('edit', 'sm')} 记一笔</button>
      <button class="btn ghost sm icon-only" data-dclose>${icon('x')}</button>
    </div>
    <div class="drawer-b">
      ${d.siblings && d.siblings.length ? `<div class="card pad" style="margin-bottom:14px;font-size:12.5px;
          background:var(--a50);border-color:var(--a100)">
        ${icon('merge', 'sm')} <b>同名公司还有 ${d.siblings.length} 条</b>：
        ${d.siblings.map((s) => esc(s.name) + `（${srcLabel(s.source)}）`).join('、')}
      </div>` : ''}

      <div class="sec">
        <div class="sec-h"><h4>基本信息</h4><span class="spacer"></span>
          <button class="btn ghost sm" data-dedit-info>${icon('edit', 'sm')} 编辑</button></div>
        <div class="card pad">
          <div class="info-grid">
            <div><span>行业</span>${esc(d.industry || '—')}</div>
            <div><span>规模</span>${d.headcount ? num(d.headcount) + ' 人' : (d.size_band || '—')}</div>
            <div><span>地区</span>${esc(d.region || '—')}</div>
            <div><span>现有供应商</span>${esc(d.vendors || '—')}</div>
            <div><span>推荐人</span>${esc(d.referrer || '—')}</div>
            <div><span>负责人</span>${esc(d.owner || '—')}</div>
            <div><span>最近跟进</span>${d.last_at ? md(d.last_at) : '—'}</div>
            <div><span>下次跟进</span>${d.next_at ? md(d.next_at) : '—'}</div>
          </div>
          ${d.third_party_note ? `<div class="hr"></div>
            <div style="font-size:12.5px;color:var(--text-2)">三方情况：${esc(d.third_party_note)}</div>` : ''}
        </div>
      </div>

      <div class="sec">
        <div class="sec-h"><h4>联系人</h4><span class="n">${(d.contacts || []).length}</span>
          <span class="spacer"></span></div>
        <div id="ct-list">${(d.contacts || []).map(contactItem).join('') ||
          '<div class="empty" style="padding:24px"><p>还没有联系人，在下面添加。</p></div>'}</div>
        <div class="card pad" style="padding:11px">
          <input class="input" id="new-ct" style="width:100%"
            placeholder="粘贴「张女士 13800138000 人事」，或直接填微信 / 脉脉昵称">
          <div class="row" style="margin-top:8px">
            <label class="switch"><input type="checkbox" id="new-kp"> 有效 KP</label>
            <label class="switch"><input type="checkbox" id="new-wx"> 已加微信</label>
            <span class="grow"></span>
            <button class="btn sm" data-add-ct>${icon('plus', 'sm')} 添加</button>
          </div>
        </div>
      </div>

      <div class="sec">
        <div class="sec-h"><h4>跟进时间线</h4><span class="n">${(d.activities || []).length}</span>
          <span class="spacer"></span></div>
        <div class="timeline">
          ${(d.activities || []).map((a) => {
            const tone = a.origin === 'manual' ? 'manual' : (['signed', 'trial', 'wechat', 'material'].includes(a.result) ? 'ok' : '');
            return `<div class="tl-item ${tone}">
              <div class="tl-m">
                <span class="tl-d">${a.happened_at ? md(a.happened_at) : '早前'}</span>
                ${a.result && a.result !== a.content
                  ? `<span class="pill tiny" style="color:${stageColor(a.result)};background:${stageColor(a.result)}14">${stageLabel(a.result)}</span>` : ''}
                ${a.contact_name ? `<span class="dim" style="font-size:11px">${esc(a.contact_name)}</span>` : ''}
                ${a.origin === 'manual' ? `<span class="pill tiny brand">手动</span>` : ''}
              </div>
              <div class="tl-b">${esc(a.content)}</div>
            </div>`;
          }).join('') || '<div class="empty" style="padding:26px"><p>暂无记录</p></div>'}
        </div>
      </div>

      <div class="sec">
        <div class="sec-h"><h4>操作</h4></div>
        <div class="row wrap">
          <button class="btn sm" data-dnext>${icon('calendar', 'sm')} 改下次跟进</button>
          <button class="btn sm ${d.no_follow ? '' : 'danger'}" data-dnf>
            ${d.no_follow ? '恢复跟进' : '标记不再跟进'}</button>
          <button class="btn sm danger" data-ddel>${icon('trash', 'sm')} 删除</button>
        </div>
      </div>
    </div>`;

  openDrawer({
    body,
    onMount(root, close) {
      $('[data-dlog]', root).onclick = () => { close(); openLog(id); };
      $('[data-dedit-info]', root).onclick = () => editInfo(id, d, close);
      $('[data-add-ct]', root).onclick = async () => {
        const raw = $('#new-ct', root).value.trim();
        if (!raw) return toast('先输入联系人', 'bad');
        await api('/company/' + id + '/contacts', {
          method: 'POST',
          body: { raw, is_kp: $('#new-kp', root).checked, wechat_added: $('#new-wx', root).checked },
        });
        toast('已添加', 'ok');
        close(); openCompany(id);
      };
      $('#new-ct', root).onkeydown = (e) => { if (e.key === 'Enter') $('[data-add-ct]', root).click(); };

      $('#ct-list', root).onclick = async (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const cid = +btn.dataset.cid;
        const item = btn.closest('.ct-item');
        if (btn.dataset.act === 'edit') {
          item.classList.toggle('editing');
          btn.innerHTML = item.classList.contains('editing') ? '收起' : `${icon('edit', 'sm')} 编辑`;
        }
        if (btn.dataset.act === 'save') {
          const b = {};
          $$('.ct-item[data-cid="' + cid + '"] [data-f]', root).forEach((inp) => {
            b[inp.dataset.f] = inp.type === 'checkbox' ? (inp.checked ? 1 : 0) : inp.value;
          });
          await api('/contact/' + cid, { method: 'POST', body: b });
          toast('已保存', 'ok');
          close(); openCompany(id);
        }
        if (btn.dataset.act === 'del') {
          const ok = await confirmDlg({ title: '删除联系人', message: '确定删除这个联系人？', okText: '删除', danger: true });
          if (!ok) return;
          await api('/contact/' + cid, { method: 'DELETE' });
          toast('已删除', 'ok');
          close(); openCompany(id);
        }
      };
      $('#ct-list', root).onchange = async (e) => {
        const inp = e.target.closest('[data-auto]');
        if (!inp) return;
        const cid = +inp.closest('.ct-item').dataset.cid;
        await api('/contact/' + cid, { method: 'POST', body: { [inp.dataset.f]: inp.checked ? 1 : 0 } });
        toast('已更新', 'ok');
      };

      $('[data-dnext]', root).onclick = async () => {
        const v = await promptDlg({ title: '下次跟进', label: '日期（YYYY-MM-DD，留空清除）', value: d.next_at || todayISO() });
        if (v === null) return;
        await api('/company/' + id, { method: 'POST', body: { next_at: v.trim() } });
        toast('已更新', 'ok'); close(); openCompany(id);
      };
      $('[data-dnf]', root).onclick = async () => {
        if (d.no_follow) {
          await api('/company/' + id, { method: 'POST', body: { no_follow: 0, no_follow_reason: '', next_at: addDays(todayISO(), 3) } });
          toast('已恢复跟进', 'ok');
        } else {
          const r = await promptDlg({ title: '停跟原因', label: '原因（如：已用全景、无预算、联系不上）', value: '' });
          if (r === null) return;
          await api('/company/' + id, { method: 'POST', body: { no_follow: 1, no_follow_reason: r, stage: 'dropped', next_at: '' } });
          toast('已移出队列', 'ok');
        }
        close(); openCompany(id);
      };
      $('[data-ddel]', root).onclick = async () => {
        const ok = await confirmDlg({
          title: '删除客户', message: `删除「${esc(d.name)}」及其全部联系人、跟进记录？不可撤销。`,
          okText: '删除', danger: true,
        });
        if (!ok) return;
        await api('/company/' + id, { method: 'DELETE' });
        toast('已删除', 'ok'); close(); render();
      };
    },
  });
}

function contactItem(c) {
  const chLabel = { phone: '手机', landline: '座机', wechat: '微信', maimai: '脉脉', other: '其他', unknown: '未知' };
  return `<div class="ct-item" data-cid="${c.id}">
    <div class="top">
      <span class="nm">${esc(c.name || '未命名')}</span>
      ${c.title ? `<span class="pill">${esc(c.title)}</span>` : ''}
      <span class="pill line">${chLabel[c.channel] || c.channel}</span>
      ${c.phone ? `<span class="mono dim">${esc(c.phone)}</span>` : ''}
      ${c.wechat ? `<span class="dim" style="font-size:12px">微信 ${esc(c.wechat)}</span>` : ''}
      ${c.invalid ? '<span class="pill danger tiny">失效</span>' : ''}
      <span class="grow"></span>
      <label class="switch"><input type="checkbox" data-auto data-f="is_kp" ${c.is_kp ? 'checked' : ''}> KP</label>
      <label class="switch"><input type="checkbox" data-auto data-f="wechat_added" ${c.wechat_added ? 'checked' : ''}> 已加微</label>
      <button class="btn ghost xs" data-act="edit" data-cid="${c.id}">${icon('edit', 'sm')}</button>
      <button class="btn ghost xs" data-act="del" data-cid="${c.id}">${icon('trash', 'sm')}</button>
    </div>
    <div class="fields">
      <div><label>姓名</label><input class="input" data-f="name" value="${esc(c.name)}"></div>
      <div><label>职位</label><input class="input" data-f="title" value="${esc(c.title)}"></div>
      <div><label>手机/座机</label><input class="input" data-f="phone" value="${esc(c.phone)}"></div>
      <div><label>微信</label><input class="input" data-f="wechat" value="${esc(c.wechat)}"></div>
      <div><label>其他号码</label><input class="input" data-f="other_phone" value="${esc(c.other_phone)}"></div>
      <div><label>渠道</label>
        <select class="select" data-f="channel" style="width:100%">
          ${Object.keys(chLabel).map((k) => `<option value="${k}" ${c.channel === k ? 'selected' : ''}>${chLabel[k]}</option>`).join('')}
        </select></div>
      <div style="grid-column:1/-1"><label>备注</label><input class="input" data-f="note" value="${esc(c.note)}"></div>
      <div style="grid-column:1/-1" class="row">
        <label class="switch"><input type="checkbox" data-f="invalid" ${c.invalid ? 'checked' : ''}> 标记失效（离职/空号）</label>
        <span class="grow"></span>
        <button class="btn primary sm" data-act="save" data-cid="${c.id}">保存</button>
      </div>
    </div>
  </div>`;
}

function editInfo(id, d, closeDrawer) {
  openModal({
    title: '编辑基本信息',
    width: 520,
    body: `
      <div class="field"><label>公司名称</label><input class="input" id="e-name" style="width:100%" value="${esc(d.name)}"></div>
      <div class="row" style="gap:10px">
        <div class="field grow"><label>行业</label><input class="input" id="e-ind" style="width:100%" value="${esc(d.industry)}"></div>
        <div class="field grow"><label>地区</label><input class="input" id="e-reg" style="width:100%" value="${esc(d.region)}"></div>
      </div>
      <div class="row" style="gap:10px">
        <div class="field grow"><label>人数</label><input class="input" id="e-hc" style="width:100%" value="${d.headcount || ''}"></div>
        <div class="field grow"><label>三方情况</label>
          <select class="select" id="e-tp" style="width:100%">
            <option value="unknown" ${d.third_party === 'unknown' ? 'selected' : ''}>未知</option>
            <option value="yes" ${d.third_party === 'yes' ? 'selected' : ''}>有三方</option>
            <option value="no" ${d.third_party === 'no' ? 'selected' : ''}>无三方</option>
          </select></div>
      </div>
      <div class="field"><label>现有供应商</label><input class="input" id="e-vd" style="width:100%" value="${esc(d.vendors)}"></div>
      <div class="field"><label>下次跟进</label><input type="date" class="input" id="e-next" style="width:100%" value="${esc(d.next_at)}"></div>`,
    footer: `<button class="btn" data-c>取消</button><button class="btn primary" data-s>保存</button>`,
    onMount(root, close) {
      $('[data-c]', root).onclick = close;
      $('[data-s]', root).onclick = async () => {
        await api('/company/' + id, {
          method: 'POST',
          body: {
            name: $('#e-name', root).value.trim(),
            industry: $('#e-ind', root).value.trim(),
            region: $('#e-reg', root).value.trim(),
            headcount: $('#e-hc', root).value.trim() || null,
            third_party: $('#e-tp', root).value,
            vendors: $('#e-vd', root).value.trim(),
            next_at: $('#e-next', root).value,
          },
        });
        close(); closeDrawer(); openCompany(id); toast('已保存', 'ok');
      };
    },
  });
}

function openNewCompany() {
  openModal({
    title: '新建客户',
    width: 480,
    body: `
      <div class="field"><label>公司名称 *</label>
        <input class="input" id="n-name" style="width:100%" placeholder="例：上海某某科技有限公司"></div>
      <div class="field"><label>来源</label>
        <select class="select" id="n-src" style="width:100%">
          ${SOURCES.map((s) => `<option value="${s.k}" ${s.k === 'bd' ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select></div>
      <div class="row" style="gap:10px">
        <div class="field grow"><label>行业</label><input class="input" id="n-ind" style="width:100%"></div>
        <div class="field grow"><label>地区</label><input class="input" id="n-reg" style="width:100%"></div>
      </div>
      <div class="field"><label>下次跟进</label><input type="date" class="input" id="n-next" style="width:100%" value="${addDays(todayISO(), 1)}"></div>`,
    footer: `<button class="btn" data-c>取消</button><button class="btn primary" data-s>创建</button>`,
    onMount(root, close) {
      const doSave = async () => {
        const name = $('#n-name', root).value.trim();
        if (!name) return toast('公司名必填', 'bad');
        try {
          const r = await api('/company', {
            method: 'POST',
            body: {
              name, source: $('#n-src', root).value,
              industry: $('#n-ind', root).value, region: $('#n-reg', root).value,
              next_at: $('#n-next', root).value,
            },
          });
          close(); toast('已创建', 'ok'); openCompany(r.id);
        } catch (e) { toast(e.message, 'bad'); }
      };
      $('[data-c]', root).onclick = close;
      $('[data-s]', root).onclick = doSave;
      $('#n-name', root).onkeydown = (e) => { if (e.key === 'Enter') doSave(); };
    },
  });
}
