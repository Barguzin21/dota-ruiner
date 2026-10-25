import { cors } from './_cors.js';
import { load } from './_store.js';

// История цены набора: GET ?name=… → {days, prices}. CDN держит ответ час — история обновляется раз в сутки.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  const name = String(req.query?.name || '');
  if (!name || name.length > 200) return res.status(400).json({ error: 'нужно название набора' });
  try {
    const { doc } = await load('prices/history.json', { days: [], p: {} });
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({ days: doc.days, prices: doc.p[name] || [] });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
