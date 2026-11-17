/* intro.js —— 开场片头
   时序用 setTimeout 驱动，给元素加 .in 类，CSS 负责过渡。
   这样即使某些环境对 CSS 动画支持不好，最终态也一定会出现。 */
'use strict';

const INTRO_KEY = 'crm-intro-done';

function introWanted() {
  try {
    const h = location.hash || '';
    const q = new URLSearchParams(h.split('?')[1] || '');
    const v = q.get('intro');
    if (v === '1' || v === 'still') return true;
    if (v === '0') return false;
    return !localStorage.getItem(INTRO_KEY);
  } catch (e) {
    return false;
  }
}
function introDone() {
  try { localStorage.setItem(INTRO_KEY, '1'); } catch (e) {}
}

function playIntro(opts = {}) {
  if (document.querySelector('.intro')) return null;
  const theme = opts.theme || 'warm';
  const name = (opts.name || '').trim();
  const hasName = !!name;
  const sub = opts.sub || '欢迎来到你的客户系统';
  const note = opts.note || '这里存着你要打的每一通电话';
  const still = opts.still || false;

  const el = document.createElement('div');
  el.className = 'intro' + (still ? ' still' : '');
  el.dataset.theme = theme;
  el.innerHTML = `
    <div class="i-glow i-glow-a"></div>
    <div class="i-glow i-glow-b"></div>
    <canvas class="i-canvas"></canvas>
    <button class="i-skip" type="button">跳过</button>
    <div class="i-content">
      ${hasName ? `<div class="i-eyebrow"><em>for</em>${esc(name)}</div>
      <h1 class="i-name">${[...name].map((ch) =>
        `<span>${esc(ch)}</span>`).join('')}</h1>` : ''}
      <div class="i-rule"></div>
      <p class="i-sub">${esc(sub)}</p>
      <p class="i-note">${esc(note)}<span class="i-heart"><svg viewBox="0 0 24 24">
        <path d="M12 20.6C6.4 16.5 3 13.3 3 9.7A4.3 4.3 0 0 1 12 7.8a4.3 4.3 0 0 1 9 1.9c0 3.6-3.4 6.8-9 10.9z"/>
      </svg></span></p>
    </div>
    <div class="i-foot">
      ${opts.sign ? `<div class="i-sign">— ${esc(opts.sign)}</div>` : ''}
      <div class="i-hint">点任意处进入</div>
    </div>`;
  document.body.appendChild(el);

  /* ── 粒子 ───────────────────────────────────── */
  const cv = el.querySelector('.i-canvas');
  const ctx = cv.getContext('2d');
  let W = 1, H = 1;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cs = getComputedStyle(el);
  const cAccent = (cs.getPropertyValue('--i-accent') || '#d4638f').trim();
  const cDot = (cs.getPropertyValue('--i-dot') || 'rgba(212,99,143,.5)').trim();

  function resize() {
    W = el.clientWidth || window.innerWidth;
    H = el.clientHeight || window.innerHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  const N = Math.max(26, Math.min(60, Math.round((W * H) / 24000)));
  const parts = Array.from({ length: N }).map(() => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: 0.8 + Math.random() * 2.3,
    vx: (Math.random() - 0.5) * 0.14,
    vy: -(0.05 + Math.random() * 0.22),
    a: 0.16 + Math.random() * 0.48,
    ph: Math.random() * Math.PI * 2,
    sp: 0.4 + Math.random() * 1.1,
    heart: Math.random() < 0.1,
    rot: (Math.random() - 0.5) * 0.6,
  }));

  function heartPath(cx, cy, s, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.beginPath();
    for (let t = 0; t <= Math.PI * 2 + 0.02; t += 0.16) {
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t)
                  - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      const px = (x / 17) * s, py = (y / 17) * s;
      if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  let raf = 0, last = performance.now();
  function tick(now) {
    const dt = Math.min(2.6, (now - last) / 16.67) || 1;
    last = now;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.ph += 0.014 * p.sp * dt;
      if (p.y < -24) { p.y = H + 20; p.x = Math.random() * W; }
      if (p.x < -24) p.x = W + 20;
      if (p.x > W + 24) p.x = -20;
      const tw = 0.55 + 0.45 * Math.sin(p.ph);
      ctx.globalAlpha = p.a * tw;
      if (p.heart) {
        ctx.fillStyle = cAccent;
        heartPath(p.x, p.y, p.r * 2.6, p.rot + Math.sin(p.ph * 0.5) * 0.16);
      } else {
        ctx.fillStyle = cDot;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = p.a * tw * 0.16;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  requestAnimationFrame(() => el.classList.add('ready'));

  /* ── 时序 ───────────────────────────────────── */
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  const mark = (sel) => {
    const n = el.querySelector(sel);
    if (n) n.classList.add('in');
  };

  if (still) {
    // 直接呈现终态：用于截图核对，也给不喜欢动画的人
    el.querySelectorAll('.i-eyebrow,.i-rule,.i-sub,.i-note,.i-foot,.i-skip,.i-name span')
      .forEach((n) => n.classList.add('in'));
  } else {
    at(120, () => mark('.i-skip'));
    at(320, () => mark('.i-eyebrow'));
    const chars = el.querySelectorAll('.i-name span');
    chars.forEach((c, i) => at(580 + i * 115, () => c.classList.add('in')));
    const nameDone = 580 + chars.length * 115;
    at(nameDone + 60, () => mark('.i-rule'));
    at(nameDone + 380, () => mark('.i-sub'));
    at(nameDone + 900, () => mark('.i-note'));
    at(nameDone + 1500, () => mark('.i-foot'));
  }

  /* ── 关闭 ───────────────────────────────────── */
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
    window.removeEventListener('resize', resize);
    document.removeEventListener('keydown', onKey);
    el.classList.add('out');
    setTimeout(() => el.remove(), 820);
    introDone();
  }
  function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      close();
    }
  }
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', () => { resize(); });
  el.querySelector('.i-skip').addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });
  // 1.2 秒后才接受点击，避免手快误跳过
  at(1200, () => { if (!closed) el.addEventListener('click', close); });
  at(9500, close);

  return { close };
}
