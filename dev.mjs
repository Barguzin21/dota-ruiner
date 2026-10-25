// Локальный сервер: статика + функции из api/ в стиле Vercel. node dev.mjs [порт]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const PORT = +process.argv[2] || 3141;
const MODELS = normalize(process.env.MODELS || join(ROOT, '..', 'dota-ruiner-models'));
const TYPES = { '.glb': 'model/gltf-binary','.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png' };
// .env — свои ключи, .env.local — то, что выдал `vercel env pull` (токен Blob)
for (const f of ['.env', '.env.local']) if (existsSync(f)) for (const l of readFileSync(f, 'utf8').split('\n')) { const m = l.match(/^(\w+)="?(.*?)"?\s*$/); if (m) process.env[m[1]] ??= m[2]; }

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const file = join(ROOT, 'api', url.pathname.slice(5).replace(/\W/g, '') + '.js');
    if (!existsSync(file)) return res.writeHead(404).end();
    let body = '';
    for await (const c of req) body += c;
    req.body = body ? JSON.parse(body) : undefined;
    req.query = Object.fromEntries(url.searchParams);
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (d) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(d)); };
    return (await import(pathToFileURL(file))).default(req, res);
  }
  // 3D-модели живут в соседнем репозитории (на проде — barguzin21.github.io/dota-ruiner-models)
  const base = url.pathname.startsWith('/models/') ? MODELS : ROOT;
  const rel = url.pathname.startsWith('/models/') ? url.pathname.slice(7) : url.pathname === '/' ? '/index.html' : url.pathname;
  const path = normalize(join(base, decodeURIComponent(rel)));
  if (!path.startsWith(base)) return res.writeHead(403).end();
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
