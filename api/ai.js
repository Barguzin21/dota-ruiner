import { cors } from './_cors.js';

// ИИ-комментарии: разбор матча, советы игроку, подбор сетов. Бесплатный уровень Gemini.
// Нужен env GEMINI_API_KEY; без него отвечает 503, и сайт показывает разбор по правилам.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const PROMPTS = {
  match: 'Ты — опытный аналитик Dota 2 и немного стендап-комик. По данным матча напиши разбор на русском: ' +
    '1) кто заруинил и почему (2–3 предложения, с цифрами), 2) кто MVP, 3) где матч решился (минута и что произошло), ' +
    '4) по одному конкретному совету каждому игроку проигравшей команды. Пиши живо, с юмором, но без оскорблений. ' +
    'Только факты из данных, ничего не выдумывай. Формат: Markdown, короткие абзацы и списки.',
  player: 'Ты — тренер по Dota 2. По данным игрока в матче дай на русском: что он сделал хорошо (2 пункта), ' +
    '3 главные ошибки с цифрами и 3 конкретных совета на следующую игру (позиционирование, предметы, тайминги). ' +
    'Опирайся только на данные. Формат: Markdown, коротко.',
  sets: 'Ты — стилист косметики Dota 2. Тебе дан список наборов и предметов героя с ценами в рублях. ' +
    'Предложи 3 образа: «Дёшево» (до 100 ₽), «Средне» (100–1000 ₽), «Дорого» (больше 1000 ₽). Каждый образ — это либо целый набор, ' +
    'либо гармоничный микс предметов из разных наборов в одной стилистике и цветовой гамме (по одному предмету на слот). ' +
    'Используй ТОЛЬКО id из списка. Ответь строго JSON: {"looks":[{"tier":"cheap|mid|expensive","title":"название образа",' +
    '"why":"почему это смотрится гармонично, 1–2 предложения","items":[id,...]}]}',
};

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'ИИ не настроен' });
  const { kind, data } = req.body || {};
  const prompt = PROMPTS[kind];
  const payload = JSON.stringify(data || {});
  if (!prompt || payload.length > 60000) return res.status(400).json({ error: 'bad request' });

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${prompt}\n\nДанные:\n${payload}` }] }],
        generationConfig: { temperature: kind === 'sets' ? 0.6 : 0.85, maxOutputTokens: 2048, ...(kind === 'sets' ? { responseMimeType: 'application/json' } : {}) },
      }),
    });
    const d = await r.json();
    if (!r.ok) return res.status(502).json({ error: d.error?.message || `gemini ${r.status}` });
    const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    res.status(200).json({ text });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
