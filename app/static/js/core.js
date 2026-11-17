/* core.js —— 状态、请求、格式化、主题 */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const esc = (s) => String(s == null ? '' : s)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addDays = (iso, n) => {
  const d = iso ? new Date(iso + 'T00:00:00') : new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const md = (iso) => (iso ? iso.slice(5).replace('-', '/') : '');
const ymd = (iso) => (iso ? iso.replace(/-/g, '/').slice(2) : '');
const dayDiff = (a, b) => (!a || !b) ? null
  : Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function relDue(iso) {
  if (!iso) return { text: '未排期', cls: 'calm' };
  const od = dayDiff(todayISO(), iso);
  if (od > 0) return { text: `逾期 ${od} 天`, cls: '' };
  if (od === 0) return { text: '今天到期', cls: 'now' };
  if (od === -1) return { text: '明天', cls: 'calm' };
  return { text: `${md(iso)} 到期`, cls: 'calm' };
}

function num(n) {
  if (n == null || n === '') return '—';
  if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + '万';
  return String(n);
}

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

async function api(path, opt = {}) {
  const r = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opt,
    body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined,
  });
  let j;
  try { j = await r.json(); } catch (e) { j = {}; }
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}

/* 元数据 */
const STAGES = [
  { k: 'new', label: '待触达', color: '#a3adbb' },
  { k: 'contacted', label: '已触达', color: '#8b95a5' },
  { k: 'reachable', label: '待加微', color: '#06b6d4' },
  { k: 'wechat', label: '已加微信', color: '#10b981' },
  { k: 'interested', label: '有兴趣', color: '#3d6ef2' },
  { k: 'material', label: '已发资料', color: '#6366f1' },
  { k: 'trial', label: '试单中', color: '#8b5cf6' },
  { k: 'negotiating', label: '签约中', color: '#f59e0b' },
  { k: 'signed', label: '已签约', color: '#059669' },
  { k: 'no_need', label: '暂无需求', color: '#9ca3af' },
  { k: 'dropped', label: '已弃单', color: '#f43f5e' },
];
const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.k, s]));
const stageLabel = (k) => (STAGE_MAP[k] || { label: k }).label;
const stageColor = (k) => (STAGE_MAP[k] || { color: '#a3adbb' }).color;
const FUNNEL = ['new', 'contacted', 'reachable', 'wechat', 'interested', 'material',
  'trial', 'negotiating', 'signed'];

const SOURCES = [
  { k: 'ka', label: '目标KA' },
  { k: 'referrer', label: '证明人线索' },
  { k: 'bd', label: '自主BD' },
  { k: 'opportunity', label: '商机线索' },
];
const SRC_MAP = Object.fromEntries(SOURCES.map((s) => [s.k, s.label]));
const srcLabel = (k) => SRC_MAP[k] || k;

const TP_MAP = { yes: ['有三方', 'yes'], no: ['无三方', 'no'], unknown: ['三方未知', 'unknown'] };
const tpLabel = (k) => (TP_MAP[k] || TP_MAP.unknown)[0];
const tpCls = (k) => (TP_MAP[k] || TP_MAP.unknown)[1];

const RESULTS = [
  { k: 'contacted', label: '未接 / 不接', gap: 7, tone: '' },
  { k: 'reachable', label: '答应加微', gap: 2, tone: '' },
  { k: 'wechat', label: '已加微信', gap: 3, tone: 'ok' },
  { k: 'material', label: '已发资料', gap: 4, tone: 'ok' },
  { k: 'interested', label: '有兴趣', gap: 2, tone: 'ok' },
  { k: 'trial', label: '试单 / 试用', gap: 3, tone: 'ok' },
  { k: 'negotiating', label: '签约推进', gap: 2, tone: 'ok' },
  { k: 'signed', label: '已签约', gap: 0, tone: 'ok' },
  { k: 'no_need', label: '暂无需求', gap: 30, tone: 'warn' },
  { k: 'dropped', label: '弃单', gap: 0, tone: 'bad' },
];
const RESULT_MAP = Object.fromEntries(RESULTS.map((r) => [r.k, r]));

/* 全局状态 */
const S = {
  route: 'today',
  query: new URLSearchParams(),
  meta: null,
  settings: {},
  minutes: 60,
  today: null,
  loading: false,
  sel: new Set(),
  theme: 'light',
  searchIndex: [],
  lastActive: null,
  weekIncludeImport: true,   // 周报默认含导入的历史记录，否则刚上手的人看到的是空的
};

/* 主题 */
function applyTheme(t) {
  S.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('crm-theme', t); } catch (e) {}
}
function toggleTheme() {
  applyTheme(S.theme === 'dark' ? 'light' : 'dark');
  if (typeof closeAllMenus === 'function') closeAllMenus();
  rerenderTop();
}
function initTheme() {
  let t = null;
  try { t = localStorage.getItem('crm-theme'); } catch (e) {}
  if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(t);
}
function rerenderTop() {
  const b = $('#theme-btn');
  if (b) b.innerHTML = icon(S.theme === 'dark' ? 'sun' : 'moon');
}

/* 图标 */
function icon(name, cls = '') {
  return `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

/* toast */
function toast(msg, kind = '') {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  const ic = kind === 'ok' ? 'check' : kind === 'bad' ? 'alert' : 'spark';
  el.innerHTML = `${icon(ic)}<span>${esc(msg)}</span>`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 200);
  }, 2400);
}

async function copyText(t, label) {
  const done = () => toast((label || '已复制') + ' ' + t, 'ok');
  try {
    await navigator.clipboard.writeText(t);
    done();
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (err) { toast('复制失败', 'bad'); }
    ta.remove();
  }
}

/* 数组工具 */
const sum = (a) => a.reduce((x, y) => x + y, 0);
const groupBy = (arr, f) => arr.reduce((m, x) => { (m[f(x)] ||= []).push(x); return m; }, {});

/* 全局键值缓存（避免重复请求） */
const CACHE = { meta: null, metaAt: 0 };

async function searchAll(q) {
  try {
    return await api('/search?q=' + encodeURIComponent(q));
  } catch (e) {
    return { companies: [], contacts: [] };
  }
}
