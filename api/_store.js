// JSON-файлы в приватном Vercel Blob: чтение мимо кэша и запись с проверкой etag,
// чтобы два одновременных голоса не затёрли друг друга.
import { get, put } from '@vercel/blob';

export async function load(path, empty) {
  const r = await get(path, { access: 'private', useCache: false }).catch((e) => {
    if (e.name === 'BlobNotFoundError') return null;
    throw e;
  });
  if (!r) return { doc: empty, etag: null };
  // большой файл приходит сжатым со слабым ETag (W/"…"), а ifMatch принимает только сильный
  return { doc: await new Response(r.stream).json(), etag: r.blob.etag?.replace(/^W\//, '') };
}

// change(doc) → новый doc. Повторяем, если кто-то успел записать раньше.
export async function update(path, empty, change) {
  for (let i = 0; i < 8; i++) {
    if (i) await new Promise((r) => setTimeout(r, 40 + Math.random() * 120 * i));
    const { doc, etag } = await load(path, empty);
    const next = change(doc);
    try {
      await put(path, JSON.stringify(next), {
        access: 'private', contentType: 'application/json', addRandomSuffix: false,
        ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
      });
      return next;
    } catch (e) {
      if (!/precondition|already exists/i.test(`${e.name} ${e.message}`)) throw e;
    }
  }
  throw new Error('конфликт записи');
}
