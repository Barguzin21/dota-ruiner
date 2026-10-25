// Обучение: разбор «моих» ошибок в матче, тайминги предметов, страница-тренер по последним играм.
import { $, $$, esc, fmt, OD, getJSON, consts, heroImg, itemImg, store, toast, md, askAI, fx } from './util.js?v=202610252139';
import { analyze, mmss, METRIC_RU } from './analyze.js?v=202610252139';
import { icon as ic } from './icons.js?v=202610252139';

// Мой аккаунт (кнопка «Это я»). По нему подсвечиваем «себя» в матчах и строим тренера.
export const me = () => store.get('me', null);
export const setMe = (id) => { store.set('me', id ? +id : null); toast(id ? 'Запомнили: это ты' : 'Сброшено'); };

// Что делать с каждой ошибкой: почему это проигрывает и как исправить.
export const TIPS = {
  'Фарм ниже ожидания': { why: 'Без золота герой не выходит на свои тайминги, и команда дерётся 4 на 5 по ценности.', how: ['Между драками всегда есть волна или лагерь, не стой на месте.', 'Фарми лес по пути к линии, а не отдельным походом.', 'Пушь волну перед уходом в лес, чтобы не терять крипов.'], drill: 'Лобби с ботами: 10 минут, цель, 70+ добитых крипов на любой линии.' },
  'Слишком много смертей': { why: 'Каждая смерть, потерянное золото, время и бонус врагу. Больше 7 смертей почти всегда значит поражение.', how: ['Перед выходом вперёд смотри на мини-карту: если 3+ врагов не видно, не иди.', 'Держи телепорт и деньги на выкуп после 25-й минуты.', 'Ставь вард на пути, по которому фармишь.'], drill: 'Каждые 5 секунд бросай взгляд на мини-карту, сделай это привычкой в обычных играх.' },
  'Накормил врагов': { why: 'Смерть с серией убийств отдаёт врагу кучу золота, так зафармленный враг становится неубиваемым.', how: ['Если на тебе серия, играй осторожнее, награда за тебя растёт.', 'Не умирай с полным кошельком: купи предмет до выхода на карту.'], drill: 'В следующих 5 играх старайся не уходить в минус по убийствам после 20-й минуты.' },
  'Умирал в одиночку': { why: 'Смерть без драки, чистая потеря: команда не получила ничего взамен.', how: ['Не фарми дальнюю линию, если врагов не видно на карте.', 'Ходи по лесу с вардами и не заходи в туман первым.', 'Держи кнопку спасения (BKB, блинк, форс) под рукой.'], drill: 'Отметь в реплее каждую смерть вне драки и спроси себя: где я видел врагов за 10 секунд до неё?' },
  'Не участвовал в драках': { why: 'Команда проигрывает драки без тебя, а один зафармленный герой ничего не решает.', how: ['Приходи на драки до их начала: следи за сбором врагов на карте.', 'Используй телепорт к своим, когда команда собралась.', 'Ставь будильник на появление Рошана и рун, там бывают драки.'], drill: 'Цель на 5 игр: KP выше 50%.' },
  'Нет сейв-предметов': { why: 'Без BKB, Linken или мобильности кор умирает от первого же контроля в драке.', how: ['Если у врага 3+ героя с оглушениями, BKB раньше урона.', 'Против одного сильного контроля подойдут Linken или Lotus.', 'Блинк или Force Staff спасают от прыжков.'], drill: 'Перед игрой посчитай контроль у врага и реши, какой сейв будешь собирать.' },
  'Проиграл линию': { why: 'Проигранная линия = отставание на 1–2 предмета к 15-й минуте, это тяжело отыграть.', how: ['Добивай крипов, а не бей героя без причины.', 'Отводи волну к своей вышке, если соперник сильнее.', 'Зови саппорта на помощь или смени линию на лес.'], drill: 'Лобби: 10 минут на линии против бота Unfair, цель 50 крипов и 10 не отданных.' },
  'Не давил строения': { why: 'Победа, это здания. Выиграли драку и ушли в лес, значит, подарили врагу время.', how: ['После выигранной драки сразу иди на ближайшую вышку.', 'Отправляй волны крипов на линии перед заходом на Рошана.'], drill: 'После каждой выигранной драки задай себе вопрос: какое здание мы можем взять прямо сейчас?' },
  'Мало обзора': { why: 'Без вардов команда ходит вслепую и умирает в засадах.', how: ['Покупай обсервер каждый раз, когда он есть в лавке.', 'Ставь варды перед Рошаном и перед вражескими лесами, когда вы впереди.', 'Снимай вражеские варды сентри.'], drill: 'Цель на игру: 1 обсервер каждые 3 минуты до 30-й минуты.' },
  'Почти не играл': { why: 'Низкая активность похожа на AFK, команда фактически играет вчетвером.', how: ['Держи героя в движении: фарм, варды, давление.'], drill: '-' },
  'Токсичность в чате': { why: 'Ругань ломает настрой своей команды сильнее, чем врагов.', how: ['Включи mute после первого конфликта.', 'Пиши только по делу: «Рошан», «нет вардов», «смок».'], drill: 'Сыграй 5 игр с выключенным чатом.' },
  'Смерти стоили зданий': { why: 'Каждая такая смерть открыла врагу дорогу к вышкам, казармам или Рошану.', how: ['Когда у врагов респавн короче вашего, не лезь, держи защиту.', 'В поздней игре не фарми одну линию без выкупа.'], drill: 'Смотри таймеры выкупа своей команды перед каждым выходом вперёд.' },
  'Слил преимущество': { why: 'Команда была впереди, а смерть дала врагу шанс вернуться в игру.', how: ['Когда вы впереди, играйте вместе и через варды, без одиночных вылазок.', 'Не лезь в лес врага без смока и обзора.'], drill: 'После 5k преимущества, только групповые действия.' },
  'Первым падал в драках': { why: 'Пока ты лежишь, команда дерётся вчетвером и чаще всего проигрывает.', how: ['Не начинай драку первым, если ты не инициатор.', 'Стой за своими корами и танками.', 'Держи сейв-предмет наготове.'], drill: 'В начале каждой драки задай себе вопрос: кто на меня прыгнет первым?' },
  'Пропускал драки': { why: 'Команда проигрывала большие драки без тебя.', how: ['Следи за сбором врагов на мини-карте.', 'Телепорт держи всегда.'], drill: 'Цель на 5 игр: участие в 80%+ больших драк.' },
  'Умирал с деньгами': { why: 'Смерть с большим запасом золота, двойная потеря.', how: ['Трать деньги до выхода на карту.', 'Держи запас ровно на выкуп, остальное, в предметы.'], drill: 'Перед каждым выходом из базы проверь золото.' },
  'Поздний ключевой предмет': { why: 'Предмет, вокруг которого строится игра героя, пришёл слишком поздно, окно силы ушло.', how: ['Не отвлекайся на ситуативные вещи, пока нет ключевого предмета.', 'Фарми эффективнее: лагеря между волнами, стаки от саппорта.'], drill: 'Запиши среднее время ключевого предмета и улучши его на 3 минуты за 10 игр.' },
};

// Тайминги ключевых покупок против всех игр на этом герое (OpenDota scenarios).
const timingsCache = new Map();
export async function itemTimings(heroId, purchases, itemsByKey) {
  if (!timingsCache.has(heroId)) timingsCache.set(heroId, getJSON(`${OD}/scenarios/itemTimings?hero_id=${heroId}`).catch(() => []));
  const rows = await timingsCache.get(heroId);
  const seen = new Set();
  const out = [];
  for (const p of purchases) {
    if (seen.has(p.key) || (itemsByKey[p.key]?.cost || 0) < 2000) continue;
    seen.add(p.key);
    const r = rows.filter((x) => x.item === p.key).map((x) => ({ t: x.time, g: +x.games, w: +x.wins }));
    const total = r.reduce((s, x) => s + x.g, 0);
    if (total < 30) continue;
    const earlier = r.filter((x) => x.t < p.time).reduce((s, x) => s + x.g, 0);
    const median = (() => { let acc = 0; for (const x of r.sort((a, b) => a.t - b.t)) { acc += x.g; if (acc >= total / 2) return x.t; } return null; })();
    const at = r.find((x) => x.t >= p.time) || r[r.length - 1];
    out.push({ key: p.key, name: itemsByKey[p.key]?.name || p.key, time: p.time, late: earlier / total, median, wr: at && at.g >= 10 ? at.w / at.g : null });
  }
  return out;
}

// Раздел «Обучение» в матче.
export function coachSection(el, A, C) {
  const myId = me();
  const mine = A.players.find((p) => myId && p.accountId === myId);
  const pick = (p) => {
    el.innerHTML = report(p, A);
    fx(el);
    $$('[data-me]', el).forEach((b) => (b.onclick = () => { setMe(b.dataset.me); pick(p); }));
    $('[data-other]', el)?.addEventListener('click', () => chooser());
    $('[data-coachai]', el)?.addEventListener('click', (e) => coachAI(e.currentTarget, p, A));
    itemTimings(p.heroId, p.purchases, C.itemsByKey).then((list) => {
      const box = $('[data-timings]', el);
      if (!box) return;
      box.innerHTML = list.length ? list.map((x) => `<div class="tm-row ${x.late > 0.7 ? 'bad' : x.late < 0.3 ? 'good' : ''}">
        <img src="${itemImg(x.key)}" alt=""><div><b>${esc(x.name)}</b><span>${mmss(x.time)} · обычно к ${x.median ? mmss(x.median) : '-'}</span></div>
        <div class="tm-bar"><i style="--p:${Math.round(x.late * 100)}%"></i></div>
        <em>${x.late > 0.7 ? `позже ${Math.round(x.late * 100)}% игроков` : x.late < 0.3 ? `быстрее ${Math.round((1 - x.late) * 100)}% игроков` : 'в среднем темпе'}</em></div>`).join('')
        : '<p class="psub">Нет крупных покупок, с которыми можно сравнить.</p>';
      fx(box);
    });
  };
  const chooser = () => {
    el.innerHTML = `<div class="panel"><h3>Кто ты в этом матче? <small>выбери себя, покажем твои ошибки и как сыграть лучше</small></h3>
      <div class="pickme">${A.players.map((p) => `<button class="chip ${p.win ? 'pos' : 'neg'}" data-pick="${p.idx}"><img src="${heroImg(p.heroKey)}" alt="">${esc(p.name)} · ${esc(p.hero)}</button>`).join('')}</div></div>`;
    $$('[data-pick]', el).forEach((b) => (b.onclick = () => pick(A.players[b.dataset.pick])));
  };
  mine ? pick(mine) : chooser();
}

function report(p, A) {
  const tips = p.neg.slice(0, 4).map((n) => ({ n, t: TIPS[n.title] }));
  const deaths = p.deathTimes.map((t) => {
    const solo = p.soloDeaths.some((d) => d.time === t);
    return { t, solo };
  });
  const weak = p.breakdown.slice().sort((a, b) => a.value * b.weight - b.value * a.weight).slice(0, 3);
  return `<div class="coach">
    <div class="panel reveal coach-head">
      <img src="${heroImg(p.heroKey)}" alt="">
      <div><div class="lbl">Разбор для игрока</div><h4>${esc(p.name)} · ${esc(p.hero)}</h4>
      <div class="psub">${p.win ? 'Победа' : 'Поражение'} · влияние ${p.score}/100 · ${p.win ? `вклад ${p.share}%` : `руин ${p.share}%`}</div></div>
      <div class="coach-acts">${me() === p.accountId ? '<span class="chip pos">это ты</span>' : p.accountId ? `<button class="btn ghost sm" data-me="${p.accountId}">Это я</button>` : ''}<button class="btn ghost sm" data-other>Другой игрок</button>
      ${p.accountId ? `<a class="btn sm" href="#/coach/${p.accountId}">Тренер по 20 играм →</a>` : ''}</div>
    </div>
    <div class="coach-grid">
      <div class="panel reveal"><h3>Главные ошибки <small>что стоило игры</small></h3>
        ${tips.length ? tips.map(({ n, t }, i) => `<div class="mistake"><div class="mn">${i + 1}</div><div>
          <b>${esc(n.title)}</b><p class="fact">${esc(n.text)}</p>
          ${t ? `<p class="why">${esc(t.why)}</p><ul>${t.how.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>${t.drill !== '-' ? `<div class="drill">Упражнение: ${esc(t.drill)}</div>` : ''}` : ''}
        </div></div>`).join('') : '<p class="psub">Серьёзных ошибок модель не нашла. Хорошая игра.</p>'}
      </div>
      <div class="coach-side">
        <div class="panel reveal"><h3>Слабые места <small>метрики с самым большим недобором</small></h3>
          ${weak.map((b) => { const v = Math.round(b.value * 100); return `<div class="bdr"><span>${b.label}</span><div class="bar ${v >= 60 ? 'good' : v >= 40 ? 'mid' : ''}"><i style="--w:${v}%"></i></div><b>${v}</b><em>вес ${Math.round(b.weight * 100)}%</em></div>`; }).join('')}
        </div>
        <div class="panel reveal"><h3>Смерти по минутам</h3>
          ${deaths.length ? `<div class="deaths">${deaths.map((d) => `<span class="${d.solo ? 'solo' : ''}" title="${d.solo ? 'без драки' : 'в драке'}">${mmss(d.t)}</span>`).join('')}</div>
          <p class="psub">Красные, смерти без драки: команда ничего не получила взамен.</p>` : '<p class="psub">Ни одной смерти.</p>'}
          ${p.laneDiff != null ? `<p class="psub">Линия к 10:00: <b class="${p.laneDiff >= 0 ? 'rad' : 'dire'}">${p.laneDiff >= 0 ? '+' : '−'}${fmt(Math.abs(p.laneDiff))}</b> золота против ${esc(p.laneOpp || 'соперника')}.</p>` : ''}
        </div>
        <div class="panel reveal"><h3>Тайминги предметов <small>против всех игр на ${esc(p.hero)}</small></h3><div data-timings><div class="spinner" style="width:22px;height:22px"></div></div></div>
      </div>
    </div>
    <div class="panel reveal aibox"><h3>План от ИИ-тренера</h3><div data-coachout class="ai"><button class="btn" data-coachai>${ic('sparkles')} Разобрать мою игру</button></div></div>
  </div>`;
}

async function coachAI(btn, p, A) {
  const out = btn.closest('[data-coachout]');
  out.innerHTML = '<div class="loading" style="padding:20px"><div class="spinner"></div>Тренер смотрит игру…</div>';
  try {
    out.innerHTML = md(await askAI('player', { match: { duration: mmss(A.duration), winner: A.winner }, player: {
      hero: p.hero, pos: p.role, win: p.win, kda: `${p.k}/${p.d}/${p.a}`, gpm: p.gpm, kp: Math.round(p.kp * 100), score: p.score,
      lane: p.laneDiff, deaths: p.deathTimes.map(mmss), soloDeaths: p.soloDeaths.length, bad: p.neg.map((x) => x.text), good: p.pos.map((x) => x.text),
      metrics: Object.fromEntries(p.breakdown.map((b) => [b.label, Math.round(b.value * 100)])) } }));
  } catch (e) {
    out.innerHTML = `<p class="psub">ИИ сейчас недоступен (${esc(e.message)}). Советы по правилам, выше.</p>`;
  }
}

// ---------- страница-тренер: последние игры игрока
export async function coachPage(app, id) {
  id = +id;
  app.innerHTML = '<div class="loading"><div class="spinner"></div>Собираем твои последние игры…</div>';
  const C = await consts();
  let list;
  let prof;
  try {
    [prof, list] = await Promise.all([getJSON(`${OD}/players/${id}`), getJSON(`${OD}/players/${id}/matches?limit=20&significant=1`)]);
  } catch {
    app.innerHTML = '<div class="error">Не удалось загрузить профиль. Проверь, что история матчей открыта в настройках Dota 2.</div>';
    return;
  }
  const name = prof?.profile?.personaname || `Игрок ${id}`;
  app.innerHTML = `<div class="coachpage">
    <div class="phead reveal"><img src="${esc(prof?.profile?.avatarfull || '')}" alt=""><div><div class="lbl">Тренер</div><h1>${esc(name)}</h1>
      <div class="psub">Разбор последних ${list.length} игр: что повторяется и над чем работать в первую очередь</div></div>
      <div style="margin-left:auto">${me() === id ? '<span class="chip pos">это ты</span>' : `<button class="btn ghost sm" data-me="${id}">Это я</button>`}</div></div>
    <div class="panel reveal"><div class="progress"><i id="cpbar"></i></div><div class="psub" id="cpstat">Разбираем матчи: 0 из ${list.length}</div></div>
    <div id="cpout"></div></div>`;
  $('[data-me]', app)?.addEventListener('click', (e) => { setMe(id); e.target.outerHTML = '<span class="chip pos">это ты</span>'; });
  fx(app);

  const games = [];
  for (const [i, m] of list.entries()) {
    const key = `m:${m.match_id}`;
    let full = null;
    try { full = JSON.parse(sessionStorage.getItem(key)); } catch { /* нет кэша */ }
    if (!full) {
      full = await getJSON(`${OD}/matches/${m.match_id}`).catch(() => null);
      await new Promise((r) => setTimeout(r, 900)); // OpenDota пускает ~60 запросов в минуту
    }
    if (!document.body.contains($('#cpout'))) return;
    if (full?.players?.length) {
      const a = analyze(full, { heroes: C.heroes, itemsById: C.itemsById });
      const p = a.players.find((x) => x.accountId === id);
      if (p) games.push({ a, p, id: m.match_id, ruiner: a.ruiner === p, mvp: a.mvp === p });
    }
    $('#cpbar').style.width = `${((i + 1) / list.length) * 100}%`;
    $('#cpstat').textContent = `Разбираем матчи: ${i + 1} из ${list.length}`;
    if ((i + 1) % 4 === 0 || i === list.length - 1) drawCoach($('#cpout'), games, C, name);
  }
  $('#cpstat').textContent = `Готово: разобрано ${games.length} игр`;
}

function drawCoach(out, games, C, name) {
  if (!games.length) { out.innerHTML = '<div class="empty">Не удалось разобрать ни одной игры.</div>'; return; }
  const n = games.length;
  const wins = games.filter((g) => g.p.win).length;
  const avg = (f) => games.reduce((s, g) => s + f(g), 0) / n;
  // повторяющиеся ошибки
  const counts = {};
  for (const g of games) for (const x of g.p.neg) counts[x.title] = (counts[x.title] || 0) + 1;
  const rec = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  // профиль метрик
  const keys = Object.keys(METRIC_RU);
  const prof = keys.map((k) => {
    // метрика считается только в играх, где она входит в формулу роли (варды, у саппортов, фарм, у коров)
    const v = games.filter((g) => g.p.breakdown.some((b) => b.key === k)).map((g) => g.p.m01[k]).filter((x) => x != null);
    return v.length ? { k, label: METRIC_RU[k], v: Math.round(v.reduce((s, x) => s + x, 0) / v.length * 100) } : null;
  }).filter(Boolean).sort((a, b) => a.v - b.v);
  // герои
  const byHero = {};
  for (const g of games) {
    const h = (byHero[g.p.heroKey] ||= { key: g.p.heroKey, name: g.p.hero, n: 0, w: 0, s: 0 });
    h.n++; h.w += g.p.win ? 1 : 0; h.s += g.p.score;
  }
  const heroes = Object.values(byHero).sort((a, b) => b.n - a.n);
  const trend = games.slice().reverse().map((g) => g.p.score);
  const W = 600, H = 80;
  const path = trend.map((v, i) => `${i ? 'L' : 'M'}${(i / Math.max(1, trend.length - 1) * W).toFixed(1)},${(H - v / 100 * H).toFixed(1)}`).join('');

  out.innerHTML = `
    <div class="stats-band reveal">
      ${[['Игр разобрано', n], ['Винрейт', `${Math.round(wins / n * 100)}%`], ['Раз руинер', games.filter((g) => g.ruiner).length], ['Раз MVP', games.filter((g) => g.mvp).length], ['Среднее влияние', Math.round(avg((g) => g.p.score))], ['Смертей за игру', avg((g) => g.p.d).toFixed(1)]]
        .map(([k, v]) => `<div class="tile"><div class="lbl">${k}</div><div class="num">${v}</div></div>`).join('')}
    </div>
    <div class="coach-grid">
      <div class="panel reveal"><h3>Что повторяется <small>ошибки, которые встречаются чаще всего</small></h3>
        ${rec.slice(0, 5).map(([t, c], i) => { const tip = TIPS[t]; return `<div class="mistake"><div class="mn">${i + 1}</div><div>
          <b>${esc(t)}</b> <span class="chip neg">${c} из ${n} игр</span>
          ${tip ? `<p class="why">${esc(tip.why)}</p><ul>${tip.how.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>${tip.drill !== '-' ? `<div class="drill">Упражнение: ${esc(tip.drill)}</div>` : ''}` : ''}</div></div>`; }).join('') || '<p class="psub">Повторяющихся ошибок нет.</p>'}
      </div>
      <div class="coach-side">
        <div class="panel reveal"><h3>Профиль игрока <small>0–100, 50, средний игрок на твоих героях</small></h3>
          ${prof.map((x) => `<div class="bdr"><span>${x.label}</span><div class="bar ${x.v >= 60 ? 'good' : x.v >= 40 ? 'mid' : ''}"><i style="--w:${x.v}%"></i></div><b>${x.v}</b><em>${x.v < 40 ? 'слабо' : x.v >= 60 ? 'сильно' : ''}</em></div>`).join('')}
        </div>
        <div class="panel reveal"><h3>Влияние по играм <small>от старых к новым</small></h3>
          <svg viewBox="0 0 ${W} ${H}" class="chart"><line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="#2a2e3a" stroke-dasharray="4 4"/><path d="${path}" fill="none" stroke="#3d8bff" stroke-width="2.5"/>
          ${trend.map((v, i) => `<circle cx="${i / Math.max(1, trend.length - 1) * W}" cy="${H - v / 100 * H}" r="3.5" fill="${v < 40 ? '#ff3b3b' : v >= 60 ? '#4fd27a' : '#ffc23d'}"/>`).join('')}</svg>
        </div>
        <div class="panel reveal"><h3>Герои</h3>
          ${heroes.map((h) => `<div class="hrow"><img src="${heroImg(h.key)}" alt=""><span>${esc(h.name)}</span><span class="psub">${h.n} игр · ${Math.round(h.w / h.n * 100)}% побед</span><b>${Math.round(h.s / h.n)}</b></div>`).join('')}
        </div>
      </div>
    </div>
    <div class="panel reveal"><h3>Игры <small>нажми, чтобы открыть разбор</small></h3><div class="mlist">
      ${games.map((g) => `<a class="mrow ${g.p.win ? 'w' : 'l'}" href="#/match/${g.id}"><img src="${heroImg(g.p.heroKey)}" alt=""><div><div class="pname">${esc(g.p.hero)}${g.ruiner ? '<span class="tag r">РУИНЕР</span>' : g.mvp ? '<span class="tag m">MVP</span>' : ''}</div><div class="psub">${esc(g.p.neg[0]?.title || 'без явных ошибок')}</div></div>
        <div class="num ${g.p.win ? 'rad' : 'dire'}">${g.p.win ? 'Победа' : 'Поражение'}</div><div class="num hide-s">${g.p.k}/${g.p.d}/${g.p.a}</div><div class="num hide-s">${g.p.score}</div></a>`).join('')}
    </div></div>
    <div class="panel reveal aibox"><h3>Персональный план от ИИ-тренера</h3><div class="ai" id="cpai"><button class="btn" id="cpaibtn">${ic('sparkles')} Составить план тренировок</button></div></div>`;
  fx(out);
  $('#cpaibtn').onclick = async () => {
    const box = $('#cpai');
    box.innerHTML = '<div class="loading" style="padding:20px"><div class="spinner"></div>Тренер составляет план…</div>';
    try {
      box.innerHTML = md(await askAI('coach', { name, games: n, winrate: Math.round(wins / n * 100), ruiner: games.filter((g) => g.ruiner).length,
        recurring: rec.slice(0, 6).map(([t, c]) => `${t}: ${c} из ${n}`), profile: prof.map((x) => `${x.label}: ${x.v}`),
        heroes: heroes.slice(0, 5).map((h) => `${h.name}: ${h.n} игр, ${Math.round(h.w / h.n * 100)}% побед, влияние ${Math.round(h.s / h.n)}`) }));
    } catch (e) {
      box.innerHTML = `<p class="psub">ИИ недоступен (${esc(e.message)}). Главные упражнения, в блоке «Что повторяется».</p>`;
    }
  };
}
