// 3D-примерочная: герой из файлов Dota 2 с анимацией idle, предметы надеваются на его скелет.
// Модели лежат в отдельном репозитории (GitHub Pages), см. tools/build_models.py.
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
// Список героев с моделями, чтобы не стучаться за манифестом, которого нет.
const index = () => (indexP ||= fetch(`${MODELS}index.json`).then((r) => (r.ok ? r.json() : [])).catch(() => []));

// Io (wisp) в игре нарисован частицами, модель под ними просто шар: показываем картинку.
const NO_3D = new Set(['wisp']);

export async function hasModels(hero) {
  if (NO_3D.has(hero) || !(await index()).includes(hero)) return null;
  try {
    const r = await fetch(`${MODELS}${hero}/manifest.json`);
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}

// Витрина: герой в стандартном облике, крутится сам, подсветка в цвет карточки (руинер, красная, MVP, золотая).
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
  // OrbitControls ставит touch-action:none, и на телефоне палец на модели не крутит страницу
  if (!controls.enabled) renderer.domElement.style.touchAction = 'pan-y';
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
  // окно меняет размер уже после загрузки (телефон, перестройка вёрстки): пересчитываем и кадр, иначе голова срезана, а снизу пусто
  let refit = 0;
  let lastSize = '';
  const ro = new ResizeObserver(() => {
    resize();
    const size = `${el.clientWidth}x${el.clientHeight}`;
    if (!hero || size === lastSize) return;
    lastSize = size;
    clearTimeout(refit);
    refit = setTimeout(() => { if (alive) frame(); }, 150);
  });
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
    // Стандартные части героя, вынесенные в отдельные модели, рисуются предметами, тело оставляем.
    await sync();
    frame();
    lastSize = `${el.clientWidth}x${el.clientHeight}`;
  })();

  // Кадр считаем после надевания предметов и по позе из анимации: у Juggernaut и других тело маленькое,
  // а маска, плащ и оружие отдельными моделями, по голому телу камера подъезжает слишком близко.
  function frame() {
    mixer?.update(0);
    hero.updateMatrixWorld(true);
    hero.traverse((o) => o.skeleton?.update());
    const box = new THREE.Box3().setFromObject(hero, true);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const hgt = Math.max(size.y, size.x * 0.8);
    shadow.position.set(center.x, box.min.y + 0.01, center.z);
    shadow.scale.setScalar(Math.max(size.x, size.z) * 1.6);
    controls.target.set(center.x, center.y, center.z);
    // маленькое окно (карточка MVP): вписываем точно по высоте и ширине с запасом на поворот
    const small = opt.controls === false && el.clientHeight < 200;
    if (small) renderer.toneMappingExposure = 1.5;
    const aspect = el.clientWidth / Math.max(1, el.clientHeight);
    const fit = Math.max(size.y, Math.max(size.x, size.z) / aspect) * 1.1 / (2 * Math.tan(THREE.MathUtils.degToRad(15)));
    const dist = small ? fit : hgt * (opt.controls === false ? 2.5 : 3.1); // запас: оружие и плащи бывают в полтора раза больше тела
    camera.position.set(center.x, center.y + (small ? 0 : hgt * 0.1), center.z + dist);
    camera.near = hgt / 100;
    camera.far = hgt * 50;
    camera.updateProjectionMatrix();
    controls.minDistance = hgt * 0.8;
    controls.maxDistance = hgt * 5;
    resize();
    if (opt.controls === false) fitByPixels(small, small ? 1.22 : 1.2, small ? 1.22 : 0.92); // в высоком окне руинера оружию по бокам можно чуть выйти за край, зато герой крупный
  }

  // Математическая рамка не знает, куда герой уходит в анимации и при повороте. Поэтому меряем настоящую картинку:
  // рендерим с восьми сторон в разные моменты анимации, берём общую занятую область и по ней ставим камеру.
  function fitByPixels(small, margin, wideMargin = margin) {
    const W = renderer.domElement.width;
    const H = renderer.domElement.height;
    if (!W || !H) return;
    const c = document.createElement('canvas');
    c.width = 120;
    c.height = Math.max(8, Math.round(120 * H / W));
    const g2 = c.getContext('2d', { willReadFrequently: true });
    const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const measure = () => {
      const t = controls.target;
      const d = camera.position.distanceTo(t);
      let top = 1, bot = -1, wide = 0;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        camera.position.set(t.x + Math.sin(a) * d, t.y, t.z + Math.cos(a) * d);
        camera.lookAt(t);
        mixer?.update(0.37);
        renderer.render(scene, camera);
        g2.clearRect(0, 0, c.width, c.height);
        g2.drawImage(renderer.domElement, 0, 0, c.width, c.height);
        const px = g2.getImageData(0, 0, c.width, c.height).data;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          if (px[(y * c.width + x) * 4 + 3] < 30) continue;
          const ny = 1 - 2 * (y + 0.5) / c.height;
          if (ny > bot) bot = ny;
          if (ny < top) top = ny;
          wide = Math.max(wide, Math.abs(2 * (x + 0.5) / c.width - 1));
        }
      }
      return { low: top, high: bot, wide, d };
    };
    shadow.visible = false;
    for (let pass = 0; pass < 2; pass++) {
      const { low, high, wide, d } = measure();
      if (high <= low) break;
      const t = controls.target;
      // в маленьком окне герой по центру; в высоком окне руинера стоит ногами внизу (у штампа) и занимает почти всю высоту
      // окно руинера: герой от самого верха почти до низа (−0.96…0.92), штамп ложится под ноги
      const span = small ? 2 / margin : 1.88;
      const want = small ? 0 : -0.02; // где должен оказаться центр героя по высоте (-1 низ, 1 верх)
      const next = Math.max(d * (high - low) / span, d * wide * wideMargin, d * 0.3);
      t.y += ((high + low) / 2 * d - want * next) * halfTan;
      camera.position.set(t.x, t.y, t.z + next);
      camera.lookAt(t);
    }
    shadow.visible = true;
    controls.update();
  }


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
        // а сами кости подменяем костями героя, тогда предмет двигается вместе с анимацией героя.
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
    refit() { if (hero) frame(); },
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
