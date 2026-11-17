/* view.settings.js —— 设置 */
'use strict';

async function viewSettings(main) {
  main.innerHTML = `<div class="page">${skeletonList(2)}</div>`;
  const [st, meta, stats] = await Promise.all([api('/settings'), api('/meta'), api('/stats')]);
  S.settings = st;

  main.innerHTML = `<div class="page">
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(420px,1fr))">
      <div class="card stat">
        <h3>每日 BD 节奏</h3>
        <div class="field">
          <label>每天留给 BD 的时间</label>
          <div class="segmented" id="set-min">
            ${[30, 45, 60, 90, 120].map((m) => `<button data-m="${m}"
              class="${(+st.bd_minutes || 60) === m ? 'on' : ''}">${m} 分钟</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label>提醒时间（周二至周五，逗号分隔）</label>
          <input class="input" id="set-times" style="width:100%" value="${esc(st.remind_times || '11:30,13:00')}">
        </div>
        <div class="row">
          <button class="btn primary" data-save pacing>保存</button>
          <span class="grow"></span>
          <button class="btn" data-remind-install>${icon('clock', 'sm')} 注册系统提醒</button>
        </div>
        <div class="hint dim" style="font-size:11.5px;margin-top:9px;line-height:1.6">
          注册后由 Windows 计划任务在到点时弹窗，点一下直接开工作台。
        </div>
      </div>

      <div class="card stat">
        <h3>外观</h3>
        <div class="field">
          <label>主题</label>
          <div class="segmented" id="set-theme">
            <button data-t="light" class="${S.theme === 'light' ? 'on' : ''}">浅色</button>
            <button data-t="dark" class="${S.theme === 'dark' ? 'on' : ''}">深色</button>
          </div>
        </div>
        <div class="hr"></div>
        <h3 style="margin-bottom:8px">快捷键</h3>
        <div style="font-size:12.5px;line-height:2.1">
          <div class="row"><kbd>⌘K</kbd><span class="grow">命令面板 / 全局搜索</span></div>
          <div class="row"><kbd>G</kbd><span>+</span><kbd>T/B/C/I</kbd><span class="grow">跳到今日/看板/客户/洞察</span></div>
          <div class="row"><kbd>N</kbd><span class="grow">新建客户</span></div>
          <div class="row"><kbd>?</kbd><span class="grow">快捷键说明</span></div>
        </div>
      </div>

      <div class="card stat">
        <h3>数据</h3>
        <div style="font-size:12.5px;line-height:2">
          <div class="row"><span class="dim" style="width:76px">客户总数</span><b>${stats.total}</b></div>
          <div class="row"><span class="dim" style="width:76px">导入时间</span><span>${esc(st.imported_at || '—')}</span></div>
          <div class="row"><span class="dim" style="width:76px">导入来源</span><span class="trunc">${esc(st.import_source || '—')}</span></div>
          <div class="row"><span class="dim" style="width:76px">数据库</span><span class="mono">${esc(st.db_path || 'data\\crm.db')}</span></div>
          <div class="row"><span class="dim" style="width:76px">版本</span><span>${esc(st.version || '1.0')}</span></div>
        </div>
        <div class="row wrap" style="margin-top:12px">
          <a class="btn sm" href="/api/export?fmt=csv">${icon('download', 'sm')} 导出 CSV</a>
          <button class="btn sm" data-backup>${icon('copy', 'sm')} 备份数据库</button>
          ${st.has_seed
            ? '<button class="btn sm danger" data-reimport>重新导入种子表</button>'
            : '<button class="btn sm danger" disabled title="此版本不含种子表">重新导入种子表</button>'}
        </div>
      </div>

      <div class="card stat">
        <h3>关于</h3>
        <div class="dim" style="font-size:12.5px;line-height:1.85">
          本机运行，数据只存在本机 <span class="mono">data\\crm.db</span>，不上传任何服务器。<br>
          关闭黑窗口即停止服务；拷走整个文件夹就是完整备份。<br>
          <span style="display:block;margin-top:8px">代码：Python 标准库 + 原生 JS，零第三方依赖。</span>
        </div>
        <div class="hr"></div>
        <div class="row">
          <span class="dim" style="font-size:12.5px">版本 <b class="mono">${esc(st.version || '—')}</b></span>
          <span class="grow"></span>
          <button class="btn sm" data-check-update>${icon('refresh', 'sm')} 检查更新</button>
        </div>
      </div>
    </div>
  </div>`;

  $('#set-min').onclick = (e) => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    $$('#set-min button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    S.minutes = +b.dataset.m;
  };
  $('#set-theme').onclick = (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    $$('#set-theme button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    applyTheme(b.dataset.t);
  };
  $('[data-save]', main).onclick = async () => {
    await api('/settings', {
      method: 'POST',
      body: {
        bd_minutes: String(S.minutes),
        remind_times: $('#set-times', main).value.trim(),
      },
    });
    toast('已保存', 'ok');
  };
  $('[data-remind-install]', main).onclick = async () => {
    try {
      const r = await api('/reminders', { method: 'POST', body: {} });
      toast(r.message || '提醒已注册', 'ok');
    } catch (e) { toast('注册失败：' + e.message, 'bad'); }
  };
  $('[data-backup]', main).onclick = async () => {
    try {
      const r = await api('/backup', { method: 'POST', body: {} });
      toast('已备份到 ' + r.path, 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  };
  const cu = $('[data-check-update]', main);
  if (cu) cu.onclick = async () => {
    cu.disabled = true;
    cu.innerHTML = '检查中…';
    await checkUpdate(false);
    cu.disabled = false;
    cu.innerHTML = `${icon('refresh', 'sm')} 检查更新`;
    openUpdateDialog();
  };

  const reimportBtn = $('[data-reimport]', main);
  if (reimportBtn) reimportBtn.onclick = async () => {
    const ok = await confirmDlg({
      title: '重新导入', okText: '重新导入', danger: true,
      message: '会用 <b>data/seed.xlsx</b> 覆盖当前全部数据，手动记录也会丢失。<br>建议先导出 CSV 或备份数据库。',
    });
    if (!ok) return;
    try {
      const r = await api('/import', { method: 'POST', body: {} });
      toast(`已重新导入 ${r.companies} 家`, 'ok');
      render();
    } catch (e) { toast(e.message, 'bad'); }
  };
}
