// Проверка на смурфа: опыт аккаунта против уровня игры.
import { $, esc, fmt, OD, getJSON, consts, heroImg, fx } from './util.js?v=202610260213';
import { rankName } from './analyze.js?v=202610260213';
import { icon as ic } from './icons.js?v=202610260213';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export async function smurfPage(app, id) {
  id = +id;
  app.innerHTML = '<div class="loading"><div class="spinner"></div>Проверяем аккаунт…</div>';
  const C = await consts();
  let prof, wl, recent, heroes;
  try {
    [prof, wl, recent, heroes] = await Promise.all([
      getJSON(`${OD}/players/${id}`), getJSON(`${OD}/players/${id}/wl`),
      getJSON(`${OD}/players/${id}/recentMatches`), getJSON(`${OD}/players/${id}/heroes`),
    ]);
  } catch {
    app.innerHTML = '<div class="error">Не удалось загрузить профиль. Возможно, история матчей скрыта в настройках Dota 2.</div>';
    return;
  }
  const games = (wl?.win || 0) + (wl?.lose || 0);
  const name = prof?.profile?.personaname || `Игрок ${id}`;
  // самая первая игра: смещение на (всего − 1) в истории матчей
  const first = games ? await getJSON(`${OD}/players/${id}/matches?offset=${games - 1}&limit=1`).then((r) => r[0]).catch(() => null) : null;
  const ageDays = first ? Math.round((Date.now() / 1000 - first.start_time) / 86400) : null;

  const rec = recent || [];
  const rWins = rec.filter((m) => (m.player_slot < 128) === m.radiant_win).length;
  const kda = rec.length ? rec.reduce((s, m) => s + (m.kills + m.assists) / Math.max(1, m.deaths), 0) / rec.length : 0;
  const gpm = rec.length ? rec.reduce((s, m) => s + m.gold_per_min, 0) / rec.length : 0;
  const played = (heroes || []).filter((h) => h.games > 0).sort((a, b) => b.games - a.games);
  const top3 = played.slice(0, 3).reduce((s, h) => s + h.games, 0);
  const tier = prof?.rank_tier ? Math.floor(prof.rank_tier / 10) : 0;

  // сигналы: [сила 0–1, есть ли подозрение, факт, вывод, вес в итоге]
  const signals = [
    games ? [games < 300 ? 1 : games < 800 ? 0.5 : 0, games < 800, `${fmt(games)} игр на аккаунте`, games < 300 ? 'очень мало для своего уровня' : games < 800 ? 'немного' : 'обычный опыт', 1.4] : [0, false, 'история скрыта', 'проверить нельзя', 1.4],
    ageDays != null ? [ageDays < 180 ? 1 : ageDays < 400 ? 0.4 : 0, ageDays < 400, `первая игра ${ageDays} дн. назад`, ageDays < 180 ? 'свежий аккаунт' : ageDays < 400 ? 'аккаунту меньше года' : 'старый аккаунт', 1.1] : null,
    tier ? [tier >= 5 && games < 1000 ? 1 : tier >= 4 && games < 500 ? 0.7 : 0, tier >= 4 && games < 1000, `ранг ${rankName(prof.rank_tier)}`, tier >= 5 && games < 1000 ? 'высокий ранг при малом числе игр' : 'ранг соответствует опыту', 1.2] : null,
    rec.length ? [pct(rWins, rec.length) >= 65 ? 1 : pct(rWins, rec.length) >= 58 ? 0.5 : 0, pct(rWins, rec.length) >= 58, `${pct(rWins, rec.length)}% побед в последних ${rec.length}`, pct(rWins, rec.length) >= 65 ? 'аномально много побед' : 'обычный винрейт', 1] : null,
    rec.length ? [kda >= 5 ? 1 : kda >= 3.5 ? 0.5 : 0, kda >= 3.5, `KDA ${kda.toFixed(1)} в среднем`, kda >= 5 ? 'играет сильно выше своего ранга' : 'обычный KDA', 0.9] : null,
    played.length ? [top3 / Math.max(1, games) > 0.6 ? 0.6 : 0, top3 / Math.max(1, games) > 0.6, `${pct(top3, games)}% игр на трёх героях`, top3 / Math.max(1, games) > 0.6 ? 'узкий пул героев, типично для смурфа' : 'разнообразный пул', 0.5] : null,
  ].filter(Boolean);
  const score = Math.round(100 * signals.reduce((s, x) => s + x[0] * x[4], 0) / signals.reduce((s, x) => s + x[4], 0));
  const verdict = !games ? 'Проверить нельзя' : score >= 60 ? 'Скорее смурф' : score >= 35 ? 'Возможно смурф' : 'Не похож на смурфа';
  const bought = tier >= 5 && rec.length >= 10 && pct(rWins, rec.length) < 40 && kda < 2.2;

  app.innerHTML = `<div class="smurfpage">
    <div class="phead reveal"><img src="${esc(prof?.profile?.avatarfull || '')}" alt=""><div><div class="lbl">Проверка на смурфа</div><h1>${esc(name)}</h1>
      <div class="psub">${prof?.rank_tier ? rankName(prof.rank_tier) : 'ранг скрыт'} · ${fmt(games)} игр</div></div>
      <div class="coach-acts" style="margin-left:auto"><a class="btn ghost sm" href="#/player/${id}">Матчи</a><a class="btn ghost sm" href="#/coach/${id}">${ic('cap')} Тренер</a></div></div>
    <div class="smurf-verdict panel reveal ${score >= 60 ? 'hi' : score >= 35 ? 'mid' : 'lo'}">
      <div class="sv-gauge"><svg viewBox="0 0 120 70"><path d="M10 64a50 50 0 0 1 100 0" class="g-bg"/><path d="M10 64a50 50 0 0 1 100 0" class="g-fg" style="stroke-dasharray:157;stroke-dashoffset:${157 * (1 - score / 100)}"/></svg><b>${games ? score + '%' : '-'}</b></div>
      <div><div class="lbl">Вероятность смурфа</div><h2>${verdict}</h2>
      <p class="psub">${games ? 'Смотрим, насколько уровень игры обгоняет опыт аккаунта: мало игр, свежий аккаунт, высокий ранг, много побед и узкий пул героев.' : 'У игрока скрыта история матчей, OpenDota не отдаёт данные.'}</p>
      ${bought ? '<span class="chip neg">Возможно купленный или поднятый аккаунт: высокий ранг, но мало побед и слабая игра</span>' : ''}</div>
    </div>
    <div class="coach-grid">
      <div class="panel reveal"><h3>Сигналы</h3>${signals.map((x) => `<div class="sig ${x[1] ? 'bad' : 'ok'}"><i></i><div><b>${esc(x[2])}</b><span>${esc(x[3])}</span></div></div>`).join('')}</div>
      <div class="coach-side">
        <div class="panel reveal"><h3>Главные герои</h3>${played.slice(0, 6).map((h) => {
          const hh = C.heroes[h.hero_id] || {};
          const key = (hh.name || '').replace('npc_dota_hero_', '');
          return `<div class="hrow"><img src="${heroImg(key)}" alt=""><span>${esc(hh.localized_name || '')}</span><span class="psub">${h.games} игр · ${pct(h.win, h.games)}% побед</span><b>${pct(h.games, games)}%</b></div>`;
        }).join('') || '<p class="psub">Нет данных.</p>'}</div>
        <div class="panel reveal"><h3>Последние игры</h3><div class="stats-band">
          <div class="tile"><div class="lbl">Побед</div><div class="num">${pct(rWins, rec.length)}%</div></div>
          <div class="tile"><div class="lbl">KDA</div><div class="num">${kda.toFixed(1)}</div></div>
          <div class="tile"><div class="lbl">Золото в минуту</div><div class="num">${Math.round(gpm)}</div></div>
        </div></div>
      </div>
    </div></div>`;
  fx(app);
}
