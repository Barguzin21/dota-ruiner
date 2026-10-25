// Рейтинг среди друзей: кто чаще руинит и кто тащит в последних играх. Список друзей — в браузере.
import { $, $$, esc, OD, getJSON, consts, store, toast, fx } from './util.js?v=202610260208';
import { loadGames, summarize, me } from './coach.js?v=202610260208';
import { parseInput } from './app.js?v=202610260208';
import { icon as ic } from './icons.js?v=202610260208';

const N = 10; // игр на друга
const TTL = 6 * 3600 * 1000; // итоги живут 6 часов, чтобы не долбить OpenDota
const SORTS = { ruin: ['Чаще руинит', (s) => s.ruiner / Math.max(1, s.n)], carry: ['Чаще тащит', (s) => s.mvp / Math.max(1, s.n)], score: ['Влияние', (s) => s.score] };

export async function friendsPage(app) {
  const ids = [...new Set([me(), ...store.get('friends', [])].filter(Boolean))];
  let sort = 'ruin';
  app.innerHTML = `<div class="friends">
    <div class="wtop reveal"><div><div class="lbl">Рейтинг</div><h1>Друзья</h1></div>
      <form class="frform" id="ff"><input id="fq" placeholder="Профиль или код друга" autocomplete="off"><button class="btn">${ic('usersearch')} Добавить</button></form></div>
    <div class="panel reveal"><div class="seg" id="fsort">${Object.entries(SORTS).map(([k, [t]]) => `<button data-s="${k}">${t}</button>`).join('')}</div>
      <div class="psub" style="margin:8px 0 0">По последним ${N} играм каждого. ${me() ? '' : 'Нажми «Это я» в профиле, чтобы попасть в рейтинг.'}</div>
      <div id="flist" class="flist"></div></div></div>`;
  fx(app);
  $('#ff').onsubmit = (e) => {
    e.preventDefault();
    const r = parseInput($('#fq').value);
    const id = +(r.player || r.ambiguous || 0);
    if (!id) return toast('Нужна ссылка на профиль или код для друзей');
    store.set('friends', [...new Set([...store.get('friends', []), id])]);
    friendsPage(app);
  };
  const rows = {};
  const draw = () => {
    $$('#fsort button').forEach((b) => b.classList.toggle('on', b.dataset.s === sort));
    const list = ids.map((id) => rows[id] || { id, loading: true });
    const val = SORTS[sort][1];
    list.sort((a, b) => (b.s ? val(b.s) : -1) - (a.s ? val(a.s) : -1));
    $('#flist').innerHTML = list.map((r, i) => r.loading ? `<div class="frow"><span class="frank">·</span><span class="psub" style="grid-column:2/-1">Загружаем игры игрока ${r.id}…</span></div>`
      : `<div class="frow ${r.id === me() ? 'me' : ''}"><span class="frank">${i + 1}</span><img src="${esc(r.avatar)}" alt="">
        <a class="pname" href="#/player/${r.id}">${esc(r.name)}${r.id === me() ? ' <span class="tag you">ТЫ</span>' : ''}</a>
        ${r.s.n ? `<span class="fstat"><b>${r.s.ruiner}</b> руинер</span><span class="fstat"><b>${r.s.mvp}</b> MVP</span><span class="fstat"><b>${r.s.score}</b> влияние</span>`
          : '<span class="psub fwide">история скрыта</span>'}
        ${r.id !== me() ? `<button class="fx" data-del="${r.id}" title="Убрать">×</button>` : '<span></span>'}</div>`).join('') || '<div class="empty">Добавь друзей по ссылке на профиль.</div>';
    $$('[data-del]').forEach((b) => (b.onclick = () => { store.set('friends', store.get('friends', []).filter((x) => x !== +b.dataset.del)); friendsPage(app); }));
  };
  $$('#fsort button').forEach((b) => (b.onclick = () => { sort = b.dataset.s; draw(); }));
  draw();
  const C = await consts();
  for (const id of ids) {
    const cached = store.get(`fr:${id}`, null);
    if (cached && Date.now() - cached.t < TTL) { rows[id] = cached; draw(); continue; }
    const [prof, list] = await Promise.all([getJSON(`${OD}/players/${id}`).catch(() => null), getJSON(`${OD}/players/${id}/recentMatches`).catch(() => [])]);
    const games = await loadGames(id, list.slice(0, N), C, () => !!$('#flist'));
    if (!games) return;
    const s = summarize(games);
    rows[id] = { id, t: Date.now(), name: prof?.profile?.personaname || `Игрок ${id}`, avatar: prof?.profile?.avatar || '', s: { n: s.n, ruiner: s.ruiner, mvp: s.mvp, score: s.score } };
    store.set(`fr:${id}`, rows[id]);
    draw();
  }
}
