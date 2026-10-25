// Страница матча: вердикт, вкладки, карта, график, ИИ, карточка «Поделиться».
import { $, $$, esc, fmt, OD, getJSON, consts, heroImg, heroTall, itemImg, store, toast, md, askAI } from './util.js';
import { analyze, defend, mmss, rankName } from './analyze.js';

let A; // текущий разбор
let C; // справочники

const TABS = [
  ['players', 'Игроки'], ['chart', 'График'], ['map', 'Карта'], ['episodes', 'Эпизоды'], ['noms', 'Номинации'],
  ['builds', 'Билды'], ['draft', 'Драфт'], ['chat', 'Чат'], ['ai', 'ИИ-разбор'],
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
const scoreBar = (s) => `<div class="bar ${s >= 60 ? 'good' : s >= 40 ? 'mid' : ''}"><i style="width:${s}%"></i></div>`;
const teamName = (t) => (t === 'radiant' ? 'Силы Света' : 'Силы Тьмы');

function draw(app) {
  const r = A.ruiner;
  const mvp = A.mvp;
  app.innerHTML = `
    <div class="mhead">
      <h1>Матч ${A.id}</h1>
      <span class="score"><span class="rad">${A.score.radiant}</span> : <span class="dire">${A.score.dire}</span></span>
      <span>${mmss(A.duration)}</span>
      <span>Победа: <b class="${A.winner === 'radiant' ? 'rad' : 'dire'}">${teamName(A.winner)}</b></span>
      ${A.rank ? `<span>Ранг матча: ${rankName(A.rank)}</span>` : ''}
      <span>${new Date(A.startTime * 1000).toLocaleDateString('ru-RU')}</span>
    </div>
    ${A.parsed ? '' : '<div class="banner" id="parse"><div class="spinner" style="width:22px;height:22px;margin:0;border-width:2px"></div><span>Реплей ещё не разобран — заказали разбор у OpenDota. Пока показываем анализ по общей статистике.</span></div>'}
    <section class="verdict">
      <div class="vcard">
        <img class="portrait" src="${portrait(r, 1)}" alt="${esc(r.hero)}">
        <div>
          <div class="vlabel">ЗАРУИНИЛ</div>
          <div class="vname">${esc(r.name)}</div>
          <div class="vhero">${esc(r.hero)} · позиция ${r.role} · ${teamName(r.team)}</div>
          <div class="vstats"><span>K/D/A <b>${r.k}/${r.d}/${r.a}</b></span><span>GPM <b>${r.gpm}</b></span><span>Урон <b>${fmt(r.dmg)}</b></span><span>KP <b>${Math.round(r.kp * 100)}%</b></span></div>
          <div class="meter"><span>Влияние ${r.score}/100</span><div class="bar"><i style="width:${r.score}%"></i></div></div>
          <div class="meter"><span>Уверенность модели: <b style="color:var(--text)">${A.confidence}%</b>${A.gap < 6 ? ' · почти вровень с ' + esc(A.nearRuiner.hero) : ''}</span></div>
        </div>
      </div>
      <div class="vside">
        <div class="vcard mvp">
          <img class="portrait" src="${portrait(mvp, 1)}" alt="">
          <div><div class="vlabel">MVP</div><div class="vname" style="font-size:18px">${esc(mvp.name)}</div>
          <div class="vhero">${esc(mvp.hero)} · ${mvp.k}/${mvp.d}/${mvp.a} · GPM ${mvp.gpm}</div>
          <div class="meter"><span>Влияние ${mvp.score}</span><div class="bar good"><i style="width:${mvp.score}%"></i></div></div></div>
        </div>
        ${mini('Лучший у проигравших', A.bestLoser, 'тащил как мог')}
        ${mini('Почти заруинил', A.nearRuiner, `влияние ${A.nearRuiner.score}`)}
        ${mini('Пассажир победы', A.passenger, 'победили без него')}
      </div>
    </section>
    <div class="reasons">${r.neg.slice(0, 4).map((x) => `<div class="reason"><b>${esc(x.title)}</b><span>${esc(x.text)}</span></div>`).join('') || '<div class="reason"><b>Явных провалов нет</b><span>Просто хуже остальных по сумме метрик.</span></div>'}</div>
    <div class="actions">
      <button class="btn ghost" data-act="defend">⚖️ Оправдать руинера</button>
      <button class="btn ghost" data-act="why">🔍 Почему именно он?</button>
      <button class="btn" data-act="ai">🧠 Разбор от ИИ</button>
      <button class="btn gold" data-act="share">📤 Поделиться</button>
      <a class="btn ghost" href="#/sets/${r.heroKey}">👕 Сеты на ${esc(r.hero)}</a>
    </div>
    <div id="extra"></div>
    <nav class="tabs">${TABS.map(([k, t], i) => `<button data-tab="${k}" class="${i ? '' : 'on'}">${t}</button>`).join('')}</nav>
    <div id="tab"></div>`;

  $$('[data-tab]', app).forEach((b) => (b.onclick = () => {
    $$('[data-tab]', app).forEach((x) => x.classList.toggle('on', x === b));
    showTab(b.dataset.tab);
  }));
  $$('[data-act]', app).forEach((b) => (b.onclick = () => action(b.dataset.act)));
  showTab('players');
}

function mini(title, p, sub) {
  return `<div class="mini"><img src="${portrait(p)}" alt=""><div><div class="t">${title}</div><div class="n">${esc(p.name)}</div><div class="s">${esc(p.hero)} · ${sub}</div></div></div>`;
}

function action(act) {
  const box = $('#extra');
  const r = A.ruiner;
  if (act === 'defend') {
    box.innerHTML = `<div class="panel"><h3>Оправдать руинера?</h3><div class="reasons">${defend(A, r).map((t) => `<div class="reason pos"><span>${esc(t)}</span></div>`).join('')}</div></div>`;
  } else if (act === 'why') {
    const losers = A.players.filter((p) => !p.win).sort((a, b) => a.score - b.score);
    box.innerHTML = `<div class="panel"><h3>Почему именно он?</h3>
      <p style="margin-top:0;color:var(--muted)">Модель сравнивает каждого игрока с другими на том же герое (перцентили OpenDota) и с ожиданиями роли: фарм, урон, смерти, участие в драках, обзор, линия, давление на здания. Затем штрафует за смерти без драки, кормёжку и токсичность. Руинер — игрок проигравшей команды с самым низким итогом.</p>
      ${losers.map((p) => `<div class="sc" style="margin:6px 0"><span style="width:150px" class="pname">${esc(p.hero)}</span>${scoreBar(p.score)}<span class="num">${p.score}</span></div>`).join('')}
      <div class="sub">Все сигналы против ${esc(r.hero)}</div>
      <div class="reasons">${r.neg.map((x) => `<div class="reason"><b>${esc(x.title)}</b><span>${esc(x.text)}</span></div>`).join('')}</div></div>`;
  } else if (act === 'ai') {
    $$('[data-tab]').find((b) => b.dataset.tab === 'ai').click();
    $('nav.tabs').scrollIntoView();
    return;
  } else if (act === 'share') return share();
  box.scrollIntoView({ block: 'nearest' });
}

function showTab(k) {
  const el = $('#tab');
  const f = { players, chart, map, episodes, noms, builds, draft, chat, ai }[k];
  f(el);
}

// ---------- игроки
function players(el) {
  const teams = ['radiant', 'dire'].sort((a) => (a === A.winner ? -1 : 1));
  el.innerHTML = teams.map((t) => `
    <div class="panel"><div class="teamhead"><span class="${t === 'radiant' ? 'rad' : 'dire'}">${teamName(t)} · ${t === A.winner ? 'победа' : 'поражение'}</span>
    <span class="lbl">NW ${fmt(A.teamNw[t])}</span></div>
    ${A.players.filter((p) => p.team === t).sort((a, b) => a.role - b.role).map(prow).join('')}</div>`).join('');
  $$('.prow', el).forEach((row) => (row.onclick = () => {
    const open = row.classList.toggle('open');
    const next = row.nextElementSibling;
    if (next?.classList.contains('pdetail')) next.remove();
    if (open) row.insertAdjacentHTML('afterend', pdetail(A.players[row.dataset.i]));
    if (open) bindDetail(row.nextElementSibling, A.players[row.dataset.i]);
  }));
}

function prow(p) {
  const cls = p === A.ruiner ? 'ruiner' : p === A.mvp ? 'mvp' : '';
  const tag = p === A.ruiner ? '<span class="tag r">РУИНЕР</span>' : p === A.mvp ? '<span class="tag m">MVP</span>' : '';
  const top = p.neg[0] || p.pos[0];
  return `<div class="prow ${cls}" data-i="${p.idx}">
    <img class="h" src="${portrait(p)}" alt="">
    <div style="min-width:0"><div class="pname">${esc(p.name)}${tag}</div><div class="psub">${esc(p.hero)} · поз. ${p.role}${top ? ` · ${esc(top.title)}` : ''}</div></div>
    <div><div class="num">${p.k}/${p.d}/${p.a}</div><div class="lbl">K/D/A</div></div>
    <div class="hide-m hide-s"><div class="num">${p.gpm}</div><div class="lbl">GPM</div></div>
    <div class="hide-m hide-s"><div class="num">${Math.round(p.kp * 100)}%</div><div class="lbl">KP</div></div>
    <div class="sc">${scoreBar(p.score)}<span class="num">${p.score}</span></div>
    <span class="caret hide-s">▾</span></div>`;
}

const itemIcons = (ids) => ids.map((id) => {
  const k = C.itemsById[id];
  return k ? `<img src="${itemImg(k)}" title="${esc(C.itemsByKey[k]?.name || k)}" alt="" loading="lazy">` : '';
}).join('');

function pdetail(p) {
  const st = [['Net Worth', fmt(p.nw)], ['XPM', p.xpm], ['Добито', `${p.lh} / ${p.dn}`], ['Урон', fmt(p.dmg)], ['Доля урона', `${Math.round(p.dmgShare * 100)}%`],
    ['По зданиям', fmt(p.tower)], ['Хил', fmt(p.heal)], ['Варды', `${p.obs} / ${p.sen}`], ['Контроль', `${Math.round(p.stuns)} с`], ['Мёртв', `${Math.round(p.deadShare * 100)}%`],
    ['Скормил', fmt(p.fed)], ['APM', p.apm ?? '—']];
  return `<div class="pdetail">
    <div class="stats">${st.map(([k, v]) => `<div class="stat"><div class="lbl">${k}</div><div class="num">${v}</div></div>`).join('')}</div>
    <div class="items">${itemIcons([...p.items, p.neutral].filter(Boolean))}</div>
    ${p.neg.length ? `<div class="sub">Ошибки</div><div class="reasons">${p.neg.map((x) => `<div class="reason"><b>${esc(x.title)}</b><span>${esc(x.text)}</span></div>`).join('')}</div>` : ''}
    ${p.pos.length ? `<div class="sub">Сильные стороны</div><div class="reasons">${p.pos.map((x) => `<div class="reason pos"><b>${esc(x.title)}</b><span>${esc(x.text)}</span></div>`).join('')}</div>` : ''}
    <div class="actions"><button class="btn" data-coach>🧠 Советы от ИИ</button><a class="btn ghost" href="#/sets/${p.heroKey}">👕 Сеты на ${esc(p.hero)}</a>
    ${p.accountId ? `<a class="btn ghost" href="#/player/${p.accountId}">Другие матчи игрока</a>` : ''}</div>
    <div data-coachbox></div></div>`;
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
  return `<rect width="128" height="128" fill="#13241a"/>
    <path d="M0,38 C30,46 48,56 64,64 C80,72 98,84 128,92 L128,104 C96,96 78,82 62,74 C46,66 28,56 0,50Z" fill="#1d4a66" opacity=".75"/>
    <g fill="none" stroke="#3b3a2a" stroke-width="3.4" stroke-linecap="round" opacity=".9">
      <path d="M13,110 L13,14 L114,14"/><path d="M18,110 L110,18"/><path d="M18,115 L115,115 L115,18"/>
    </g>
    <path d="M0,128 L0,96 Q20,92 32,108 Q36,120 32,128Z" fill="#2c5a2c" opacity=".9"/>
    <path d="M128,0 L96,0 Q92,20 108,30 Q120,34 128,32Z" fill="#5a2c22" opacity=".9"/>
    <circle cx="14" cy="114" r="5" fill="#5fd36f" opacity=".9"/><circle cx="114" cy="14" r="5" fill="#ff6a3d" opacity=".9"/>
    <circle cx="80" cy="76" r="3.2" fill="#3a2d4d" stroke="#8a6fc9" stroke-width=".6"/><text x="80" y="77.3" font-size="3" text-anchor="middle" fill="#cbb8ff">R</text>`;
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
  el.innerHTML = A.players.slice().sort((a, b) => (a.team === b.team ? a.role - b.role : a.team === A.winner ? -1 : 1)).map((p) => `
    <div class="panel"><div class="teamhead"><span>${esc(p.hero)} <span class="psub">— ${esc(p.name)}, поз. ${p.role}</span>${p === A.ruiner ? '<span class="tag r">РУИНЕР</span>' : ''}</span><span class="${p.win ? 'rad' : 'dire'}">${p.win ? 'W' : 'L'}</span></div>
    <div class="timeline">${p.purchases.filter((x) => core(x.key)).map((x) => `<div><img src="${itemImg(x.key)}" alt="" title="${esc(C.itemsByKey[x.key]?.name || x.key)}" loading="lazy">${mmss(x.time)}</div>`).join('') || '<span class="psub">Нет данных о покупках</span>'}</div>
    ${p.neg.filter((x) => x.title === 'Нет сейв-предметов').map((x) => `<div class="psub" style="margin-top:8px;color:#ffb3b3">⚠ ${esc(x.text)}</div>`).join('')}</div>`).join('');
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
