/* view.today.js —— 今日工作台 */
'use strict';

async function viewToday(main) {
  const filter = S.todayFilter || 'all';
  main.innerHTML = `<div class="page">${skeletonList(4)}</div>`;
  const d = await api('/today?minutes=' + S.minutes);
  S.today = d;
  updateSidebarCounts();

  const dt = new Date(d.date + 'T00:00:00');
  const pct = Math.min(100, Math.round((d.planned_minutes / Math.max(1, d.budget)) * 100));
  const C = 2 * Math.PI * 30;

  let items = d.items;
  if (filter === 'due') items = items.filter((x) => x.bucket === 'due');
  if (filter === 'ka') items = items.filter((x) => x.source === 'ka');
  const dueItems = items.filter((x) => x.bucket === 'due');
  const fillItems = items.filter((x) => x.bucket === 'fill');

  main.innerHTML = `<div class="page">
    <div class="hero">
      <div class="ring">
        <svg width="78" height="78" viewBox="0 0 78 78">
          <circle cx="39" cy="39" r="30" fill="none" stroke="var(--surface-3)" stroke-width="6.5"/>
          <circle cx="39" cy="39" r="30" fill="none" stroke="url(#brandGrad)" stroke-width="6.5"
            stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}"
            stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(1)}"
            style="transition:stroke-dashoffset 700ms cubic-bezier(.32,.72,0,1)"/>
        </svg>
        <div class="val">${d.planned_minutes}<small>/ ${d.budget} 分</small></div>
      </div>
      <div>
        <div class="hero-t">今天安排了 ${d.items.length} 家</div>
        <div class="hero-m">${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日 ${WEEK[dt.getDay()]}
          · 按「到期 → 目标KA → 有三方背调」排队</div>
      </div>
      <div class="hero-kpis">
        <div class="kpi ${d.overdue_count ? 'hot' : ''}"><b>${d.due_count}</b><span>到期 / 逾期</span></div>
        <div class="kpi"><b>${d.done_today}</b><span>今日已记</span></div>
        <div class="kpi"><b>${d.overflow_total}</b><span>队列剩余</span></div>
      </div>
    </div>

    <div class="row" style="margin-bottom:2px">
      <div class="segmented" id="tf">
        <button data-f="all" class="${filter === 'all' ? 'on' : ''}">全部 ${d.items.length}</button>
        <button data-f="due" class="${filter === 'due' ? 'on' : ''}">仅到期 ${dueItems.length}</button>
        <button data-f="ka" class="${filter === 'ka' ? 'on' : ''}">目标KA</button>
      </div>
      <span class="grow"></span>
      <button class="btn sm ghost" id="btn-budget">${icon('clock', 'sm')} ${d.budget} 分钟</button>
      <button class="btn sm ghost icon-only" id="btn-reload" title="刷新">${icon('refresh', 'sm')}</button>
    </div>

    ${dueItems.length ? `
      <div class="group-h"><span class="t">必做</span><span class="n hot">${dueItems.length}</span>
        <span class="line"></span></div>
      <div class="queue" id="q-due">${dueItems.map(leadCard).join('')}</div>` : ''}

    ${fillItems.length ? `
      <div class="group-h"><span class="t">建议加做</span><span class="n">${fillItems.length}</span>
        <span class="line"></span></div>
      <div class="queue" id="q-fill">${fillItems.map(leadCard).join('')}</div>` : ''}

    ${!dueItems.length && !fillItems.length ? `<div class="empty" style="margin-top:20px">
      <div class="ic">${icon(d.total ? 'check' : 'inbox', 'lg')}</div>
      <h4>${d.total ? '今天的队列是空的' : '还没有客户'}</h4>
      <p>${d.total
        ? '没有到期任务，也没有需要补的——可以主动去客户库挑几家。'
        : '系统是空的。点下面的按钮加第一家客户，或者去客户库批量导入。'}</p>
      <div class="row" style="margin-top:12px">
        <button class="btn primary sm" onclick="openNewCompany()">${icon('plus', 'sm')} 新建客户</button>
        <a class="btn sm" href="#/clients">去客户库</a>
      </div>
    </div>` : ''}
  </div>`;

  $('#tf').onclick = (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    S.todayFilter = b.dataset.f;
    viewToday(main);
  };
  $('#btn-reload').onclick = () => viewToday(main);
  $('#btn-budget').onclick = (e) => {
    openMenu(e.currentTarget, [30, 45, 60, 90, 120].map((m) => ({
      label: m === S.minutes ? `${m} 分钟 ✓` : `${m} 分钟`,
      onClick: async () => {
        S.minutes = m;
        await api('/settings', { method: 'POST', body: { bd_minutes: String(m) } });
        viewToday(main);
      },
    })));
  };

  main.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = +b.dataset.id;
    const act = b.dataset.act;
    if (act === 'log') openLog(id);
    else if (act === 'open') openCompany(id);
    else if (act === 'copy') copyText(b.dataset.v, '已复制');
    else if (act === 'later') laterCompany(id);
    else if (act === 'call') { /* tel: 链接自己处理 */ }
  };
}

function leadCard(it) {
  const isKa = it.source === 'ka';
  const od = relDue(it.next_at);
  const cls = [it.bucket === 'due' ? 'due' : '', isKa ? 'ka' : ''].join(' ');
  const cts = (it.contacts || []).slice(0, 3).map((c) => {
    const val = c.phone || (c.wechat ? 'wx: ' + c.wechat : (c.channel === 'maimai' ? '脉脉' : '无号码'));
    return `<div class="ct">
      <span class="who" title="${esc(c.name)}">${esc(c.name || '未命名')}</span>
      <span class="val">${esc(val)}</span>
      ${c.is_kp ? `<span class="pill tiny ka">KP</span>` : ''}
      ${c.wechat_added ? `<span class="pill tiny yes">已加微</span>` : ''}
      <span class="acts">
        ${c.phone ? `<a class="btn xs" href="tel:${esc(c.phone)}">拨打</a>
          <button class="btn xs" data-act="copy" data-v="${esc(c.phone)}">复制</button>` : ''}
      </span>
    </div>`;
  }).join('');

  return `<div class="lead ${cls}" data-id="${it.id}">
    <div class="lead-h">
      <div class="grow">
        <div class="lead-name">${esc(it.name)}</div>
        <div class="lead-tags">
          ${isKa ? `<span class="pill ka">目标KA</span>` : ''}
          ${it.industry ? `<span class="pill">${esc(it.industry)}</span>` : ''}
          ${it.headcount ? `<span class="pill">${num(it.headcount)}人</span>` : ''}
          ${it.region ? `<span class="pill">${esc(it.region)}</span>` : ''}
          <span class="pill ${tpCls(it.third_party)}">${tpLabel(it.third_party)}</span>
          <span class="pill brand">${esc(it.stage_label)}</span>
        </div>
      </div>
      <span class="lead-od ${od.cls}">${od.text}</span>
    </div>
    <div class="cts">${cts || `<div class="ct"><span class="val dim">暂无联系人</span></div>`}</div>
    ${it.last_note ? `<div class="lead-note"><b>${it.last_note_at ? md(it.last_note_at) : '早前'}</b>${esc(it.last_note)}</div>` : ''}
    <div class="lead-f">
      <button class="btn primary sm" data-act="log" data-id="${it.id}">${icon('edit', 'sm')} 记一笔</button>
      <button class="btn sm" data-act="open" data-id="${it.id}">详情</button>
      <span class="spacer"></span>
      <button class="btn ghost sm" data-act="later" data-id="${it.id}">推到明天</button>
    </div>
  </div>`;
}

async function laterCompany(id) {
  const card = $(`.lead[data-id="${id}"]`);
  if (card) { card.classList.add('done'); }
  await api('/company/' + id, { method: 'POST', body: { next_at: addDays(todayISO(), 1) } });
  toast('已推到明天', 'ok');
  setTimeout(() => viewToday($('#main-wrap') || $('.page')), 220);
}

/* ── 记一笔 ───────────────────────────────────────── */
function openLog(companyId, preset) {
  api('/company/' + companyId).then((d) => {
    const contacts = d.contacts || [];
    let picked = preset || '';
    const body = `
      <div class="field">
        <label>这次的结果</label>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:6px" id="res-grid">
          ${RESULTS.map((r) => `
            <button type="button" class="btn" data-res="${r.k}"
              style="justify-content:flex-start;height:34px;font-size:12.5px">
              <span style="width:6px;height:6px;border-radius:50%;background:${stageColor(r.k)};flex:0 0 6px"></span>
              ${r.label}
            </button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>跟谁通的</label>
        <select class="select" id="log-ct" style="width:100%">
          <option value="">不指定</option>
          ${contacts.map((c) => `<option value="${c.id}">${esc(c.name || '未命名')}　${esc(c.phone || c.wechat || '')}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>说了什么</label>
        <textarea class="input" id="log-txt" rows="3"
          placeholder="例：对方说今年只有高管做背调，留了微信让发资料"></textarea>
      </div>
      <div class="field">
        <label>下次跟进</label>
        ${dateChips('log-next', d.next_at || addDays(todayISO(), 3))}
      </div>
      <div class="field" style="margin-bottom:4px">
        <label class="switch"><input type="checkbox" id="log-nf"> 标记为不再跟进（移出队列）</label>
        <input class="input" id="log-nf-r" placeholder="原因，如：已用全景、无预算"
          style="width:100%;margin-top:7px;display:none">
      </div>`;

    openModal({
      title: `记一笔 · ${esc(d.name)}`,
      sub: `<span class="pill ${tpCls(d.third_party)}" style="margin-right:6px">${tpLabel(d.third_party)}</span>
            <span class="pill brand">${esc(d.stage_label)}</span>
            ${d.next_at ? ` <span class="dim">原定 ${md(d.next_at)}</span>` : ''}`,
      body,
      width: 560,
      footer: `<span class="dim" style="font-size:11.5px;margin-right:auto">⌘/Ctrl + Enter 保存</span>
               <button class="btn" data-cancel>取消</button>
               <button class="btn primary" data-save>保存</button>`,
      onMount(root, close) {
        bindDateChips(root, 'log-next');
        const nf = $('#log-nf', root);
        nf.onchange = () => { $('#log-nf-r', root).style.display = nf.checked ? '' : 'none'; };
        $$('#res-grid [data-res]', root).forEach((b) => {
          b.onclick = () => {
            $$('#res-grid [data-res]', root).forEach((x) => {
              x.classList.remove('primary');
              x.style.borderColor = '';
            });
            b.classList.add('primary');
            picked = b.dataset.res;
            const r = RESULT_MAP[picked];
            if (r) $('#log-next', root).value = r.gap ? addDays(todayISO(), r.gap) : '';
          };
        });
        if (picked && RESULT_MAP[picked]) {
          const b = $(`#res-grid [data-res="${picked}"]`, root);
          if (b) b.click();
        }
        $('[data-cancel]', root).onclick = close;
        const save = async () => {
          const txt = $('#log-txt', root).value.trim();
          if (!picked && !txt) { toast('先选一个结果或写点内容', 'bad'); return; }
          try {
            await api('/company/' + companyId + '/log', {
              method: 'POST',
              body: {
                result: picked, content: txt,
                contact_id: $('#log-ct', root).value ? +$('#log-ct', root).value : null,
                next_at: nf.checked ? '' : $('#log-next', root).value,
                no_follow: nf.checked ? 1 : 0,
                no_follow_reason: $('#log-nf-r', root).value,
              },
            });
            close();
            toast('已记录', 'ok');
            render();
          } catch (e) { toast(e.message, 'bad'); }
        };
        $('[data-save]', root).onclick = save;
        root.onkeydown = (e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); }
        };
      },
    });
  }).catch((e) => toast(e.message, 'bad'));
}
