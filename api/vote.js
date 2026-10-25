import { cors } from './_cors.js';
import { load, update } from './_store.js';

// Голоса за вердикт матча: согласны ли люди с моделью и кого они сами считают руинером.
// GET ?match=ID → {agree, disagree, picks: {индекс игрока: голоса}}; POST {match, vote, pick?}.
const EMPTY = { agree: 0, disagree: 0, picks: {} };

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const id = String(req.query?.match || req.body?.match || '');
  if (!/^\d{6,12}$/.test(id)) return res.status(400).json({ error: 'нужен ID матча' });
  const path = `votes/${id}.json`;
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json((await load(path, EMPTY)).doc);
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET или POST' });
    const { vote, pick } = req.body || {};
    if (!['agree', 'disagree'].includes(vote)) return res.status(400).json({ error: 'vote: agree или disagree' });
    const p = Number.isInteger(pick) && pick >= 0 && pick < 10 ? pick : null;
    const doc = await update(path, EMPTY, (d) => {
      d = { ...EMPTY, ...d, picks: { ...d.picks } };
      d[vote]++;
      if (vote === 'disagree' && p != null) d.picks[p] = (d.picks[p] || 0) + 1;
      return d;
    });
    res.status(200).json(doc);
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
