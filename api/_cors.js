// Сайт живёт на GitHub Pages, а функции — на Vercel: разрешаем запросы с github.io и локалки.
const ALLOWED = /^https:\/\/[\w-]+\.github\.io$|^http:\/\/localhost(:\d+)?$/;

export function cors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
