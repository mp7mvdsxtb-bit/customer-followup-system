/* 十种不同的开场；沿用拖动、撕开、拨动、擦拭、浇水、翻转、跟随、放飞、开关、播放的操作。 */
(function () {
  'use strict';
  const SNOOZE = 'crm-intro-snooze';
  const EPOCH = new Date(2026, 10, 17);
  const scenes = [
    {name:'宝箱',symbol:'✦',title:'给你的宝藏',love:'所有小小的好运，今天都藏在这里。',hint:'向下拖动钥匙，打开宝箱',kind:'drag'},
    {name:'礼物',symbol:'🎁',title:'拆开一份惊喜',love:'今天的礼物，是又能喜欢你一天。',hint:'点击撕开包装',kind:'tear'},
    {name:'星际',symbol:'🚀',title:'向心动出发',love:'宇宙很大，偏偏想靠近你。',hint:'拨动发射杆',kind:'lever'},
    {name:'镜面',symbol:'☁',title:'雾后的消息',love:'擦去一点雾，就能看见我的想念。',hint:'在画面上来回擦一擦',kind:'wipe'},
    {name:'水族馆',symbol:'🐠',title:'给快乐加一点水',love:'愿你像小鱼一样，自在又闪亮。',hint:'点一下，为水族箱加水',kind:'water'},
    {name:'罗盘',symbol:'✺',title:'方向是美好',love:'无论走到哪里，我都站在你这边。',hint:'点一下，翻转罗盘',kind:'flip'},
    {name:'气球',symbol:'🎈',title:'让心情飞一会儿',love:'把今天的轻松，系在你手心。',hint:'移动鼠标或手指，带气球飞',kind:'follow'},
    {name:'纸飞机',symbol:'✈',title:'一封飞行中的问候',love:'这架纸飞机，目的地是你的笑容。',hint:'点一下，放飞飞机',kind:'fly'},
    {name:'灯塔',symbol:'▥',title:'为你留一束光',love:'夜色再深，也有人为你亮着灯。',hint:'按一下，点亮灯塔',kind:'light'},
    {name:'电台',symbol:'◉',title:'心动频道',love:'现在播放：今天也很喜欢你。',hint:'按下播放键',kind:'play'}
  ];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function pick(opts) {
    let n = Number(opts.scene); const fixed = window.S && S.settings && S.settings.intro_scene;
    if (!Number.isInteger(n) || n < 1 || n > 10) n = Number(fixed);
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      const now = new Date(); const day = new Date(now.getFullYear(),now.getMonth(),now.getDate());
      n = ((Math.round((day - EPOCH) / 86400000) % 10) + 10) % 10 + 1;
    }
    return n;
  }
  function introWanted() {
    try { const q = new URLSearchParams(location.hash.split('?')[1] || ''); const v = q.get('intro');
      if (v === '0' || v === 'off') return false; if (v) return true;
      return Number(localStorage.getItem(SNOOZE) || 0) <= Date.now();
    } catch (_) { return true; }
  }
  function playIntro(opts) {
    opts = opts || {}; if (document.querySelector('.intro')) return;
    const no = pick(opts), scene = scenes[no-1], still = !!opts.still;
    const root = document.createElement('div'); root.className = 'intro n' + no + (still ? ' still' : '');
    root.setAttribute('role','dialog'); root.setAttribute('aria-label',scene.name+'开场');
    const name = (opts.name || '').trim(); const sub = (opts.sub || '').trim(); const note = (opts.note || '').trim();
    const message = note && note !== '这里存着你要打的每一通电话' ? note : scene.love;
    const subtitle = sub && sub !== '欢迎来到你的客户系统' ? sub : scene.title;
    const shapes = [
      '<div class="chest"><div class="lid"></div><div class="lock">✦</div></div><div class="key">🗝</div>',
      '<div class="gift"><div class="ribbon-v"></div><div class="ribbon-h"></div><div class="bow">❋</div></div>',
      '<div class="planet"></div><div class="rocket">🚀</div><div class="lever"><span></span></div>',
      '<div class="mirror"><div class="reflection">✧</div><div class="mist"></div></div>',
      '<div class="tank"><div class="water"><span>🐠</span><i>◦　○　◦</i></div><div class="seaweed">〰　♒　〰</div></div><div class="tap">＋</div>',
      '<div class="compass"><div class="compass-ring">N<span>S</span></div><div class="needle">◆</div></div>',
      '<div class="cloud c1"></div><div class="cloud c2"></div><div class="balloon">♥<div class="string"></div></div>',
      '<div class="postmark">AIR MAIL<br>✦<br>FOR YOU</div><div class="plane">✈</div><div class="trail"></div>',
      '<div class="moon">☾</div><div class="beam"></div><div class="lighthouse"><div class="lamp"></div><div class="tower"></div><div class="island"></div></div><div class="switch">◯</div>',
      '<div class="radio"><div class="radio-top">FREQUENCY　88.6 — 108</div><div class="dial">♫</div><div class="speaker">••••<br>••••<br>••••</div><button class="play-button" type="button" aria-label="播放">▶</button></div>'
    ];
    root.innerHTML = `<div class="i-bar"><button type="button" data-snooze>今天不再显示</button><button type="button" data-skip>跳过</button></div><div class="art">${shapes[no-1]}</div><div class="copy"><div class="eyebrow">${String(no).padStart(2,'0')} / 10　·　${esc(scene.name)}</div><h1>${esc(subtitle)}</h1>${name ? `<div class="name">给 ${esc(name)}</div>` : ''}<p>${esc(message)}</p>${opts.sign ? `<div class="sign">— ${esc(opts.sign)}</div>` : ''}<div class="hint">${esc(scene.hint)}</div></div>`;
    document.body.appendChild(root);
    const previousOverflow = document.body.style.overflow; document.body.style.overflow='hidden';
    const timers = [], cleanup = []; let closed = false, done = false, activatedAt = 0;
    const later = (fn,ms) => { const id=setTimeout(fn,ms); timers.push(id); };
    function close(){ if(closed)return; closed=true; timers.forEach(clearTimeout); cleanup.forEach(f=>f()); document.body.style.overflow=previousOverflow; root.classList.add('out'); setTimeout(()=>root.remove(),500); }
    function listen(el,event,fn,options){el.addEventListener(event,fn,options);cleanup.push(()=>el.removeEventListener(event,fn,options));}
    function activate(){ if(done){ close(); return; } done=true; activatedAt=Date.now(); root.classList.add('active'); root.querySelector('.hint').textContent='点击任意处进入'; later(close,5000); }
    const art=root.querySelector('.art'); const hint=root.querySelector('.hint');
    listen(root.querySelector('[data-skip]'),'click', e=>{e.stopPropagation();close();});
    listen(root.querySelector('[data-snooze]'),'click', e=>{e.stopPropagation();try{const d=new Date();d.setHours(24,0,0,0);localStorage.setItem(SNOOZE,String(d.getTime()));}catch(_){}close();});
    listen(document,'keydown',e=>{if(e.key==='Escape'||e.key==='Enter'||e.key===' '){e.preventDefault();close();}});
    if (still) {root.classList.add('active');hint.textContent='';}
    else if(scene.kind==='drag'){
      let y=null; listen(art,'pointerdown',e=>{y=e.clientY;art.setPointerCapture(e.pointerId);});
      listen(art,'pointermove',e=>{if(y!==null){let d=Math.max(0,Math.min(110,e.clientY-y));root.style.setProperty('--drag',d+'px');if(d>65){y=null;activate();}}});
      listen(art,'pointerup',()=>{y=null;});listen(art,'wheel',e=>{if(e.deltaY>0)activate();},{passive:true});
      listen(root,'click',()=>{if(done && Date.now()-activatedAt>400)close();});
    } else if(scene.kind==='wipe'){
      let last=null, distance=0; const move=e=>{if(e.pointerType==='mouse'||e.buttons||e.pressure){if(last)distance+=Math.hypot(e.clientX-last.x,e.clientY-last.y);last={x:e.clientX,y:e.clientY};root.style.setProperty('--mist',String(Math.max(.12,1-distance/650)));if(distance>550&&!done)activate();}};
      listen(art,'pointermove',move);listen(root,'click',()=>{if(done && Date.now()-activatedAt>400)close();});
    } else if(scene.kind==='follow'){
      const move=e=>{root.style.setProperty('--bx',Math.max(-140,Math.min(140,(e.clientX-innerWidth/2)*.28))+'px');root.style.setProperty('--by',Math.max(-90,Math.min(90,(e.clientY-innerHeight/2)*.22))+'px');if(!done){done=true;hint.textContent='点击任意处进入';later(close,7500);}};
      listen(root,'pointermove',move);listen(root,'click',()=>close());
    } else {listen(root,'click',e=>{if(e.target.closest('.i-bar'))return;activate();});}
    if(!still)later(close,18000);
    return {close};
  }
  window.playIntro=playIntro; window.introWanted=introWanted;
  window.INTRO_SCENES=scenes.map((s,i)=>({no:i+1,key:s.kind,label:s.name}));
  window.INTRO_TODAY=()=>pick({});
})();
