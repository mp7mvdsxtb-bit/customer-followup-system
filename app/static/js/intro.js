/* ============================================================
   开场片头 · 10 个场景（Second cut）
   ------------------------------------------------------------
   这一版不是「同一个版式换背景」，而是 10 个不同的画面：
     1 信纸  2 日历  3 唱片  4 车窗  5 桌面
     6 星图  7 窗光  8 折纸  9 灯泡 10 磁带

   每个场景自己搭 DOM，交互也各不相同：
     滚动 / 撕 / 拨唱针 / 擦雾 / 掀便签 /
     移动带动视差 / 拉开窗帘 / 放走纸鹤 / 按开关 / 按播放键

   情话写死在场景里，因为每句要对得上画面。
   ============================================================ */
(function () {
  'use strict';

  const EPOCH = new Date(2026, 10, 17);
  const SNOOZE_KEY = 'crm-intro-snooze';

  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  function dayOffset() {
    const n = new Date();
    const a = new Date(EPOCH.getFullYear(), EPOCH.getMonth(), EPOCH.getDate());
    const b = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.floor((b - a) / 86400000);
  }

  /* 每个场景自带的情话 */
  const LOVE = {
    1: '今天第一个电话，想打给你',
    2: '日子一天天过，还好有你',
    3: '这首歌，单曲循环一整天',
    4: '下雨天，也想听听你的声音',
    5: '喝完这杯，就去打电话',
    6: '你是我今晚最亮的一颗',
    7: '天亮了，又是想你的一天',
    8: '愿你今天，事事顺心',
    9: '想到什么，就去做吧',
    10: 'A 面第一首，是给你的',
  };

  /* ============================================================
     1 · 信纸 —— 一封信，往下抽才看得全
     ============================================================ */
  function sLetter(ctx) {
    const { stage, name, sub, sign, still } = ctx;
    stage.innerHTML = `
      <div class="paper">
        <div class="stamp">✉</div>
        <div class="line salut">亲爱的 ${esc(name)}：</div>
        <div class="line"><h1 class="who">${esc(name)}</h1></div>
        <div class="line say">${esc(sub)}</div>
        <div class="line love">${esc(LOVE[1])}</div>
        <div class="line sign">${sign ? '—— ' + esc(sign) : ''}</div>
      </div>
      <div class="pull">↓ 往下拖，把信抽出来</div>`;

    const lines = [...stage.querySelectorAll('.line')];
    const paper = $('.paper', stage);

    if (still) {
      lines.forEach((l) => l.classList.add('in'));
      $('.pull', stage).style.display = 'none';
      return;
    }

    let shown = 0;
    const reveal = () => {
      if (shown < lines.length) {
        lines[shown++].classList.add('in');
        setTimeout(reveal, 520);
      } else {
        $('.pull', stage).style.opacity = '0';
        ctx.setTap(() => ctx.close());
        ctx.autoIn(3600);
      }
    };
    setTimeout(reveal, 420);

    // 拖动 / 滚动：信纸轻微跟随，营造「抽出来」的手感
    let base = 0, drag = null;
    const apply = (v) => {
      base = Math.max(-60, Math.min(70, v));
      paper.style.transform = `rotate(-1.4deg) translateY(${base}px)`;
    };
    const onWheel = (e) => apply(base - e.deltaY * 0.22);
    const onDown = (e) => { drag = e.clientY; };
    const onMove = (e) => { if (drag != null) apply(base + (e.clientY - drag) * 0.35); };
    const onUp = () => { drag = null; };
    stage.addEventListener('wheel', onWheel, { passive: true });
    stage.addEventListener('pointerdown', onDown);
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    ctx.autoIn(15000);
    return () => {
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('pointerdown', onDown);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
    };
  }

  /* ============================================================
     2 · 日历 —— 撕下今天这一页
     ============================================================ */
  function sCalendar(ctx) {
    const { root, stage, name, sub, still } = ctx;
    const d = new Date();
    const MON = ['一月', '二月', '三月', '四月', '五月', '六月',
      '七月', '八月', '九月', '十月', '十一月', '十二月'];
    const WD = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const day = String(d.getDate()).padStart(2, '0');

    stage.innerHTML = `
      <div class="cal">
        <div class="ring"><i></i><i></i><i></i><i></i></div>
        <div class="month">${MON[d.getMonth()]}</div>
        <div class="body">
          <div class="day">${day}</div>
          <div class="wd">${WD[d.getDay()]}</div>
          <div class="divider"></div>
          <div class="who">${esc(name)}</div>
          <div class="love">${esc(LOVE[2])}</div>
        </div>
        <div class="back">
          <div class="who">${esc(name)}</div>
          <div class="say">${esc(sub)}</div>
          <div class="love" style="margin-top:20px;color:#a08090;font-size:12.5px;letter-spacing:.16em">
            ${esc(LOVE[2])}</div>
        </div>
        <div class="flap">
          <div class="month">${MON[d.getMonth()]}</div>
          <div class="body">
            <div class="day">${day}</div>
            <div class="wd">${WD[d.getDay()]}</div>
            <div class="divider"></div>
            <div class="who">${esc(name)}</div>
            <div class="love">${esc(LOVE[2])}</div>
          </div>
        </div>
      </div>
      <div class="hint">点一下，撕下今天</div>`;

    if (still) {
      // 定格定格在「还没撕」的状态，日历原貌更完整
      $('.hint', stage).style.opacity = '0';
      return;
    }

    let torn = false;
    ctx.setTap(() => {
      if (!torn) {
        torn = true;
        root.classList.add('revealed');
        setTimeout(() => ctx.autoIn(4200), 900);
      } else {
        ctx.close();
      }
    });
    ctx.autoIn(15000);
  }

  /* ============================================================
     3 · 唱片 —— 拨下唱针
     ============================================================ */
  function sVinyl(ctx) {
    const { root, stage, name, sub, still } = ctx;
    stage.innerHTML = `
      <div class="deck">
        <div class="arm"></div>
        <div class="vinyl">
          <div class="label">
            <div class="txt">
              <div class="who">${esc(name)}</div>
              <div class="love">${esc(LOVE[3])}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="side">
        <div class="say">${esc(sub)}</div>
        <div class="who2">Side A · 33⅓ rpm</div>
      </div>
      <div class="hint">拨一下唱臂</div>`;

    if (still) {
      root.classList.add('spin');
      $('.hint', stage).style.opacity = '0';
      return;
    }

    let spun = false;
    const drop = () => {
      if (spun) { ctx.close(); return; }
      spun = true;
      root.classList.add('spin');
      setTimeout(() => ctx.autoIn(4600), 1400);
    };
    $('.arm', stage).addEventListener('click', (e) => { e.stopPropagation(); drop(); });
    ctx.setTap(drop);
    ctx.autoIn(15000);
  }

  /* ============================================================
     4 · 车窗 —— 擦开雾气
     ============================================================ */
  function sWindow(ctx) {
    const { root, stage, name, sub, still } = ctx;
    stage.innerHTML = `
      <div class="bg"></div>
      <div class="msg">
        <div class="who">${esc(name)}</div>
        <div class="love">${esc(LOVE[4])}</div>
        <div class="say">${esc(sub)}</div>
      </div>
      <div class="drops">${Array.from({ length: 46 }, () => {
        const h = 12 + Math.random() * 22;
        return `<i style="left:${(Math.random() * 100).toFixed(2)}%;
          height:${h.toFixed(0)}px;opacity:${(0.18 + Math.random() * 0.5).toFixed(2)};
          animation-duration:${(1.1 + Math.random() * 1.8).toFixed(2)}s;
          animation-delay:${(-Math.random() * 3).toFixed(2)}s"></i>`;
      }).join('')}</div>
      <div class="glass"></div>
      <div class="fog"></div>
      <div class="hint">在玻璃上擦一擦</div>`;

    if (still) {
      root.style.setProperty('--r', '420px');
      root.classList.add('revealed');
      $('.hint', stage).style.opacity = '0';
      return;
    }

    let r = 0, target = 0, raf = 0, done = false, acc = 0, lastX = 0, lastY = 0, has = false;
    const tick = () => {
      r += (target - r) * 0.16;
      root.style.setProperty('--r', r.toFixed(1) + 'px');
      if (r > 300 && !done) {
        done = true;
        root.classList.add('revealed');
        ctx.setTap(() => ctx.close());
        ctx.autoIn(3600);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();

    const move = (x, y) => {
      root.style.setProperty('--mx', x + 'px');
      root.style.setProperty('--my', y + 'px');
      if (has) acc += Math.hypot(x - lastX, y - lastY);
      lastX = x; lastY = y; has = true;
      target = Math.min(520, 90 + acc * 0.9);
    };
    const onMove = (e) => move(e.clientX, e.clientY);
    const onTouch = (e) => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY); };
    addEventListener('mousemove', onMove);
    addEventListener('touchmove', onTouch, { passive: true });
    ctx.autoIn(18000);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('mousemove', onMove);
      removeEventListener('touchmove', onTouch);
    };
  }

  /* ============================================================
     5 · 桌面 —— 掀开便签
     ============================================================ */
  function sDesk(ctx) {
    const { root, stage, name, sub, sign, still } = ctx;
    stage.innerHTML = `
      <div class="table">
        <div class="pencil"></div>
        <div class="cup">
          <div class="steam"></div>
          <div class="body"><div class="coffee"></div></div>
          <div class="handle"></div>
        </div>
        <div class="note">
          <div class="who">${esc(name)}</div>
          <div class="hr"></div>
          <div class="say">${esc(sub)}</div>
          <div class="love">${esc(LOVE[5])}</div>
          <div class="say" style="margin-top:14px;color:#9b8b76;font-size:11.5px">
            ${sign ? '—— ' + esc(sign) : ''}</div>
        </div>
      </div>
      <div class="hint">点便签</div>`;

    if (still) {
      root.classList.add('lifted');
      $('.hint', stage).style.opacity = '0';
      return;
    }

    let lifted = false;
    const lift = () => {
      if (lifted) { ctx.close(); return; }
      lifted = true;
      root.classList.add('lifted');
      setTimeout(() => ctx.autoIn(4400), 900);
    };
    $('.note', stage).addEventListener('click', (e) => { e.stopPropagation(); lift(); });
    ctx.setTap(lift);
    ctx.autoIn(15000);
  }

  /* ============================================================
     6 · 星图 —— 星座连线，鼠标带动视差
     ============================================================ */
  function sStar(ctx) {
    const { stage, name, sub, still } = ctx;
    const stars = Array.from({ length: 90 }, () => {
      const s = (0.8 + Math.random() * 1.9).toFixed(1);
      return `<i style="left:${(Math.random() * 100).toFixed(2)}%;
        top:${(Math.random() * 100).toFixed(2)}%;width:${s}px;height:${s}px;
        animation-delay:${(-Math.random() * 3.6).toFixed(2)}s"></i>`;
    }).join('');

    const pts = [[12, 68], [26, 46], [40, 58], [52, 34], [66, 44], [78, 26], [88, 38]];
    const dPath = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');

    stage.innerHTML = `
      <div class="sky">
        <div class="stars">${stars}</div>
        <div class="const">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="${dPath}"/>
          </svg>
        </div>
      </div>
      <div class="msg">
        <div class="who">${esc(name)}</div>
        <div class="love">${esc(LOVE[6])}</div>
        <div class="say">${esc(sub)}</div>
      </div>
      <div class="hint">动一动鼠标</div>`;

    if (still) return;

    const sky = $('.sky', stage);
    const onMove = (e) => {
      const dx = (e.clientX / innerWidth - 0.5) * -22;
      const dy = (e.clientY / innerHeight - 0.5) * -16;
      sky.style.transform = `translate(${dx}px,${dy}px)`;
    };
    addEventListener('mousemove', onMove);
    ctx.autoIn(13000);
    return () => removeEventListener('mousemove', onMove);
  }

  /* ============================================================
     7 · 窗光 —— 晨光里的剪影
     ============================================================ */
  function sMorning(ctx) {
    const { root, stage, name, still } = ctx;
    stage.innerHTML = `
      <div class="room"></div>
      <div class="win"></div>
      <div class="beam"></div>
      <div class="msg">
        <div class="who">${esc(name)}</div>
        <div class="love">${esc(LOVE[7])}</div>
      </div>
      <div class="figure">
        <i class="head"></i><i class="torso"></i><i class="legs"></i>
      </div>
      <div class="hint">点一下，把光放进来</div>`;

    if (still) {
      root.classList.add('open');
      $('.hint', stage).style.opacity = '0';
      return;
    }
    let opened = false;
    const open = () => {
      if (opened) { ctx.close(); return; }
      opened = true;
      root.classList.add('open');
      setTimeout(() => ctx.autoIn(4600), 1100);
    };
    ctx.setTap(open);
    ctx.autoIn(15000);
  }

  /* ============================================================
     8 · 折纸 —— 放走一只纸鹤
     ============================================================ */
  function sOrigami(ctx) {
    const { root, stage, name, sub, still } = ctx;
    stage.innerHTML = `
      <div class="shard a"></div><div class="shard b"></div>
      <div class="shard c"></div><div class="shard d"></div>
      <div class="msg">
        <div class="who">${esc(name)}</div>
        <div class="love">${esc(LOVE[8])}</div>
        <div class="say">${esc(sub)}</div>
      </div>
      <div class="crane">
        <svg viewBox="0 0 120 120">
          <polygon points="60,54 96,30 84,70" fill="#ff8a5c"/>
          <polygon points="60,54 84,70 60,84" fill="#f2622e"/>
          <polygon points="60,54 60,84 30,76" fill="#ffd166"/>
          <polygon points="60,54 30,76 24,42" fill="#f4b93e"/>
          <polygon points="60,54 24,42 54,26" fill="#ff9a70"/>
          <polygon points="60,54 54,26 96,30" fill="#ffb08a"/>
          <polygon points="96,30 78,16 60,54" fill="#ffd166" opacity=".92"/>
        </svg>
      </div>
      <div class="hint">点一下纸鹤</div>`;

    if (still) {
      root.classList.add('flew');
      $('.crane', stage).style.display = 'none';
      $('.hint', stage).style.opacity = '0';
      return;
    }

    let flew = false;
    const fly = () => {
      if (flew) { ctx.close(); return; }
      flew = true;
      root.classList.add('flew');
      setTimeout(() => ctx.autoIn(4400), 1500);
    };
    $('.crane', stage).addEventListener('click', (e) => { e.stopPropagation(); fly(); });
    ctx.setTap(fly);
    ctx.autoIn(15000);
  }

  /* ============================================================
     9 · 灯泡 —— 按开关
     ============================================================ */
  function sBulb(ctx) {
    const { root, stage, name, still } = ctx;
    stage.innerHTML = `
      <div class="switch"></div>
      <div class="glow"></div>
      <div class="bulb">
        <div class="glass"><div class="filament"></div></div>
        <div class="base"></div>
      </div>
      <div class="msg">
        <div class="who">${esc(name)}</div>
        <div class="love">${esc(LOVE[9])}</div>
      </div>
      <div class="hint">按一下灯泡</div>`;

    if (still) {
      root.classList.add('on');
      $('.hint', stage).style.opacity = '0';
      return;
    }

    let on = false, lit = false;
    const toggle = () => {
      on = !on;
      root.classList.toggle('on', on);
      if (on && !lit) {
        lit = true;
        setTimeout(() => ctx.autoIn(6200), 800);
      }
      ctx.setTap(on ? () => ctx.close() : toggle);
    };
    $('.bulb', stage).addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    ctx.setTap(toggle);
    ctx.autoIn(16000);
  }

  /* ============================================================
     10 · 磁带 —— 按下播放键
     ============================================================ */
  function sTape(ctx) {
    const { root, stage, name, sub, sign, still } = ctx;
    stage.innerHTML = `
      <div class="tape">
        <div class="label">
          <div class="win">
            <div class="reel l"></div>
            <div class="reel r"></div>
          </div>
          <div class="who">${esc(name)}
            <small>SIDE A · ${esc(sub || '')}</small>
          </div>
        </div>
      </div>
      <div class="btnrow">
        <div class="pkey">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
        <div class="pkey" style="opacity:.45">
          <svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        </div>
      </div>
      <div class="msg">
        <div class="love">${esc(LOVE[10])}</div>
        <div class="say">${sign ? '—— ' + esc(sign) : esc(sub || '')}</div>
      </div>
      <div class="hint">按播放键</div>`;

    if (still) {
      root.classList.add('playing');
      $('.hint', stage).style.opacity = '0';
      return;
    }

    let playing = false;
    const play = () => {
      if (playing) { ctx.close(); return; }
      playing = true;
      root.classList.add('playing');
      setTimeout(() => ctx.autoIn(5200), 1500);
    };
    $('.pkey', stage).addEventListener('click', (e) => { e.stopPropagation(); play(); });
    ctx.setTap(play);
    ctx.autoIn(15000);
  }

  /* ---------- 注册表 ---------- */
  const SCENES = [
    { k: 'letter', label: '信纸', build: sLetter },
    { k: 'calendar', label: '日历', build: sCalendar },
    { k: 'vinyl', label: '唱片', build: sVinyl },
    { k: 'window', label: '车窗', build: sWindow },
    { k: 'desk', label: '桌面', build: sDesk },
    { k: 'star', label: '星图', build: sStar },
    { k: 'morning', label: '窗光', build: sMorning },
    { k: 'origami', label: '折纸', build: sOrigami },
    { k: 'bulb', label: '灯泡', build: sBulb },
    { k: 'tape', label: '磁带', build: sTape },
  ];
  window.INTRO_SCENES = SCENES.map((s, i) => ({ no: i + 1, key: s.k, label: s.label }));

  function pickScene(opts) {
    const n = SCENES.length;
    if (opts.scene && +opts.scene >= 1 && +opts.scene <= n) return +opts.scene;
    const st = (window.S && S.settings) || {};
    const fixed = st.intro_scene;
    if (fixed && fixed !== 'auto' && +fixed >= 1 && +fixed <= n) return +fixed;
    return ((dayOffset() % n) + n) % n + 1;
  }

  function introWanted() {
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    const iq = q.get('intro');
    if (iq === '0' || iq === 'off') return false;
    if (iq) return true;
    const until = +(localStorage.getItem(SNOOZE_KEY) || 0);
    if (until > Date.now()) return false;
    return true;
  }

  /* ---------- 主流程 ---------- */
  function playIntro(opts) {
    opts = opts || {};
    const no = pickScene(opts);
    const scene = SCENES[no - 1];
    const still = !!opts.still;

    const root = document.createElement('div');
    // s1/s2… 是各场景样式的作用域前缀，漏了它整套样式都不生效
    root.className = 'intro stage-wrap s' + no;
    root.dataset.scene = String(no);
    if (still) root.classList.add('still');
    root.innerHTML = `
      <div class="stage"></div>
      <div class="i-bar">
        <button type="button" data-no-snooze>今天不再显示</button>
        <button type="button" data-skip>跳过</button>
      </div>
      <div class="i-tag">${no} / 10 · ${scene.label}</div>`;

    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';

    let closed = false;
    const cleans = [];
    const finish = () => {
      if (closed) return;
      closed = true;
      root.classList.add('out');
      document.body.style.overflow = '';
      cleans.forEach((f) => { try { f(); } catch (e) {} });
      setTimeout(() => root.remove(), 900);
      if (still) document.documentElement.dataset.introDone = '1';
    };

    let tapFn = finish;
    const ctx = {
      root,
      stage: $('.stage', root),
      name: (opts.name || '').trim() || '你',
      sub: (opts.sub || '').trim(),
      note: (opts.note || '').trim(),
      sign: (opts.sign || '').trim(),
      still,
      close: finish,
      setTap(fn) { tapFn = fn || finish; },
      autoIn(ms) { if (!still) setTimeout(finish, ms); },
    };

    try {
      const off = scene.build(ctx);
      if (typeof off === 'function') cleans.push(off);
    } catch (err) {
      console.error('开场场景出错，直接放行', err);
      finish();
      return;
    }

    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-skip],[data-no-snooze]')) return;
      tapFn();
    });

    const onKey = (e) => {
      if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); finish(); }
    };
    addEventListener('keydown', onKey);
    cleans.push(() => removeEventListener('keydown', onKey));

    $('[data-skip]', root).addEventListener('click', (e) => { e.stopPropagation(); finish(); });
    $('[data-no-snooze]', root).addEventListener('click', (e) => {
      e.stopPropagation();
      const t = new Date(); t.setHours(24, 0, 0, 0);
      localStorage.setItem(SNOOZE_KEY, String(t.getTime()));
      finish();
    });

    return root;
  }

  window.playIntro = playIntro;
  window.introWanted = introWanted;
  window.INTRO_TODAY = () => pickScene({});
})();
