// Примерочная: герои → наборы и предметы по слотам, цены, образы по бюджету (правила + ИИ).
import { $, $$, esc, rub, consts, heroTall, getJSON, toast, askAI, API } from './util.js';

const RAR = { common: ['Обычный', '#b0c3d9'], uncommon: ['Необычный', '#5e98d9'], rare: ['Редкий', '#4b69ff'], mythical: ['Мифический', '#8847ff'],
  legendary: ['Легендарный', '#d32ce6'], immortal: ['Бессмертный', '#e4ae39'], arcana: ['Аркана', '#ade55c'], ancient: ['Древний', '#eb4b4b'], seasonal: ['Сезонный', '#fff34f'] };
const RANK = ['common', 'uncommon', 'rare', 'mythical', 'legendary', 'immortal', 'arcana', 'ancient'];
const SLOT_RU = { weapon: 'Оружие', offhand_weapon: 'Второе оружие', head: 'Голова', armor: 'Броня', back: 'Спина', shoulder: 'Плечи', arms: 'Руки', belt: 'Пояс',
  neck: 'Шея', legs: 'Ноги', mount: 'Скакун', misc: 'Разное', tail: 'Хвост', gloves: 'Перчатки', body_head: 'Тело', head_accessory: 'Аксессуар', summon: 'Призыв', ability1: 'Способность 1', ability2: 'Способность 2', ability3: 'Способность 3', ability4: 'Способность 4', ultimate: 'Ульта', blink: 'Блинк' };
const ATTR = { str: 'Сила', agi: 'Ловкость', int: 'Интеллект', all: 'Универсальные' };
const TIERS = [['cheap', 'Дёшево', 0, 100], ['mid', 'Средне', 100, 1000], ['expensive', 'Дорого', 1000, Infinity]];

let pricesP;
const prices = () => (pricesP ||= getJSON(`${API}/prices`).then((d) => d.p).catch(() => null));
const icon = (it) => (it?.img ? `img/items/${it.id}.webp` : null);
const slotName = (s) => SLOT_RU[s] || s.replace(/_/g, ' ');
const rank = (r) => Math.max(0, RANK.indexOf(r));
const market = (name) => `https://steamcommunity.com/market/listings/570/${encodeURIComponent(name)}`;

export async function renderSets(app, hero, params) {
  const C = await consts();
  if (!hero) return heroGrid(app, C);
  app.innerHTML = '<div class="loading"><div class="spinner"></div>Открываем гардероб…</div>';
  let D;
  try {
    D = await getJSON(`data/heroes/${hero}.json`);
  } catch {
    app.innerHTML = '<div class="error">Такого героя нет в базе.</div>';
    return;
  }
  const P = await prices();
  heroPage(app, C, D, P, params);
}

async function heroGrid(app, C) {
  const idx = await getJSON('data/heroes.json');
  const count = Object.fromEntries(idx.map((x) => [x.hero, x.sets]));
  const heroes = Object.values(C.heroes).map((h) => ({ ...h, key: h.name.replace('npc_dota_hero_', '') })).sort((a, b) => a.localized_name.localeCompare(b.localized_name));
  app.innerHTML = `
    <div class="wtop"><div><div class="lbl">Примерочная Dota 2</div><h1>Герои</h1></div>
    <input type="search" id="hs" placeholder="Найти героя…" style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 14px;min-width:240px"></div>
    <div id="hg"></div>`;
  const draw = (q = '') => {
    $('#hg').innerHTML = Object.entries(ATTR).map(([a, t]) => {
      const list = heroes.filter((h) => h.primary_attr === a && h.localized_name.toLowerCase().includes(q.toLowerCase()));
      return list.length ? `<div class="attr">${t}</div><div class="hgrid">${list.map((h) => `
        <a class="hcard" href="#/sets/${h.key}"><img src="${heroTall(h.key)}" alt="" loading="lazy"><div>${esc(h.localized_name)}<small>${count[h.key] || 0} наборов</small></div></a>`).join('')}</div>` : '';
    }).join('') || '<div class="empty">Не нашли такого героя.</div>';
  };
  $('#hs').oninput = (e) => draw(e.target.value);
  draw();
}

function heroPage(app, C, D, P, params) {
  const h = C.heroByKey[D.hero] || { localized_name: D.hero };
  const byId = Object.fromEntries([...D.items, ...Object.values(D.defaults)].map((i) => [i.id, i]));
  const price = (it) => P?.[it.n]?.[0] ?? null;
  const vol = (it) => P?.[it.n]?.[1] ?? 0;
  const setPrice = (s) => price(s) ?? (s.items.every((id) => price(byId[id]) != null) ? s.items.reduce((a, id) => a + price(byId[id]), 0) : null);
  const slots = D.slots.filter((s) => D.defaults[s] || D.items.some((i) => i.s === s));

  const st = { eq: { ...Object.fromEntries(Object.entries(D.defaults).map(([s, i]) => [s, i.id])) }, set: null, view: 'sets', slot: null, q: '', sort: 'pop', onlySale: true, looks: null };
  for (const id of (params.get('i') || '').split(',').map(Number).filter(Boolean)) if (byId[id]) st.eq[byId[id].s] = id;

  app.innerHTML = `
    <div class="wtop"><div><a class="lbl" href="#/sets" style="text-decoration:none">← Все герои</a><h1>${esc(h.localized_name)}</h1></div>
    <div class="psub">${D.sets.length} наборов · ${D.items.length} предметов · цены ${P ? 'маркета в рублях' : 'недоступны'}</div></div>
    <div class="wrap2">
      <aside class="stage"><div class="look" id="look"></div><div class="slots" id="slots"></div>
        <div class="total"><span class="lbl">Стоимость образа</span><span class="num" id="sum"></span></div>
        <div class="actions"><button class="btn gold" id="buy">Где купить</button><button class="btn ghost" id="link">Ссылка на образ</button><button class="btn ghost" id="reset">Сбросить</button></div>
      </aside>
      <section>
        <div class="panel aibox"><h3>Образ под бюджет <small>подборка по ценам и редкости</small></h3><div class="looks" id="looks"></div>
        <div class="actions" style="margin-bottom:0"><button class="btn" id="aisets">✨ Подобрать стильные образы с ИИ</button></div></div>
        <div class="toolbar">
          <div class="seg"><button data-v="sets">Наборы</button><button data-v="items">Предметы</button></div>
          <input type="search" id="q" placeholder="Поиск по названию">
          <select id="sort"><option value="pop">Популярные</option><option value="cheap">Дешевле</option><option value="exp">Дороже</option><option value="rar">По редкости</option></select>
          <label class="chip" style="cursor:pointer"><input type="checkbox" id="sale" checked> только в продаже</label>
        </div>
        <div class="filters" id="slotf"></div>
        <div class="igrid" id="grid"></div>
      </section>
    </div>`;

  // 3D, если для героя выгружены модели; иначе — картинка набора / портрет.
  let viewer = null;
  const look = $('#look');
  const drawStage = () => {
    const set = st.set && D.sets.find((s) => s.id === st.set);
    const lookSet = set; // st.set сбрасывается, как только меняют отдельный предмет
    const title = lookSet ? esc(lookSet.ru) : `${esc(h.localized_name)} — свой образ`;
    if (viewer) {
      $('.lt', look).innerHTML = title;
      viewer.wear(Object.values(st.eq));
    } else {
      look.innerHTML = lookSet?.img
        ? `<img src="${icon(lookSet)}" alt=""><div class="lt">${title}</div>`
        : `<img src="${heroTall(D.hero)}" alt="" style="object-fit:contain;height:90%"><div class="lt">${title}</div>`;
    }
    let total = 0;
    let unknown = 0;
    $('#slots').innerHTML = slots.map((s) => {
      const it = byId[st.eq[s]] || D.defaults[s];
      const def = it && D.defaults[s]?.id === it.id;
      const p = it && !def ? price(it) : null;
      if (it && !def) p == null ? unknown++ : (total += p);
      return `<div class="slot ${st.slot === s && st.view === 'items' ? 'on' : ''}" data-slot="${s}">${icon(it) ? `<img src="${icon(it)}" alt="">` : '<img alt="">'}
        <div style="min-width:0"><div class="k">${slotName(s)}</div><div class="nm">${esc(it?.ru || '—')}</div></div><div class="pr">${def ? 'стандарт' : rub(p)}</div></div>`;
    }).join('');
    $('#sum').textContent = rub(total) + (unknown ? ` + ${unknown} без цены` : '');
    if (set && price(set) != null) $('#sum').textContent += ` · набор ${rub(price(set))}`;
    $$('#slots .slot').forEach((el) => (el.onclick = () => { st.view = 'items'; st.slot = el.dataset.slot; drawList(); drawStage(); }));
  };

  const card = (x, isSet) => {
    const p = isSet ? setPrice(x) : price(x);
    const [rn, rc] = RAR[x.r] || RAR.common;
    const on = isSet ? st.set === x.id : st.eq[x.s] === x.id;
    const partsCheaper = isSet && price(x) != null && x.items.every((id) => price(byId[id]) != null) && x.items.reduce((a, id) => a + price(byId[id]), 0) < price(x) * 0.85;
    return `<div class="icard ${on ? 'on' : ''}" data-${isSet ? 'set' : 'item'}="${x.id}">
      <div class="pic">${x.img ? `<img src="${icon(x)}" alt="" loading="lazy">` : collage(isSet ? x.items : [])}</div>
      <div class="rar" style="background:${rc}"></div>
      <div class="info"><div class="nm">${esc(x.ru)}</div>
      <div class="meta"><span style="color:${rc}">${rn}${isSet ? '' : ' · ' + slotName(x.s)}</span><span class="price ${p == null ? 'none' : ''}">${p == null ? 'не продаётся' : rub(p)}</span></div>
      ${partsCheaper ? '<div class="psub" style="color:var(--green)">по частям дешевле</div>' : ''}</div></div>`;
  };

  // У набора нет своей иконки в игре — показываем коллаж из иконок его предметов.
  const collage = (ids) => {
    const imgs = ids.map((id) => byId[id]).filter((it) => it?.img).slice(0, 4);
    return imgs.length ? `<div class="collage n${imgs.length}">${imgs.map((it) => `<img src="${icon(it)}" alt="" loading="lazy">`).join('')}</div>` : '<div class="noimg">нет картинки</div>';
  };

  const sorter = (a, b) => ({
    pop: () => vol(b) - vol(a) || rank(b.r) - rank(a.r),
    cheap: () => (price(a) ?? 1e9) - (price(b) ?? 1e9),
    exp: () => (price(b) ?? -1) - (price(a) ?? -1),
    rar: () => rank(b.r) - rank(a.r) || vol(b) - vol(a),
  })[st.sort]();

  const drawList = () => {
    $$('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.v === st.view));
    const q = st.q.toLowerCase();
    const match = (x) => !q || x.ru.toLowerCase().includes(q) || x.n.toLowerCase().includes(q);
    $('#slotf').innerHTML = st.view === 'items' ? [null, ...slots].map((s) => `<button data-s="${s || ''}" class="${st.slot === s ? 'on' : ''}">${s ? slotName(s) : 'Все слоты'}</button>`).join('') : '';
    $$('#slotf button').forEach((b) => (b.onclick = () => { st.slot = b.dataset.s || null; drawList(); drawStage(); }));
    let list;
    if (st.view === 'sets') {
      list = D.sets.filter((s) => match(s) && (!st.onlySale || setPrice(s) != null)).sort((a, b) => (st.sort === 'cheap' || st.sort === 'exp' ? ({ cheap: 1, exp: -1 }[st.sort]) * ((setPrice(a) ?? 1e9) - (setPrice(b) ?? 1e9)) : sorter(a, b)));
      $('#grid').innerHTML = list.map((s) => card(s, true)).join('') || '<div class="empty">Ничего не нашли.</div>';
    } else {
      list = D.items.filter((i) => match(i) && (!st.slot || i.s === st.slot) && (!st.onlySale || price(i) != null)).sort(sorter).slice(0, 300);
      $('#grid').innerHTML = list.map((i) => card(i, false)).join('') || '<div class="empty">Ничего не нашли.</div>';
    }
    $$('[data-set]').forEach((el) => (el.onclick = () => equipSet(+el.dataset.set)));
    $$('[data-item]').forEach((el) => (el.onclick = () => {
      const it = byId[el.dataset.item];
      st.set = null;
      st.eq[it.s] = st.eq[it.s] === it.id ? D.defaults[it.s]?.id : it.id;
      drawStage();
      drawList();
    }));
  };

  const equipSet = (id) => {
    const s = D.sets.find((x) => x.id === id);
    st.set = id;
    for (const iid of s.items) st.eq[byId[iid].s] = iid;
    drawStage();
    drawList();
    window.innerWidth < 900 && $('#look').scrollIntoView({ behavior: 'smooth' });
  };

  // Образы по правилам: в каждом ценовом диапазоне — самый редкий и ходовой набор.
  const ruleLooks = () => TIERS.map(([tier, title, lo, hi]) => {
    const c = D.sets.filter((s) => { const p = setPrice(s); return p != null && p >= lo && p < hi; })
      .sort((a, b) => rank(b.r) - rank(a.r) || vol(b) - vol(a))[0];
    return c && { tier, title, name: c.ru, why: `${RAR[c.r]?.[0] || ''} набор, ${vol(c)} шт. в продаже — самый редкий в этом бюджете.`, items: c.items, set: c.id };
  }).filter(Boolean);

  const drawLooks = (looks) => {
    $('#looks').innerHTML = looks.map((l, i) => {
      const total = l.items.reduce((a, id) => a + (price(byId[id]) ?? 0), 0);
      const sp = l.set ? setPrice(D.sets.find((s) => s.id === l.set)) : null;
      return `<div class="lookc" data-look="${i}"><div class="tier ${l.tier}">${esc(TIERS.find((t) => t[0] === l.tier)?.[1] || l.tier)}</div><b>${esc(l.name)}</b><p>${esc(l.why)}</p>
        <div class="row">${l.items.map((id) => byId[id]).filter(Boolean).map((it) => (icon(it) ? `<img src="${icon(it)}" alt="" title="${esc(it.ru)}">` : '')).join('')}</div>
        <div class="sum">${rub(sp ?? total)}</div></div>`;
    }).join('') || '<div class="empty">Нет наборов с ценами.</div>';
    $$('[data-look]').forEach((el) => (el.onclick = () => {
      const l = looks[el.dataset.look];
      if (l.set) return equipSet(l.set);
      st.set = null;
      for (const id of l.items) st.eq[byId[id].s] = id;
      drawStage();
      drawList();
    }));
  };

  $('#aisets').onclick = async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'ИИ подбирает…';
    const sets = D.sets.filter((s) => setPrice(s) != null).sort((a, b) => vol(b) - vol(a)).slice(0, 70)
      .map((s) => ({ id: s.id, name: s.n, rarity: s.r, price: Math.round(setPrice(s) * 100) / 100, items: s.items }));
    const items = D.items.filter((i) => price(i) != null).sort((a, b) => vol(b) - vol(a)).slice(0, 160)
      .map((i) => ({ id: i.id, name: i.n, slot: i.s, rarity: i.r, price: price(i) }));
    try {
      const text = await askAI('sets', { hero: h.localized_name, slots, sets, items });
      const looks = JSON.parse(text.replace(/^```json|```$/g, '')).looks
        .map((l) => {
          // набор раскрываем в предметы, лишние/чужие id отбрасываем, один предмет на слот
          const ids = l.items.flatMap((id) => D.sets.find((s) => s.id === id)?.items || [id]).filter((id) => byId[id]);
          const per = Object.values(Object.fromEntries(ids.map((id) => [byId[id].s, id])));
          return { tier: l.tier, name: l.title, why: l.why, items: per };
        }).filter((l) => l.items.length);
      drawLooks(looks.length ? looks : ruleLooks());
    } catch (err) {
      toast(err.status === 503 ? 'ИИ ещё не подключён — показаны подборки по правилам' : 'ИИ не ответил, показаны подборки по правилам');
    }
    e.target.disabled = false;
    e.target.textContent = '✨ Подобрать стильные образы с ИИ';
  };

  $$('.seg button').forEach((b) => (b.onclick = () => { st.view = b.dataset.v; drawList(); drawStage(); }));
  $('#q').oninput = (e) => { st.q = e.target.value; drawList(); };
  $('#sort').onchange = (e) => { st.sort = e.target.value; drawList(); };
  $('#sale').onchange = (e) => { st.onlySale = e.target.checked; drawList(); };
  $('#reset').onclick = () => { st.eq = Object.fromEntries(Object.entries(D.defaults).map(([s, i]) => [s, i.id])); st.set = null; drawStage(); drawList(); };
  $('#link').onclick = async () => {
    const ids = Object.values(st.eq).filter((id) => !Object.values(D.defaults).some((d) => d.id === id));
    const url = `${location.origin}${location.pathname}#/sets/${D.hero}${ids.length ? '?i=' + ids.join(',') : ''}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast('Ссылка на образ скопирована');
  };
  $('#buy').onclick = () => {
    const its = Object.values(st.eq).map((id) => byId[id]).filter((it) => it && D.defaults[it.s]?.id !== it.id);
    const set = st.set && D.sets.find((s) => s.id === st.set);
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div><h3 style="font:700 16px var(--display);margin:0 0 12px">Где купить</h3>
      ${set && price(set) != null ? `<p><a class="btn gold" href="${market(set.n)}" target="_blank" rel="noopener">Набор целиком в Steam — ${rub(price(set))}</a></p>` : ''}
      ${its.map((it) => `<div class="slot" style="cursor:default"><img src="${icon(it) || ''}" alt=""><div><div class="k">${slotName(it.s)}</div><div class="nm">${esc(it.ru)}</div></div>
        <a class="btn ghost" href="${market(it.n)}" target="_blank" rel="noopener">${rub(price(it))} · Steam</a></div>`).join('') || '<p class="psub">Сейчас на герое только стандартные предметы.</p>'}
      <p class="psub">Цены — средние по маркету, в Steam может отличаться.</p>
      <div class="actions"><button class="btn ghost" data-close>Закрыть</button></div></div>`;
    modal.onclick = (e) => { if (e.target === modal || 'close' in e.target.dataset) modal.remove(); };
    document.body.append(modal);
  };

  drawStage();
  drawList();
  drawLooks(ruleLooks());
  start3d();

  async function start3d() {
    const v3 = await import('./viewer3d.js').catch(() => null);
    const man = v3 && (await v3.hasModels(D.hero));
    if (!man || !document.body.contains(look)) return;
    look.classList.add('is3d');
    look.innerHTML = `<div class="lt"></div><div class="l3d"><span class="badge3d">3D</span>
      <button class="btn ghost sm" id="snap" title="Сохранить картинку">📸</button></div><div class="l3load"><div class="spinner"></div></div>`;
    viewer = v3.createViewer(look, man);
    window.addEventListener('hashchange', () => viewer.dispose(), { once: true });
    $('#snap').onclick = () => {
      const a = document.createElement('a');
      a.download = `${D.hero}-look.png`;
      a.href = viewer.snapshot();
      a.click();
    };
    drawStage();
    await viewer.ready.catch(() => toast('3D-модель не загрузилась'));
    $('.l3load', look)?.remove();
  }
}
