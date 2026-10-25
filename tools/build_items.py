"""Собирает базу косметики из установленной Dota 2: data/heroes/<hero>.json + img/items/<id>.webp.

python tools/build_items.py ["C:/.../dota 2 beta/game/dota/pak01_dir.vpk"]
"""
import io
import json
import os
import sys

from PIL import Image

import kv
import vpk
from build_icons import vtex

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAK = sys.argv[1] if len(sys.argv) > 1 else r'C:/Program Files (x86)/Steam/steamapps/common/dota 2 beta/game/dota/pak01_dir.vpk'
ICON = 112  # px, отдаём как webp

entries, start = vpk.index(PAK)


def text(path):
    return vpk.read(PAK, entries[path], start).decode('utf-8-sig', 'replace')


game = kv.parse(text('scripts/items/items_game.txt'))['items_game']
ru = kv.parse(text('resource/localization/items_russian.txt'))['lang']['Tokens']
prefabs = game['prefabs']


def prop(item, key):
    """Свойство предмета с учётом префабов (prefab может быть списком через пробел)."""
    if key in item:
        return item[key]
    for p in (item.get('prefab') or '').split():
        v = prop(prefabs.get(p, {}), key)
        if v is not None:
            return v
    return None


def ru_name(item):
    tok = (item.get('item_name') or '').lstrip('#')
    return ru.get(tok) or ru.get(tok.lower()) or item.get('name')


def icon(item, out_id):
    inv = (prop(item, 'image_inventory') or '').lower()
    key = f'panorama/images/{inv}_png.vtex_c'
    if not inv or key not in entries:
        return False
    raw = vpk.read(PAK, entries[key], start)
    dst = os.path.join(ROOT, 'img', 'items', f'{out_id}.webp')
    if not os.path.exists(dst):
        i = raw.find(b'\x89PNG')
        if i >= 0:
            img = Image.open(io.BytesIO(raw[i:])).convert('RGBA')
        else:
            # у новых предметов иконка — DXT-текстура 256x256: картинка 256x170 сверху, ниже мусор
            img = vtex(raw)
            if img is None:
                return False
            img = img.crop((0, 0, img.width, round(img.width * 170 / 256)))
        img.thumbnail((ICON * 2, ICON))  # иконки 256x170 → ширина до 224
        img.save(dst, 'WEBP', quality=78)
    return True


SKIP_SLOTS = {'taunt', 'persona_selector', 'costume', 'ambient_effects', 'voice', 'loadout_slot_none', 'hero_base'}
os.makedirs(os.path.join(ROOT, 'img', 'items'), exist_ok=True)
os.makedirs(os.path.join(ROOT, 'data', 'heroes'), exist_ok=True)

heroes = {}
by_name = {}
for iid, it in game['items'].items():
    if not isinstance(it, dict):
        continue
    pf = (it.get('prefab') or '').split()
    if not {'wearable', 'default_item', 'bundle'} & set(pf):
        continue
    ub = it.get('used_by_heroes')
    hs = list(ub.keys()) if isinstance(ub, dict) else []
    if len(hs) != 1:
        continue
    hero = hs[0].replace('npc_dota_hero_', '')
    h = heroes.setdefault(hero, {'defaults': {}, 'items': {}, 'sets': []})
    by_name[it.get('name')] = iid
    if 'bundle' in pf:
        h['sets'].append((iid, it))
        continue
    slot = prop(it, 'item_slot') or 'weapon'
    if slot in SKIP_SLOTS or 'persona' in slot:
        continue
    rec = {'id': int(iid), 'n': it.get('name'), 'ru': ru_name(it), 's': slot,
           'r': prop(it, 'item_rarity') or 'common', 'img': icon(it, iid)}
    if 'default_item' in pf:
        h['defaults'][slot] = rec
    else:
        h['items'][iid] = rec

index = []
for hero, h in sorted(heroes.items()):
    sets = []
    for iid, it in h['sets']:
        parts = [int(by_name[n]) for n in (it.get('bundle') or {}) if by_name.get(n) in h['items']]
        if not parts:
            continue
        sets.append({'id': int(iid), 'n': it.get('name'), 'ru': ru_name(it), 'r': prop(it, 'item_rarity') or 'common',
                     'items': parts, 'img': icon(it, iid)})
    slots = sorted({i['s'] for i in h['items'].values()} | set(h['defaults']))
    out = {'hero': hero, 'slots': slots, 'defaults': h['defaults'],
           'items': sorted(h['items'].values(), key=lambda x: x['id']), 'sets': sorted(sets, key=lambda x: x['id'])}
    with open(os.path.join(ROOT, 'data', 'heroes', f'{hero}.json'), 'w', encoding='utf8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    index.append({'hero': hero, 'sets': len(sets), 'items': len(h['items'])})
    print(hero, len(h['items']), 'items', len(sets), 'sets')

with open(os.path.join(ROOT, 'data', 'heroes.json'), 'w', encoding='utf8') as f:
    json.dump(index, f, ensure_ascii=False, separators=(',', ':'))
