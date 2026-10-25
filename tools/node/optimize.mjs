// Сжатие glb из Source 2 Viewer: оставляем только цветовую текстуру (webp), геометрия — meshopt.
// node optimize.mjs <jobs.json>   jobs: [[src, dst, texSize], ...]
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let ok = 0;
let fail = 0;

for (const [src, dst, size] of jobs) {
  try {
    const doc = await io.read(src);
    const root = doc.getRoot();
    for (const m of root.listMaterials()) {
      // Шейдер Dota не PBR: нормали/маски только раздувают файл, без них модель выглядит так же в превью.
      m.setNormalTexture(null).setOcclusionTexture(null).setEmissiveTexture(null).setMetallicRoughnessTexture(null);
      m.setMetallicFactor(0).setRoughnessFactor(0.75);
    }
    // морф-цели (лицо, ткань) в примерочной не играют, а весят до 20 МБ на предмет
    for (const mesh of root.listMeshes()) {
      for (const prim of mesh.listPrimitives()) for (const t of prim.listTargets()) { prim.removeTarget(t); t.dispose(); }
      mesh.setWeights([]);
    }
    // герою нужна одна стойка, предметам анимации не нужны вовсе — они двигаются костями героя
    const keep = dst.endsWith('hero.glb') ? 1 : 0;
    // dispose() анимации не трогает её сэмплеры — их данные оставались в файле (до 25 МБ мусора)
    for (const a of root.listAnimations().slice(keep)) {
      for (const c of a.listChannels()) c.dispose();
      for (const sm of a.listSamplers()) { sm.getInput()?.dispose(); sm.getOutput()?.dispose(); sm.dispose(); }
      a.dispose();
    }
    await doc.transform(
      prune({ keepAttributes: true, keepLeaves: true }),
      dedup(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 72 }),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    mkdirSync(dirname(dst), { recursive: true });
    await io.write(dst, doc);
    ok++;
  } catch (e) {
    fail++;
    console.error('FAIL', src, e.message);
  }
}
console.log(`готово: ${ok}, ошибок: ${fail}`);
