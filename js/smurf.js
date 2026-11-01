// Проверка на смурфа: опыт аккаунта против уровня игры.
import { $, esc, fmt, OD, getJSON, consts, heroImg, fx } from './util.js?v=202611020232';
import { rankName } from './analyze.js?v=202611020232';
import { icon as ic } from './icons.js?v=202611020232';

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

  // Смурф = мало опыта И игра сильно выше него. Одно без другого не считается:
  // старый аккаунт с высоким KDA это сильный игрок, новичок с обычной игрой просто новичок.
  const wrNow = pct(rWins, rec.length);
  const wrAll = pct(wl?.win || 0, games);
  const stomps = rec.filter((m) => (m.kills + m.assists) / Math.max(1, m.deaths) >= 6).length;
  const pool = new Set(rec.map((m) => m.hero_id)).size;
  const perDay = ageDays ? games / ageDays : 0;
  const expS = games ? Math.max(games < 500 ? 1 : games < 1500 ? 0.6 : games < 3000 ? 0.2 : 0, ageDays != null ? (ageDays < 365 ? 0.8 : ageDays < 730 ? 0.3 : 0) * (games < 3000 ? 1 : 0.3) : 0) : 0;
  const perfS = rec.length ? (Math.min(1, Math.max(0, (wrNow - 50) / 25)) * 0.4 + Math.min(1, Math.max(0, (kda - 2.5) / 3)) * 0.3 + Math.min(1, stomps / rec.length * 2.5) * 0.3) : 0;
  const signals = [
    games ? [0, games < 1500, `${fmt(games)} игр на аккаунте`, games < 500 ? 'совсем мало' : games < 1500 ? 'немного для уверенной игры' : 'опытный аккаунт'] : [0, false, 'история скрыта', 'проверить нельзя'],
    ageDays != null ? [0, ageDays < 365, `первая игра ${ageDays} дн. назад, ${perDay.toFixed(1).replace('.', ',')} игр в день`, ageDays < 365 ? 'аккаунту меньше года' : 'старый аккаунт'] : null,
    tier ? [0, tier >= 5 && games < 1500, `ранг ${rankName(prof.rank_tier)}`, tier >= 5 && games < 1500 ? 'высокий ранг при малом опыте' : 'ранг по опыту'] : null,
    rec.length ? [0, wrNow >= 60, `${wrNow}% побед в последних ${rec.length} (всего ${wrAll}%)`, wrNow - wrAll >= 12 ? 'сейчас играет намного лучше своей истории' : wrNow >= 60 ? 'много побед' : 'обычный винрейт'] : null,
    rec.length ? [0, stomps / rec.length >= 0.3, `${stomps} из ${rec.length} игр с KDA 6+`, stomps / rec.length >= 0.3 ? 'часто разносит лобби' : 'разгромов мало'] : null,
    rec.length ? [0, kda >= 3.5, `KDA ${kda.toFixed(1).replace('.', ',')} в среднем`, kda >= 3.5 ? 'выше обычного' : 'обычный KDA'] : null,
    played.length ? [0, pool <= 5 && rec.length >= 10, `${pool} разных героев за ${rec.length} игр`, pool <= 5 ? 'узкий пул, как у бустера' : 'разнообразный пул'] : null,
  ].filter(Boolean);
  const score = Math.round(100 * expS * (0.35 + 0.65 * perfS));
  const verdict = !games ? 'Проверить нельзя' : score >= 55 ? 'Скорее смурф' : score >= 30 ? 'Возможно смурф' : perfS >= 0.55 ? 'Не смурф, просто сильный игрок' : 'Не похож на смурфа';
  const bought = tier >= 5 && rec.length >= 10 && pct(rWins, rec.length) < 40 && kda < 2.2;

  app.innerHTML = `<div class="smurfpage">
    <div class="phead reveal"><img src="${esc(prof?.profile?.avatarfull || '')}" alt=""><div><div class="lbl">Проверка на смурфа</div><h1>${esc(name)}</h1>
      <div class="psub">${prof?.rank_tier ? rankName(prof.rank_tier) : 'ранг скрыт'} · ${fmt(games)} игр</div></div>
      <div class="coach-acts" style="margin-left:auto"><a class="btn ghost sm" href="#/player/${id}">Матчи</a><a class="btn ghost sm" href="#/coach/${id}">${ic('cap')} Тренер</a></div></div>
    <div class="smurf-verdict panel reveal ${score >= 55 ? 'hi' : score >= 30 ? 'mid' : 'lo'}">
      <div class="sv-gauge"><svg viewBox="0 0 120 70"><path d="M10 64a50 50 0 0 1 100 0" class="g-bg"/><path d="M10 64a50 50 0 0 1 100 0" class="g-fg" style="stroke-dasharray:157;stroke-dashoffset:${157 * (1 - score / 100)}"/></svg><b>${games ? score + '%' : '-'}</b></div>
      <div><div class="lbl">Вероятность смурфа</div><h2>${verdict}</h2>
      <p class="psub">${games ? 'Смурф это мало опыта и игра сильно выше него. Считаем оба условия вместе: опыт аккаунта и то, как он играет сейчас.' : 'У игрока скрыта история матчей, OpenDota не отдаёт данные.'}</p>
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
