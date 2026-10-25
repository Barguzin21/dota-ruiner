// Общие мелочи: экранирование, загрузка справочников, тост, мини-markdown.
export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const fmt = (n) => Math.round(n || 0).toLocaleString('ru-RU');
export const rub = (n) => n == null ? '—' : `${n < 10 ? n.toFixed(2).replace('.', ',') : fmt(n)} ₽`;
export const OD = 'https://api.opendota.com/api';
// GitHub Pages не запускает функции — цены и ИИ живут на Vercel.
export const API = location.hostname.endsWith('github.io') ? 'https://dota-ruiner.vercel.app/api' : 'api';

let constsP;
export function consts() {
  constsP ||= fetch('data/consts.json').then((r) => r.json()).then((c) => {
    c.itemsById = Object.fromEntries(Object.entries(c.items).map(([id, it]) => [id, it.key]));
    c.itemsByKey = Object.fromEntries(Object.values(c.items).map((it) => [it.key, it]));
    c.heroByKey = Object.fromEntries(Object.values(c.heroes).map((h) => [h.name.replace('npc_dota_hero_', ''), h]));
    return c;
  });
  return constsP;
}

export const heroImg = (key) => `img/heroes/${key}.webp`;
export const heroTall = (key) => `img/heroes/tall/${key}.webp`;
export const itemImg = (key) => `img/game/${key}.webp`;

export async function getJSON(url, opt) {
  const r = await fetch(url, opt);
  if (!r.ok) {
    const e = new Error(`${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

let toastT;
export function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2200);
}

export const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } },
};

// Эффекты интерфейса для только что вставленного HTML: появление при прокрутке, счётчики, 3D-наклон.
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return;
  e.target.classList.add('in');
  io.unobserve(e.target);
  for (const n of [e.target, ...e.target.querySelectorAll('[data-count]')]) if (n.dataset?.count) countUp(n);
}), { rootMargin: '0px 0px -40px' }) : null;

export function fx(root) {
  if (!root) return;
  const els = [...root.querySelectorAll('.reveal:not(.in), .bar, .ring, .share, .tug')];
  if (root.matches?.('.reveal')) els.push(root);
  for (const el of els) io && !still ? io.observe(el) : el.classList.add('in');
  if (still || !io) root.querySelectorAll('[data-count]').forEach((n) => (n.textContent = n.dataset.count));
  for (const el of root.querySelectorAll('.tilt')) tilt(el);
}

function countUp(n) {
  const to = +n.dataset.count;
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 900);
    n.textContent = Math.round(to * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function tilt(el) {
  if (el.dataset.tilt || still || matchMedia('(hover: none)').matches) return;
  el.dataset.tilt = 1;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${(-y * 5).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${(x * 7).toFixed(2)}deg`);
    el.style.setProperty('--mx', `${(x + 0.5) * 100}%`);
    el.style.setProperty('--my', `${(y + 0.5) * 100}%`);
  });
  el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
}

// Markdown от ИИ: заголовки, жирный, списки, абзацы. Всё экранируется до разметки.
export function md(text) {
  const lines = esc(text).split('\n');
  let html = '';
  let list = false;
  for (const raw of lines) {
    const l = raw.trim();
    const li = l.match(/^([-*•]|\d+\.)\s+(.*)/);
    if (li) {
      if (!list) { html += '<ul>'; list = true; }
      html += `<li>${inline(li[2])}</li>`;
      continue;
    }
    if (list) { html += '</ul>'; list = false; }
    const hd = l.match(/^(#{1,4})\s+(.*)/);
    if (hd) html += `<h4>${inline(hd[2])}</h4>`;
    else if (l) html += `<p>${inline(l)}</p>`;
  }
  return html + (list ? '</ul>' : '');
}
const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');

export async function askAI(kind, data) {
  const r = await fetch(`${API}/ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, data }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(d.error || `ИИ недоступен (${r.status})`);
    e.status = r.status;
    throw e;
  }
  return d.text;
}
