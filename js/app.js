// Роутер, главная, страница игрока.
import { $, $$, esc, OD, getJSON, consts, heroImg, heroTall, store, toast, fx } from './util.js?v=202610260228';
import { renderMatch } from './match.js?v=202610260228';
import { renderSets } from './wardrobe.js?v=202610260228';
import { coachPage, me, setMe } from './coach.js?v=202610260228';
import { friendsPage } from './friends.js?v=202610260228';
import { comparePage } from './compare.js?v=202610260228';
import { smurfPage } from './smurf.js?v=202610260228';
import { icon as ic } from './icons.js?v=202610260228';
import { rankName, analyze } from './analyze.js?v=202610260228';

const app = $('#app');
const STEAM64 = 76561197960265728n;

// Понимаем: ID матча, ссылки Dotabuff/OpenDota/Stratz/Steam, SteamID64, код для друзей.
export function parseInput(s) {
  s = s.trim();
  let m = s.match(/(?:matches?|match)\/(\d{6,12})/i);
  if (m) return { match: m[1] };
  m = s.match(/players?\/(\d{1,20})/i) || s.match(/profiles\/(\d{17})/i);
  if (m) return { player: toAccount(m[1]) };
  if (/steamcommunity\.com\/id\//i.test(s)) return { error: 'Короткие ссылки Steam (/id/ник) не поддерживаются, вставь ссылку вида /profiles/7656… или код для друзей.' };
  m = s.match(/^\d+$/);
  if (!m) return { error: 'Не понял. Вставь ID матча, ссылку на матч или профиль.' };
  const n = BigInt(s);
  if (n >= STEAM64) return { player: toAccount(s) };
  if (n > 4294967295n) return { match: s };
  // Короткие числа: ID матча сейчас ~9 млрд, ID аккаунта, до ~2 млрд.
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
    ${me() ? '<div class="panel reveal mine" id="mine"><h3>Мои катки <small>последние 5 игр</small></h3><div class="mine-list"><div class="spinner" style="width:22px;height:22px"></div></div></div>' : ''}
    <div class="features">
      <div class="feature tilt reveal"><div class="ico">${ic('target')}</div><b>Руинер, MVP и проценты</b><p>11 метрик против перцентилей на том же герое, доля руина каждого и устойчивость вердикта.</p></div>
      <div class="feature tilt reveal"><div class="ico">${ic('map')}</div><b>Карта и линии</b><p>Смерти и варды на карте с ползунком времени, кто выиграл каждую линию к 10:00.</p></div>
      <div class="feature tilt reveal"><div class="ico">${ic('usersearch')}</div><b>Смурфы и аккаунты</b><p>Сколько игр у каждого, винрейт, первый раз на герое или смурф.</p></div>
      <div class="feature tilt reveal"><div class="ico">${ic('sparkles')}</div><b>Разбор от ИИ</b><p>Живой комментарий матча человеческим языком и личные советы каждому.</p></div>
      <div class="feature tilt reveal"><div class="ico">${ic('cube')}</div><b>3D-примерочная</b><p>Настоящие модели из игры: надевай сеты, смотри цены, ИИ подберёт образ под бюджет.</p></div>
      <div class="feature tilt reveal"><div class="ico">${ic('chart')}</div><b>Руин-статистика</b><p>Как часто игрок руинит и тащит в последних матчах.</p></div>
    </div>`;
  $('#f').onsubmit = (e) => {
    e.preventDefault();
    submit($('#q').value);
  };
  $('[data-ex]').onclick = (e) => go(`#/match/${e.target.dataset.ex}`);
  app.insertAdjacentHTML('beforeend', `<div class="panel reveal sid"><h3>Конвертер Steam ID <small>ссылка, SteamID64, код для друзей, [U:1:N] или STEAM_0</small></h3>
    <input id="sidq" placeholder="Например 76561198452324571 или steamcommunity.com/profiles/…" autocomplete="off"><div id="sidout" class="sidout"></div></div>`);
  $('#sidq').oninput = (e) => ($('#sidout').innerHTML = steamIds(e.target.value));
  fx(app);
  if (me()) myMatches(me());
  import('./viewer3d.js?v=202610260228').then((v3) => v3.showcase($('.home3d'), hero, 'red')).catch(() => {});
}

// «Мои катки»: 5 последних игр, пометка руинер/MVP и влияние появляются по мере разбора.
async function myMatches(id) {
  const box = $('#mine .mine-list');
  const c = await consts();
  const list = await getJSON(`${OD}/players/${id}/recentMatches`).catch(() => []);
  if (!box?.isConnected) return;
  if (!list.length) { box.innerHTML = '<p class="psub">Нет открытых матчей. Проверь, что история в Dota 2 не скрыта.</p>'; return; }
  box.innerHTML = list.slice(0, 5).map((m) => {
    const win = (m.player_slot < 128) === m.radiant_win;
    const h = c.heroes[m.hero_id] || {};
    const key = (h.name || '').replace('npc_dota_hero_', '');
    return `<a class="mine-row ${win ? 'w' : 'l'}" href="#/match/${m.match_id}" data-m="${m.match_id}"><img src="${heroImg(key)}" alt="">
      <span class="pname">${esc(h.localized_name || '')}</span><span class="num">${m.kills}/${m.deaths}/${m.assists}</span>
      <span class="mine-tag" data-tag>…</span><span class="${win ? 'rad' : 'dire'}">${win ? 'Победа' : 'Поражение'}</span></a>`;
  }).join('') + `<div class="mine-links"><a href="#/player/${id}">все матчи</a> · <a href="#/coach/${id}">тренер</a> · <a href="#/compare/${id}">сравнить с другом</a> · <a href="#/friends">друзья</a></div>`;
  for (const m of list.slice(0, 5)) {
    const full = await getJSON(`${OD}/matches/${m.match_id}`).catch(() => null);
    const tag = $(`[data-m="${m.match_id}"] [data-tag]`);
    if (!tag) return;
    if (!full?.players?.length) { tag.textContent = ''; continue; }
    const a = analyze(full, { heroes: c.heroes, itemsById: c.itemsById });
    const p = a.players.find((x) => x.accountId === +id);
    tag.innerHTML = !p ? '' : a.ruiner === p ? '<span class="tag r">РУИНЕР</span>' : a.mvp === p ? '<span class="tag m">MVP</span>' : `<span class="psub">влияние ${p.score}</span>`;
  }
}

// Все форматы Steam ID из одного ввода.
function steamIds(v) {
  v = v.trim();
  if (!v) return '';
  let acc = null;
  let m;
  if ((m = v.match(/\[U:1:(\d+)\]/i))) acc = BigInt(m[1]);
  else if ((m = v.match(/STEAM_[0-5]:([01]):(\d+)/i))) acc = BigInt(m[2]) * 2n + BigInt(m[1]);
  else if ((m = v.match(/(\d{5,20})/))) acc = BigInt(m[1]) >= STEAM64 ? BigInt(m[1]) - STEAM64 : BigInt(m[1]);
  if (acc == null || acc > 4294967295n) return '<p class="psub">Не распознал. Короткие ссылки /id/ник без API Steam не раскрыть.</p>';
  const rows = [['Код для друзей (Dota)', acc], ['SteamID64', acc + STEAM64], ['SteamID3', `[U:1:${acc}]`], ['SteamID', `STEAM_0:${acc % 2n}:${acc / 2n}`]];
  return `<div class="sidgrid">${rows.map(([k, x]) => `<button class="tile" data-copy="${x}"><div class="lbl">${k}</div><div class="num">${x}</div></button>`).join('')}</div>
    <div class="actions"><a class="btn sm" href="#/player/${acc}">Матчи игрока</a><a class="btn ghost sm" href="#/coach/${acc}">Тренер</a>
    <a class="btn ghost sm" href="https://steamcommunity.com/profiles/${acc + STEAM64}" target="_blank" rel="noopener">Профиль Steam</a></div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy]');
  if (b) navigator.clipboard.writeText(b.dataset.copy).then(() => toast('Скопировано'), () => {});
});

// Вход в обучение: если «я» уже известен, сразу тренер, иначе просим профиль.
function coachLanding() {
  if (me()) { location.hash = `#/coach/${me()}`; return; }
  app.innerHTML = `<div class="coachland reveal">
    <div class="lbl">Обучение</div><h1 class="hero-title" style="font-size:clamp(34px,5vw,60px)">Найди свои <em>ошибки</em></h1>
    <p class="lead">Вставь ссылку на свой профиль Steam, Dotabuff или OpenDota, или код для друзей. Тренер разберёт последние 20 игр: что у тебя повторяется, какие метрики проседают и что тренировать в первую очередь.</p>
    <form class="search" id="cf"><input id="cq" placeholder="Профиль или код для друзей" autocomplete="off"><button class="btn big red">${ic('cap')} Разобрать мои игры</button></form>
    <div class="hint">Ещё можно открыть любой разбор матча и в разделе «Обучение» выбрать себя.</div></div>`;
  fx(app);
  $('#cf').onsubmit = (e) => {
    e.preventDefault();
    const r = parseInput($('#cq').value);
    if (!r.player && !r.ambiguous) return toast('Нужна ссылка на профиль или код для друзей');
    const id = r.player || r.ambiguous;
    setMe(id);
    location.hash = `#/coach/${id}`;
  };
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
      </div><div class="coach-acts" style="margin-left:auto"><a class="btn" href="#/coach/${id}">${ic('cap')} Тренер по 20 играм</a><a class="btn ghost" href="#/smurf/${id}">${ic('usersearch')} Проверка на смурфа</a><a class="btn ghost" href="#/compare/${id}">${ic('swords')} Сравнить</a>${me() === +id ? '<span class="chip pos">это ты</span>' : `<button class="btn ghost" id="itsme">Это я</button>`}</div></div>
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
      ['Средний руин в поражениях', lost.length ? `${avg(lost, (x) => x.me.share)}%` : '-'],
      ['Среднее влияние на игру', avg(res, (x) => x.me.score)],
      ['Винрейт', `${Math.round(res.filter((x) => x.me.win).length / res.length * 100)}%`],
    ];
    $('#rs').innerHTML = tiles.map(([k, v]) => `<div class="tile"><div class="lbl">${k}</div><div class="num">${v}</div></div>`).join('');
  }
}

async function route() {
  const [, page, arg] = location.hash.split(/[/?]/);
  $$('.top nav a, .tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.nav === (page === 'sets' ? 'sets' : page === 'coach' ? 'coach' : 'match')));
  window.scrollTo(0, 0);
  if (page === 'match' && arg) return renderMatch(app, arg);
  if (page === 'player' && arg) return player(arg);
  if (page === 'coach' && arg) return coachPage(app, arg);
  if (page === 'coach') return coachLanding();
  if (page === 'smurf' && arg) return smurfPage(app, arg);
  if (page === 'compare' && arg) return comparePage(app, arg, location.hash.split('/')[3]);
  if (page === 'friends') return friendsPage(app);
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

// Тема: «Неон» (по умолчанию) или «Спорт». Искры только в неоне.
const themeBtn = $('#theme');
const paintTheme = () => (themeBtn.textContent = document.documentElement.classList.contains('sport') ? '◐ Спорт' : '◐ Неон');
const toggleTheme = () => {
  const sport = document.documentElement.classList.toggle('sport');
  store.set('theme', sport ? 'sport' : 'neon');
  paintTheme();
};
themeBtn.onclick = toggleTheme;
document.querySelector('[data-theme-toggle]').onclick = toggleTheme; // нижняя панель на телефоне
paintTheme();
// Шапка и меню разделов прячутся при прокрутке вниз и возвращаются при прокрутке вверх.
// Порог 40 px в одну сторону: плавная прокрутка даёт мелкие откаты назад, без порога шапка мигает.
let lastY = scrollY;
let anchorY = scrollY;
addEventListener('scroll', () => {
  const y = scrollY;
  if ((y > lastY) !== (lastY > anchorY)) anchorY = lastY; // сменилось направление, новая точка отсчёта
  if (y < 160) document.body.classList.remove('bars-hidden');
  else if (Math.abs(y - anchorY) > 40) document.body.classList.toggle('bars-hidden', y > anchorY);
  // меню разделов прячем, только когда оно уже прилипло к верху, а не стоит на своём месте в странице
  const tabs = document.querySelector('.tabs');
  document.body.classList.toggle('tabs-stuck', !!tabs && tabs.getBoundingClientRect().top <= 72);
  lastY = y;
}, { passive: true });

// установка как приложение (PWA): сервис-воркер лежит рядом со страницей
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
embers();
window.addEventListener('hashchange', route);
route();
