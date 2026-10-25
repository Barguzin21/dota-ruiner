// 3D-примерочная: герой из файлов Dota 2 с анимацией idle, предметы надеваются на его скелет.
// Модели лежат в отдельном репозитории (GitHub Pages) — см. tools/build_models.py.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const MODELS = location.hostname.endsWith('github.io') ? '/dota-ruiner-models/' : '/models/';
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();
const load = (url) => {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  return cache.get(url);
};

let indexP;
// Список героев с моделями — чтобы не стучаться за манифестом, которого нет.
const index = () => (indexP ||= fetch(`${MODELS}index.json`).then((r) => (r.ok ? r.json() : [])).catch(() => []));

export async function hasModels(hero) {
  if (!(await index()).includes(hero)) return null;
  try {
    const r = await fetch(`${MODELS}${hero}/manifest.json`);
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}

// Витрина: герой в стандартном облике, крутится сам, подсветка в цвет карточки (руинер — красная, MVP — золотая).
export async function showcase(el, hero, tone) {
  const man = await hasModels(hero);
  if (!man || !document.body.contains(el)) return null;
  const d = await fetch(`data/heroes/${hero}.json`).then((r) => r.json()).catch(() => null);
  const v = createViewer(el, man, { tone, controls: false });
  window.addEventListener('hashchange', () => v.dispose(), { once: true });
  v.wear(Object.values(d?.defaults || {}).map((i) => i.id));
  await v.ready.then(() => el.classList.add('live')).catch(() => v.dispose());
  return v;
}

const TONES = { red: [0xff3b3b, 0xff8a6b], gold: [0xffc23d, 0xffe2a0], blue: [0x7fb0ff, 0xdfe8ff] };

export function createViewer(el, manifest, opt = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  el.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 500);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = opt.controls === false ? 2 : 1.2;
  controls.enabled = opt.controls !== false;
  controls.addEventListener('start', () => (controls.autoRotate = false));

  const [rimColor, fill] = TONES[opt.tone] || TONES.blue;
  scene.add(new THREE.HemisphereLight(fill, 0x2a2018, 1.5));
  const key = new THREE.DirectionalLight(0xfff1dd, 2.4);
  key.position.set(3, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(rimColor, opt.tone ? 4 : 2.2);
  rim.position.set(-4, 3, -5);
  scene.add(rim);
  // мягкая тень-пятно под героем
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  let hero, skeleton, boneIdx, mixer;
  const worn = new Map(); // id → mesh[]
  const clock = new THREE.Clock();
  let alive = true;
  let want = [];

  const resize = () => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  let paused = false;
  renderer.setAnimationLoop(() => {
    if (!alive || paused) return;
    mixer?.update(clock.getDelta());
    controls.update();
    renderer.render(scene, camera);
  });

  const ready = (async () => {
    const gltf = await load(MODELS + manifest.hero);
    hero = gltf.scene;
    scene.add(hero);
    hero.traverse((o) => {
      if (o.isSkinnedMesh && !skeleton) skeleton = o.skeleton;
      if (o.isMesh) o.frustumCulled = false;
    });
    boneIdx = new Map(skeleton?.bones.map((b, i) => [b.name.toLowerCase(), i]) || []);
    if (gltf.animations[0]) {
      mixer = new THREE.AnimationMixer(hero);
      mixer.clipAction(gltf.animations[0]).play();
    }
    // Стандартные части героя, вынесенные в отдельные модели, рисуются предметами — тело оставляем.
    const box = new THREE.Box3().setFromObject(hero);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const hgt = Math.max(size.y, size.x * 0.8);
    shadow.position.set(center.x, box.min.y + 0.01, center.z);
    shadow.scale.setScalar(Math.max(size.x, size.z) * 1.6);
    controls.target.set(center.x, center.y, center.z);
    // запас сверху и по бокам: оружие и плащи бывают в полтора раза больше тела
    camera.position.set(center.x, center.y + hgt * 0.1, center.z + hgt * (opt.controls === false ? 2.5 : 3.1));
    camera.near = hgt / 100;
    camera.far = hgt * 50;
    controls.minDistance = hgt * 0.8;
    controls.maxDistance = hgt * 5;
    resize();
    await sync();
  })();

  // Кость героя для кости предмета: то же имя (без учёта регистра), иначе ближайший предок, иначе корень.
  function heroBone(b) {
    for (let x = b; x; x = x.parent) {
      const i = boneIdx.get((x.name || '').toLowerCase());
      if (i != null) return skeleton.bones[i];
    }
    return skeleton.bones[0];
  }

  function attach(id, gltf) {
    const meshes = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      let mesh;
      if (o.isSkinnedMesh && skeleton) {
        // Вершины предмета лежат в системе его собственных костей: оставляем его матрицы привязки,
        // а сами кости подменяем костями героя — тогда предмет двигается вместе с анимацией героя.
        const sk = new THREE.Skeleton(o.skeleton.bones.map(heroBone), o.skeleton.boneInverses.map((m) => m.clone()));
        mesh = new THREE.SkinnedMesh(o.geometry, o.material);
        mesh.bind(sk, o.bindMatrix.clone());
      } else {
        mesh = new THREE.Mesh(o.geometry, o.material);
        mesh.applyMatrix4(o.matrixWorld);
      }
      mesh.frustumCulled = false;
      hero.add(mesh);
      meshes.push(mesh);
    });
    return meshes;
  }

  async function sync() {
    if (!hero) return;
    const ids = want.filter((id) => manifest.items[id]);
    for (const [id, meshes] of worn) {
      if (!ids.includes(id)) {
        meshes.forEach((m) => { m.removeFromParent(); m.geometry.dispose(); });
        worn.delete(id);
      }
    }
    await Promise.all(ids.filter((id) => !worn.has(id)).map(async (id) => {
      worn.set(id, []);
      try {
        const gltf = await load(`${MODELS}${manifest.hero.split('/')[0]}/${id}.glb`);
        if (want.includes(id) && worn.has(id)) worn.set(id, attach(id, gltf));
      } catch {
        worn.delete(id);
      }
    }));
  }

  return {
    ready,
    async wear(ids) {
      want = ids.map(String);
      await sync();
    },
    snapshot: () => renderer.domElement.toDataURL('image/png'),
    pause(v) { paused = v; if (!v) clock.getDelta(); },
    resetView() { controls.autoRotate = true; },
    dispose() {
      alive = false;
      ro.disconnect();
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
