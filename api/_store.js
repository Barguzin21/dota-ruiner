// JSON-документы в Upstash Redis (REST): хеш { doc, v }, запись «только если версия не изменилась»,
// чтобы два одновременных голоса не затёрли друг друга.
// Раньше данные жили в Vercel Blob; при первом чтении ключа старый файл переносится сюда (если Blob доступен).
import { get } from '@vercel/blob';

const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const key = (path) => `dota:${path}`;

async function redis(...cmd) {
  const r = await fetch(RURL, { method: 'POST', headers: { authorization: `Bearer ${RTOK}` }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw Error('redis: ' + j.error);
  return j.result;
}

const CAS = `if (redis.call('HGET', KEYS[1], 'v') or '0') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'doc', ARGV[2], 'v', tostring(tonumber(ARGV[1]) + 1))
return 1`;

/** Старый файл из Blob — только для переноса. Недоступен (заморожен/нет) → null. */
async function fromBlob(path) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const r = await get(path, { access: 'private', useCache: false }).catch(() => null);
  return r?.stream ? await new Response(r.stream).json() : null;
}

export async function load(path, empty) {
  const [doc, v] = await redis('HMGET', key(path), 'doc', 'v');
  if (doc) return { doc: JSON.parse(doc), etag: v || '0' };
  const old = await fromBlob(path);
  if (old) {
    // переносим один раз; если параллельно кто-то уже записал — берём его версию
    await redis('EVAL', CAS, 1, key(path), '0', JSON.stringify(old));
    return load(path, empty);
  }
  return { doc: empty, etag: '0' };
}

// change(doc) → новый doc. Повторяем, если кто-то успел записать раньше.
export async function update(path, empty, change) {
  for (let i = 0; i < 8; i++) {
    if (i) await new Promise((r) => setTimeout(r, 40 + Math.random() * 120 * i));
    const { doc, etag } = await load(path, empty);
    const next = change(doc);
    if (await redis('EVAL', CAS, 1, key(path), etag, JSON.stringify(next))) return next;
  }
  throw new Error('конфликт записи');
}
