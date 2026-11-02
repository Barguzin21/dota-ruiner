// Разбор матча OpenDota: счёт влияния игроков, руинер, MVP, причины, эпизоды, номинации.
// Чистые функции без DOM, проверяются в test.mjs.

const MIN = 60;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sum = (a) => a.reduce((s, x) => s + x, 0);
const fmt = (n) => Math.round(n).toLocaleString('ru-RU');
export const mmss = (t) => `${t < 0 ? '-' : ''}${Math.floor(Math.abs(t) / 60)}:${String(Math.abs(t) % 60 | 0).padStart(2, '0')}`;

// Вес метрик по роли. Сумма весов = 1.
export const WEIGHTS = {
  core: { farm: 0.16, xp: 0.05, dmg: 0.14, deaths: 0.1, deathCost: 0.08, discipline: 0.1, kp: 0.07, fights: 0.08, lh: 0.05, tower: 0.07, lane: 0.1 },
  support: { deaths: 0.12, deathCost: 0.06, discipline: 0.12, kp: 0.15, fights: 0.12, vision: 0.15, dmg: 0.07, xp: 0.05, utility: 0.1, lane: 0.06 },
};
export const METRIC_RU = {
  farm: 'Фарм (GPM)', xp: 'Опыт (XPM)', dmg: 'Урон по героям', deaths: 'Мало смертей', deathCost: 'Мало потерь от смертей', discipline: 'Дисциплина',
  kp: 'Участие в убийствах', fights: 'Командные драки', lh: 'Добивания', tower: 'Давление на здания', lane: 'Стадия линий', vision: 'Обзор (варды)', utility: 'Контроль, хил, стаки',
};

// Предметы, которые спасают кора от контроля в поздней игре.
const SAVE_ITEMS = ['black_king_bar', 'aeon_disk', 'sphere', 'manta', 'satanic', 'abyssal_blade', 'disperser', 'pipe', 'lotus_orb', 'cyclone', 'wind_waker', 'heavens_halberd', 'ghost', 'glimmer_cape', 'force_staff', 'hurricane_pike', 'blink', 'overwhelming_blink', 'swift_blink', 'arcane_blink', 'mjollnir', 'harpoon', 'bloodstone', 'refresher', 'solar_crest', 'pavise'];
// Герои со своим «BKB» или уходом от контроля в способностях, им сейв-предмет не обязателен.
const SELF_SAVE = new Set(['life_stealer', 'juggernaut', 'omniknight', 'slark', 'weaver', 'ember_spirit', 'void_spirit', 'puck', 'morphling', 'antimage',
  'queenofpain', 'storm_spirit', 'faceless_void', 'templar_assassin', 'abaddon', 'skeleton_king', 'naga_siren', 'pangolier', 'nyx_assassin', 'bounty_hunter',
  'clinkz', 'riki', 'phantom_lancer', 'monkey_king', 'earth_spirit', 'marci', 'hoodwink', 'sand_king', 'meepo', 'troll_warlord', 'huskar', 'oracle', 'dazzle', 'kez', 'muerta', 'medusa', 'spectre', 'brewmaster']);
const TOXIC = /(fuck|noob|нуб|даун|дебил|идиот|урод|сын\s*шлю|мать|мамк|ебан|еба|хуй|хуе|пидор|пидр|сука|бля|гандон|retard|idiot|stupid|uninstall|report|репорт|рак\b|раки\b|тупой|тупая|feed|фидер|kys|ez\b|изи\b)/i;

const DEATH = new Set(['Крайний фид', 'Ключевая смерть', 'Слишком много смертей', 'Накормил врагов', 'Умирал в одиночку', 'Смерти стоили зданий', 'Слил преимущество', 'Первым падал в драках', 'Умирал с деньгами']);
// Позиция: из OpenDota, а в неразобранном матче её нет, тогда по месту в команде по ценности (1 самый богатый, 5 самый бедный).
const role = (p) => p.position_est || p._pos || 3;
const isSupport = (p) => role(p) >= 4;
const team = (p) => (p.player_slot < 128 ? 'radiant' : 'dire');

function pct(p, key) {
  const v = p.benchmarks?.[key]?.pct;
  return typeof v === 'number' ? v : null;
}

// Перцентиль по ожиданию, если у OpenDota нет бенчмарков (матч без парсинга).
function rel(v, expected) {
  return clamp(0.5 + (v / expected - 1) * 0.6, 0, 1);
}

function deathsInFights(p, fights, idx, others) {
  // «В драке»: смерть попала в командную драку OpenDota (от 3 смертей) или рядом, ±15 с, погиб кто-то ещё,
  // свой или враг: это стычка 2 на 2, а не пойманный в одиночку. Остальные смерти одиночные.
  const out = { fight: 0, solo: [] };
  for (const d of p.deaths_log || []) {
    const inFight = fights.some((f) => d.time >= f.start - 3 && d.time <= f.end + 3 && f.players[idx]?.deaths)
      || others.some((t) => Math.abs(t - d.time) <= 15);
    if (inFight) out.fight++;
    else out.solo.push(d);
  }
  return out;
}

export function analyze(m, consts = {}) {
  // Неразобранный матч: саппорты — два самых бедных героя с ролью Support (бедный Juggernaut саппортом не станет),
  // остальные — позиции 1–3 по ценности.
  const nw = (p) => p.net_worth || p.total_gold || 0;
  const canSup = (p) => (consts.heroes?.[p.hero_id]?.roles || []).includes('Support');
  for (const t of ['radiant', 'dire']) {
    const side = m.players.filter((p) => team(p) === t).sort((a, b) => nw(b) - nw(a));
    const sups = [...side.filter(canSup), ...side.filter((p) => !canSup(p))].sort((a, b) => canSup(b) - canSup(a) || nw(a) - nw(b)).slice(0, 2);
    side.filter((p) => !sups.includes(p)).forEach((p, i) => { p._pos = i + 1; });
    sups.sort((a, b) => nw(b) - nw(a)).forEach((p, i) => { p._pos = 4 + i; });
  }
  const heroes = consts.heroes || {};
  const heroByName = Object.fromEntries(Object.values(heroes).map((h) => [h.name, h.localized_name]));
  const killerName = (k) => heroByName[k] || (/tower|fort|rax/.test(k || '') ? 'башня' : /roshan/.test(k || '') ? 'Рошан' : 'крипы');
  const itemsById = consts.itemsById || {};
  const dur = m.duration || 1;
  const mins = dur / MIN;
  const parsed = !!(m.od_data?.has_parsed || m.version);
  const fights = m.teamfights || [];
  const kills = { radiant: m.radiant_score ?? 0, dire: m.dire_score ?? 0 };
  const teamDmg = { radiant: 0, dire: 0 };
  const teamNw = { radiant: 0, dire: 0 };
  for (const p of m.players) {
    teamDmg[team(p)] += p.hero_damage || 0;
    teamNw[team(p)] += p.net_worth || p.total_gold || 0;
  }
  const winner = m.radiant_win ? 'radiant' : 'dire';
  const adv = m.radiant_gold_adv || [];

  // --- данные, которые нужны сразу про всех: линии, драки, объекты
  const at10 = (arr) => (arr?.length ? arr[Math.min(10, arr.length - 1)] : null);
  const lostBuildings = { radiant: [], dire: [] }; // когда сторона теряла здание или Рошана
  for (const o of m.objectives || []) {
    if (o.type === 'building_kill' && /tower[2-4]|rax|fort/.test(o.key || '')) lostBuildings[o.key.includes('goodguys') ? 'radiant' : 'dire'].push(o.time);
    if (o.type === 'CHAT_MESSAGE_ROSHAN_KILL') lostBuildings[o.team === 2 ? 'dire' : 'radiant'].push(o.time);
  }
  const bigFights = fights.map((f) => {
    const g = { radiant: 0, dire: 0 };
    f.players.forEach((fp, i) => { if (m.players[i]) g[team(m.players[i])] += fp.gold_delta || 0; });
    const deaths = f.players.reduce((s, fp) => s + (fp.deaths || 0), 0);
    // первая смерть в драке, по логам смертей игроков
    let first = null;
    m.players.forEach((p, i) => {
      for (const d of p.deaths_log || []) if (d.time >= f.start - 2 && d.time <= f.end + 2 && (!first || d.time < first.t)) first = { i, t: d.time };
    });
    return { f, deaths, won: g.radiant >= g.dire ? 'radiant' : 'dire', first };
  }).filter((x) => x.deaths >= 3);

  // время каждой смерти каждого игрока: по нему отличаем стычку от одиночной смерти
  const deathTimes = m.players.map((p) => (p.deaths_log || []).map((d) => d.time));
  const teamVision = { radiant: 0, dire: 0 };
  for (const p of m.players) if (isSupport(p)) teamVision[team(p)] += (p.obs_placed ?? (p.obs_log || []).length) + (p.sen_placed ?? (p.sen_log || []).length) * 0.6;

  // медианы этого матча: страхуют от странных бенчмарков OpenDota (Турбо, новые герои), «отстал» только если хуже лобби
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] || 0; };
  const medXpm = med(m.players.map((p) => p.xp_per_min || 0));
  const medCoreGpm = med(m.players.filter((p) => role(p) <= 3).map((p) => p.gold_per_min || 0));
  const medDpm = med(m.players.map((p) => (p.hero_damage || 0) / mins));

  const players = m.players.map((p, idx) => {
    const t = team(p);
    const h = heroes[p.hero_id] || {};
    const heroKey = (h.name || '').replace('npc_dota_hero_', '');
    const sup = isSupport(p);
    const sign = t === 'radiant' ? 1 : -1;

    // Линия: золото к 10:00 против самого богатого врага на той же линии.
    const opps = m.players.filter((q) => team(q) !== t && q.lane === p.lane && p.lane_role !== 4 && q.lane_role !== 4);
    const g10 = at10(p.gold_t);
    const opp = opps.sort((a, b) => (at10(b.gold_t) || 0) - (at10(a.gold_t) || 0))[0];
    const laneDiff = g10 != null && opp && at10(opp.gold_t) != null ? g10 - at10(opp.gold_t) : null;
    const laneOpp = opp ? (heroes[opp.hero_id]?.localized_name || '') : null;

    // Цена смертей и смерти «с последствиями».
    const dl = p.deaths_log || [];
    const deathCost = sum(dl.map((d) => (d.gold_lost || 0) + (d.gold_fed || 0) * 0.5 + (d.time_dead || 0) * (p.gold_per_min || 300) / 60));
    const df = deathsInFights(p, fights, idx, deathTimes.filter((_, i) => i !== idx).flat());
    // Смерть «стоила здания», только если виноват именно он: умер один или первым в проигранной драке.
    // Если команду разменяли целиком, здание отдала вся команда, а не каждый погибший.
    const firstIn = (d) => bigFights.some((x) => x.won !== t && x.first?.i === idx && x.first.t === d.time);
    const objDeaths = dl.filter((d) => lostBuildings[t].some((bt) => bt >= d.time && bt <= d.time + 75) && (df.solo.includes(d) || firstIn(d))).length;
    const throwDeaths = dl.filter((d) => {
      if (!df.solo.includes(d) && !firstIn(d)) return false; // разменяли всех, слила вся команда
      const i = Math.floor(d.time / 60);
      if (adv[i] == null || adv[i] * sign < 5000) return false;
      return adv.slice(i, i + 5).some((v) => v * sign < adv[i] * sign - 4000);
    }).length;
    const avgLost = dl.length ? sum(dl.map((d) => d.gold_lost || 0)) / dl.length : 0;

    // Драки: участие, первая смерть в проигранной, пропуски проигранных.
    const myFights = bigFights.filter((x) => { const fp = x.f.players[idx]; return fp && (fp.damage > 0 || fp.deaths > 0 || fp.healing > 0); });
    const firstLost = bigFights.filter((x) => x.won !== t && x.first?.i === idx).length;
    const missedLost = bigFights.filter((x) => x.won !== t && !myFights.includes(x)).length;
    const fightDmg = sum(myFights.map((x) => x.f.players[idx].damage || 0));
    const fightTeamDmg = sum(bigFights.flatMap((x) => x.f.players.filter((_, i) => m.players[i] && team(m.players[i]) === t).map((fp) => fp.damage || 0)));
    const kp = kills[t] ? (p.kills + p.assists) / kills[t] : 0;
    const dmgShare = teamDmg[t] ? (p.hero_damage || 0) / teamDmg[t] : 0;
    const finalItems = [0, 1, 2, 3, 4, 5].map((i) => itemsById[p[`item_${i}`]]).filter(Boolean);
    const allItems = new Set([...finalItems, ...(p.purchase_log || []).map((x) => x.key)]);
    const fed = sum((p.deaths_log || []).map((d) => d.gold_fed || 0));
    const lost = sum((p.deaths_log || []).map((d) => d.gold_lost || 0));
    const obs = p.obs_placed ?? (p.obs_log || []).length;
    const sen = p.sen_placed ?? (p.sen_log || []).length;
    const deadShare = (p.life_state_dead || 0) / dur;
    const toxic = (m.chat || []).filter((c) => c.type === 'chat' && c.player_slot === p.player_slot && TOXIC.test(c.key)).length;
    const chatCount = (m.chat || []).filter((c) => c.type === 'chat' && c.player_slot === p.player_slot).length;
    const teamExp = sup ? { gpm: 300, xpm: 400, dpm: 250, lh: 1.5 } : { gpm: 520, xpm: 650, dpm: 550, lh: 6 };

    const m01 = {
      farm: pct(p, 'gold_per_min') ?? rel(p.gold_per_min, teamExp.gpm),
      xp: pct(p, 'xp_per_min') ?? rel(p.xp_per_min, teamExp.xpm),
      dmg: pct(p, 'hero_damage_per_min') ?? rel((p.hero_damage || 0) / mins, teamExp.dpm),
      // саппорт ходит первым, ставит варды в тумане и умирает чаще, ожидание выше, но без лишних поблажек
      deaths: pct(p, 'deaths_per_min') ?? clamp(1 - p.deaths / (mins * (sup ? 0.36 : 0.32)), 0, 1),
      lh: pct(p, 'last_hits_per_min') ?? rel(p.last_hits / mins, teamExp.lh),
      tower: pct(p, 'tower_damage') ?? rel(p.tower_damage || 0, sup ? 400 : 2500),
      kp: clamp((kp - 0.25) / 0.5, 0, 1),
      // линия: половина, эффективность OpenDota, половина, золото против соперника к 10:00
      lane: avg([p.lane_efficiency_pct != null ? clamp(p.lane_efficiency_pct / 100, 0, 1) : null, laneDiff != null ? clamp(0.5 + laneDiff / (sup ? 2400 : 3000), 0, 1) : null]) ?? 0.5,
      // в паре саппортов варды часто ставит один: 70% оценки свои варды, 30% обзор всех саппортов команды
      vision: 0.7 * clamp((obs + sen * 0.6) / Math.max(4, mins * (role(p) === 5 ? 0.45 : 0.3)), 0, 1) + 0.3 * clamp(teamVision[t] / Math.max(6, mins * 0.6), 0, 1),
      utility: clamp(Math.max(pct(p, 'hero_healing_per_min') ?? 0, (p.stuns || 0) / Math.max(1, mins * 1.2), (p.camps_stacked || 0) / 8), 0, 1),
      deathCost: clamp(1 - deathCost / Math.max(1, mins) / (sup ? 260 : 320), 0, 1),
      discipline: clamp(1 - df.solo.length * (sup ? 0.08 : 0.09) - objDeaths * 0.12 - throwDeaths * 0.15 - firstLost * 0.08, 0, 1),
      fights: bigFights.length ? clamp(myFights.length / bigFights.length * 0.6 + (fightTeamDmg ? fightDmg / fightTeamDmg : 0.2) * 2 - firstLost * 0.08, 0, 1) : 0.5,
    };
    const w = WEIGHTS[sup ? 'support' : 'core'];
    let score = 100 * sum(Object.entries(w).map(([k, v]) => v * m01[k]));
    const breakdown = Object.entries(w).map(([k, v]) => ({ key: k, label: METRIC_RU[k], value: m01[k], weight: v }));
    // Метрики сравнивают игрока только с ожиданиями его роли. Кто реально тащил команду, они не видят:
    // QoP 16/4 и Rubick 3/12 выходили равными. Поэтому отдельная поправка за долю в уроне и убийствах команды.
    const killShare = kills[t] ? p.kills / kills[t] : 0;
    const carry = Math.round(clamp((dmgShare - 0.2) * 60 + (killShare - 0.2) * 30, sup ? -3 : -8, 14));
    score += carry;
    // Взгляд сильного игрока: не сколько умер, а во что превратил золото и где был, когда решалась игра.
    const nwShare = teamNw[t] ? (p.net_worth || p.total_gold || 0) / teamNw[t] : 0.2;
    const conv = nwShare ? dmgShare / nwShare : 1;
    const gt = p.gold_t || [];
    const lateGpm = gt.length >= 20 ? (gt[gt.length - 1] - gt[gt.length - 11]) / 10 : null;
    const rival = m.players.find((q) => team(q) !== t && role(q) === role(p));
    const nwRatio = rival ? (p.net_worth || 0) / Math.max(1, rival.net_worth || 0) : 1;
    const richest = !m.players.some((q) => team(q) === t && (q.net_worth || 0) > (p.net_worth || 0));
    const lastLost = [...bigFights].reverse().find((x) => x.won !== t);
    // для карточки игрока: игра по минутам, смерти с контекстом, варды, вещи для команды
    const atMin = (arr, mn) => (arr?.length > mn ? arr[mn] : null);
    const timeline = [10, 20, 40].filter((mn) => mn * 60 <= dur).map((mn) => ({
      mn, gold: atMin(p.gold_t, mn), lh: atMin(p.lh_t, mn), xp: atMin(p.xp_t, mn),
      k: (p.kills_log || []).filter((x) => x.time <= mn * 60).length, d: dl.filter((x) => x.time <= mn * 60).length,
    }));
    const deathsInfo = dl.map((d) => ({ t: d.time, by: killerName(d.key), solo: df.solo.includes(d), first: firstIn(d), lost: d.gold_lost || 0, fed: d.gold_fed || 0, dead: d.time_dead || 0 }));
    const leftBy = new Map((p.obs_left_log || []).map((w) => [w.ehandle, w]));
    const obsLives = (p.obs_log || []).map((w) => leftBy.get(w.ehandle) && { life: leftBy.get(w.ehandle).time - w.time, killed: !!leftBy.get(w.ehandle).attackername && leftBy.get(w.ehandle).time - w.time < 350 }).filter(Boolean);
    const teamItems = {};
    for (const x of p.purchase_log || []) if (TEAM_ITEMS.has(x.key)) teamItems[x.key] = (teamItems[x.key] || 0) + 1;

    const neg = [];
    const pos = [];
    const add = (arr, weight, title, text) => arr.push({ weight, title, text });

    // --- негатив
    if (p.leaver_status > 1 || p.abandons) {
      score = Math.min(score, 3);
      add(neg, 100, 'Покинул игру', 'Игрок вышел из матча, команда доигрывала вчетвером.');
    }
    if (!sup && m01.farm < 0.25 && p.gold_per_min < medCoreGpm * 0.9) add(neg, 30 * (0.3 - m01.farm) * 4, 'Фарм ниже ожидания', `GPM ${p.gold_per_min}, хуже, чем у ${Math.round((1 - m01.farm) * 100)}% игроков на этом герое.`);
    const manyDeaths = p.deaths >= Math.max(sup ? 10 : 8, mins * (sup ? 0.26 : 0.2));
    if (manyDeaths || (m01.deaths < 0.15 && p.deaths >= 6)) add(neg, 8 + p.deaths * (sup ? 1.5 : 2), 'Слишком много смертей', `${p.deaths} смертей, мёртвым ${Math.round(deadShare * 100)}% игры.`);
    if (fed > Math.max(3500, mins * 130) && p.deaths > p.kills + p.assists) add(neg, fed / 300, 'Накормил врагов', `Враги получили ${fmt(fed)} золота за его смерти, сам потерял ${fmt(lost)}.`);
    if (df.solo.length >= 3 && df.solo.length >= p.deaths * 0.4) add(neg, df.solo.length * 4, 'Умирал в одиночку', `${df.solo.length} смертей вне командных драк, пойман без команды.`);
    const farmingCarry = role(p) === 1 && m01.farm >= 0.6;
    if (kills[t] >= 10 && kp < 0.35 && !farmingCarry) add(neg, (0.4 - kp) * 60, 'Не участвовал в драках', `KP ${Math.round(kp * 100)}%, команда дралась без него.`);
    if (!sup && mins > 30 && !SELF_SAVE.has(heroKey) && ![...allItems].some((k) => SAVE_ITEMS.includes(k))) add(neg, 10, 'Нет сейв-предметов', 'К поздней игре нет BKB, Aeon Disk, Linken или мобильности, лёгкая цель для контроля.');
    if (!sup && laneDiff != null && laneDiff < -1200) add(neg, 8 + Math.min(14, -laneDiff / 250), 'Проиграл линию', `−${fmt(-laneDiff)} золота к 10:00 против ${laneOpp}${p.lane_efficiency_pct != null ? `, эффективность линии ${p.lane_efficiency_pct}%` : ''}.`);
    else if (!sup && role(p) <= 2 && (p.lane_efficiency_pct ?? 100) < 45) add(neg, 12, 'Проиграл линию', `Эффективность на линии ${p.lane_efficiency_pct}% к 10-й минуте.`);
    if (objDeaths >= 3 && objDeaths >= p.deaths * 0.4) add(neg, 6 + objDeaths * 4, 'Смерти стоили зданий', `${objDeaths} раз после его смерти враги сразу забирали вышку, казармы или Рошана.`);
    if (throwDeaths >= 1) add(neg, 10 + throwDeaths * 6, 'Слил преимущество', `${throwDeaths} смерт${throwDeaths === 1 ? 'ь' : 'и'} при перевесе 5k+ золота, после которых команда потеряла 4k+.`);
    if (firstLost >= 2) add(neg, 5 + firstLost * 4, 'Первым падал в драках', `В ${firstLost} проигранных драках умер первым, команда дралась вчетвером.`);
    if (!sup && !farmingCarry && missedLost >= 3) add(neg, 4 + missedLost * 3, 'Пропускал драки', `Не было в ${missedLost} из ${bigFights.filter((x) => x.won !== t).length} проигранных командных драк.`);
    if (!sup && mins > 20 && p.deaths >= 3 && avgLost > 350) add(neg, 6, 'Умирал с деньгами', `Терял в среднем ${fmt(avgLost)} золота за смерть, деньги лучше тратить до выхода на карту.`);
    if (!sup && mins > 25 && (p.tower_damage || 0) < 500) add(neg, 8, 'Не давил строения', `${fmt(p.tower_damage || 0)} урона по строениям за ${Math.round(mins)} минут.`);
    if (sup && obs < mins / (role(p) === 5 ? 6 : 10) && teamVision[t] < mins * 0.45 && parsed) add(neg, 12, 'Мало обзора', `${obs} observer и ${sen} sentry за ${Math.round(mins)} минут.`);
    // не про смерти: урон, опыт, работа саппорта
    if (!sup && mins > 20 && m01.dmg < 0.2 && (p.hero_damage || 0) / mins < medDpm) add(neg, 10, 'Мало урона по героям', `${fmt((p.hero_damage || 0) / mins)} урона в минуту, меньше, чем у ${Math.round((1 - m01.dmg) * 100)}% игроков на герое.`);
    if (mins > 20 && m01.xp < 0.18 && p.xp_per_min < medXpm * 0.85) add(neg, sup ? 6 : 9, 'Отстал по опыту', `${p.xp_per_min} опыта в минуту, ${p.level} уровень к концу игры.`);
    if (sup && mins > 20 && m01.utility < 0.15 && parsed) add(neg, 8, 'Мало пользы в драках', `${Math.round(p.stuns || 0)} с контроля, ${fmt(p.hero_healing || 0)} хила и ${p.camps_stacked || 0} стаков за игру.`);
    const enemyObs = sum(m.players.filter((q) => team(q) !== t).map((q) => q.obs_placed ?? (q.obs_log || []).length));
    const dewards = (p.observer_kills || 0) + (p.sentry_kills || 0);
    if (sup && parsed && mins > 20 && enemyObs >= mins / 3 && dewards === 0 && sen < 3) add(neg, 8, 'Не снимал варды', `Враги поставили ${enemyObs} обсерверов, а у него ${sen} sentry и ни одного снятого варда.`);
    if (p.actions_per_min && p.actions_per_min < 50 && parsed) add(neg, 15, 'Почти не играл', `APM ${p.actions_per_min}, похоже на AFK или игру «в одну кнопку».`);
    if (toxic >= 2) add(neg, 4 + toxic, 'Токсичность в чате', `${toxic} оскорбительных сообщений.`);
    // выкуп в последние 5 минут проигранной катки не в вину: это попытка спасти игру
    const bbEarly = (p.buyback_log || []).filter((b) => b.time < dur - 300).length;
    if (bbEarly >= Math.max(2, Math.round(mins / 20)) && !(t === winner)) add(neg, 4, 'Дорогие выкупы', `${bbEarly} выкупа до финала, команда всё равно проиграла.`);
    // рапира: купил и к концу её нет, значит отдал врагу
    const rapier = (p.purchase_log || []).find((x) => x.key === 'rapier');
    if (rapier && !finalItems.includes('rapier')) add(neg, 14, 'Слил рапиру', `Купил Divine Rapier на ${mmss(rapier.time)}, к концу игры её у него не было.`);

    // крайний фид: треть смертей команды почти без размена; это проблема даже у победителей
    const teamDeaths = sum(m.players.filter((q) => team(q) === t).map((q) => q.deaths || 0));
    if (p.deaths >= 8 && p.deaths >= teamDeaths / 3 && p.kills + p.assists < p.deaths) add(neg, 16, 'Крайний фид', `${p.deaths} из ${teamDeaths} смертей команды, а убийств с помощью всего ${p.kills + p.assists}.`);
    // ключевая смерть: самый богатый в команде умер, и за две минуты соперник отыграл 3k+ золота или строение
    const keyDeath = richest && !sup && dl.find((d) => {
      const i = Math.floor(d.time / 60);
      const swing = adv[i] != null && adv[i + 2] != null ? (adv[i] - adv[i + 2]) * sign : 0;
      return swing >= 3000 || lostBuildings[t].some((bt) => bt >= d.time && bt <= d.time + 90);
    });
    if (keyDeath) add(neg, 10, 'Ключевая смерть', `Самый богатый в команде погиб на ${mmss(keyDeath.time)}, и соперник сразу отыграл золото или строение.`);
    if (!sup && mins > 20 && nwShare > 0.24 && conv < 0.7) add(neg, 13, 'Золото не стало уроном', `${Math.round(nwShare * 100)}% золота команды, но только ${Math.round(dmgShare * 100)}% её урона.`);
    if (!sup && !(t === winner) && lateGpm != null && lateGpm < p.gold_per_min * 0.75) add(neg, 11, 'Исчез в концовке', `За последние 10 минут ${Math.round(lateGpm)} золота в минуту при среднем ${p.gold_per_min}.`);
    if (!(t === winner) && richest && !sup && kp < 0.45 && mins > 20) add(neg, 12, 'Самый дорогой, но вне игры', `Самый богатый в команде, а участвовал только в ${Math.round(kp * 100)}% убийств.`);
    if (!sup && !(t === winner) && rival && mins > 20 && nwRatio < 0.6) add(neg, 12, 'Проиграл дуэль позиций', `Ценность в ${(1 / Math.max(0.01, nwRatio)).toFixed(1).replace('.', ',')} раза меньше, чем у ${heroes[rival.hero_id]?.localized_name || 'соперника'} на той же позиции.`);
    if (!sup && !(t === winner) && mins > 35 && !p.buyback_count && lastLost?.f.players[idx]?.deaths) add(neg, 9, 'Без выкупа в финале', 'Погиб в последней проигранной драке и за всю игру ни разу не выкупился.');

    // --- позитив
    if (dmgShare > 0.33 && killShare > 0.33) add(pos, 16, 'Тащил команду', `${Math.round(dmgShare * 100)}% урона и ${Math.round(killShare * 100)}% убийств команды.`);
    if (!sup && conv > 1.35 && mins > 20) add(pos, 9, 'Выжал максимум из золота', `${Math.round(nwShare * 100)}% золота команды дали ${Math.round(dmgShare * 100)}% её урона.`);
    if (!sup && lateGpm != null && lateGpm > p.gold_per_min * 1.3) add(pos, 6, 'Сильная концовка', `${Math.round(lateGpm)} золота в минуту за последние 10 минут.`);
    if (dmgShare > 0.3) add(pos, dmgShare * 40, 'Главный источник урона', `${Math.round(dmgShare * 100)}% урона команды по героям.`);
    if (kp > 0.7) add(pos, kp * 15, 'Был в каждой драке', `KP ${Math.round(kp * 100)}%.`);
    if (m01.farm > 0.75 && !sup) add(pos, 12, 'Отличный фарм', `GPM ${p.gold_per_min}, лучше ${Math.round(m01.farm * 100)}% игроков на герое.`);
    if (p.deaths <= 2 && mins > 20) add(pos, 12, 'Почти не умирал', `${p.deaths} смертей за ${Math.round(mins)} минут.`);
    if (obs + sen >= mins / 2.5 && sup) add(pos, 10, 'Держал обзор', `${obs} observer + ${sen} sentry.`);
    if ((p.hero_healing || 0) > 5000) add(pos, 8, 'Лечил команду', `${fmt(p.hero_healing)} хила по союзникам.`);
    if ((p.stuns || 0) > mins * 1.5) add(pos, 8, 'Много контроля', `${Math.round(p.stuns)} секунд оглушений.`);
    if ((p.tower_damage || 0) > 6000) add(pos, 8, 'Сносил строения', `${fmt(p.tower_damage)} урона по зданиям.`);
    if (sup && dewards >= 4) add(pos, 6, 'Снимал варды', `${dewards} вражеских вардов снято.`);
    if ((p.camps_stacked || 0) >= 6) add(pos, 5, 'Стакал лагеря', `${p.camps_stacked} стаков.`);
    if (!sup && laneDiff != null && laneDiff > 1200) add(pos, 6 + Math.min(10, laneDiff / 300), 'Выиграл линию', `+${fmt(laneDiff)} золота к 10:00 против ${laneOpp}.`);
    else if ((p.lane_efficiency_pct ?? 0) > 85 && !sup) add(pos, 6, 'Выиграл линию', `Эффективность на линии ${p.lane_efficiency_pct}%.`);
    if (fightTeamDmg && fightDmg / fightTeamDmg > 0.32) add(pos, 10, 'Решал драки', `${Math.round(fightDmg / fightTeamDmg * 100)}% урона команды в больших драках.`);
    if (bigFights.length >= 4 && myFights.length === bigFights.length) add(pos, 6, 'Не пропустил ни одной драки', `Был во всех ${bigFights.length} больших драках.`);

    // Токсичность метриками не ловится, отдельный небольшой штраф.
    score -= Math.min(10, toxic * 2);
    score = clamp(score, 0, 100);

    neg.sort((a, b) => b.weight - a.weight);
    // Одна и та же смерть даёт сразу «много смертей», «накормил», «умирал один»… Оставляем две самые сильные,
    // иначе все причины про смерти и не видно остального.
    let deathN = 0;
    for (let i = neg.length - 1; i >= 0; i--) if (DEATH.has(neg[i].title)) deathN++;
    if (deathN > 2) {
      let keep = 2;
      for (let i = 0; i < neg.length; i++) if (DEATH.has(neg[i].title) && keep-- <= 0) neg.splice(i--, 1);
    }
    pos.sort((a, b) => b.weight - a.weight);
    return {
      idx, slot: p.player_slot, team: t, win: t === winner, role: role(p), support: sup,
      name: p.personaname || p.name || 'Аноним', accountId: p.account_id, rank: p.rank_tier,
      heroId: p.hero_id, hero: h.localized_name || `Герой ${p.hero_id}`, heroKey: (h.name || '').replace('npc_dota_hero_', ''), heroImg: h.img,
      k: p.kills, d: p.deaths, a: p.assists, gpm: p.gold_per_min, xpm: p.xp_per_min, lh: p.last_hits, dn: p.denies,
      nw: p.net_worth || p.total_gold || 0, dmg: p.hero_damage || 0, tower: p.tower_damage || 0, heal: p.hero_healing || 0,
      kp, dmgShare, obs, sen, fed, lost, soloDeaths: df.solo, deathTimes: (p.deaths_log || []).map((x) => x.time), deadShare, toxic, chatCount,
      stuns: p.stuns || 0, stacks: p.camps_stacked || 0, level: p.level, apm: p.actions_per_min,
      items: [0, 1, 2, 3, 4, 5].map((i) => p[`item_${i}`]).filter(Boolean), neutral: p.item_neutral,
      purchases: (p.purchase_log || []).filter((x) => !/^(tango|flask|clarity|ward_|tpscroll|smoke|dust|enchanted_mango|faerie_fire|branches|blood_grenade|ward_dispenser)/.test(x.key)),
      m01, breakdown, score: Math.round(score), neg, pos, laneDiff, laneOpp, deathCost, objDeaths, throwDeaths, firstLost, missedLost,
      fightsIn: myFights.length, fightsAll: bigFights.length, gold10: g10, lh10: at10(p.lh_t), toxicPenalty: Math.min(10, toxic * 2), carry, killShare, nwShare, conv,
      lane: p.lane, laneRole: p.lane_role, heroKeyRaw: heroKey,
      lanePos: p.lane_pos, obsLog: p.obs_log || [], senLog: p.sen_log || [],
      runes: (p.runes_log || []).length, taken: sum(Object.values(p.damage_taken || {})),
      multi: Math.max(0, ...Object.keys(p.multi_kills || {}).map(Number)), streak: Math.max(0, ...Object.keys(p.kill_streaks || {}).map(Number)),
      timeline, deathsInfo, teamItems, smokes: p.item_uses?.smoke_of_deceit || 0,
      obsLife: obsLives.length ? Math.round(sum(obsLives.map((x) => x.life)) / obsLives.length) : null, obsKilled: obsLives.filter((x) => x.killed).length,
      neutrals: p.neutral_kills || 0, couriers: p.courier_kills || 0, runesN: (p.runes_log || []).length,
      rosh: p.roshan_kills || 0, dewards: (p.observer_kills || 0) + (p.sentry_kills || 0), buybacks: p.buyback_count || 0,
    };
  });

  const losers = players.filter((p) => !p.win).sort((a, b) => a.score - b.score);
  const winners = players.filter((p) => p.win).sort((a, b) => b.score - a.score);
  const ruiner = losers[0];
  const nearRuiner = losers[1];
  const gap = nearRuiner.score - ruiner.score;
  // Доля руина: кто сколько «весит» в поражении; у победителей, доля вклада.
  const share = (arr, f) => { const tot = sum(arr.map(f)) || 1; arr.forEach((p) => (p.share = Math.round(f(p) / tot * 100))); };
  share(losers, (p) => (100 - p.score) ** 2);
  share(winners, (p) => p.score ** 2);
  verdicts(players, mins);
  // место из 10 по золоту, добиваниям и урону
  for (const [key, f] of [['nwPlace', (p) => p.nw], ['lhPlace', (p) => p.lh], ['dmgPlace', (p) => p.dmg]]) {
    [...players].sort((a, b) => f(b) - f(a)).forEach((p, i) => (p[key] = i + 1));
  }
  const stability = verdictStability(losers, m.match_id);
  const confidence = clamp(Math.round(stability * 0.8 + Math.min(20, gap * 1.5)), 40, 99);

  return {
    id: m.match_id, duration: dur, winner, parsed, score: kills, startTime: m.start_time,
    gameMode: m.game_mode, turbo: m.game_mode === 23, lobby: m.lobby_type, rank: avgRank(players),
    players, ruiner, nearRuiner, confidence, gap, stability, lanes: lanes(players),
    mvp: winners[0], bestLoser: losers[losers.length - 1], passenger: winners[winners.length - 1],
    advantage: { gold: m.radiant_gold_adv || [], xp: m.radiant_xp_adv || [] },
    turning: turningPoint(m.radiant_gold_adv || [], winner),
    fights: fights.map((f) => fightInfo(f, players)),
    rawFights: fights, // для разбора драки по участникам
    episodes: episodes(m, players, fights, ruiner),
    noms: nominations(players, mins),
    chat: (m.chat || []).filter((c) => c.type === 'chat').map((c) => ({ time: c.time, text: c.key, p: players.find((p) => p.slot === c.player_slot), toxic: TOXIC.test(c.key) })),
    teamNw, teamDmg,
  };
}

// Вердикт каждому из десяти, а не только одному руинеру (идея RUINER от BattlePass).
// «Подтверждённая проблема» = заметный минус (вес 8+). «Слил?» только при двух таких проблемах и низком вкладе,
// «Под вопросом» при одной проблеме, если вклад низкий или на 5+ ниже среднего у союзников.
// «Не вытащил» — проигравший кор, который тащил (вклад 75+); саппортам не даём, у них он почти всегда мимо.
export function verdicts(players, mins) {
  for (const t of ['radiant', 'dire']) {
    const side = players.filter((p) => p.team === t).sort((a, b) => b.score - a.score);
    const mean = sum(side.map((p) => p.score)) / side.length;
    side.forEach((p, i) => {
      p.place = i + 1;
      const serious = p.neg.filter((n) => n.weight >= 8).length;
      const below = p.score <= mean - 5;
      if (p.win) {
        p.label = p.score >= (p.support ? 82 : 75) && !serious ? 'Тащил'
          : serious >= 2 && p.score < mean ? 'Под вопросом'
          : mins > 20 && p.kp < 0.3 ? 'Был в сторонке' : 'Норм';
      } else {
        p.label = !p.support && p.score >= 75 ? 'Не вытащил'
          : serious >= 2 && p.score <= 45 ? 'Слил?'
          : serious >= 1 && (p.score <= 40 || below) ? 'Под вопросом' : 'Норм';
      }
    });
    // «Слил?» не больше двух в команде, второй только если вклад почти как у первого (до 4 баллов)
    const slil = side.filter((p) => p.label === 'Слил?').reverse();
    slil.slice(1).forEach((p, i) => { if (i > 0 || p.score - slil[0].score > 4) p.label = 'Под вопросом'; });
  }
  // руинера сайт называет всегда: если по правилам он «Норм», это хотя бы «Под вопросом»
  const ruiner = players.filter((p) => !p.win).sort((a, b) => a.score - b.score)[0];
  if (ruiner && ruiner.label === 'Норм') ruiner.label = 'Под вопросом';
}

const avg = (a) => { const v = a.filter((x) => x != null); return v.length ? sum(v) / v.length : null; };

// Устойчивость вердикта: 400 раз случайно шатаем веса метрик (±40%) и смотрим,
// как часто руинером остаётся тот же игрок. Генератор с seed = ID матча, чтобы цифра не прыгала.
export function verdictStability(losers, seed = 1) {
  let s = Number(seed) % 2147483647 || 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const base = losers[0];
  let same = 0;
  const N = 400;
  for (let n = 0; n < N; n++) {
    const jitter = {};
    let worst = null;
    let worstScore = Infinity;
    for (const p of losers) {
      const w = WEIGHTS[p.support ? 'support' : 'core'];
      let tot = 0;
      let sc = 0;
      for (const [k, v] of Object.entries(w)) {
        jitter[k] ??= 0.6 + rnd() * 0.8;
        tot += v * jitter[k];
        sc += v * jitter[k] * p.m01[k];
      }
      sc = sc / tot * 100 - p.toxicPenalty + p.carry;
      if (sc < worstScore) { worstScore = sc; worst = p; }
    }
    if (worst === base) same++;
  }
  return Math.round(same / N * 100);
}

// Линии к 10:00: кто выиграл каждую.
function lanes(players) {
  const names = { 1: 'Нижняя', 2: 'Центральная', 3: 'Верхняя' };
  return [1, 2, 3].map((l) => {
    const side = (t) => players.filter((p) => p.lane === l && p.team === t && p.laneRole !== 4);
    const r = side('radiant');
    const d = side('dire');
    if (!r.length || !d.length || r.some((p) => p.gold10 == null)) return null;
    const gr = sum(r.map((p) => p.gold10));
    const gd = sum(d.map((p) => p.gold10));
    return { lane: names[l], radiant: r, dire: d, diff: gr - gd, winner: Math.abs(gr - gd) < 600 ? null : gr > gd ? 'radiant' : 'dire' };
  }).filter(Boolean);
}

// rank_tier = ранг*10 + звёзды (1–5). Усредняем на сквозной шкале звёзд, иначе «64» и «55» дают несуществующий «Герой 9».
export function avgRank(players) {
  const r = players.map((p) => p.rank).filter(Boolean);
  if (!r.length) return null;
  const steps = r.map((t) => (Math.floor(t / 10) - 1) * 5 + Math.min(5, Math.max(1, t % 10 || 1)) - 1);
  const v = Math.round(sum(steps) / steps.length);
  const tier = Math.min(8, Math.floor(v / 5) + 1);
  return tier === 8 ? 80 : tier * 10 + (v % 5) + 1;
}

// Перелом: последняя минута, когда победитель вышел вперёд и уже не отдавал преимущество.
export function turningPoint(adv, winner) {
  if (!adv.length) return null;
  const sign = winner === 'radiant' ? 1 : -1;
  let t = null;
  for (let i = adv.length - 1; i >= 0; i--) {
    if (adv[i] * sign <= 0) { t = i + 1; break; }
  }
  const loserMax = Math.max(0, ...adv.map((v) => -v * sign));
  const loserMaxAt = adv.findIndex((v) => -v * sign === loserMax);
  return { minute: t ?? 0, loserMax, loserMaxAt, comeback: loserMax > 8000 };
}

function fightInfo(f, players) {
  const goldBy = { radiant: 0, dire: 0 };
  const deaths = [];
  f.players.forEach((fp, i) => {
    const p = players[i];
    if (!p) return;
    goldBy[p.team] += fp.gold_delta || 0;
    for (const [x, ys] of Object.entries(fp.deaths_pos || {})) {
      for (const y of Object.keys(ys)) deaths.push({ p, x: +x, y: +y });
    }
    if (fp.deaths && !Object.keys(fp.deaths_pos || {}).length) deaths.push({ p, x: null, y: null });
  });
  const won = goldBy.radiant >= goldBy.dire ? 'radiant' : 'dire';
  return { start: f.start, end: f.end, deaths, won, swing: Math.abs(goldBy.radiant - goldBy.dire), dmg: f.players.map((fp) => fp.damage || 0) };
}

const BUILD_RU = (key) => {
  const side = key.includes('goodguys') ? 'Свет' : 'Тьма';
  const lane = key.includes('top') ? 'верх' : key.includes('mid') ? 'центр' : key.includes('bot') ? 'низ' : '';
  if (key.includes('tower')) return `вышка ${key.match(/tower(\d)/)?.[1] || ''} (${side}${lane ? ', ' + lane : ''})`;
  if (key.includes('rax')) return `казармы (${side}${lane ? ', ' + lane : ''})`;
  if (key.includes('fort')) return `трон (${side})`;
  return key.replace(/npc_dota_/, '');
};

function episodes(m, players, fights, ruiner) {
  const out = [];
  const bySlot = (s) => players.find((p) => p.slot === s);
  for (const o of m.objectives || []) {
    if (o.type === 'CHAT_MESSAGE_FIRSTBLOOD') {
      const killer = bySlot(o.player_slot);
      const victim = players.find((p) => p.slot === o.victim_player_slot) || players[o.key];
      out.push({ t: o.time, kind: 'fb', title: 'Первая кровь', text: `${killer?.hero || '?'} убивает ${victim?.hero || '?'}`, p: victim });
    } else if (o.type === 'building_kill' && /tower|rax|fort/.test(o.key)) {
      if (/tower1/.test(o.key)) continue; // первые вышки, шум
      out.push({ t: o.time, kind: 'building', title: 'Пало строение', text: BUILD_RU(o.key), team: o.key.includes('goodguys') ? 'radiant' : 'dire' });
    } else if (o.type === 'CHAT_MESSAGE_ROSHAN_KILL') {
      out.push({ t: o.time, kind: 'rosh', title: 'Рошан убит', text: o.team === 2 ? 'Силы Света' : 'Силы Тьмы' });
    } else if (o.type === 'CHAT_MESSAGE_AEGIS') {
      out.push({ t: o.time, kind: 'rosh', title: 'Аегис', text: bySlot(o.player_slot)?.hero || '' });
    }
  }
  fights.forEach((f, fi) => {
    const info = fightInfo(f, players);
    if (info.deaths.length < 3) return;
    const loserSide = info.won === 'radiant' ? 'Тьма' : 'Свет';
    const rd = info.deaths.filter((d) => d.p === ruiner).length;
    out.push({ t: f.start, kind: 'fight', title: `Драка: ${info.deaths.length} ${[2, 3, 4].includes(info.deaths.length % 10) && ![12, 13, 14].includes(info.deaths.length % 100) ? 'смерти' : 'смертей'}`, text: `${loserSide} теряет ${fmt(info.swing)} золота в обмене` + (rd ? ` · ${ruiner.hero} погиб` : ''), ruiner: !!rd, won: info.won, fi });
  });
  for (const d of ruiner.soloDeaths) {
    out.push({ t: d.time, kind: 'solo', title: `${ruiner.hero}: смерть без драки`, text: `Отдал ${fmt(d.gold_fed || 0)} золота врагу, ждал респавна ${d.time_dead || '?'} сек.`, ruiner: true });
  }
  return out.sort((a, b) => a.t - b.t);
}

// предметы «для команды»: обзор, смоки, ауры и сейвы союзников
const TEAM_ITEMS = new Set(['ward_observer', 'ward_sentry', 'smoke_of_deceit', 'dust', 'gem', 'mekansm', 'guardian_greaves', 'pipe', 'crimson_guard',
  'glimmer_cape', 'force_staff', 'lotus_orb', 'solar_crest', 'vladmir', 'spirit_vessel', 'holy_locket', 'arcane_boots', 'boots_of_bearing', 'ward_dispenser']);

// min — порог номинации; медаль по тому, во сколько раз он превышен (как ступени медалей Dota Plus)
const NOMS = [
  { id: 'feeder', icon: 'coins', title: 'Кормилец', desc: 'больше всех золота врагам', v: (p) => p.fed, f: (v) => `${fmt(v)} золота врагам` },
  { id: 'immortal', icon: 'shield', title: 'Бессмертный', desc: 'меньше всех смертей', v: (p) => -p.d + p.k * 0.01, f: (_, p) => `${p.d} смертей` },
  { id: 'damage', icon: 'burst', title: 'Мясник', desc: 'больше всех урона', v: (p) => p.dmg, f: (v) => `${fmt(v)} урона` },
  { id: 'farmer', icon: 'wheat', title: 'Фермер', desc: 'больше всех добитых крипов', v: (p) => p.lh, f: (v) => `${v} крипов` },
  { id: 'eyes', icon: 'eye', title: 'Глаза команды', desc: 'больше всех вардов', v: (p) => p.obs + p.sen, f: (v) => `${v} вардов` },
  { id: 'healer', icon: 'heart', title: 'Лекарь', desc: 'больше всех хила', v: (p) => p.heal, f: (v) => `${fmt(v)} хила` },
  { id: 'tank', icon: 'tank', title: 'Танк', desc: 'принял больше всех урона', v: (p) => p.taken, f: (v) => `${fmt(v)} урона принято` },
  { id: 'control', icon: 'spiral', title: 'Мастер контроля', desc: 'больше всех оглушений', v: (p) => p.stuns, f: (v) => `${Math.round(v)} сек. контроля` },
  { id: 'builder', icon: 'tower', title: 'Сносчик', desc: 'больше всех урона по зданиям', v: (p) => p.tower, f: (v) => `${fmt(v)} по зданиям` },
  { id: 'tourist', icon: 'suitcase', title: 'Турист', desc: 'меньше всех участия в драках', v: (p) => -p.kp, f: (_, p) => `KP ${Math.round(p.kp * 100)}%` },
  { id: 'ghost', icon: 'ghost', title: 'Призрак', desc: 'дольше всех лежал мёртвым', v: (p) => p.deadShare, f: (v) => `${Math.round(v * 100)}% игры мёртв` },
  { id: 'hunter', icon: 'target', title: 'Охотник за вардами', desc: 'больше всех снял вардов', v: (p) => p.dewards, f: (v) => `${v} вардов снято` },
  { id: 'stacker', icon: 'boxes', title: 'Стакер', desc: 'больше всех стаков', v: (p) => p.stacks, f: (v) => `${v} стаков` },
  { id: 'multi', icon: 'zap', title: 'Мульти-килл', desc: 'лучшая серия убийств', v: (p) => p.multi * 100 + p.streak, f: (_, p) => p.multi >= 5 ? 'RAMPAGE' : p.multi === 4 ? 'Ultra kill' : p.multi === 3 ? 'Triple kill' : `серия ${p.streak}` },
  { id: 'jungler', icon: 'wheat', title: 'Лесник', desc: 'больше всех лесных крипов', min: 80, v: (p) => p.neutrals, f: (v) => `${v} лесных крипов` },
  { id: 'streak', icon: 'crown', title: 'Серия', desc: 'самая длинная серия убийств', min: 5, v: (p) => p.streak, f: (v) => `серия из ${v} убийств` },
  { id: 'runes', icon: 'drop', title: 'Диджей рун', desc: 'больше всех рун', min: 8, v: (p) => p.runesN, f: (v) => `${v} рун` },
  { id: 'roshan', icon: 'skull', title: 'Убийца Рошана', desc: 'добивал Рошана', min: 1, v: (p) => p.rosh, f: (v) => `${v} раз` },
  { id: 'courier', icon: 'target', title: 'Охотник на курьеров', desc: 'больше всех убил курьеров', min: 1, v: (p) => p.couriers, f: (v) => `${v} курьеров` },
  { id: 'smoker', icon: 'ghost', title: 'Дымовых дел мастер', desc: 'больше всех смоков', min: 3, v: (p) => p.smokes, f: (v) => `${v} смоков` },
  { id: 'toxic', icon: 'biohazard', title: 'Токсик матча', desc: 'больше всех ругался', v: (p) => p.toxic, f: (v) => `${v} грубых сообщений` },
];

function nominations(players, mins) {
  const out = [];
  for (const n of NOMS) {
    const best = [...players].sort((a, b) => n.v(b) - n.v(a))[0];
    const v = n.v(best);
    if (!v || v <= 0 && !['immortal', 'tourist'].includes(n.id)) continue;
    if (n.id === 'multi' && best.multi < 3) continue;
    if (n.id === 'toxic' && best.toxic < 2) continue;
    if (n.id === 'stacker' && best.stacks < 3) continue;
    if (n.id === 'hunter' && best.dewards < 3) continue;
    if (n.id === 'feeder' && best.fed < 1500) continue;
    if (n.id === 'ghost' && best.deadShare < 0.12) continue;
    if (n.id === 'tourist' && mins < 15) continue;
    if (n.min && v < n.min) continue;
    // одному игроку не больше двух номинаций: третью отдаём следующему по силе
    const got = (p) => out.filter((x) => x.p === p).length;
    const who = got(best) < 2 ? best : [...players].sort((a, b) => n.v(b) - n.v(a)).find((p) => got(p) < 2 && n.v(p) > 0 && (!n.min || n.v(p) >= n.min));
    if (!who) continue;
    const ratio = n.min ? n.v(who) / n.min : 0;
    const medal = !n.min ? null : ratio >= 4 ? 'Грандмастер' : ratio >= 3 ? 'Платина' : ratio >= 2 ? 'Золото' : ratio >= 1.5 ? 'Серебро' : 'Бронза';
    out.push({ ...n, p: who, medal, value: n.f(n.v(who), who) });
  }
  return out;
}

// «Оправдать руинера»: что говорит в его пользу и что было у команды.
export function defend(a, p) {
  const out = p.pos.map((x) => x.text);
  const mates = a.players.filter((q) => q.team === p.team && q !== p);
  const worseDeaths = mates.filter((q) => q.d > p.d);
  if (worseDeaths.length) out.push(`${worseDeaths.map((q) => q.hero).join(', ')} умирали чаще (${worseDeaths.map((q) => q.d).join(', ')}).`);
  const lowKp = mates.filter((q) => q.kp < p.kp);
  if (lowKp.length) out.push(`Участие в драках выше, чем у ${lowKp.map((q) => q.hero).join(', ')}.`);
  if (p.support) out.push('Саппорт: маленький фарм для него нормален, модель это учитывает.');
  const enemyCore = a.players.filter((q) => q.team !== p.team).sort((x, y) => y.nw - x.nw)[0];
  if (enemyCore && enemyCore.nw > p.nw * 2.2) out.push(`У врага был зафармленный ${enemyCore.hero} (${fmt(enemyCore.nw)} NW), играть против него тяжело любому.`);
  if (a.gap < 6) out.push(`Разрыв со следующим игроком всего ${a.gap} балла, заруинила скорее вся команда.`);
  if (!out.length) out.push('Оправдать сложно: ни одного сильного сигнала в его пользу.');
  return out;
}

export const RANKS = ['', 'Рекрут', 'Страж', 'Рыцарь', 'Герой', 'Легенда', 'Властелин', 'Божество', 'Титан'];
export const rankName = (r) => (r ? `${RANKS[Math.floor(r / 10)] || ''} ${r % 10 || ''}`.trim() : 'Без ранга');
