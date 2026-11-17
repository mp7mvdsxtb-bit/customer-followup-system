/* view.board.js —— 看板视图（拖拽改阶段） */
'use strict';

const BOARD_COLS = ['new', 'contacted', 'reachable', 'wechat', 'interested',
  'material', 'trial', 'negotiating', 'signed'];
const BOARD_COLS_MORE = [...BOARD_COLS, 'no_need', 'dropped'];

async function viewBoard(main) {
  const showMore = S.boardMore;
  main.innerHTML = `<div class="page">${skeletonList(2)}</div>`;
  const f = S.boardFilter || {};
  const qs = new URLSearchParams({ limit: '2000', nf: '0', ...f }).toString();
  const d = await api('/companies?' + qs);
  const cols = showMore ? BOARD_COLS_MORE : BOARD_COLS;
  const byStage = groupBy(d.rows, (r) => r.stage);

  main.innerHTML = `<div class="page">
    <div class="row" style="margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div class="segmented" id="bf">
        <button data-k="" class="${!f.source ? 'on' : ''}">全部 ${d.total}</button>
        ${SOURCES.map((s) => {
          const n = d.rows.filter((r) => r.source === s.k).length;
          return `<button data-k="${s.k}" class="${f.source === s.k ? 'on' : ''}">${s.label} ${n}</button>`;
        }).join('')}
      </div>
      <span class="grow"></span>
      <label class="switch"><input type="checkbox" id="bm" ${showMore ? 'checked' : ''}> 显示停跟 / 弃单列</label>
    </div>
    <div class="board" id="board">
      ${cols.map((k) => {
        const st = STAGE_MAP[k];
        const rows = byStage[k] || [];
        return `<div class="kcol" data-stage="${k}">
          <div class="kcol-h">
            <span class="dotcol" style="background:${st.color}"></span>
            <span class="nm">${st.label}</span>
            <span class="n">${rows.length}</span>
          </div>
          <div class="kcol-b" data-drop="${k}">
            ${rows.slice(0, 60).map((r) => `
              <div class="kcard" draggable="true" data-cid="${r.id}">
                <div class="t">${esc(r.name)}</div>
                <div class="m">
                  ${r.source === 'ka' ? '<span class="pill tiny ka">KA</span>' : ''}
                  <span class="trunc">${esc(r.industry || '未分类')}</span>
                  ${r.next_at ? `<span style="margin-left:auto" class="num">${md(r.next_at)}</span>` : ''}
                </div>
              </div>`).join('') || '<div class="kempty">空</div>'}
            ${rows.length > 60 ? `<div class="kempty">还有 ${rows.length - 60} 家…</div>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;

  $('#bf').onclick = (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    S.boardFilter = { source: b.dataset.k };
    viewBoard(main);
  };
  $('#bm').onchange = (e) => { S.boardMore = e.target.checked; viewBoard(main); };

  const board = $('#board');
  let dragId = null;

  board.addEventListener('dragstart', (e) => {
    const c = e.target.closest('.kcard');
    if (!c) return;
    dragId = +c.dataset.cid;
    c.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(dragId)); } catch (err) {}
  });
  board.addEventListener('dragend', (e) => {
    $$('.kcard.dragging').forEach((c) => c.classList.remove('dragging'));
    $$('.kcol.drag-over').forEach((c) => c.classList.remove('drag-over'));
  });
  board.addEventListener('dragover', (e) => {
    const col = e.target.closest('.kcol');
    if (!col) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    $$('.kcol.drag-over').forEach((c) => { if (c !== col) c.classList.remove('drag-over'); });
    col.classList.add('drag-over');
  });
  board.addEventListener('dragleave', (e) => {
    const col = e.target.closest('.kcol');
    if (col && !col.contains(e.relatedTarget)) col.classList.remove('drag-over');
  });
  board.addEventListener('drop', async (e) => {
    const col = e.target.closest('.kcol');
    if (!col || !dragId) return;
    e.preventDefault();
    const stage = col.dataset.stage;
    const id = dragId;
    dragId = null;
    col.classList.remove('drag-over');
    try {
      await api('/company/' + id, { method: 'POST', body: { stage } });
      toast(`已移到「${stageLabel(stage)}」`, 'ok');
      viewBoard(main);
    } catch (err) { toast(err.message, 'bad'); }
  });
  board.addEventListener('click', (e) => {
    const c = e.target.closest('.kcard');
    if (c) openCompany(+c.dataset.cid);
  });
}
