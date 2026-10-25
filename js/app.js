// Роутер, главная, страница игрока.
import { $, $$, esc, OD, getJSON, consts, heroImg, store, toast } from './util.js';
import { renderMatch } from './match.js';
import { renderSets } from './wardrobe.js';
import { rankName } from './analyze.js';

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

function home() {
  const recent = store.get('recent', []);
  app.innerHTML = `
    <h1 class="hero-title">Кто <em>заруинил</em><br>катку?</h1>
    <p class="lead">Вставь ID матча Dota 2 или ссылку на профиль. Разберём реплей по минутам: кто руинер, кто MVP, где матч решился, кто кормил и как не повторить ошибки.</p>
    <form class="search" id="f">
      <input id="q" placeholder="ID матча, ссылка Dotabuff / OpenDota / Stratz / Steam или код для друзей" autocomplete="off" autofocus>
      <button class="btn big red">Разобрать</button>
    </form>
    <div class="hint">Пример: <button type="button" data-ex="9060352207">матч 9060352207</button></div>
    ${recent.length ? `<div class="recent"><span class="lbl">Недавние:</span>${recent.map((r) => `
      <a class="chip" href="#/match/${r.id}"><img src="${heroImg(r.hero)}" alt="">${r.id}${r.ruiner ? ` · руинер ${esc(r.ruiner)}` : ''}</a>`).join('')}</div>` : ''}
    <div class="features">
      <div class="feature"><div class="ico">🎯</div><b>Руинер и MVP</b><p>Модель сравнивает каждого с ожиданиями для его героя и роли и называет виновного крупно.</p></div>
      <div class="feature"><div class="ico">🗺️</div><b>Карта матча</b><p>Смерти, варды и драки на карте с ползунком времени. Видно, где решилась игра.</p></div>
      <div class="feature"><div class="ico">🧠</div><b>Разбор от ИИ</b><p>Живой комментарий к матчу и личные советы каждому игроку.</p></div>
      <div class="feature"><div class="ico">👕</div><b>Примерочная</b><p>Сеты героев из матча с ценами. ИИ подберёт образ на любой бюджет.</p></div>
    </div>`;
  $('#f').onsubmit = (e) => {
    e.preventDefault();
    submit($('#q').value);
  };
  $('[data-ex]').onclick = (e) => go(`#/match/${e.target.dataset.ex}`);
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
      </div></div>
      <div class="panel"><h3>Последние матчи <small>нажми, чтобы узнать, кто заруинил</small></h3>
      <div class="mlist">${list.map((m) => {
        const win = (m.player_slot < 128) === m.radiant_win;
        const h = c.heroes[m.hero_id] || {};
        const key = (h.name || '').replace('npc_dota_hero_', '');
        return `<a class="mrow ${win ? 'w' : 'l'}" href="#/match/${m.match_id}">
          <img src="${heroImg(key)}" alt=""><div><div class="pname">${esc(h.localized_name || '')}</div><div class="psub">${new Date(m.start_time * 1000).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div>
          <div class="num ${win ? 'rad' : 'dire'}">${win ? 'Победа' : 'Поражение'}</div>
          <div class="num hide-s">${m.kills}/${m.deaths}/${m.assists}</div>
          <div class="psub hide-s">${Math.floor(m.duration / 60)} мин</div></a>`;
      }).join('') || '<div class="empty">Нет матчей. Возможно, профиль скрыт в настройках Dota 2.</div>'}</div></div>`;
  } catch {
    app.innerHTML = `<div class="error">Не удалось открыть профиль ${esc(id)}. Проверь ссылку или включи «Показывать общедоступную историю матчей» в настройках Dota 2.</div>`;
  }
}

async function route() {
  const [, page, arg] = location.hash.split(/[/?]/);
  $$('.top nav a').forEach((a) => a.classList.toggle('on', a.dataset.nav === (page === 'sets' ? 'sets' : 'match')));
  window.scrollTo(0, 0);
  if (page === 'match' && arg) return renderMatch(app, arg);
  if (page === 'player' && arg) return player(arg);
  if (page === 'sets') return renderSets(app, arg, new URLSearchParams(location.hash.split('?')[1] || ''));
  return home();
}

window.addEventListener('hashchange', route);
route();
