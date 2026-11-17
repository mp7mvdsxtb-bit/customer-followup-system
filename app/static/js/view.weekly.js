/* view.weekly.js —— 周报：这一周跟了哪些客户、结果如何（周一汇报用） */
'use strict';

async function viewWeekly(main) {
  main.innerHTML = `<div class="page">${skeletonList(3)}</div>`;
  const start = S.weekStart || '';
  const inc = S.weekIncludeImport ? '1' : '0';
  const d = await api(`/weekly?start=${encodeURIComponent(start)}&include_import=${inc}`);
  const w = d.week, s = d.summary;
  S.weekStart = w.start;

  const resultBars = s.by_result.length ? s.by_result.map((x) => {
    const color = stageColor(x.k);
    return `<div class="bar">
      <span class="k" style="width:76px;flex:0 0 76px">
        <span class="dot" style="width:6px;height:6px;border-radius:50%;
          background:${color};display:inline-block;margin-right:6px"></span>${stageLabel(x.k)}</span>
      <span class="track"><span class="fill" style="width:${(x.v / s.by_result[0].v) * 100}%;
        background:${color}"></span></span>
      <span class="v">${x.v}</span></div>`;
  }).join('') : '<div class="dim" style="font-size:12.5px;padding:6px 0">这一周没有记录</div>';

  main.innerHTML = `<div class="page">
    <div class="row wrap" style="margin-bottom:14px;gap:8px">
      <div class="row tight" style="gap:4px">
        <button class="btn sm icon-only" data-nav="${w.prev}" title="上一周">${icon('chev-left', 'sm')}</button>
        <div style="padding:0 6px;font-size:13.5px;font-weight:620;min-width:190px;text-align:center">
          ${esc(w.label)}
          ${w.is_this_week ? '<span class="pill tiny brand" style="margin-left:6px">本周</span>' : ''}
          ${w.is_last_week ? '<span class="pill tiny" style="margin-left:6px">上周</span>' : ''}
        </div>
        <button class="btn sm icon-only" data-nav="${w.next}" title="下一周"
          ${w.is_this_week ? 'disabled' : ''}>${icon('chev-right', 'sm')}</button>
      </div>
      <span class="grow"></span>
      <label class="switch"><input type="checkbox" id="w-inc" ${d.include_import ? 'checked' : ''}>
        含 Excel 导入的历史记录</label>
      <a class="btn sm" href="/api/weekly/export?start=${esc(w.start)}&include_import=${inc}">
        ${icon('download', 'sm')} 导出周报</a>
      <button class="btn sm" onclick="window.print()">${icon('copy', 'sm')} 打印</button>
    </div>

    <div class="grid c4" style="margin-bottom:14px">
      <div class="card stat"><div class="big-num">${s.companies}</div>
        <div class="stat-l">跟进客户数</div></div>
      <div class="card stat"><div class="big-num">${s.activities}</div>
        <div class="stat-l">跟进次数</div></div>
      <div class="card stat"><div class="big-num" style="color:var(--g600)">${s.advanced}</div>
        <div class="stat-l">有实质推进</div></div>
      <div class="card stat"><div class="big-num" style="color:var(--a600)">${s.signed}</div>
        <div class="stat-l">签约</div></div>
    </div>

    <div class="grid c2" style="margin-bottom:14px;align-items:stretch">
      <div class="card stat" style="align-self:stretch"><h3>结果分布</h3>${resultBars}</div>
      <div class="card stat" style="align-self:stretch">
        <h3>汇报口径</h3>
        <div style="font-size:12.5px;line-height:2;color:var(--text-2)">
          <div class="row"><span class="dim" style="width:88px">统计范围</span>
            <b>${esc(w.start)} → ${esc(w.end)}</b><span class="dim">（周一至周日）</span></div>
          <div class="row"><span class="dim" style="width:88px">来源</span>
            <span>${d.include_import ? '手动记录 + Excel 导入' : '只算手动记录'}</span></div>
          <div class="row"><span class="dim" style="width:88px">下周已排</span>
            <b>${s.next_week_planned}</b><span class="dim">家</span></div>
        </div>
        <div class="hr"></div>
        <div class="dim" style="font-size:12px;line-height:1.7">
          「有实质推进」= 本周最好结果到了「待加微」或更靠后。
          周一开会直接念这张表就行。
        </div>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>公司</th><th>来源</th><th>行业</th><th>规模</th>
          <th style="width:70px">跟进</th><th>本周最好结果</th><th>当前阶段</th>
          <th>最后一次记录</th><th>下次跟进</th>
        </tr></thead>
        <tbody>
          ${d.rows.map((r) => `<tr data-id="${r.id}">
            <td><span class="co" title="${esc(r.name)}">${esc(r.name)}</span>
              ${r.contact ? `<span class="co-sub">${esc(r.contact)}</span>` : ''}</td>
            <td><span class="pill">${srcLabel(r.source)}</span></td>
            <td class="cell-dim">${esc(r.industry || '—')}</td>
            <td class="cell-dim num">${r.headcount ? num(r.headcount) : '—'}</td>
            <td class="num" style="font-weight:600">${r.n}</td>
            <td>${r.best_result
              ? `<span class="pill" style="background:${stageColor(r.best_result)}1a;
                  color:${stageColor(r.best_result)}">${stageLabel(r.best_result)}</span>`
              : '<span class="dim">—</span>'}</td>
            <td>${r.best_result && r.best_result === r.stage
              ? `<span class="pill">${esc(r.stage_label)}</span>`
              : `<span class="pill brand">${esc(r.stage_label)}</span>`}</td>
            <td class="cell-dim" style="max-width:280px">
              <span class="trunc" style="display:block;max-width:280px"
                title="${esc(r.last_content)}">${esc(r.last_content || '—')}</span></td>
            <td class="cell-dim num">${r.next_at ? md(r.next_at) : '—'}</td>
          </tr>`).join('') || `<tr><td colspan="9" style="height:auto">
            <div class="empty" style="border:0;background:none">
              <div class="ic">${icon('calendar', 'lg')}</div>
              <h4>这一周还没有跟进记录</h4>
              <p>要么是这周还没开始，要么记录记在别处。<br>
                如果 Excel 里本来就有这段时间的记录，勾上右上角「含 Excel 导入的历史记录」。</p>
            </div></td></tr>`}
        </tbody>
      </table>
    </div>

    ${d.rows.length ? `<div class="dim" style="font-size:12px;margin-top:10px;text-align:right">
      共 ${d.rows.length} 家 · 点击任意一行查看详情
    </div>` : ''}
  </div>`;

  main.onclick = (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      S.weekStart = nav.dataset.nav;
      viewWeekly(main);
      return;
    }
    const tr = e.target.closest('tr[data-id]');
    if (tr) openCompany(+tr.dataset.id);
  };
  const incEl = $('#w-inc', main);
  if (incEl) incEl.onchange = () => {
    S.weekIncludeImport = incEl.checked;
    viewWeekly(main);
  };
}
