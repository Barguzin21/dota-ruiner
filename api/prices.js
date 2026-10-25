import { cors } from './_cors.js';

// Цены косметики Dota 2 в рублях (публичный прайс market.dota2.net) → {t, p: {name: [цена, в продаже]}}.
// У источника нет CORS, поэтому идём через функцию; CDN Vercel кэширует ответ на час.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    const r = await fetch('https://market.dota2.net/api/v2/prices/RUB.json', { headers: { 'User-Agent': 'dota-ruiner/1.0' } });
    if (!r.ok) throw new Error(`market ${r.status}`);
    const d = await r.json();
    const p = {};
    for (const it of d.items || []) p[it.market_hash_name] = [+it.price, +it.volume];
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({ t: d.time, p });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: String(e.message || e) });
  }
}
