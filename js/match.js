// Страница матча: вердикт, вкладки, карта, график, ИИ, карточка «Поделиться».
import { $, $$, esc, fmt, OD, getJSON, consts, heroImg, heroTall, itemImg, store, toast, md, askAI, fx } from './util.js';
import { analyze, defend, mmss, rankName } from './analyze.js';
import { coachSection, me, itemTimings } from './coach.js';

let A; // текущий разбор
let C; // справочники

const TABS = [
  ['players', 'Игроки'], ['coach', 'Обучение'], ['chart', 'График'], ['map', 'Карта'], ['episodes', 'Эпизоды'], ['lanes', 'Линии'], ['noms', 'Номинации'],
  ['builds', 'Билды'], ['draft', 'Драфт'], ['accounts', 'Аккаунты'], ['chat', 'Чат'], ['ai', 'ИИ-разбор'],
];

export async function renderMatch(app, id) {
  app.innerHTML = '<div class="loading"><div class="spinner"></div>Загружаем матч…</div>';
  C = await consts();
  let m;
  try {
    m = await getJSON(`${OD}/matches/${id}`);
  } catch (e) {
    app.innerHTML = `<div class="error">${e.status === 404 ? `Матч ${esc(id)} не найден. Проверь ID.` : 'OpenDota не отвечает, попробуй через минуту.'}</div>`;
    return;
  }
  if (!m.players?.length) {
    app.innerHTML = '<div class="error">У матча нет данных об игроках.</div>';
    return;
  }
  A = analyze(m, { heroes: C.heroes, itemsById: C.itemsById });
  saveRecent();
  draw(app);
  if (!A.parsed) requestParse(app, id);
}

function saveRecent() {
  const r = store.get('recent', []).filter((x) => x.id !== A.id);
  r.unshift({ id: A.id, hero: A.ruiner.heroKey, ruiner: A.ruiner.hero });
  store.set('recent', r.slice(0, 8));
}

// Матч без разбора реплея: просим OpenDota распарсить и ждём.
async function requestParse(app, id) {
  const b = $('#parse');
  try {
    const job = await getJSON(`${OD}/request/${id}`, { method: 'POST' });
    const jobId = job?.job?.jobId;
    for (let i = 0; i < 40 && jobId; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      if (!document.body.contains(b)) return;
      b.querySelector('span').textContent = `Скачиваем и разбираем реплей… ${(i + 1) * 5} сек.`;
      const st = await getJSON(`${OD}/request/${jobId}`).catch(() => ({}));
      if (st === null || st?.state === 'completed' || (st && !st.jobId && !st.state)) break;
    }
    const m = await getJSON(`${OD}/matches/${id}`);
    if (m.od_data?.has_parsed || m.version) {
      A = analyze(m, { heroes: C.heroes, itemsById: C.itemsById });
      draw(app);
      toast('Реплей разобран — анализ обновлён');
    } else b.querySelector('span').textContent = 'Реплей пока недоступен (у старых матчей Valve его удаляет). Показываем анализ по общей статистике.';
  } catch {
    b.querySelector('span').textContent = 'Не удалось заказать разбор реплея. Анализ — по общей статистике.';
  }
}

const portrait = (p, tall) => (tall ? heroTall(p.heroKey) : heroImg(p.heroKey));
const scoreBar = (s) => `<div class="bar ${s >= 60 ? 'good' : s >= 40 ? 'mid' : ''}"><i style="--w:${s}%"></i></div>`;
const teamName = (t) => (t === 'radiant' ? 'Силы Света' : 'Силы Тьмы');

// Кольцевой индикатор: значение 0..100, подпись под ним.
function ring(value, label, tone = 'red', hint = '') {
  const c = 2 * Math.PI * 26;
  return `<div class="ring ${tone}" title="${esc(hint)}"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" class="rb"/>
    <circle cx="32" cy="32" r="26" class="rf" style="stroke-dasharray:${c};--off:${c * (1 - value / 100)}"/></svg>
    <b data-count="${value}">0</b><span>${label}</span></div>`;
}

function statTile(label, value, sub = '') {
  return `<div class="tile"><div class="lbl">${label}</div><div class="num">${value}</div>${sub ? `<div class="psub">${sub}</div>` : ''}</div>`;
}

function draw(app) {
  const r = A.ruiner;
  const mvp = A.mvp;
  app.innerHTML = `
    <div class="mhead reveal">
      <div><div class="lbl">Матч</div><h1>${A.id}</h1></div>
      <div class="pill"><span class="lbl">Счёт</span><b class="score"><span class="rad">${A.score.radiant}</span> : <span class="dire">${A.score.dire}</span></b></div>
      <div class="pill"><span class="lbl">Длительность</span><b>${mmss(A.duration)}</b></div>
      <div class="pill"><span class="lbl">Победа</span><b class="${A.winner === 'radiant' ? 'rad' : 'dire'}">${teamName(A.winner)}</b></div>
      ${A.rank ? `<div class="pill"><span class="lbl">Средний ранг</span><b>${rankName(A.rank)}</b></div>` : ''}
      <div class="pill"><span class="lbl">Дата</span><b>${new Date(A.startTime * 1000).toLocaleDateString('ru-RU')}</b></div>
    </div>
    ${A.parsed ? '' : '<div class="banner" id="parse"><div class="spinner" style="width:22px;height:22px;margin:0;border-width:2px"></div><span>Реплей ещё не разобран — заказали разбор у OpenDota. Пока показываем анализ по общей статистике.</span></div>'}
    <section class="verdict">
      <div class="vcard tilt reveal"><div class="gyro" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="vstage" data-hero3d="${r.heroKey}" data-tone="red"><img class="portrait" src="${portrait(r, 1)}" alt="${esc(r.hero)}"></div>
        <div class="vbody">
          <div class="vlabel glitch" data-text="ЗАРУИНИЛ">ЗАРУИНИЛ</div>
          <div class="vname">${esc(r.name)}</div>
          <div class="vhero">${esc(r.hero)} · позиция ${r.role} · ${teamName(r.team)}</div>
          <div class="tiles">
            ${statTile('Убийства / смерти / помощь', `${r.k}/${r.d}/${r.a}`)}
            ${statTile('Золото в минуту', r.gpm)}
            ${statTile('Урон по героям', fmt(r.dmg))}
            ${statTile('Участие в драках', `${Math.round(r.kp * 100)}%`)}
          </div>
          <div class="rings">
            ${ring(r.share, 'руин в катке', 'red', 'Доля вины в поражении среди пяти проигравших')}
            ${ring(r.score, 'влияние на игру', 'blue', 'Итог модели 0–100: чем ниже, тем хуже сыграл')}
            ${ring(A.stability, 'устойчивость', 'gold', 'Как часто он остаётся руинером, если 400 раз случайно поменять веса метрик')}
          </div>
          <div class="vnote">Уверенность модели <b>${A.confidence}%</b>${A.gap < 6 ? ` · почти вровень с ${esc(A.nearRuiner.hero)}` : ''}</div>
        </div>
      </div>
      <div class="vside">
        <div class="vcard mvp tilt reveal">
          <div class="vstage" data-hero3d="${mvp.heroKey}" data-tone="gold"><img class="portrait" src="${portrait(mvp, 1)}" alt=""></div>
          <div class="vbody"><div class="vlabel">MVP</div><div class="vname">${esc(mvp.name)}</div>
          <div class="vhero">${esc(mvp.hero)} · ${mvp.k}/${mvp.d}/${mvp.a} · ${mvp.gpm} золота/мин</div>
          <div class="meter"><span>Влияние на игру</span>${scoreBar(mvp.score)}<b>${mvp.score}</b></div>
          <div class="meter"><span>Вклад в победу</span>${scoreBar(mvp.share * 2.5)}<b>${mvp.share}%</b></div></div>
        </div>
        ${mini('Лучший у проигравших', A.bestLoser, `руин ${A.bestLoser.share}% · тащил как мог`)}
        ${mini('Почти заруинил', A.nearRuiner, `руин ${A.nearRuiner.share}% · влияние ${A.nearRuiner.score}`)}
        ${mini('Пассажир победы', A.passenger, `вклад ${A.passenger.share}% · победили без него`)}
      </div>
    </section>
    <div class="reasons reveal">${r.neg.slice(0, 4).map((x) => `<div class="reason"><b>${esc(x.title)}</b><span>${esc(x.text)}</span></div>`).join('') || '<div class="reason"><b>Явных провалов нет</b><span>Просто хуже остальных по сумме метрик.</span></div>'}</div>
    <div class="actions">
      <button class="btn ghost" data-act="defend">⚖️ Оправдать руинера</button>
      <button class="btn ghost" data-act="why">🔍 Почему именно он?</button>
      <button class="btn" data-act="ai">🧠 Разбор от ИИ</button>
      <button class="btn gold" data-act="share">📤 Поделиться</button>
      <a class="btn ghost" href="#/sets/${r.heroKey}">👕 Сеты на ${esc(r.hero)}</a>
    </div>
    <div id="extra"></div>
    <nav class="tabs"><div class="tabs-in">${TABS.map(([k, t], i) => `<button data-tab="${k}" class="${i ? '' : 'on'}">${t}</button>`).join('')}<i class="tab-ind"></i></div></nav>
    ${TABS.map(([k, t], i) => `<section class="msec" id="sec-${k}"><div class="msec-n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</div>
      <h2 class="msec-t">${t}</h2><div class="msec-b" data-sec="${k}"></div></section>`).join('')}`;

  const moveInd = (b) => {
    const ind = $('.tab-ind', app);
    if (!ind || !b) return; // успели уйти со страницы матча
    ind.style.width = `${b.offsetWidth}px`;
    ind.style.transform = `translateX(${b.offsetLeft}px)`;
  };
  const mark = (k) => {
    const b = $(`[data-tab="${k}"]`, app);
    $$('[data-tab]', app).forEach((x) => x.classList.toggle('on', x === b));
    moveInd(b);
    b?.scrollIntoView({ block: 'nearest', inline: 'center' });
  };
  // Навигация = прокрутка к разделу; при прокрутке подсвечиваем текущий.
  $$('[data-tab]', app).forEach((b) => (b.onclick = () => $(`#sec-${b.dataset.tab}`).scrollIntoView({ behavior: 'smooth' })));
  requestAnimationFrame(() => moveInd($('[data-tab].on', app)));
  const spy = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && mark(e.target.id.slice(4))), { rootMargin: '-35% 0px -60% 0px' });
  // Разделы рисуются, когда до них почти долистали: драфт, аккаунты и мета делают десятки запросов.
  const lazy = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    lazy.unobserve(e.target);
    showTab(e.target.dataset.sec, e.target);
  }), { rootMargin: '600px 0px' });
  const HEAVY = ['builds', 'draft', 'accounts'];
  $$('.msec', app).forEach((sec) => {
    spy.observe(sec);
    const b = $('.msec-b', sec);
    if (HEAVY.includes(b.dataset.sec)) lazy.observe(b);
    else showTab(b.dataset.sec, b);
  });
  window.addEventListener('hashchange', () => { spy.disconnect(); lazy.disconnect(); }, { once: true });
  $$('[data-act]', app).forEach((b) => (b.onclick = () => action(b.dataset.act)));
  fx(app);
  mount3d(app);
}

// Живые герои в карточках вердикта, если для них выгружены 3D-модели.
async function mount3d(root) {
  const v3 = await import('./viewer3d.js').catch(() => null);
  if (!v3) return;
  for (const el of $$('[data-hero3d]', root)) v3.showcase(el, el.dataset.hero3d, el.dataset.tone);
}

function mini(title, p, sub) {
  return `<div class="mini tilt reveal"><img src="${portrait(p)}" alt=""><div><div class="t">${title}</div><div class="n">${esc(p.name)}</div><div class="s">${esc(p.hero)} · ${sub}</div></div></div>`;
}

function action(act) {
  const box = $('#extra');
  const r = A.ruiner;
  if (act === 'defend') {
    box.innerHTML = `<div class="panel reveal"><h3>Оправдать руинера?</h3><div class="reasons">${defend(A, r).map((t) => `<div class="reason pos"><span>${esc(t)}</span></div>`).join('')}</div></div>`;
  } else if (act === 'why') {
    const losers = A.players.filter((p) => !p.win).sort((a, b) => a.score - b.score);
    box.innerHTML = `<div class="panel reveal"><h3>Почему именно он?</h3>
      <p style="margin-top:0;color:var(--muted)">Каждого игрока модель сравнивает с другими на том же герое (перцентили OpenDota) и с ожиданиями его роли. Считаются 10–11 метрик: фарм, урон, смерти и их цена, дисциплина (смерти без команды, перед потерей зданий, при большом перевесе), командные драки, линия к 10:00, обзор, давление на здания. Руинер — игрок проигравшей команды с самым низким итогом. Устойчивость ${A.stability}% означает, что при 400 случайных вариантах весов он остаётся руинером в ${A.stability}% случаев.</p>
      <div class="whygrid">${losers.map((p) => `<div class="sc"><span class="pname">${esc(p.hero)}</span>${scoreBar(p.score)}<span class="num">${p.score}</span><span class="chip ${p === r ? 'neg' : ''}">руин ${p.share}%</span></div>`).join('')}</div>
      <div class="sub">Из чего сложился счёт ${esc(r.hero)}</div>${breakdown(r)}
      <div class="sub">Все сигналы против ${esc(r.hero)}</div>
      <div class="reasons">${r.neg.map((x) => `<div class="reason"><b>${esc(x.title)}</b><span>${esc(x.text)}</span></div>`).join('')}</div></div>`;
  } else if (act === 'ai') {
    $('#sec-ai').scrollIntoView({ behavior: 'smooth' });
    return;
  } else if (act === 'share') return share();
  fx(box);
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// Разложение итога: каждая метрика — её значение 0–100 и вес в формуле.
function breakdown(p) {
  return `<div class="bd">${p.breakdown.slice().sort((a, b) => b.weight - a.weight).map((b) => {
    const v = Math.round(b.value * 100);
    return `<div class="bdr"><span>${b.label}</span><div class="bar ${v >= 60 ? 'good' : v >= 40 ? 'mid' : ''}"><i style="--w:${v}%"></i></div><b>${v}</b><em>вес ${Math.round(b.weight * 100)}%</em></div>`;
  }).join('')}${p.toxicPenalty ? `<div class="bdr"><span>Штраф за токсичность</span><div></div><b>−${p.toxicPenalty}</b><em></em></div>` : ''}</div>`;
}

function showTab(k, el) {
  const f = { players, coach: (e) => coachSection(e, A, C), chart, map, episodes, lanes, noms, builds, draft, accounts, chat, ai }[k];
  f(el);
  fx(el);
}

// ---------- игроки
function players(el) {
  const teams = ['radiant', 'dire'].sort((a) => (a === A.winner ? -1 : 1));
  el.innerHTML = teams.map((t) => {
    const win = t === A.winner;
    return `
    <div class="panel reveal"><div class="teamhead"><span class="${t === 'radiant' ? 'rad' : 'dire'}">${teamName(t)} · ${win ? 'победа' : 'поражение'}</span>
    <span class="lbl">Ценность команды ${fmt(A.teamNw[t])}</span></div>
    <div class="prow thead"><span></span><span>Игрок</span><span>Убийства / смерти / помощь</span><span class="hide-m hide-s">Золото в минуту</span>
      <span class="hide-m hide-s">Участие в драках</span><span>Влияние на игру (0–100)</span><span class="hide-s">${win ? 'Вклад в победу' : 'Руин в катке'}</span><span class="hide-s"></span></div>
    ${A.players.filter((p) => p.team === t).sort((a, b) => a.role - b.role).map(prow).join('')}</div>`;
  }).join('');
  $$('.prow:not(.thead)', el).forEach((row) => (row.onclick = () => {
    const open = row.classList.toggle('open');
    const next = row.nextElementSibling;
    if (next?.classList.contains('pdetail')) next.remove();
    if (open) {
      row.insertAdjacentHTML('afterend', pdetail(A.players[row.dataset.i]));
      bindDetail(row.nextElementSibling, A.players[row.dataset.i]);
      fx(row.nextElementSibling);
    }
  }));
}

function prow(p) {
  const cls = p === A.ruiner ? 'ruiner' : p === A.mvp ? 'mvp' : '';
  const tag = (p === A.ruiner ? '<span class="tag r">РУИНЕР</span>' : p === A.mvp ? '<span class="tag m">MVP</span>' : '') + (me() && p.accountId === me() ? '<span class="tag you">ТЫ</span>' : '');
  const top = p.neg[0] || p.pos[0];
  return `<div class="prow ${cls}" data-i="${p.idx}">
    <img class="h" src="${portrait(p)}" alt="">
    <div style="min-width:0"><div class="pname">${esc(p.name)}${tag}</div><div class="psub">${esc(p.hero)} · поз. ${p.role}${top ? ` · ${esc(top.title)}` : ''}</div></div>
    <div class="num">${p.k}/${p.d}/${p.a}</div>
    <div class="num hide-m hide-s">${p.gpm}</div>
    <div class="num hide-m hide-s">${Math.round(p.kp * 100)}%</div>
    <div class="sc">${scoreBar(p.score)}<span class="num">${p.score}</span></div>
    <div class="hide-s"><span class="share ${p.win ? 'w' : 'l'}" style="--p:${p.share}">${p.share}%</span></div>
    <span class="caret hide-s">▾</span></div>`;
}

const itemIcons = (ids) => ids.map((id) => {
  const k = C.itemsById[id];
  return k ? `<img src="${itemImg(k)}" title="${esc(C.itemsByKey[k]?.name || k)}" alt="" loading="lazy">` : '';
}).join('');

function pdetail(p) {
  const st = [['Ценность героя (NW)', fmt(p.nw)], ['Опыт в минуту', p.xpm], ['Добито / не отдано', `${p.lh} / ${p.dn}`], ['Урон по героям', fmt(p.dmg)],
    ['Доля урона команды', `${Math.round(p.dmgShare * 100)}%`], ['Урон по зданиям', fmt(p.tower)], ['Лечение', fmt(p.heal)], ['Варды obs / sentry', `${p.obs} / ${p.sen}`],
    ['Контроль', `${Math.round(p.stuns)} с`], ['Мёртв от игры', `${Math.round(p.deadShare * 100)}%`], ['Цена смертей', fmt(p.deathCost)], ['Скормил врагам', fmt(p.fed)],
    ['Большие драки', p.fightsAll ? `${p.fightsIn} из ${p.fightsAll}` : '—'], ['Золото к 10:00', p.gold10 != null ? fmt(p.gold10) : '—'],
    ['Линия против соперника', p.laneDiff != null ? `${p.laneDiff > 0 ? '+' : '−'}${fmt(Math.abs(p.laneDiff))}` : '—', p.laneOpp ? `vs ${esc(p.laneOpp)}` : ''], ['Действий в минуту', p.apm ?? '—']];
  return `<div class="pdetail">
    <div class="stats">${st.map(([k, v, s]) => statTile(k, v, s)).join('')}</div>
    <div class="items">${itemIcons([...p.items, p.neutral].filter(Boolean))}</div>
    <div class="sub">Из чего сложился счёт (${p.score}/100)</div>${breakdown(p)}
    ${p.neg.length ? `<div class="sub">Ошибки</div><div class="reasons">${p.neg.map((x) => `<div class="reason"><b>${esc(x.title)}</b><span>${esc(x.text)}</span></div>`).join('')}</div>` : ''}
    ${p.pos.length ? `<div class="sub">Сильные стороны</div><div class="reasons">${p.pos.map((x) => `<div class="reason pos"><b>${esc(x.title)}</b><span>${esc(x.text)}</span></div>`).join('')}</div>` : ''}
    <div class="actions"><button class="btn" data-coach>🧠 Советы от ИИ</button><a class="btn ghost" href="#/sets/${p.heroKey}">👕 Сеты на ${esc(p.hero)}</a>
    ${p.accountId ? `<a class="btn ghost" href="#/player/${p.accountId}">Другие матчи игрока</a>` : ''}</div>
    <div data-coachbox></div></div>`;
}

// ---------- линии
function lanes(el) {
  const col = (ps) => ps.map((p) => `<div class="lp"><img src="${portrait(p)}" alt=""><div><div class="pname">${esc(p.hero)}</div><div class="psub">${fmt(p.gold10)} золота · ${p.lh10 ?? '—'} крипов</div></div></div>`).join('');
  el.innerHTML = `<div class="panel"><h3>Стадия линий <small>золото героев к 10:00</small></h3>
    ${A.lanes.length ? `<div class="lanes">${A.lanes.map((l) => `<div class="lane reveal ${l.winner || ''}">
      <div class="lane-h"><b>${l.lane} линия</b><span class="${l.winner === 'radiant' ? 'rad' : l.winner === 'dire' ? 'dire' : 'psub'}">${l.winner ? `${teamName(l.winner)} +${fmt(Math.abs(l.diff))}` : 'примерно ровно'}</span></div>
      <div class="lane-b"><div>${col(l.radiant)}</div><div class="vs">VS</div><div>${col(l.dire)}</div></div>
      <div class="tug"><i style="--p:${50 + Math.max(-45, Math.min(45, l.diff / 80))}%"></i></div></div>`).join('')}</div>` : '<div class="empty">Для линий нужен разобранный реплей.</div>'}
  </div>`;
}

// ---------- аккаунты: смурфы и опыт игроков
async function accounts(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Смотрим профили игроков…</div>';
  const rows = await Promise.all(A.players.map(async (p) => {
    if (!p.accountId) return { p, hidden: true };
    const [prof, wl, heroes] = await Promise.all([
      getJSON(`${OD}/players/${p.accountId}`).catch(() => null),
      getJSON(`${OD}/players/${p.accountId}/wl`).catch(() => null),
      getJSON(`${OD}/players/${p.accountId}/heroes?hero_id=${p.heroId}`).catch(() => null),
    ]);
    // 0 игр у OpenDota почти всегда значит закрытую историю матчей, а не новый аккаунт
    const games = wl && wl.win + wl.lose > 0 ? wl.win + wl.lose : null;
    const onHero = heroes?.find?.((h) => +h.hero_id === p.heroId)?.games ?? null;
    const hi = (p.m01.farm + p.m01.dmg + p.m01.deaths) / 3;
    const smurf = games != null && games < 400 && hi > 0.75 ? 'Похож на смурфа' : games != null && games < 150 ? 'Новый аккаунт' : null;
    return { p, prof, games, wr: games ? Math.round(wl.win / games * 100) : null, onHero: games ? onHero : null, smurf, closed: games == null };
  }));
  if (!document.body.contains(el)) return;
  el.innerHTML = `<div class="panel"><h3>Аккаунты <small>опыт игроков и проверка на смурфов</small></h3>
    <div class="prow thead acc"><span></span><span>Игрок</span><span>Всего игр</span><span class="hide-s">Винрейт</span><span class="hide-s">Игр на герое</span><span>Пометка</span></div>
    ${rows.map((x) => `<div class="prow acc ${x.smurf ? 'ruiner' : ''}"><img class="h" src="${portrait(x.p)}" alt="">
      <div style="min-width:0"><div class="pname">${esc(x.p.name)}</div><div class="psub">${esc(x.p.hero)} · ${x.prof?.rank_tier ? rankName(x.prof.rank_tier) : 'ранг скрыт'}</div></div>
      <div class="num">${x.hidden ? 'аноним' : x.games != null ? fmt(x.games) : '<span class="psub">история скрыта</span>'}</div><div class="num hide-s">${x.wr != null ? x.wr + '%' : '—'}</div>
      <div class="num hide-s">${x.onHero ?? '—'}</div><div>${x.smurf ? `<span class="chip neg">${x.smurf}</span>` : x.onHero != null && x.onHero < 5 ? '<span class="chip">впервые на герое</span>' : ''}</div></div>`).join('')}
    <p class="psub" style="margin:12px 0 0">«Похож на смурфа» — меньше 400 игр на аккаунте и показатели лучше 75% игроков на этом герое. Скрытый профиль нельзя проверить.</p></div>`;
}

function bindDetail(el, p) {
  $('[data-coach]', el).onclick = async (e) => {
    const box = $('[data-coachbox]', el);
    e.target.disabled = true;
    box.innerHTML = '<div class="loading" style="padding:20px"><div class="spinner"></div>ИИ смотрит на игру…</div>';
    try {
      const text = await askAI('player', { match: brief(), player: playerBrief(p) });
      box.innerHTML = `<div class="panel aibox ai">${md(text)}</div>`;
    } catch (err) {
      box.innerHTML = `<div class="panel aibox ai">${aiFallbackNote(err)}${md(coachRules(p))}</div>`;
    }
    e.target.disabled = false;
  };
}

// ---------- график золота
function chart(el) {
  const g = A.advantage.gold;
  const x = A.advantage.xp;
  if (!g.length) {
    el.innerHTML = '<div class="panel empty">Для этого матча нет поминутных данных.</div>';
    return;
  }
  const W = 900, H = 300, P = 34;
  const max = Math.max(1000, ...g.map(Math.abs), ...x.map(Math.abs));
  const sx = (i) => P + (i / (g.length - 1)) * (W - P * 2);
  const sy = (v) => H / 2 - (v / max) * (H / 2 - 20);
  const line = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join('');
  const area = `${line(g)}L${sx(g.length - 1)},${H / 2}L${sx(0)},${H / 2}Z`;
  const tsec = (t) => P + (t / 60 / (g.length - 1)) * (W - P * 2);
  const ticks = [];
  for (let mnt = 0; mnt < g.length; mnt += 5) ticks.push(`<text x="${sx(mnt)}" y="${H - 4}" fill="#8b91a5" font-size="11" text-anchor="middle">${mnt}</text>`);
  const r = A.ruiner;
  const turn = A.turning;
  el.innerHTML = `<div class="panel"><h3>Преимущество по золоту и опыту <small>выше — Силы Света, ниже — Силы Тьмы</small></h3>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="График преимущества">
      <defs>
        <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fd36f" stop-opacity=".45"/><stop offset=".5" stop-color="#5fd36f" stop-opacity="0"/><stop offset=".5" stop-color="#ff6a3d" stop-opacity="0"/><stop offset="1" stop-color="#ff6a3d" stop-opacity=".45"/></linearGradient>
      </defs>
      <line x1="${P}" x2="${W - P}" y1="${H / 2}" y2="${H / 2}" stroke="#262a38"/>
      <text x="${P}" y="16" fill="#5fd36f" font-size="11">+${fmt(max)}</text><text x="${P}" y="${H - 18}" fill="#ff6a3d" font-size="11">−${fmt(max)}</text>
      ${A.fights.map((f) => `<rect x="${tsec(f.start)}" y="20" width="${Math.max(2, tsec(f.end) - tsec(f.start))}" height="${H - 46}" fill="#3d8bff" opacity=".08"/>`).join('')}
      ${turn && turn.minute > 1 ? `<line x1="${sx(turn.minute)}" x2="${sx(turn.minute)}" y1="14" y2="${H - 22}" stroke="#ffc23d" stroke-dasharray="4 4"/><text x="${sx(turn.minute) + 4}" y="26" fill="#ffc23d" font-size="11">перелом ${turn.minute}:00</text>` : ''}
      <path d="${area}" fill="url(#ga)"/>
      <path d="${line(x)}" fill="none" stroke="#8b91a5" stroke-width="1.5" stroke-dasharray="5 4"/>
      <path d="${line(g)}" fill="none" stroke="#eceef4" stroke-width="2.2"/>
      ${r.deathTimes.map((t) => `<g><circle cx="${tsec(t)}" cy="${H - 30}" r="5" fill="#ff3b3b"/><title>${esc(r.hero)} умер на ${mmss(t)}</title></g>`).join('')}
      ${ticks.join('')}
    </svg>
    <div class="legend"><span><i style="background:#eceef4"></i>Золото</span><span><i style="background:#8b91a5"></i>Опыт</span><span><i style="background:#ff3b3b"></i>Смерти руинера (${esc(r.hero)})</span><span><i style="background:#3d8bff;opacity:.5"></i>Командные драки</span>${turn?.minute > 1 ? '<span><i style="background:#ffc23d"></i>Перелом</span>' : ''}</div>
    <p style="color:var(--muted);margin:12px 0 0;font-size:14px">${turnText()}</p></div>`;
}

function turnText() {
  const t = A.turning;
  if (!t) return '';
  const w = teamName(A.winner);
  const l = teamName(A.winner === 'radiant' ? 'dire' : 'radiant');
  if (t.comeback) return `Камбэк! ${l} вели до ${fmt(t.loserMax)} золота на ${t.loserMaxAt + 1}-й минуте, но ${w} отыгрались и окончательно вышли вперёд на ${t.minute}-й минуте.`;
  if (t.minute <= 1) return `${w} вели с первых минут и ни разу не отдали преимущество.`;
  return `${w} окончательно перехватили преимущество на ${t.minute}-й минуте. Максимум у проигравших — ${fmt(t.loserMax)} золота.`;
}

// ---------- карта (координаты OpenDota: клетки 64..192)
const MX = (x) => x - 64;
const MY = (y) => 192 - y;

function mapSvg() {
  // настоящая мини-карта из файлов игры, слегка притемнённая, чтобы метки читались
  return `<image href="img/minimap.webp" width="128" height="128" preserveAspectRatio="none"/><rect width="128" height="128" fill="#05070b" opacity=".28"/>`;
}

function map(el) {
  const pl = A.players;
  el.innerHTML = `<div class="panel"><h3>Карта матча <small>смерти, варды и где проводил время игрок</small></h3>
    <div class="mapwrap">
      <svg class="map" id="mp" viewBox="0 0 128 128"></svg>
      <div class="mapctl">
        <label class="lbl">Время: <b id="mt" style="color:var(--text)">весь матч</b></label>
        <input type="range" id="mr" min="0" max="${A.duration}" value="${A.duration}" step="10">
        <div class="checks">
          <label><input type="checkbox" id="mall" checked> Весь матч</label>
          <label><input type="checkbox" id="md" checked> Смерти</label>
          <label><input type="checkbox" id="mo" checked> Observer</label>
          <label><input type="checkbox" id="ms" checked> Sentry</label>
        </div>
        <select id="mpl"><option value="">Все игроки</option>${pl.map((p) => `<option value="${p.idx}" ${p === A.ruiner ? 'selected' : ''}>${esc(p.hero)} — ${esc(p.name)}${p === A.ruiner ? ' (руинер)' : ''}</option>`).join('')}</select>
        <div class="mapinfo" id="mi"></div>
        <div class="legend"><span><i style="background:#5fd36f"></i>Свет</span><span><i style="background:#ff6a3d"></i>Тьма</span><span><i style="background:#ffd84a"></i>Observer</span><span><i style="background:#62b6ff"></i>Sentry</span><span>✕ — смерть</span><span><i style="background:#fff;opacity:.4"></i>Где был игрок</span></div>
      </div>
    </div></div>`;
  const svg = $('#mp');
  const deaths = A.fights.flatMap((f) => f.deaths.filter((d) => d.x != null).map((d) => ({ ...d, t: f.start })));
  const wards = pl.flatMap((p) => [...p.obsLog.map((w) => ({ p, w, kind: 'obs' })), ...p.senLog.map((w) => ({ p, w, kind: 'sen' }))]);
  const redraw = () => {
    const all = $('#mall').checked;
    const t = +$('#mr').value;
    const sel = $('#mpl').value === '' ? null : A.players[$('#mpl').value];
    $('#mt').textContent = all ? 'весь матч' : mmss(t);
    const inT = (time, life) => all || (time <= t && time + life >= t);
    let heat = '';
    if (sel?.lanePos) {
      const cells = Object.entries(sel.lanePos).flatMap(([x, ys]) => Object.entries(ys).map(([y, n]) => [+x, +y, n]));
      const mx = Math.max(...cells.map((c) => c[2]));
      heat = cells.map(([x, y, n]) => `<circle cx="${MX(x)}" cy="${MY(y)}" r="2.4" fill="#fff" opacity="${(0.08 + 0.5 * n / mx).toFixed(2)}"/>`).join('');
    }
    const ds = $('#md').checked ? deaths.filter((d) => inT(d.t, 90) && (!sel || d.p === sel)) : [];
    const ws = wards.filter((x) => (x.kind === 'obs' ? $('#mo').checked : $('#ms').checked) && inT(x.w.time, x.kind === 'obs' ? 360 : 420) && (!sel || x.p === sel));
    svg.innerHTML = mapSvg() + heat +
      ws.map(({ w, kind, p }) => `<g><circle cx="${MX(w.x)}" cy="${MY(w.y)}" r="${kind === 'obs' ? 2.2 : 1.7}" fill="${kind === 'obs' ? '#ffd84a' : '#62b6ff'}" stroke="#000" stroke-width=".4" opacity=".9"/><title>${esc(p.hero)}: ${kind === 'obs' ? 'Observer' : 'Sentry'} на ${mmss(w.time)}</title></g>`).join('') +
      ds.map((d) => {
        const c = d.p.team === 'radiant' ? '#5fd36f' : '#ff6a3d';
        const big = d.p === A.ruiner;
        const s = big ? 2.6 : 1.8;
        return `<g><path d="M${MX(d.x) - s},${MY(d.y) - s}L${MX(d.x) + s},${MY(d.y) + s}M${MX(d.x) + s},${MY(d.y) - s}L${MX(d.x) - s},${MY(d.y) + s}" stroke="${big ? '#ff3b3b' : c}" stroke-width="${big ? 1.4 : 1}" stroke-linecap="round"/><title>${esc(d.p.hero)} умер ~${mmss(d.t)}</title></g>`;
      }).join('');
    $('#mi').innerHTML = sel
      ? `<b>${esc(sel.hero)}</b>: ${ds.length} смертей в драках на карте, ${ws.length} вардов. ${sel.soloDeaths.length ? `Ещё ${sel.soloDeaths.length} смертей вне драк (координат нет).` : ''}`
      : `На карте: <b>${ds.length}</b> смертей в драках и <b>${ws.length}</b> вардов.`;
  };
  $('#mr').oninput = () => { $('#mall').checked = false; redraw(); };
  $$('#mall,#md,#mo,#ms,#mpl').forEach((x) => (x.onchange = redraw));
  if (!A.parsed) $('#mi').textContent = 'Карта появится после разбора реплея.';
  redraw();
}

// ---------- эпизоды
function episodes(el) {
  const kinds = { all: 'Все', ruiner: 'Руинер', fight: 'Драки', building: 'Здания', rosh: 'Рошан' };
  const icon = { fb: '🩸', building: '🏚️', rosh: '🐉', fight: '⚔️', solo: '💀' };
  let f = 'all';
  const render = () => {
    const eps = A.episodes.filter((e) => f === 'all' || (f === 'ruiner' ? e.ruiner : e.kind === f));
    el.innerHTML = `<div class="panel"><h3>Ключевые эпизоды</h3>
      <div class="filters">${Object.entries(kinds).map(([k, t]) => `<button data-f="${k}" class="${k === f ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="eps">${eps.map((e) => `<div class="ep ${e.ruiner ? 'ruiner' : e.kind}"><div class="tm">${mmss(e.t)}</div><div>${icon[e.kind] || '•'}</div>
        <div><b>${esc(e.title)}</b><span>${esc(e.text)}</span></div></div>`).join('') || '<div class="empty">Нет эпизодов (реплей не разобран).</div>'}</div></div>`;
    $$('[data-f]', el).forEach((b) => (b.onclick = () => { f = b.dataset.f; render(); }));
  };
  render();
}

// ---------- номинации
function noms(el) {
  el.innerHTML = `<div class="panel"><h3>Номинации матча</h3><div class="noms">${A.noms.map((n) => `
    <div class="nom"><div class="ic">${n.icon}</div><div><b>${n.title}</b><div class="v">${n.desc}</div>
    <div class="who"><img src="${portrait(n.p)}" alt=""><span>${esc(n.p.name)}</span></div><div class="v">${esc(n.value)}</div></div></div>`).join('')}</div></div>`;
}

// ---------- билды
function builds(el) {
  const core = (k) => (C.itemsByKey[k]?.cost || 0) >= 1200;
  const list = A.players.slice().sort((a, b) => (a.team === b.team ? a.role - b.role : a.team === A.winner ? -1 : 1));
  el.innerHTML = `<p class="psub" style="margin:0 0 10px">Сверху — покупки игрока с таймингами. Снизу — что чаще всего собирают на этом герое в середине и конце игры (OpenDota): зелёная рамка — игрок это тоже купил.</p>` +
    list.map((p) => `
    <div class="panel reveal" data-build="${p.idx}"><div class="teamhead"><span>${esc(p.hero)} <span class="psub">— ${esc(p.name)}, поз. ${p.role}</span>${p === A.ruiner ? '<span class="tag r">РУИНЕР</span>' : ''}</span><span class="${p.win ? 'rad' : 'dire'}">${p.win ? 'победа' : 'поражение'}</span></div>
    <div class="timeline">${p.purchases.filter((x) => core(x.key)).map((x) => `<div><img src="${itemImg(x.key)}" alt="" title="${esc(C.itemsByKey[x.key]?.name || x.key)}" loading="lazy">${mmss(x.time)}</div>`).join('') || '<span class="psub">Нет данных о покупках</span>'}</div>
    <div class="meta" data-meta><span class="lbl">Мета на герое: загружаем…</span></div>
    <div class="tmchips" data-tm></div>
    ${p.neg.filter((x) => x.title === 'Нет сейв-предметов').map((x) => `<div class="psub" style="margin-top:8px;color:#ffb3b3">⚠ ${esc(x.text)}</div>`).join('')}</div>`).join('');
  // Популярные предметы на героях — по одному запросу на героя, параллельно.
  list.forEach(async (p) => {
    itemTimings(p.heroId, p.purchases, C.itemsByKey).then((tl) => {
      const box = $(`[data-build="${p.idx}"] [data-tm]`, el);
      if (box && tl.length) box.innerHTML = `<span class="lbl">Тайминги:</span>${tl.map((x) => `<span class="chip ${x.late > 0.7 ? 'neg' : x.late < 0.3 ? 'pos' : ''}" title="обычно к ${x.median ? mmss(x.median) : '—'}"><img src="${itemImg(x.key)}" alt="">${mmss(x.time)} · ${x.late > 0.7 ? `позже ${Math.round(x.late * 100)}%` : x.late < 0.3 ? `быстрее ${Math.round((1 - x.late) * 100)}%` : 'норма'}</span>`).join('')}`;
    });
    const pop = await getJSON(`${OD}/heroes/${p.heroId}/itemPopularity`).catch(() => null);
    const box = $(`[data-build="${p.idx}"] [data-meta]`, el);
    if (!box) return;
    if (!pop) { box.innerHTML = '<span class="psub">Мета недоступна</span>'; return; }
    const counts = {};
    for (const part of ['mid_game_items', 'late_game_items']) for (const [id, n] of Object.entries(pop[part] || {})) counts[id] = (counts[id] || 0) + n;
    const top = Object.entries(counts).map(([id, n]) => [C.itemsById[id], n]).filter(([k]) => k && core(k)).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
    const bought = new Set(p.purchases.map((x) => x.key));
    const hit = top.filter((k) => bought.has(k)).length;
    // «нестандартно» — только то, что на этом герое почти никто не берёт ни в какой фазе игры
    const all = {};
    for (const part of ['start_game_items', 'early_game_items', 'mid_game_items', 'late_game_items']) for (const [id, n] of Object.entries(pop[part] || {})) all[C.itemsById[id]] = (all[C.itemsById[id]] || 0) + n;
    const total = Object.values(all).reduce((a, b) => a + b, 0) || 1;
    const odd = [...bought].filter((k) => core(k) && (all[k] || 0) / total < 0.004);
    box.innerHTML = `<span class="lbl">Мета (${hit} из ${top.length}):</span>${top.map((k) => `<img class="${bought.has(k) ? 'got' : ''}" src="${itemImg(k)}" title="${esc(C.itemsByKey[k]?.name || k)}" alt="">`).join('')}
      ${odd.length ? `<span class="psub" style="margin-left:8px">нестандартно: ${odd.map((k) => esc(C.itemsByKey[k]?.name || k)).join(', ')}</span>` : ''}`;
  });
}

// ---------- драфт (винрейты пар героев по OpenDota)
async function draft(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Считаем матчапы героев…</div>';
  const side = (t) => A.players.filter((p) => p.team === t);
  try {
    const mu = await Promise.all(A.players.map((p) => getJSON(`${OD}/heroes/${p.heroId}/matchups`).catch(() => [])));
    const adv = A.players.map((p, i) => {
      const enemies = A.players.filter((q) => q.team !== p.team).map((q) => q.heroId);
      const rows = mu[i].filter((r) => enemies.includes(r.hero_id) && r.games_played > 20);
      const wr = rows.length ? rows.reduce((s, r) => s + r.wins / r.games_played, 0) / rows.length : 0.5;
      return { p, wr, worst: rows.sort((a, b) => a.wins / a.games_played - b.wins / b.games_played)[0] };
    });
    const teamWr = (t) => adv.filter((x) => x.p.team === t).reduce((s, x) => s + x.wr, 0) / 5;
    const rw = teamWr('radiant');
    const dw = teamWr('dire');
    const better = rw >= dw ? 'radiant' : 'dire';
    const col = (t) => `<div class="side">${side(t).map((p) => {
      const x = adv.find((a) => a.p === p);
      const bad = x.worst ? C.heroes[x.worst.hero_id]?.localized_name : null;
      return `<div class="h"><img src="${portrait(p)}" alt=""><div><div class="pname">${esc(p.hero)}</div><div class="psub">${bad ? `хуже всего против ${esc(bad)}` : ''}</div></div><span class="num ${x.wr >= 0.5 ? 'rad' : 'dire'}">${(x.wr * 100).toFixed(1)}%</span></div>`;
    }).join('')}</div>`;
    el.innerHTML = `<div class="panel"><h3>Чей драфт лучше? <small>средний винрейт героя против пятёрки соперников</small></h3>
      <div class="draft">${col('radiant')}<div class="vs"><div class="big rad">${(rw * 100).toFixed(1)}%</div>VS<div class="big dire">${(dw * 100).toFixed(1)}%</div></div>${col('dire')}</div>
      <p style="color:var(--muted);margin:14px 0 0">${Math.abs(rw - dw) < 0.01 ? 'Драфты равные — матч решила игра, а не пики.' : `Драфт лучше у ${teamName(better)} (+${(Math.abs(rw - dw) * 100).toFixed(1)} п.п.). ${better === A.winner ? 'Они и победили.' : 'Но победили соперники — значит, разыграли лучше.'}`}</p></div>`;
  } catch {
    el.innerHTML = '<div class="panel empty">Не удалось получить матчапы — попробуй позже.</div>';
  }
}

// ---------- чат
function chat(el) {
  el.innerHTML = `<div class="panel"><h3>Чат матча <small>${A.chat.filter((c) => c.toxic).length} грубых сообщений подсвечено</small></h3>
    <div class="chat">${A.chat.map((c) => `<div class="msg ${c.toxic ? 'toxic' : ''}"><span class="tm">${mmss(c.time)}</span>${c.p ? `<img src="${portrait(c.p)}" alt="">` : '<span></span>'}<span class="who ${c.p?.team === 'radiant' ? 'rad' : 'dire'}">${esc(c.p?.name || '?')}</span><span class="tx">${esc(c.text)}</span></div>`).join('') || '<div class="empty">В чате тишина.</div>'}</div></div>`;
}

// ---------- ИИ
function brief() {
  return {
    duration: mmss(A.duration), winner: teamName(A.winner), score: `${A.score.radiant}:${A.score.dire}`, rank: A.rank ? rankName(A.rank) : null,
    ruiner: `${A.ruiner.hero} (${A.ruiner.name})`, mvp: `${A.mvp.hero} (${A.mvp.name})`, turning: turnText(),
    players: A.players.map(playerBrief),
    fights: A.fights.filter((f) => f.deaths.length >= 3).map((f) => ({ t: mmss(f.start), deaths: f.deaths.map((d) => d.p.hero), won: teamName(f.won), swing: f.swing })),
  };
}
const playerBrief = (p) => ({
  hero: p.hero, name: p.name, team: teamName(p.team), win: p.win, pos: p.role, kda: `${p.k}/${p.d}/${p.a}`, gpm: p.gpm, xpm: p.xpm, nw: p.nw,
  dmg: p.dmg, kp: Math.round(p.kp * 100), wards: p.obs + p.sen, fed: p.fed, soloDeaths: p.soloDeaths.length, score: p.score,
  items: p.items.map((id) => C.itemsByKey[C.itemsById[id]]?.name).filter(Boolean),
  bad: p.neg.map((x) => `${x.title}: ${x.text}`), good: p.pos.map((x) => `${x.title}: ${x.text}`),
});

function aiFallbackNote(err) {
  return err?.status === 503
    ? '<p style="color:var(--muted)">ИИ ещё не подключён — пока разбор по правилам модели.</p>'
    : `<p style="color:var(--muted)">ИИ сейчас недоступен (${esc(err?.message)}). Разбор по правилам модели:</p>`;
}

function rulesStory() {
  const r = A.ruiner;
  const lose = A.players.filter((p) => !p.win && p !== r);
  return `## Кто заруинил
**${r.hero} (${r.name})** — влияние ${r.score}/100, уверенность ${A.confidence}%. ${r.neg.slice(0, 3).map((x) => x.text).join(' ')}

## MVP
**${A.mvp.hero} (${A.mvp.name})**: ${A.mvp.k}/${A.mvp.d}/${A.mvp.a}, GPM ${A.mvp.gpm}. ${A.mvp.pos.slice(0, 2).map((x) => x.text).join(' ')}

## Где решился матч
${turnText()}

## Советы проигравшим
${[r, ...lose].map((p) => `- **${p.hero}**: ${coachTip(p)}`).join('\n')}`;
}

function coachTip(p) {
  const t = p.neg[0]?.title;
  return {
    'Фарм ниже ожидания': 'больше времени в лесу между волнами, не ходи на драки без предметов.',
    'Слишком много смертей': 'держи байбек и ставь вард перед тем, как идти вперёд.',
    'Накормил врагов': 'не умирай с полным кошельком — покупай предметы до выхода на карту.',
    'Умирал в одиночку': 'не фарми одни линии без обзора, когда врагов нет на карте.',
    'Не участвовал в драках': 'смотри на мини-карту и приходи на драки раньше, используй TP.',
    'Нет сейв-предметов': 'против контроля собирай BKB, Linken или блинк раньше.',
    'Проиграл линию': 'попроси ротацию или смени линию, выбери спокойный фарм.',
    'Не давил строения': 'после выигранной драки бей вышки, а не возвращайся в лес.',
    'Мало обзора': 'покупай observer каждый раз, когда он есть в лавке.',
    'Почти не играл': 'играть надо всю игру — даже если всё плохо.',
    'Токсичность в чате': 'mute и фокус на игре: токсичность злит и свою команду.',
  }[t] || 'держи позицию и играй от команды.';
}

function coachRules(p) {
  return `## ${p.hero}: что поправить
${p.neg.length ? p.neg.slice(0, 3).map((x) => `- **${x.title}.** ${x.text} Совет: ${coachTip({ neg: [x] })}`).join('\n') : '- Явных ошибок нет.'}

## Что было хорошо
${p.pos.length ? p.pos.slice(0, 3).map((x) => `- ${x.text}`).join('\n') : '- Сильных сторон модель не нашла.'}`;
}

function ai(el) {
  el.innerHTML = `<div class="panel aibox"><h3>Разбор от ИИ <small>живой комментарий матча</small></h3><div id="aiout" class="ai"><button class="btn" id="aigo">🧠 Сгенерировать разбор</button></div></div>`;
  $('#aigo').onclick = async () => {
    const out = $('#aiout');
    out.innerHTML = '<div class="loading" style="padding:30px"><div class="spinner"></div>ИИ смотрит матч…</div>';
    try {
      out.innerHTML = md(await askAI('match', brief()));
    } catch (err) {
      out.innerHTML = aiFallbackNote(err) + md(rulesStory());
    }
  };
}

// ---------- карточка «Поделиться»
async function share() {
  const r = A.ruiner;
  const cv = document.createElement('canvas');
  cv.width = 1200;
  cv.height = 630;
  const x = cv.getContext('2d');
  await document.fonts.ready;
  const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  const [pr, pm] = await Promise.all([load(heroTall(r.heroKey)), load(heroTall(A.mvp.heroKey))]);
  const g = x.createLinearGradient(0, 0, 1200, 630);
  g.addColorStop(0, '#2a0b0e');
  g.addColorStop(0.55, '#0e1016');
  g.addColorStop(1, '#0a0b10');
  x.fillStyle = g;
  x.fillRect(0, 0, 1200, 630);
  if (pr) { x.save(); roundRect(x, 60, 70, 330, 437, 22); x.clip(); x.drawImage(pr, 60, 70, 330, 437); x.restore(); }
  x.fillStyle = '#ff3b3b';
  x.font = '900 86px Unbounded';
  x.fillText('ЗАРУИНИЛ', 430, 160);
  x.fillStyle = '#eceef4';
  x.font = '700 44px Unbounded';
  x.fillText(clip(x, r.name, 700), 430, 230);
  x.font = '500 26px Inter';
  x.fillStyle = '#8b91a5';
  x.fillText(`${r.hero} · ${r.k}/${r.d}/${r.a} · GPM ${r.gpm} · влияние ${r.score}/100`, 430, 276);
  x.font = '600 26px Inter';
  r.neg.slice(0, 3).forEach((n, i) => {
    x.fillStyle = '#ff6b4a';
    x.fillText('✕', 430, 340 + i * 44);
    x.fillStyle = '#eceef4';
    x.fillText(clip(x, n.title + ' — ' + n.text, 690), 466, 340 + i * 44);
  });
  if (pm) { x.save(); roundRect(x, 430, 490, 66, 88, 10); x.clip(); x.drawImage(pm, 430, 490, 66, 88); x.restore(); }
  x.fillStyle = '#ffc23d';
  x.font = '900 30px Unbounded';
  x.fillText('MVP', 512, 528);
  x.fillStyle = '#eceef4';
  x.font = '600 24px Inter';
  x.fillText(clip(x, `${A.mvp.name} · ${A.mvp.hero}`, 600), 512, 566);
  x.fillStyle = '#8b91a5';
  x.font = '500 20px Inter';
  x.fillText(`Матч ${A.id} · ${mmss(A.duration)} · ${A.score.radiant}:${A.score.dire}`, 60, 590);
  x.textAlign = 'right';
  x.fillText(location.host, 1140, 590);

  const text = `Кто заруинил матч ${A.id}? ${r.hero} (${r.name}) — ${r.neg.slice(0, 2).map((n) => n.title.toLowerCase()).join(', ')}. MVP — ${A.mvp.hero}. ${location.href}`;
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<div><h3 style="font:700 16px var(--display);margin:0 0 12px">Карточка матча</h3><div id="cvh"></div>
    <div class="actions"><button class="btn gold" data-s="png">Скачать картинку</button><button class="btn ghost" data-s="txt">Копировать итог</button><button class="btn ghost" data-s="link">Копировать ссылку</button><button class="btn ghost" data-s="close">Закрыть</button></div></div>`;
  $('#cvh', modal).append(cv);
  modal.onclick = async (e) => {
    const s = e.target.dataset?.s;
    if (e.target === modal || s === 'close') modal.remove();
    if (s === 'png') {
      const a = document.createElement('a');
      a.download = `ruiner-${A.id}.png`;
      a.href = cv.toDataURL('image/png');
      a.click();
    }
    if (s === 'txt') { await navigator.clipboard.writeText(text).catch(() => {}); toast('Итог скопирован'); }
    if (s === 'link') { await navigator.clipboard.writeText(location.href).catch(() => {}); toast('Ссылка скопирована'); }
  };
  document.body.append(modal);
}

function roundRect(x, l, t, w, h, r) {
  x.beginPath();
  x.roundRect(l, t, w, h, r);
}
function clip(x, s, w) {
  s = String(s);
  if (x.measureText(s).width <= w) return s;
  while (s.length > 1 && x.measureText(s + '…').width > w) s = s.slice(0, -1);
  return s + '…';
}
