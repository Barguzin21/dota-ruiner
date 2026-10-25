"""Герои, у которых анимация стойки называется не «idle»: находим её имя и переэкспортируем hero.glb.

python tools/fix_idle.py <out_dir>   (после build_models.py)
"""
import json
import os
import re
import struct
import subprocess
import sys

import vpk

PAK = r'C:/Program Files (x86)/Steam/steamapps/common/dota 2 beta/game/dota/pak01_dir.vpk'
VRF = os.environ.get('VRF', r'C:/Claude/_vendor/vrf/cli/Source2Viewer-CLI.exe')
RAW = os.environ.get('RAW', r'C:/Claude/_vendor/raw')
OUT = sys.argv[1]
entries, start = vpk.index(PAK)


def hero_model(hero):
    path = f'scripts/npc/heroes/npc_dota_hero_{hero}.txt'
    m = re.search(r'"Model"\s+"([^"]+)"', vpk.read(PAK, entries[path], start).decode('utf-8-sig', 'replace')) if path in entries else None
    return m.group(1) if m else None


def glb_json(path):
    b = open(path, 'rb').read()
    return json.loads(b[20:20 + struct.unpack_from('<I', b, 12)[0]])

fixed = []
for hero in sorted(os.listdir(OUT)):
    man_path = os.path.join(OUT, hero, 'manifest.json')
    if not os.path.exists(man_path):
        continue
    man = json.load(open(man_path, encoding='utf8'))
    if man.get('anim'):
        continue
    hm = hero_model(hero)
    full = os.path.join(RAW, hero, 'hero_all.glb')
    if not os.path.exists(full):
        subprocess.run([VRF, '-i', PAK, '-f', hm + '_c', '-o', full, '-d', '--gltf_export_format', 'glb', '--gltf_export_animations'], capture_output=True)
    if not os.path.exists(full):
        continue
    names = [a['name'] for a in glb_json(full).get('animations', [])]
    # предпочитаем обычную стойку: idle → *_idle → idle* → что-то с idle, без «injured/rare/loadout»
    cand = [n for n in names if re.search(r'idle', n, re.I) and not re.search(r'injur|rare|loadout|portrait|haste|run|attack|taunt|victory', n, re.I)]
    cand.sort(key=lambda n: (not re.fullmatch(r'.*_?idle(_anim)?', n, re.I), len(n)))
    if not cand:
        print(hero, 'нет стойки среди', names[:8])
        continue
    raw = os.path.join(RAW, hero, 'hero.glb')
    os.remove(raw)
    subprocess.run([VRF, '-i', PAK, '-f', hm + '_c', '-o', raw, '-d', '--gltf_export_format', 'glb', '--gltf_export_materials',
                    '--gltf_export_animations', '--gltf_animation_list', cand[0]], capture_output=True)
    os.remove(full)
    man['anim'] = True
    json.dump(man, open(man_path, 'w', encoding='utf8'), separators=(',', ':'))
    fixed.append([raw, os.path.join(OUT, hero, 'hero.glb'), 512])
    print(hero, '→', cand[0], flush=True)

job = os.path.join(RAW, 'idle_jobs.json')
json.dump(fixed, open(job, 'w'))
subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'node', 'optimize.mjs'), job])
