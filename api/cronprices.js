import { update } from './_store.js';
import SETS from './_sets.js';

// Раз в сутки (vercel.json → crons) дописываем цены всех наборов в prices/history.json:
// {days: ['2026-10-26', …], p: {название: [цена или null по дням]}}.
const MAX_DAYS = 400;

export default async function handler(req, res) {
  // Vercel Cron присылает Authorization: Bearer CRON_SECRET — чужие вызовы не пускаем
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'нет доступа' });
  try {
    const r = await fetch('https://market.dota2.net/api/v2/prices/RUB.json', { headers: { 'User-Agent': 'dota-ruiner/1.0' } });
    if (!r.ok) throw new Error(`market ${r.status}`);
    const now = {};
    for (const it of (await r.json()).items || []) now[it.market_hash_name] = +it.price;
    const day = new Date().toISOString().slice(0, 10);
    const doc = await update('prices/history.json', { days: [], p: {} }, (d) => {
      const days = [...(d.days || [])];
      const p = { ...(d.p || {}) };
      if (days[days.length - 1] === day) days.pop(); // повторный запуск в тот же день — перезаписываем день
      days.push(day);
      for (const name of SETS) {
        const row = (p[name] || []).slice(0, days.length - 1);
        while (row.length < days.length - 1) row.unshift(null);
        row.push(now[name] ?? null);
        p[name] = row.slice(-MAX_DAYS);
      }
      return { days: days.slice(-MAX_DAYS), p };
    });
    res.status(200).json({ ok: true, day, days: doc.days.length });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
