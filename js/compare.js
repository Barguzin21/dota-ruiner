// Сравнение двух игроков по последним играм: зеркальные полосы, профиль, герои, ошибки.
import { $, esc, OD, getJSON, consts, heroImg, fx, toast } from './util.js?v=202610260220';
import { loadGames, summarize, me } from './coach.js?v=202610260220';
import { icon as ic } from './icons.js?v=202610260220';
import { parseInput } from './app.js?v=202610260220';

const N = 10; // игр на игрока: 20 запросов к OpenDota, больше упирается в их лимит

export async function comparePage(app, a, b) {
  if (!b) return askSecond(app, a);
  app.innerHTML = '<div class="loading"><div class="spinner"></div>Собираем игры обоих игроков…</div>';
  const C = await consts();
  const side = async (id) => {
    const [prof, list] = await Promise.all([getJSON(`${OD}/players/${id}`).catch(() => null), getJSON(`${OD}/players/${id}/recentMatches`).catch(() => [])]);
    return { id: +id, prof, list: list.slice(0, N) };
  };
  const [L, R] = await Promise.all([side(a), side(b)]);
  app.innerHTML = `<div class="cmp">
    <div class="cmp-head reveal">${who(L)}<div class="cmp-vs">VS</div>${who(R)}</div>
    <div class="panel reveal"><div class="progress"><i id="cmpbar"></i></div><div class="psub" id="cmpstat">Разбираем игры…</div></div>
    <div id="cmpout"></div></div>`;
  fx(app);
  const total = L.list.length + R.list.length || 1;
  let done = 0;
  const step = () => { if (!$('#cmpbar')) return false; done++; $('#cmpbar').style.width = `${done / total * 100}%`; return true; };
  const gl = await loadGames(L.id, L.list, C, step);
  if (!gl) return;
  const gr = await loadGames(R.id, R.list, C, step);
  if (!gr) return;
  $('#cmpstat').closest('.panel').remove();
  const hidden = [[L, gl], [R, gr]].filter(([, g]) => !g.length).map(([s]) => name(s));
  if (hidden.length) {
    $('#cmpout').innerHTML = `<div class="panel empty">У ${hidden.map(esc).join(' и ')} нет открытых матчей (история скрыта в настройках Dota 2), сравнить не получится.</div>`;
    return;
  }
  draw($('#cmpout'), summarize(gl), summarize(gr), L, R);
}

const name = (s) => s.prof?.profile?.personaname || `Игрок ${s.id}`;
const who = (s) => `<a class="cmp-who" href="#/player/${s.id}"><img src="${esc(s.prof?.profile?.avatarfull || '')}" alt=""><b>${esc(name(s))}</b>${me() === s.id ? '<span class="tag you">ТЫ</span>' : ''}</a>`;

function draw(out, l, r, L, R) {
  // [подпись, левое, правое, больше = лучше?, формат]
  const rows = [
    ['Винрейт', l.wr, r.wr, true, (v) => `${v}%`], ['Среднее влияние', l.score, r.score, true, (v) => v],
    ['Раз руинер', l.ruiner, r.ruiner, false, (v) => v], ['Раз MVP', l.mvp, r.mvp, true, (v) => v],
    ['Смертей за игру', +l.deaths.toFixed(1), +r.deaths.toFixed(1), false, (v) => v], ['Золото в минуту', l.gpm, r.gpm, true, (v) => v],
    ['Участие в драках', l.kp, r.kp, true, (v) => `${v}%`],
  ];
  const bar = (lv, rv, more) => {
    const max = Math.max(lv, rv, 1);
    const lw = lv === rv ? 0 : (lv > rv) === more ? 1 : 0;
    return `<div class="cmp-bar"><i class="l ${lw ? 'win' : ''}" style="--w:${lv / max * 100}%"></i></div><div class="cmp-bar"><i class="r ${lv !== rv && !lw ? 'win' : ''}" style="--w:${rv / max * 100}%"></i></div>`;
  };
  const prof = l.profile.map((x) => ({ ...x, r: r.profile.find((y) => y.k === x.k)?.v })).filter((x) => x.r != null);
  const lw = rows.filter(([, lv, rv, more]) => lv !== rv && (lv > rv) === more).length;
  const rw = rows.filter(([, lv, rv, more]) => lv !== rv && (lv > rv) !== more).length;
  const score = lw - rw;
  out.innerHTML = `
    <div class="panel reveal cmp-verdict"><b>${score > 0 ? esc(name(L)) : score < 0 ? esc(name(R)) : 'Ничья'}</b>
      <span>${score === 0 ? 'по основным показателям игроки равны' : `лучше по ${Math.max(lw, rw)} из ${rows.length} показателей`}</span></div>
    <div class="panel reveal"><h3>Последние ${N} игр</h3>${rows.map(([t, lv, rv, more, f]) => `
      <div class="cmp-row"><span class="num">${f(lv)}</span>${bar(lv, rv, more)}<span class="num">${f(rv)}</span><em>${t}</em></div>`).join('')}</div>
    <div class="panel reveal"><h3>Профиль игрока <small>0–100, 50 это средний игрок на тех же героях</small></h3>${prof.map((x) => `
      <div class="cmp-row"><span class="num">${x.v}</span>${bar(x.v, x.r, true)}<span class="num">${x.r}</span><em>${x.label}</em></div>`).join('')}</div>
    <div class="cmp-two">${[l, r].map((s) => `<div class="panel reveal"><h3>Герои и ошибки</h3>
      ${s.heroes.slice(0, 3).map((h) => `<div class="hrow"><img src="${heroImg(h.key)}" alt=""><span>${esc(h.name)}</span><span class="psub">${h.n} игр</span><b>${Math.round(h.s / h.n)}</b></div>`).join('')}
      <div class="sub">Чаще всего</div>${s.mistakes.slice(0, 3).map(([t, c]) => `<div class="chip neg" style="margin:0 4px 4px 0">${esc(t)} · ${c}</div>`).join('') || '<p class="psub">Повторяющихся ошибок нет.</p>'}</div>`).join('')}</div>`;
  fx(out);
}

function askSecond(app, a) {
  app.innerHTML = `<div class="coachland reveal"><div class="lbl">Сравнение</div><h1 class="hero-title" style="font-size:clamp(30px,4.5vw,54px)">С кем <em>сравнить</em>?</h1>
    <p class="lead">Вставь профиль друга (ссылку Steam, Dotabuff, OpenDota или код для друзей). Сравним последние ${N} игр: винрейт, влияние, сколько раз руинил, профиль метрик и ошибки.</p>
    <form class="search" id="cmpf"><input id="cmpq" placeholder="Профиль или код для друзей" autocomplete="off"><button class="btn big red">${ic('swords')} Сравнить</button></form></div>`;
  fx(app);
  $('#cmpf').onsubmit = (e) => {
    e.preventDefault();
    const r = parseInput($('#cmpq').value);
    const b = r.player || r.ambiguous;
    if (!b) return toast('Нужна ссылка на профиль или код для друзей');
    location.hash = `#/compare/${a}/${b}`;
  };
}
