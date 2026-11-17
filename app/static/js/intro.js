/* ============================================================
   开场片头 · 10 个场景，按天轮换
   ------------------------------------------------------------
   规则：
   - 每次打开都播（除非设置里关掉，或点了「今天不再显示」）
   - 第 N 天用第 N 个场景，10 天一个循环
   - 设置里可以固定某一个场景，URL ?intro=场景号 也能强制
   - 10 个场景的视觉和交互都不一样，具体见每个 build 函数
   ============================================================ */
(function () {
  'use strict';

  // 第 1 天 = 2026-11-17，从这天起按自然日轮换
  const EPOCH = new Date(2026, 10, 17);
  const SNOOZE_KEY = 'crm-intro-snooze';

  /* ---------- 工具 ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function splitChars(node, text) {
    node.innerHTML = '';
    return [...text].map((ch, i) => {
      const s = el('span', '', ch === ' ' ? '\u00a0' : ch);
      s.style.transitionDelay = (0.1 + i * 0.1).toFixed(2) + 's';
      node.appendChild(s);
      return s;
    });
  }

  function dpr() {
    return Math.min(window.devicePixelRatio || 1, 2);
  }

  function fitCanvas(cv) {
    const r = dpr();
    cv.width = Math.floor(innerWidth * r);
    cv.height = Math.floor(innerHeight * r);
    cv.style.width = innerWidth + 'px';
    cv.style.height = innerHeight + 'px';
    const c = cv.getContext('2d');
    c.setTransform(r, 0, 0, r, 0, 0);
    return c;
  }

  /* ---------- 日期 → 场景号 ---------- */
  function dayOffset() {
    const n = new Date();
    const a = new Date(EPOCH.getFullYear(), EPOCH.getMonth(), EPOCH.getDate());
    const b = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.floor((b - a) / 86400000);
  }

  function pickScene(opts) {
    const n = SCENES.length;
    if (opts.scene && +opts.scene >= 1 && +opts.scene <= n) return +opts.scene;
    const st = (window.S && S.settings) || {};
    const fixed = st.intro_scene;
    if (fixed && fixed !== 'auto' && +fixed >= 1 && +fixed <= n) return +fixed;
    // JS 取模对负数不友好，加个大数再取
    return ((dayOffset() % n) + n) % n + 1;
  }

  /* ---------- 是否播放 ---------- */
  function introWanted() {
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    const iq = q.get('intro');
    if (iq === '0' || iq === 'off') return false;
    if (iq) return true;                       // 1 / still / 数字，强制
    const until = +(localStorage.getItem(SNOOZE_KEY) || 0);
    if (until > Date.now()) return false;      // 点了「今天不再显示」
    return true;                               // 每次打开都播
  }

  /* ============================================================
     场景 1 · 逐字浮现
     交互：点击任意处进入
     ============================================================ */
  function sRise(ctx) {
    const { root, nameEl, subEl, noteEl, footEl, eyebrowEl, still } = ctx;
    root.classList.add('s1');

    // 背景光点
    const cv = el('canvas', 'i-canvas');
    root.appendChild(cv);
    let raf = 0, dots = [], c = fitCanvas(cv);
    const init = () => {
      c = fitCanvas(cv);
      dots = Array.from({ length: 46 }, () => ({
        x: Math.random() * innerWidth, y: Math.random() * innerHeight,
        r: Math.random() * 1.9 + 0.7, s: Math.random() * 0.16 + 0.04,
        a: Math.random() * 0.36 + 0.12, d: Math.random() * Math.PI * 2,
      }));
    };
    init();
    const loop = () => {
      c.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of dots) {
        p.d += 0.011; p.y -= p.s;
        if (p.y < -12) { p.y = innerHeight + 12; p.x = Math.random() * innerWidth; }
        const a = p.a * (0.6 + 0.4 * Math.sin(p.d));
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
        g.addColorStop(0, `rgba(255,205,228,${a})`);
        g.addColorStop(1, 'rgba(255,205,228,0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(p.x, p.y, p.r * 5, 0, 7); c.fill();
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    addEventListener('resize', init);

    const spans = [...nameEl.querySelectorAll('span')];
    if (!spans.length) splitChars(nameEl, ctx.name || '你好');
    const rule = el('div', 'i-rule');
    nameEl.after(rule);

    if (still) {
      spans.forEach((s) => s.classList.add('in'));
      rule.classList.add('in');
      [subEl, noteEl, footEl, eyebrowEl].forEach((n) => n && n.classList.add('in'));
    } else {
      setTimeout(() => eyebrowEl && eyebrowEl.classList.add('in'), 120);
      setTimeout(() => spans.forEach((s) => s.classList.add('in')), 380);
      setTimeout(() => rule.classList.add('in'), 380 + spans.length * 100 + 220);
      setTimeout(() => subEl.classList.add('in'), 1200 + spans.length * 90);
      setTimeout(() => noteEl.classList.add('in'), 1650 + spans.length * 90);
      setTimeout(() => footEl.classList.add('in'), 2150 + spans.length * 90);
    }

    return () => { cancelAnimationFrame(raf); removeEventListener('resize', init); };
  }

  /* ============================================================
     场景 2 · 打字机
     交互：点击/按键加速；打完自动进入
     ============================================================ */
  function sType(ctx) {
    const { root, still } = ctx;
    root.classList.add('s2');
    $('.i-content', root).innerHTML = '';

    const term = el('div', 'term');
    term.innerHTML = `<div class="tl"><i></i><i></i><i></i></div>`;
    const line = el('div', 'line');
    const cur = el('span', 'cursor');
    line.appendChild(cur);
    term.appendChild(line);
    $('.i-content', root).appendChild(term);

    const lines = [
      '› 正在载入 ' + (ctx.name || '你的') + ' 的工作台…',
      '',
      '  今日待跟进：已排好队',
      '  昨天记住的，今天都还在',
      '',
      '› ' + (ctx.sub || '欢迎回来') + ' _',
    ];
    const full = lines.join('\n');

    if (still) {
      line.textContent = full;
      const tip = el('div', 'i-fade in', '<div class="i-hint">点击进入</div>');
      tip.style.marginTop = '16px';
      term.appendChild(tip);
      return;
    }

    let i = 0, speed = 42, accel = false, timer = 0;
    ctx.setTap(() => { accel = true; });
    const tick = () => {
      if (i >= full.length) {
        setTimeout(() => ctx.setTap(() => ctx.close()), 420);
        ctx.autoIn(2600);
        return;
      }
      i++;
      line.textContent = full.slice(0, i);
      line.appendChild(cur);
      timer = setTimeout(tick, accel ? 12 : speed + Math.random() * 22);
    };
    tick();
    ctx.autoIn(11000);
    return () => clearTimeout(timer);
  }

  /* ============================================================
     场景 3 · 双幕拉开
     交互：第一次点击拉幕，第二次点击进入
     ============================================================ */
  function sCurtain(ctx) {
    const { root, still, nameEl, subEl } = ctx;
    root.classList.add('s3');
    const l = el('div', 'curtain l');
    const r = el('div', 'curtain r');
    const pull = el('div', 'pull', '点一下，把幕布拉开');
    root.append(l, r, pull);

    if (still) { root.classList.add('open'); return; }

    let opened = false;
    ctx.setTap(() => {
      if (!opened) {
        opened = true;
        root.classList.add('open');
        ctx.autoIn(3400);
        setTimeout(() => ctx.setTap(() => ctx.close()), 1400);
      }
    });
    ctx.autoIn(14000);
  }

  /* ============================================================
     场景 4 · 粒子聚拢
     交互：鼠标移动吹散，松手重新聚拢
     ============================================================ */
  function sParticle(ctx) {
    const { root, still, nameEl } = ctx;
    root.classList.add('s4');
    const cv = el('canvas', 'i-canvas');
    root.prepend(cv);
    let c = fitCanvas(cv);
    let raf = 0, ps = [];

    const build = () => {
      c = fitCanvas(cv);
      // 离屏画文字，采样成目标点
      const off = document.createElement('canvas');
      off.width = innerWidth; off.height = innerHeight;
      const oc = off.getContext('2d');
      oc.fillStyle = '#fff';
      oc.textAlign = 'center';
      oc.textBaseline = 'middle';
      const fs = Math.min(innerWidth * 0.14, 108);
      oc.font = `400 ${fs}px "Kaiti SC","STKaiti","KaiTi","楷体",serif`;
      oc.fillText(ctx.name || '你好', innerWidth / 2, innerHeight / 2 - 26);

      const data = oc.getImageData(0, 0, off.width, off.height).data;
      const step = 3, pts = [];
      for (let y = 0; y < off.height; y += step) {
        for (let x = 0; x < off.width; x += step) {
          if (data[(y * off.width + x) * 4 + 3] > 110) pts.push([x, y]);
        }
      }
      // 限制数量，机器性能一般
      const max = 3400;
      const use = pts.length > max ? pts.filter((_, i) => i % Math.ceil(pts.length / max) === 0) : pts;
      ps = use.map(([tx, ty]) => ({
        tx, ty,
        x: tx + (Math.random() - 0.5) * innerWidth * 1.5,
        y: ty + (Math.random() - 0.5) * innerHeight * 1.5,
        vx: 0, vy: 0, s: Math.random() * 1.1 + 0.5,
      }));
    };
    build();

    const mouse = { x: -9999, y: -9999 };
    const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };
    addEventListener('mousemove', onMove);
    addEventListener('mouseleave', onLeave);

    let formed = false;
    let fade = 0;              // 成形后粒子淡出、真文字接管，字才认得清
    const loop = () => {
      c.clearRect(0, 0, innerWidth, innerHeight);
      c.fillStyle = 'rgba(122,162,255,.9)';
      c.globalAlpha = formed ? Math.max(0.16, 1 - fade) : 1;
      let close = 0;
      for (const p of ps) {
        // 目标吸附
        p.vx += (p.tx - p.x) * 0.055;
        p.vy += (p.ty - p.y) * 0.055;
        // 鼠标斥力
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 26000 && d2 > 0.01) {
          const f = (26000 - d2) / 26000 * 2.6;
          const d = Math.sqrt(d2);
          p.vx += (dx / d) * f; p.vy += (dy / d) * f;
        }
        p.vx *= 0.88; p.vy *= 0.88;
        p.x += p.vx; p.y += p.vy;
        if (Math.abs(p.x - p.tx) < 6 && Math.abs(p.y - p.ty) < 6) close++;
        c.fillRect(p.x, p.y, p.s, p.s);
      }
      if (formed) { fade = Math.min(1, fade + 0.012); }
      if (!formed && close > ps.length * 0.7) {
        formed = true;
        root.classList.add('formed');
        nameEl.style.visibility = '';
        nameEl.style.opacity = '1';
        ctx.autoIn(4200);
      }
      raf = requestAnimationFrame(loop);
    };
    nameEl.style.opacity = '0';
    nameEl.style.transition = 'opacity 1s ease';

    if (still) {
      ps.forEach((p) => { p.x = p.tx; p.y = p.ty; });
      root.classList.add('formed');
      nameEl.style.visibility = '';
      nameEl.style.opacity = '1';
      let fr = 0;
      const stillLoop = () => {
        c.clearRect(0, 0, innerWidth, innerHeight);
        c.fillStyle = 'rgba(122,162,255,.55)';
        c.globalAlpha = 0.3;   // 定格时保留一层微光粒子
        for (const p of ps) c.fillRect(p.x, p.y, p.s, p.s);
        c.globalAlpha = 1;
        if (fr++ < 60) raf = requestAnimationFrame(stillLoop);
      };
      stillLoop();
    } else {
      setTimeout(() => loop(), 260);
      ctx.autoIn(12000);
    }

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('mousemove', onMove);
      removeEventListener('mouseleave', onLeave);
    };
  }

  /* ============================================================
     场景 5 · 光束扫过
     交互：点击加速光束
     ============================================================ */
  function sBeam(ctx) {
    const { root, still } = ctx;
    root.classList.add('s5');
    const content = $('.i-content', root);
    const html = content.innerHTML;
    content.innerHTML = `<div class="stage"><div class="dim">${html}</div>
      <div class="lit">${html}</div><div class="beam"></div></div>`;

    if (still) {
      $('.beam', root).style.display = 'none';
      root.style.setProperty('--x', '0%');
      $('.lit', root).style.setProperty('clip-path', 'none');
      root.classList.add('done');
      return;
    }

    const beam = $('.beam', root);
    root.style.setProperty('--x', '0%');
    let x = -140, speed = 2.2, raf = 0, done = false;
    ctx.setTap(() => { speed = 11; });
    const loop = () => {
      x += speed;
      beam.style.transform = `translateX(${x}px)`;
      root.style.setProperty('--x', Math.max(0, Math.min(100, (x / innerWidth) * 100)) + '%');
      if (x > innerWidth + 140 && !done) {
        done = true;
        beam.style.opacity = '0';
        root.classList.add('done');
        ctx.setTap(() => ctx.close());
        ctx.autoIn(2200);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    ctx.autoIn(11000);
    return () => cancelAnimationFrame(raf);
  }

  /* ============================================================
     场景 6 · 翻转卡片
     交互：点击卡片翻面，再点进入
     ============================================================ */
  function sCard(ctx) {
    const { root, still } = ctx;
    root.classList.add('s6');
    const content = $('.i-content', root);
    content.innerHTML = `
      <div class="flip">
        <div class="card3d">
          <div class="face front">
            <div class="seal">启</div>
            <div class="cardtip">点一下</div>
          </div>
          <div class="face back">
            <div class="i-eyebrow" style="margin-bottom:14px">
              <em>FOR</em>${escapeHtml(ctx.name || '你')}</div>
            <div class="i-name" style="font-size:clamp(34px,6vw,62px)">${splitCharsSafe(ctx.name || '你好')}</div>
            <div class="i-sub" style="margin-top:18px;font-size:14px">${escapeHtml(ctx.sub || '欢迎回来')}</div>
          </div>
        </div>
      </div>`;

    const flip = $('.flip', root);
    flip.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!root.classList.contains('flipped')) {
        root.classList.add('flipped');
        setTimeout(() => ctx.setTap(() => ctx.close()), 1200);
        ctx.autoIn(5200);
      } else {
        ctx.close();
      }
    });
    if (still) { root.classList.add('flipped'); }
    ctx.autoIn(13000);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
  function splitCharsSafe(s) {
    return [...String(s)].map((c) => `<span>${escapeHtml(c)}</span>`).join('');
  }

  /* ============================================================
     场景 7 · 水墨
     交互：长按（或移动鼠标）让墨迹扩散
     ============================================================ */
  function sInk(ctx) {
    const { root, still, nameEl } = ctx;
    root.classList.add('s7');
    const hint = el('div', 'inkhint', '按住，让墨散开');
    $('.i-content', root).appendChild(hint);

    if (still) {
      root.style.setProperty('--r', '600px');
      root.classList.add('revealed');
      return;
    }

    let r = 0, holding = false, raf = 0, done = false;
    root.style.setProperty('--r', '0px');
    const grow = () => {
      if (holding && r < 900) r += 7;
      if (!holding && r > 90) r -= 2.2;          // 松手慢慢收
      root.style.setProperty('--r', r.toFixed(0) + 'px');
      if (r > 420 && !done) {
        done = true;
        root.classList.add('revealed');
        ctx.autoIn(2600);
      }
      raf = requestAnimationFrame(grow);
    };
    grow();

    const down = (e) => {
      holding = true;
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      root.style.setProperty('--mx', x + 'px');
      root.style.setProperty('--my', y + 'px');
    };
    const up = () => { holding = false; };
    root.addEventListener('mousedown', down);
    root.addEventListener('touchstart', down, { passive: true });
    root.addEventListener('mousemove', (e) => {
      if (!holding) {
        root.style.setProperty('--mx', e.clientX + 'px');
        root.style.setProperty('--my', e.clientY + 'px');
      }
    });
    addEventListener('mouseup', up);
    addEventListener('touchend', up);

    ctx.autoIn(14000);
    return () => cancelAnimationFrame(raf);
  }

  /* ============================================================
     场景 8 · 数字雨
     交互：滚轮加速
     ============================================================ */
  function sRain(ctx) {
    const { root, still } = ctx;
    root.classList.add('s8');
    const cv = el('canvas', 'i-canvas');
    root.prepend(cv);
    let c = fitCanvas(cv), raf = 0, cols = [], drops = [];

    const CHARS = 'アイウエオカキクケコサシスセソタチツテト0123456789ABCDEF<>{}[]/*+=';
    const setup = () => {
      c = fitCanvas(cv);
      const fs = 15, n = Math.floor(innerWidth / fs);
      drops = Array.from({ length: n }, () => Math.random() * -innerHeight);
      cols = [];
    };
    setup();
    addEventListener('resize', setup);

    let speed = 1;
    const onWheel = (e) => { speed = Math.min(6, speed + Math.abs(e.deltaY) * 0.004); };
    addEventListener('wheel', onWheel, { passive: true });

    if (still) root.classList.add('ready');

    let acc = 0;
    const loop = () => {
      // 半透明黑覆盖，形成拖尾
      c.fillStyle = 'rgba(4,7,10,.09)';
      c.fillRect(0, 0, innerWidth, innerHeight);
      c.font = '15px ui-monospace,monospace';
      acc += speed;
      if (acc > 0.5) {
        acc = 0;
        for (let i = 0; i < drops.length; i++) {
          const x = i * 15, y = drops[i];
          const ch = CHARS[(Math.random() * CHARS.length) | 0];
          c.fillStyle = Math.random() > 0.985 ? 'rgba(190,245,255,.95)' : 'rgba(53,214,255,.55)';
          c.fillText(ch, x, y);
          drops[i] += 15 * speed * 0.55;
          if (drops[i] > innerHeight && Math.random() > 0.972) drops[i] = 0;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    loop();

    if (!still) setTimeout(() => root.classList.add('ready'), 1500);
    ctx.autoIn(10000);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('wheel', onWheel);
    };
  }

  /* ============================================================
     场景 9 · 呼吸光团
     交互：鼠标靠近时光团跟过来
     ============================================================ */
  function sOrb(ctx) {
    const { root, still } = ctx;
    root.classList.add('s9');
    const orb = el('div', 'orb');
    const orb2 = el('div', 'orb2');
    root.prepend(orb2);
    root.prepend(orb);

    const place = (x, y) => {
      orb.style.transform = `translate(${x - innerWidth / 2}px, ${y - innerHeight / 2}px)`;
      orb2.style.transform = `translate(${(x - innerWidth / 2) * 0.6}px, ${(y - innerHeight / 2) * 0.6}px)`;
    };
    place(innerWidth / 2, innerHeight / 2);
    const onMove = (e) => place(e.clientX, e.clientY);
    addEventListener('mousemove', onMove);

    setTimeout(() => root.classList.add('in'), still ? 0 : 420);
    ctx.autoIn(9500);
    return () => removeEventListener('mousemove', onMove);
  }

  /* ============================================================
     场景 10 · 胶片
     交互：无（自动播放，5.5 秒后曝光闪白进入）
     ============================================================ */
  function sFilm(ctx) {
    const { root, still } = ctx;
    root.classList.add('s10');
    root.append(el('div', 'grain'), el('div', 'bars'), el('div', 'vignette'), el('div', 'flash'));

    if (still) {
      root.classList.add('in');
      return;
    }
    setTimeout(() => root.classList.add('in'), 220);
    setTimeout(() => {
      root.classList.add('flash');
      setTimeout(() => ctx.close(), 380);
    }, 5400);
  }

  /* ---------- 注册表 ---------- */
  const SCENES = [
    { k: 'rise', label: '逐字浮现', build: sRise },
    { k: 'type', label: '打字机', build: sType },
    { k: 'curtain', label: '双幕拉开', build: sCurtain },
    { k: 'particle', label: '粒子聚拢', build: sParticle },
    { k: 'beam', label: '光束扫过', build: sBeam },
    { k: 'card', label: '翻转卡片', build: sCard },
    { k: 'ink', label: '水墨', build: sInk },
    { k: 'rain', label: '数字雨', build: sRain },
    { k: 'orb', label: '呼吸光团', build: sOrb },
    { k: 'film', label: '胶片', build: sFilm },
  ];
  window.INTRO_SCENES = SCENES.map((s, i) => ({ no: i + 1, key: s.k, label: s.label }));

  /* ---------- 主流程 ---------- */
  function playIntro(opts) {
    opts = opts || {};
    const no = pickScene(opts);
    const scene = SCENES[no - 1];
    const still = !!opts.still;
    const q = new URLSearchParams(location.hash.split('?')[1] || '');

    const root = el('div', 'intro');
    root.dataset.scene = String(no);
    if (still) root.classList.add('still');
    // 配色由每个场景自己的 CSS 定义，这里不要覆盖 --i-text / --i-dim

    root.innerHTML = `
      <div class="i-content">
        <div class="i-eyebrow"><em>FOR</em>${escapeHtml(opts.name || '你')}</div>
        <h1 class="i-name"></h1>
        <p class="i-sub">${escapeHtml(opts.sub || '欢迎来到你的客户系统')}</p>
        <p class="i-note">${escapeHtml(opts.note || '')}<span class="i-heart">${
          '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.8-9.4-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.4 12c-1.9 4.2-9.4 9-9.4 9z"/></svg>'
        }</span></p>
      </div>
      <div class="i-foot">
        <div class="i-sign">${opts.sign ? '— ' + escapeHtml(opts.sign) : ''}</div>
        <div class="i-hint">點擊任意處進入</div>
      </div>
      <div class="i-bar">
        <button type="button" data-no-snooze>今天不再显示</button>
        <button type="button" data-skip>跳过</button>
      </div>
      <div class="i-scene-tag">${no} / 10 · ${scene.label}</div>`;

    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';

    const nameEl = $('.i-name', root);
    const subEl = $('.i-sub', root);
    const noteEl = $('.i-note', root);
    const footEl = $('.i-foot', root);
    const eyebrowEl = $('.i-eyebrow', root);

    // 名字先填好，各场景直接拿来用（场景 1 会重新切一次以加延迟）
    splitChars(nameEl, opts.name || '你好');

    let closed = false;
    const cleanupFns = [];

    const finish = () => {
      if (closed) return;
      closed = true;
      root.classList.add('out');
      document.body.style.overflow = '';
      cleanupFns.forEach((f) => { try { f(); } catch (e) {} });
      setTimeout(() => root.remove(), 850);
      if (still) {
        // 截图模式：不自动跳转，留个标记
        document.documentElement.dataset.introDone = '1';
      }
    };

    // 场景可以接管「点击」行为
    let tapFn = finish;
    const ctx = {
      root, nameEl, subEl, noteEl, footEl, eyebrowEl, name: opts.name, sub: opts.sub,
      still,
      close: finish,
      setTap(fn) { tapFn = fn || finish; },
      autoIn(ms) { if (!still) setTimeout(finish, ms); },
    };

    try {
      const off = scene.build(ctx);
      if (typeof off === 'function') cleanupFns.push(off);
    } catch (err) {
      console.error('开场场景出错，直接放行', err);
      finish();
      return;
    }

    // 点击进入（场景可覆盖）
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-skip],[data-no-snooze]')) return;
      tapFn();
    });
    // 空格 / 回车 / Esc 跳过
    const onKey = (e) => {
      if (['Escape', 'Enter', ' ', 'Spacebar'].includes(e.key)) {
        e.preventDefault(); finish();
      }
    };
    addEventListener('keydown', onKey);
    cleanupFns.push(() => removeEventListener('keydown', onKey));

    $('[data-skip]', root).addEventListener('click', (e) => {
      e.stopPropagation(); finish();
    });
    $('[data-no-snooze]', root).addEventListener('click', (e) => {
      e.stopPropagation();
      // 到明天 0 点
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
