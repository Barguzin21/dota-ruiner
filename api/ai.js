import { cors } from './_cors.js';

// ИИ-комментарии: разбор матча, советы игроку, подбор сетов. Бесплатный уровень Gemini.
// Нужен env GEMINI_API_KEY; без него отвечает 503, и сайт показывает разбор по правилам.
// Алиас сам переезжает на свежую flash-модель: конкретные версии Google закрывает для новых ключей.
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const FALLBACK = 'gemini-flash-lite-latest';

// Правила «человеческого» текста (по гайду Wikipedia «Signs of AI writing»): без них Gemini пишет как пресс-релиз.
const STYLE = `
Как писать:
- Пиши как живой игрок, который пересмотрел катку и делится мнением другу: от первого лица, с реакцией на цифры («311 GPM на тройке — это больно»).
- Разная длина фраз: короткие рубленые вперемешку с длинными. Не делай все абзацы одинаковыми.
- Конкретика вместо общих слов: минута, цифра, предмет, герой. Не «сыграл слабо», а «7 смертей, три из них в одиночку в лесу».
- Без канцелярита и ИИ-штампов: никаких «ключевой», «важно отметить», «стоит подчеркнуть», «играет решающую роль», «в целом», «таким образом», «не просто X, а Y», «является», «представляет собой».
- Не группируй всё по три. Не прыгай по синонимам — героя называй одинаково.
- Без эмодзи, без жирных подзаголовков в пунктах списка («**Фарм:** ...»), без длинных тире подряд, без «Надеюсь, помог» и прочих вежливостей в конце, без вывода в духе «всё получится».
- Заголовки (если нужны) — обычные короткие фразы с маленькой буквы, без двоеточий и эмодзи.
- Юмор можно и нужно, но по делу и без оскорблений. Не выдумывай ничего, чего нет в данных.`;

const PROMPTS = {
  match: 'Ты разбираешь матч Dota 2 для игроков. По данным напиши разбор на русском: кто заруинил и почему (с цифрами), ' +
    'кто вытащил игру, где матч решился (минута и что произошло) и по одному конкретному совету каждому из проигравших. ' +
    'Формат: Markdown, 3–4 коротких раздела, списки только там, где их правда удобнее читать.' + STYLE,
  player: 'Ты тренер по Dota 2 и разбираешь игру одного игрока. По данным скажи на русском, что у него получилось, ' +
    'где он ошибся сильнее всего (с цифрами) и что конкретно делать в следующей игре: позиция, предметы, тайминги. ' +
    'Формат: Markdown, коротко.' + STYLE,
  sets: 'Ты — стилист косметики Dota 2. Тебе дан список наборов и предметов героя с ценами в рублях. ' +
    'Предложи 3 образа: «Дёшево» (до 100 ₽), «Средне» (100–1000 ₽), «Дорого» (больше 1000 ₽). Каждый образ — это либо целый набор, ' +
    'либо гармоничный микс предметов из разных наборов в одной стилистике и цветовой гамме (по одному предмету на слот). ' +
    'Используй ТОЛЬКО id из списка. Ответь строго JSON: {"looks":[{"tier":"cheap|mid|expensive","title":"название образа",' +
    '"why":"почему это смотрится гармонично, 1–2 живых предложения без штампов вроде «идеально сочетается»","items":[id,...]}]}',
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

  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: `${prompt}\n\nДанные:\n${payload}` }] }],
    generationConfig: { temperature: kind === 'sets' ? 0.6 : 0.85, maxOutputTokens: 4096, ...(kind === 'sets' ? { responseMimeType: 'application/json' } : {}) },
  });
  let error = 'gemini недоступен';
  // Бесплатный уровень часто отвечает «перегружено» (429/503) — тогда пробуем облегчённую модель.
  for (const model of [MODEL, FALLBACK]) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body,
      });
      const d = await r.json();
      if (r.ok) {
        const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
        return res.status(200).json({ text });
      }
      error = d.error?.message || `gemini ${r.status}`;
      if (r.status !== 429 && r.status < 500) break;
    } catch (e) {
      error = String(e.message || e);
    }
  }
  res.status(502).json({ error });
}
