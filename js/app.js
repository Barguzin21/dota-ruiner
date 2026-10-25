// Роутер, главная, страница игрока.
import { $, $$, esc, OD, getJSON, consts, heroImg, heroTall, store, toast, fx } from './util.js';
import { renderMatch } from './match.js';
import { renderSets } from './wardrobe.js';
import { coachPage, me, setMe } from './coach.js';
import { rankName, analyze } from './analyze.js';

const app = $('#app');
const STEAM64 = 76561197960265728n;

// Понимаем: ID матча, ссылки Dotabuff/OpenDota/Stratz/Steam, SteamID64, код для друзей.
export function parseInput(s) {
  s = s.trim();
  let m = s.match(/(?:matches?|match)\/(\d{6,12})/i);
  if (m) return { match: m[1] };
  m = s.match(/players?\/(\d{1,20})/i) || s.match(/profiles\/(\d{17})/i);
  if (m) return { player: toAccount(m[1]) };
  if (/steamcommunity\.com\/id\//i.test(s)) return { error: 'Короткие ссылки Steam (/id/ник) не поддерживаются — вставь ссылку вида /profiles/7656… или код для друзей.' };
  m = s.match(/^\d+$/);
  if (!m) return { error: 'Не понял. Вставь ID матча, ссылку на матч или профиль.' };
  const n = BigInt(s);
  if (n >= STEAM64) return { player: toAccount(s) };
  if (n > 4294967295n) return { match: s };
  // Короткие числа: ID матча сейчас ~9 млрд, ID аккаунта — до ~2 млрд.
  return n > 2500000000n ? { match: s } : { ambiguous: s };
}
const toAccount = (id) => (BigInt(id) >= STEAM64 ? String(BigInt(id) - STEAM64) : String(id));

function go(hash) {
  location.hash = hash;
}

// Герои для витрины на главной: показываем случайного из тех, у кого есть 3D.
const SHOWCASE = ['axe', 'juggernaut', 'pudge', 'phantom_assassin', 'invoker', 'sven', 'drow_ranger', 'lina', 'crystal_maiden', 'faceless_void', 'antimage', 'legion_commander', 'sniper', 'windrunner', 'templar_assassin', 'dragon_knight', 'luna', 'mirana'];

function home() {
  const recent = store.get('recent', []);
  const hero = SHOWCASE[Math.floor(Math.random() * SHOWCASE.length)];
  app.innerHTML = `
    <div class="homegrid">
      <div class="reveal">
        <h1 class="hero-title">Кто <em>заруинил</em><br>катку?</h1>
        <p class="lead">Вставь ID матча Dota 2 или ссылку на профиль. Модель пройдёт матч по минутам и скажет, кто руинер, кто MVP, где решилась игра и сколько процентов поражения на каждом.</p>
        <form class="search" id="f">
          <input id="q" placeholder="ID матча, ссылка Dotabuff / OpenDota / Stratz / Steam или код для друзей" autocomplete="off" autofocus>
          <button class="btn big red">Разобрать</button>
        </form>
        <div class="hint">Пример: <button type="button" data-ex="9060352207">матч 9060352207</button>${me() ? ` · <a href="#/player/${me()}">мои игры</a> · <a href="#/coach/${me()}">мой тренер</a>` : ''}</div>
        ${recent.length ? `<div class="recent"><span class="lbl">Недавние:</span>${recent.map((r) => `
          <a class="chip" href="#/match/${r.id}"><img src="${heroImg(r.hero)}" alt="">${r.id}${r.ruiner ? ` · руинер ${esc(r.ruiner)}` : ''}</a>`).join('')}</div>` : ''}
      </div>
      <a class="home3d tilt reveal" href="#/sets/${hero}" data-hero3d="${hero}">
        <img src="${heroTall(hero)}" alt="">
        <div class="cap">Примерочная 3D<small>крути героя и собирай образ с ценами →</small></div>
      </a>
    </div>
    <div class="features">
      <div class="feature tilt reveal"><div class="ico">🎯</div><b>Руинер, MVP и проценты</b><p>11 метрик против перцентилей на том же герое, доля руина каждого и устойчивость вердикта.</p></div>
      <div class="feature tilt reveal"><div class="ico">🗺️</div><b>Карта и линии</b><p>Смерти и варды на карте с ползунком времени, кто выиграл каждую линию к 10:00.</p></div>
      <div class="feature tilt reveal"><div class="ico">🕵️</div><b>Смурфы и аккаунты</b><p>Сколько игр у каждого, винрейт, первый раз на герое или смурф.</p></div>
      <div class="feature tilt reveal"><div class="ico">🧠</div><b>Разбор от ИИ</b><p>Живой комментарий матча человеческим языком и личные советы каждому.</p></div>
      <div class="feature tilt reveal"><div class="ico">👕</div><b>3D-примерочная</b><p>Настоящие модели из игры: надевай сеты, смотри цены, ИИ подберёт образ под бюджет.</p></div>
      <div class="feature tilt reveal"><div class="ico">📈</div><b>Руин-статистика</b><p>Как часто игрок руинит и тащит в последних матчах.</p></div>
    </div>`;
  $('#f').onsubmit = (e) => {
    e.preventDefault();
    submit($('#q').value);
  };
  $('[data-ex]').onclick = (e) => go(`#/match/${e.target.dataset.ex}`);
  fx(app);
  import('./viewer3d.js').then((v3) => v3.showcase($('.home3d'), hero, 'red')).catch(() => {});
}

export function submit(v) {
  const r = parseInput(v);
  if (r.error) return toast(r.error);
  if (r.match) return go(`#/match/${r.match}`);
  if (r.player) return go(`#/player/${r.player}`);
  if (r.ambiguous) return go(`#/match/${r.ambiguous}`);
}

async function player(id) {
  app.innerHTML = '<div class="loading"><div class="spinner"></div>Загружаем профиль…</div>';
  const c = await consts();
  try {
    const [prof, list] = await Promise.all([getJSON(`${OD}/players/${id}`), getJSON(`${OD}/players/${id}/recentMatches`)]);
    const p = prof.profile;
    if (!p) throw new Error('private');
    app.innerHTML = `
      <div class="phead"><img src="${esc(p.avatarfull)}" alt=""><div>
        <h1>${esc(p.personaname)}</h1>
        <div class="psub">${rankName(prof.rank_tier)} · <a href="https://www.opendota.com/players/${id}" target="_blank" rel="noopener">OpenDota</a></div>
      </div><div class="coach-acts" style="margin-left:auto"><a class="btn" href="#/coach/${id}">🎓 Тренер по 20 играм</a>${me() === +id ? '<span class="chip pos">это ты</span>' : `<button class="btn ghost" id="itsme">Это я</button>`}</div></div>
      <div class="panel reveal"><h3>Руин-статистика <small>последние ${Math.min(10, list.length)} матчей</small></h3><div class="ruinstats" id="rs"><div class="loading" style="padding:10px"><div class="spinner"></div>Разбираем матчи…</div></div></div>
      <div class="panel reveal"><h3>Последние матчи <small>нажми, чтобы узнать, кто заруинил</small></h3>
      <div class="mlist">${list.map((m) => {
        const win = (m.player_slot < 128) === m.radiant_win;
        const h = c.heroes[m.hero_id] || {};
        const key = (h.name || '').replace('npc_dota_hero_', '');
        return `<a class="mrow ${win ? 'w' : 'l'}" href="#/match/${m.match_id}" data-m="${m.match_id}">
          <img src="${heroImg(key)}" alt=""><div><div class="pname">${esc(h.localized_name || '')}</div><div class="psub">${new Date(m.start_time * 1000).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div>
          <div class="num ${win ? 'rad' : 'dire'}">${win ? 'Победа' : 'Поражение'}<span data-tag></span></div>
          <div class="num hide-s">${m.kills}/${m.deaths}/${m.assists}</div>
          <div class="psub hide-s">${Math.floor(m.duration / 60)} мин</div></a>`;
      }).join('') || '<div class="empty">Нет матчей. Возможно, профиль скрыт в настройках Dota 2.</div>'}</div></div>`;
    fx(app);
    $('#itsme')?.addEventListener('click', (e) => { setMe(id); e.target.outerHTML = '<span class="chip pos">это ты</span>'; });
    ruinStats(+id, list.slice(0, 10), c);
  } catch {
    app.innerHTML = `<div class="error">Не удалось открыть профиль ${esc(id)}. Проверь ссылку или включи «Показывать общедоступную историю матчей» в настройках Dota 2.</div>`;
  }
}

// Прогоняем модель по последним матчам игрока: сколько раз руинил и тащил.
async function ruinStats(account, list, c) {
  const res = [];
  for (const m of list) {
    const full = await getJSON(`${OD}/matches/${m.match_id}`).catch(() => null);
    if (!document.body.contains($('#rs'))) return;
    if (!full?.players?.length) continue;
    const a = analyze(full, { heroes: c.heroes, itemsById: c.itemsById });
    const me = a.players.find((p) => p.accountId === account);
    if (!me) continue;
    res.push({ me, ruiner: a.ruiner === me, mvp: a.mvp === me });
    const tag = $(`[data-m="${m.match_id}"] [data-tag]`);
    if (tag) tag.innerHTML = a.ruiner === me ? '<span class="tag r">РУИНЕР</span>' : a.mvp === me ? '<span class="tag m">MVP</span>' : '';
    draw();
  }
  if (!res.length) $('#rs').innerHTML = '<div class="empty">Не удалось разобрать матчи.</div>';

  function draw() {
    const lost = res.filter((x) => !x.me.win);
    const avg = (a, f) => (a.length ? Math.round(a.reduce((s, x) => s + f(x), 0) / a.length) : 0);
    const tiles = [
      ['Раз руинер', `${res.filter((x) => x.ruiner).length} из ${res.length}`],
      ['Раз MVP', `${res.filter((x) => x.mvp).length} из ${res.length}`],
      ['Средний руин в поражениях', lost.length ? `${avg(lost, (x) => x.me.share)}%` : '—'],
      ['Среднее влияние на игру', avg(res, (x) => x.me.score)],
      ['Винрейт', `${Math.round(res.filter((x) => x.me.win).length / res.length * 100)}%`],
    ];
    $('#rs').innerHTML = tiles.map(([k, v]) => `<div class="tile"><div class="lbl">${k}</div><div class="num">${v}</div></div>`).join('');
  }
}

async function route() {
  const [, page, arg] = location.hash.split(/[/?]/);
  $$('.top nav a').forEach((a) => a.classList.toggle('on', a.dataset.nav === (page === 'sets' ? 'sets' : 'match')));
  window.scrollTo(0, 0);
  if (page === 'match' && arg) return renderMatch(app, arg);
  if (page === 'player' && arg) return player(arg);
  if (page === 'coach' && arg) return coachPage(app, arg);
  if (page === 'sets') return renderSets(app, arg, new URLSearchParams(location.hash.split('?')[1] || ''));
  return home();
}

// Фон: медленно летящие искры. Только когда вкладка видна и пользователь не просил меньше анимаций.
function embers() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas');
  cv.id = 'embers';
  document.body.prepend(cv);
  const x = cv.getContext('2d');
  let w, h;
  const size = () => { w = cv.width = innerWidth; h = cv.height = innerHeight; };
  size();
  addEventListener('resize', size);
  const ps = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.8 + 0.4, v: Math.random() * 0.25 + 0.05, d: Math.random() * 6.28, c: Math.random() < 0.75 ? '255,90,60' : '255,194,61' }));
  const tick = () => {
    if (!document.hidden) {
      x.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.y -= p.v / h * 2.2;
        p.d += 0.01;
        if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
        const px = (p.x + Math.sin(p.d) * 0.01) * w;
        const g = x.createRadialGradient(px, p.y * h, 0, px, p.y * h, p.r * 6);
        g.addColorStop(0, `rgba(${p.c},.55)`);
        g.addColorStop(1, `rgba(${p.c},0)`);
        x.fillStyle = g;
        x.fillRect(px - p.r * 6, p.y * h - p.r * 6, p.r * 12, p.r * 12);
      }
    }
    requestAnimationFrame(tick);
  };
  tick();
}

// Тема: «Спорт» (по умолчанию) или «Неон». Искры только в неоне.
const themeBtn = $('#theme');
const paintTheme = () => (themeBtn.textContent = document.documentElement.classList.contains('sport') ? '◐ Спорт' : '◐ Неон');
themeBtn.onclick = () => {
  const sport = document.documentElement.classList.toggle('sport');
  store.set('theme', sport ? 'sport' : 'neon');
  paintTheme();
};
paintTheme();
embers();
window.addEventListener('hashchange', route);
route();
