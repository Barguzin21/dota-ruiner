"""3D-модели для примерочной: герой (с анимацией idle) + все предметы с моделью.

python tools/build_models.py <out_dir> [hero ...]
  out_dir — папка репозитория моделей (GitHub Pages), например C:/Claude/dota-ruiner-models

Шаги на героя: Source 2 Viewer CLI экспортирует glb → из DATA-блока берём мини-скелет предмета
(имена костей + родители) и сводим каждую кость к кости героя → node tools/node/optimize.mjs сжимает
(webp + meshopt) → <out>/<hero>/manifest.json.
"""
import json
import os
import re
import struct
import subprocess
import sys
import urllib.request

import kv
import vpk

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAK = r'C:/Program Files (x86)/Steam/steamapps/common/dota 2 beta/game/dota/pak01_dir.vpk'
VRF = os.environ.get('VRF', r'C:/Claude/_vendor/vrf/cli/Source2Viewer-CLI.exe')
RAW = os.environ.get('RAW', r'C:/Claude/_vendor/raw')
OUT = sys.argv[1]
ONLY = set(sys.argv[2:])

entries, start = vpk.index(PAK)
text = lambda p: vpk.read(PAK, entries[p], start).decode('utf-8-sig', 'replace')
items = kv.parse(text('scripts/items/items_game.txt'))['items_game']['items']
_req = urllib.request.Request('https://market.dota2.net/api/v2/prices/RUB.json', headers={'User-Agent': 'dota-ruiner/1.0'})
PRICED = {i['market_hash_name'] for i in json.load(urllib.request.urlopen(_req, timeout=120))['items']}


def hero_model(hero):
    path = f'scripts/npc/heroes/npc_dota_hero_{hero}.txt'
    m = re.search(r'"Model"\s+"([^"]+)"', text(path)) if path in entries else None
    return m.group(1) if m else None


def vrf(args):
    return subprocess.run([VRF, '-i', PAK, *args], capture_output=True, text=True, encoding='utf8', errors='replace').stdout


def glb_json(path):
    b = open(path, 'rb').read()
    n = struct.unpack_from('<I', b, 12)[0]
    return json.loads(b[20:20 + n])


def skeletons(paths):
    """Из DATA-блоков: {путь: (имена костей, родители)} для мини-скелетов предметов."""
    out = {}
    dump = vrf(['-f', ','.join(p + '_c' for p in paths), '-b', 'DATA'])
    for part in re.split(r'^\[\d+/\d+\] ', dump, flags=re.M)[1:]:
        path = part.split('\n', 1)[0].strip().replace('\\', '/')
        sk = re.search(r'm_modelSkeleton = \s*\{\s*m_boneName = \s*\[(.*?)\]\s*m_nParent = \s*\[(.*?)\]', part, re.S)
        if sk:
            names = re.findall(r'"([^"]*)"', sk.group(1))
            parents = [int(x) for x in sk.group(2).replace(',', ' ').split()]
            out[path[:-2]] = (names, parents)
    return out


def to_hero_bones(names, parents, hero_bones):
    """Кость предмета → кость героя: имя без учёта регистра, иначе ближайший предок, иначе корень."""
    lower = {b.lower(): b for b in hero_bones}
    res = []
    for i in range(len(names)):
        k = i
        while k >= 0 and names[k].lower() not in lower:
            k = parents[k] if k < len(parents) else -1
        res.append(lower[names[k].lower()] if k >= 0 else hero_bones[0])
    return res


jobs = []
for f in sorted(os.listdir(os.path.join(ROOT, 'data', 'heroes'))):
    hero = f[:-5]
    if ONLY and hero not in ONLY:
        continue
    d = json.load(open(os.path.join(ROOT, 'data', 'heroes', f), encoding='utf8'))
    hm = hero_model(hero)
    if not hm:
        print('нет модели героя', hero)
        continue
    raw = os.path.join(RAW, hero)
    os.makedirs(raw, exist_ok=True)
    hero_glb = os.path.join(raw, 'hero.glb')
    if not os.path.exists(hero_glb):
        vrf(['-f', hm + '_c', '-o', hero_glb, '-d', '--gltf_export_format', 'glb', '--gltf_export_materials',
             '--gltf_export_animations', '--gltf_animation_list', 'idle'])
    if not os.path.exists(hero_glb):
        print('не экспортировался герой', hero)
        continue
    hj = glb_json(hero_glb)
    hero_bones = [hj['nodes'][k]['name'] for k in hj['skins'][0]['joints']] if hj.get('skins') else ['root']

    # Только то, что можно купить (сам предмет или его набор), плюс стандартные — иначе репозиторий раздувается вдвое.
    keep = {i['id'] for i in d['items'] if i['n'] in PRICED}
    for s in d['sets']:
        if s['n'] in PRICED:
            keep |= set(s['items'])
    want = {}
    for it in [*d['defaults'].values(), *(i for i in d['items'] if i['id'] in keep)]:
        mp = (items.get(str(it['id'])) or {}).get('model_player')
        if mp:
            want[it['id']] = mp.lower()
    paths = sorted(set(want.values()))
    todo = [p for p in paths if not os.path.exists(os.path.join(raw, p[:-5] + '.glb'))]
    for i in range(0, len(todo), 60):
        # флаг анимаций нужен ради скелета: без него VRF теряет кости предмета, а вершины лежат в системе этих костей
        vrf(['-f', ','.join(p + '_c' for p in todo[i:i + 60]), '-o', raw, '-d', '--gltf_export_format', 'glb',
             '--gltf_export_materials', '--gltf_export_animations', '--threads', '6'])
    sk = {}
    for i in range(0, len(paths), 60):
        sk.update(skeletons(paths[i:i + 60]))

    manifest = {'hero': f'{hero}/hero.glb', 'anim': bool(hj.get('animations')), 'items': {}}
    jobs.append([hero_glb, os.path.join(OUT, hero, 'hero.glb'), 512])
    for iid, p in want.items():
        src = os.path.join(raw, p[:-5] + '.glb')
        if not os.path.exists(src):
            continue
        names, parents = sk.get(p, ([], []))
        manifest['items'][iid] = to_hero_bones(names, parents, hero_bones) if names else []
        jobs.append([src, os.path.join(OUT, hero, f'{iid}.glb'), 256])
    os.makedirs(os.path.join(OUT, hero), exist_ok=True)
    json.dump(manifest, open(os.path.join(OUT, hero, 'manifest.json'), 'w', encoding='utf8'), separators=(',', ':'))
    print(hero, 'моделей', len(manifest['items']), 'из', len(want), 'анимация' if manifest['anim'] else 'БЕЗ анимации', flush=True)

job_file = os.path.join(RAW, 'jobs.json')
json.dump([[a, b, s] for a, b, s in jobs if not os.path.exists(b)], open(job_file, 'w'))
subprocess.run(['node', os.path.join(ROOT, 'tools', 'node', 'optimize.mjs'), job_file], check=False)
# Индекс для сайта: какие герои уже есть в 3D.
heroes = sorted(h for h in os.listdir(OUT) if os.path.exists(os.path.join(OUT, h, 'manifest.json')) and os.path.exists(os.path.join(OUT, h, 'hero.glb')))
json.dump(heroes, open(os.path.join(OUT, 'index.json'), 'w'))
print('героев в 3D:', len(heroes))
