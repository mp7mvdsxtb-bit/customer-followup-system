/* view.insight.js —— 数据洞察 / 目标 / 数据质量 */
'use strict';

/* ── 洞察 ─────────────────────────────────────────── */
async function viewInsight(main) {
  main.innerHTML = `<div class="page">${skeletonList(2)}</div>`;
  const [s, rep] = await Promise.all([api('/stats'), api('/report?days=28')]);
  S.stats = s;

  const bars = (arr, fmt = (x) => x) => {
    if (!arr || !arr.length) {
      return '<div class="dim" style="font-size:12.5px;padding:6px 0">暂无数据</div>';
    }
    const max = Math.max(1, ...arr.map((x) => x.v));
    return arr.map((x) => `<div class="bar">
      <span class="k" title="${esc(x.k)}">${esc(x.k)}</span>
      <span class="track"><span class="fill" style="width:${(x.v / max) * 100}%"></span></span>
      <span class="v">${fmt(x.v)}</span></div>`).join('');
  };
  const topN = (arr, n = 12) => {
    if (arr.length <= n) return arr;
    const rest = arr.slice(n).reduce((a, x) => a + x.v, 0);
    return [...arr.slice(0, n), { k: `其余 ${arr.length - n} 类`, v: rest }];
  };
  const stageVals = Object.fromEntries(s.by_stage.map((x) => [x.k, x.v]));
  const maxS = Math.max(1, ...FUNNEL.map((k) => stageVals[k] || 0));
  const conv = {
    total: s.total,
    hasTp: (s.by_third.find((x) => x.k === 'yes') || {}).v || 0,
    signing: (stageVals.negotiating || 0) + (stageVals.signed || 0),
  };

  main.innerHTML = `<div class="page">
    <div class="grid c4" style="margin-bottom:12px">
      <div class="card stat"><div class="big-num">${s.total}</div><div class="stat-l">客户总数</div></div>
      <div class="card stat"><div class="big-num" style="color:var(--a600)">${s.overdue}</div>
        <div class="stat-l">逾期未跟</div></div>
      <div class="card stat"><div class="big-num">${rep.this_week.total}</div>
        <div class="stat-l">本周跟进（次）</div></div>
      <div class="card stat"><div class="big-num">${s.no_phone}</div><div class="stat-l">缺手机号</div></div>
    </div>

    <div class="grid c2">
      <div class="card stat">
        <h3>阶段漏斗</h3>
        <div class="funnel">
          ${FUNNEL.map((k) => `<div class="fs">
            <span class="k">${stageLabel(k)}</span>
            <span class="track"><span class="fill" style="width:${((stageVals[k] || 0) / maxS) * 100}%"></span></span>
            <span class="v">${stageVals[k] || 0}</span></div>`).join('')}
          <div class="fs"><span class="k">暂无需求</span>
            <span class="track"><span class="fill" style="width:${((stageVals.no_need || 0) / maxS) * 100}%;
              background:var(--a500)"></span></span>
            <span class="v">${stageVals.no_need || 0}</span></div>
          <div class="fs"><span class="k">已弃单</span>
            <span class="track"><span class="fill" style="width:${((stageVals.dropped || 0) / maxS) * 100}%;
              background:var(--r500)"></span></span>
            <span class="v">${stageVals.dropped || 0}</span></div>
        </div>
      </div>

      <div class="card stat">
        <h3>近 4 周跟进量</h3>
        ${weekChart(rep.weekly)}
        <div class="hr"></div>
        <h3 style="margin-bottom:9px">本周结果分布</h3>
        ${rep.this_week.by_result.length ? bars(rep.this_week.by_result.map((x) => ({
          k: stageLabel(x.k), v: x.v,
        }))) : '<div class="dim" style="font-size:12.5px">本周还没有记录</div>'}
      </div>

      <div class="card stat">
        <h3>第三方背调情况</h3>
        ${bars(s.by_third.map((x) => ({
          k: { yes: '有三方', no: '无三方（机会）', unknown: '未知' }[x.k] || x.k, v: x.v,
        })))}
        <div class="hr"></div>
        <div class="dim" style="font-size:12px;line-height:1.6">
          「无三方」是最容易撬的池子，其次是「未知」——先问清有没有在用。
        </div>
      </div>

      <div class="card stat"><h3>行业分布</h3>${bars(topN(s.by_industry, 12))}</div>
      <div class="card stat"><h3>规模分布</h3>${bars(s.by_size)}</div>
      <div class="card stat"><h3>地区分布</h3>${bars(topN(s.by_region, 12))}</div>
      <div class="card stat"><h3>线索来源</h3>${bars(s.by_source.map((x) => ({ k: srcLabel(x.k), v: x.v })))}</div>
    </div>
  </div>`;
}

function weekChart(weekly) {
  const totalAll = weekly.reduce((a, w) => a + w.total, 0);
  if (!totalAll) {
    return `<div class="empty" style="border:0;background:none;padding:24px 0">
      <p class="dim" style="font-size:12.5px">最近四周还没有跟进记录。<br>从「今日工作台」记第一笔开始。</p></div>`;
  }
  const max = Math.max(1, ...weekly.map((w) => w.total));
  return `<div style="display:flex;align-items:flex-end;gap:6px;height:110px;padding:4px 0 0">
    ${weekly.map((w) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px">
      <div style="font-size:10.5px;color:var(--text-3);font-variant-numeric:tabular-nums">${w.total || ''}</div>
      <div style="width:100%;height:${Math.max(3, (w.total / max) * 66)}px;border-radius:4px 4px 2px 2px;
        background:${w.current ? 'linear-gradient(180deg,var(--b400),var(--b600))' : 'var(--surface-3)'}"></div>
      <div style="font-size:10px;color:var(--text-4)">${w.label}</div>
    </div>`).join('')}
  </div>`;
}

/* ── 目标 ─────────────────────────────────────────── */
async function viewGoals(main) {
  main.innerHTML = `<div class="page">${skeletonList(2)}</div>`;
  const [g, rep] = await Promise.all([api('/goals'), api('/report?days=90')]);
  const rows = g.months || [];
  const pick = rows.find((m) => m.current) || rows[rows.length - 1] || {};

  const money = (n) => (n == null ? '—' : (n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + ' 万' : n + ' 元'));
  const pct = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);

  main.innerHTML = `<div class="page">
    <div class="grid c2" style="margin-bottom:12px">
      <div class="card stat">
        <h3>本月个人业绩 · ${esc(pick.label || '')}</h3>
        <div class="row" style="align-items:flex-end;gap:12px">
          <div class="big-num">${money(pick.actual)}</div>
          <div class="dim" style="font-size:12px;padding-bottom:6px">/ 目标 ${money(pick.target)} · 保底 ${money(pick.floor)}</div>
        </div>
        <div class="goal-bar"><span class="f ${pct(pick.actual, pick.target) >= 100 ? 'ok' : ''}"
          style="width:${pct(pick.actual, pick.target)}%"></span></div>
        <div class="row" style="font-size:11.5px;color:var(--text-3)">
          <span>达成 ${pct(pick.actual, pick.target)}%</span>
          <span class="grow"></span>
          <span>距保底还差 ${money(Math.max(0, (pick.floor || 0) - (pick.actual || 0)))}</span>
        </div>
        <div class="hr"></div>
        <div class="row">
          <span class="dim" style="font-size:12px">实际回款</span>
          <span class="grow"></span>
          <button class="btn sm" data-set-actual>${icon('edit', 'sm')} 更新</button>
        </div>
      </div>

      <div class="card stat">
        <h3>本月动作进度</h3>
        <div class="grid" style="grid-template-columns:1fr 1fr 1fr;gap:0">
          <div><div class="big-num" style="font-size:24px">${rep.this_week.total}</div>
            <div class="stat-l">本周跟进</div></div>
          <div><div class="big-num" style="font-size:24px">${rep.this_week.by_company}</div>
            <div class="stat-l">覆盖客户</div></div>
          <div><div class="big-num" style="font-size:24px;color:var(--g600)">${rep.this_week.by_result.find((x) => x.k === 'wechat')?.v || 0}</div>
            <div class="stat-l">本周加微</div></div>
        </div>
        <div class="hr"></div>
        <div class="muted" style="font-size:12px;line-height:1.7">
          每天 ${S.minutes} 分钟 BD，按当前节奏一周约
          <b>${Math.round((S.minutes * 5) / 4) || 0}</b> 次有效触达。
        </div>
      </div>
    </div>

    <div class="card">
      <div style="padding:14px 16px 4px"><h3 style="font-size:12.5px;font-weight:620">月度拆解</h3></div>
      <table>
        <thead><tr><th>月份</th><th>保底</th><th>目标</th><th>实际</th><th style="width:180px">进度</th></tr></thead>
        <tbody>
          ${rows.map((m) => `<tr data-m="${esc(m.key)}" style="cursor:default">
            <td>${esc(m.label)} ${m.current ? '<span class="pill tiny brand">本月</span>' : ''}</td>
            <td class="num cell-dim">${money(m.floor)}</td>
            <td class="num cell-dim">${money(m.target)}</td>
            <td class="num" style="font-weight:600">${money(m.actual)}</td>
            <td><div class="goal-bar" style="margin:0"><span class="f ${pct(m.actual, m.target) >= 100 ? 'ok' : ''}"
              style="width:${pct(m.actual, m.target)}%"></span></div></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="card stat" style="margin-top:12px">
      <h3>目标设置</h3>
      <div class="row wrap" style="gap:10px">
        <div class="field" style="margin:0"><label>月度目标（元）</label>
          <input class="input" id="g-target" value="${pick.target || 60000}" style="width:130px"></div>
        <div class="field" style="margin:0"><label>保底（元）</label>
          <input class="input" id="g-floor" value="${pick.floor || 30000}" style="width:130px"></div>
        <span class="grow"></span>
        <button class="btn primary" data-save-goal>保存</button>
      </div>
    </div>
  </div>`;

  $('[data-set-actual]', main).onclick = async () => {
    const v = await promptDlg({ title: '更新本月实际', label: '实际签约/回款金额（元）', value: pick.actual || 0 });
    if (v === null) return;
    await api('/goals', { method: 'POST', body: { month: pick.key, actual: +v || 0 } });
    toast('已更新', 'ok'); viewGoals(main);
  };
  $('[data-save-goal]', main).onclick = async () => {
    await api('/goals', {
      method: 'POST',
      body: { target: +$('#g-target', main).value || 0, floor: +$('#g-floor', main).value || 0 },
    });
    toast('已保存', 'ok'); viewGoals(main);
  };
}

/* ── 数据质量 ─────────────────────────────────────── */
async function viewQuality(main) {
  main.innerHTML = `<div class="page">${skeletonList(2)}</div>`;
  const q = await api('/quality');
  const card = (iconName, title, n, desc, goFilter, tone = '') => `
    <div class="card stat" style="display:flex;gap:13px;align-items:flex-start">
      <div style="width:34px;height:34px;border-radius:9px;display:grid;place-items:center;flex:0 0 34px;
        background:${tone === 'warn' ? 'var(--a50)' : 'var(--surface-3)'};
        color:${tone === 'warn' ? 'var(--a600)' : 'var(--text-3)'}">${icon(iconName)}</div>
      <div class="grow" style="display:flex;flex-direction:column;min-height:78px">
        <div class="row"><b style="font-size:13.5px">${title}</b>
          <span class="grow"></span>
          <span class="pill ${n ? (tone === 'warn' ? 'warn' : '') : 'yes'}">${n}</span></div>
        <div class="dim" style="font-size:12px;margin-top:3px;line-height:1.55">${desc}</div>
        ${n ? `<button class="btn sm" style="margin-top:auto;align-self:flex-start"
          data-goto='${JSON.stringify(goFilter)}'>去处理</button>` : ''}
      </div>
    </div>`;

  main.innerHTML = `<div class="page">
    <div class="grid c3" style="margin-bottom:14px">
      ${card('phone', '没有手机号', q.no_phone, '只能靠微信/脉脉触达，电话打不了。', { flag: 'no_phone' }, 'warn')}
      ${card('users', '缺行业', q.no_industry, '无法按行业分组统计，也难判断匹配度。', { flag: 'no_industry' })}
      ${card('chart', '缺规模', q.no_size, '不知道对方多大，判断不了招聘量。', { flag: 'no_size' })}
      ${card('shield', '三方情况未知', q.no_tp, '不知道对方在不在用背调，话术没法准备。', { third: 'unknown' }, 'warn')}
      ${card('alert', '逾期未跟', q.overdue, '下次跟进日已经过了，需要重新排期或标记停跟。', { flag: 'overdue' }, 'warn')}
      ${card('calendar', '从未跟进', q.never, '入库后一次都没联系过。', { flag: 'never' })}
    </div>

    <div class="card">
      <div style="padding:14px 16px 6px">
        <h3 style="font-size:13px;font-weight:620">疑似重复公司 · ${q.dupes.length} 组</h3>
        <div class="dim" style="font-size:12px;margin-top:3px">名字高度相似，可能是同一家被录了两次。</div>
      </div>
      ${q.dupes.length ? `<table><tbody>
        ${q.dupes.map((g) => `<tr style="cursor:default"><td style="height:auto;padding:12px">
          <div class="row wrap" style="gap:6px">
            ${g.items.map((it) => `<span class="pill line">${esc(it.name)}
              <span class="dim" style="font-weight:400">· ${srcLabel(it.source)} · #${it.id}</span></span>`).join('')}
          </div>
          <div class="row" style="margin-top:7px">
            <span class="dim" style="font-size:11.5px">相似度 ${Math.round(g.score * 100)}%</span>
            <span class="grow"></span>
            <button class="btn sm" data-open="${g.items[0].id}">看第一条</button>
          </div>
        </td></tr>`).join('')}
      </tbody></table>` : `<div class="empty" style="border:0;background:none"><p>没有发现重复</p></div>`}
    </div>
  </div>`;

  main.onclick = (e) => {
    const g = e.target.closest('[data-goto]');
    if (g) {
      const f = JSON.parse(g.dataset.goto);
      S.filters = { ...DEF_FILTER, ...f };
      go('clients');
      return;
    }
    const o = e.target.closest('[data-open]');
    if (o) openCompany(+o.dataset.open);
  };
}
