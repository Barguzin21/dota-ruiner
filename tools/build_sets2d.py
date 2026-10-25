"""Полноростовые рендеры наборов (как на странице наборов в клиенте, 448x678) → img/sets/<id>.webp, флаг 'p2d' в data/heroes/*.json.

python tools/build_sets2d.py
"""
import glob
import json
import os

import build_icons as b
import kv

ROOT = b.ROOT
game = kv.parse(b.vpk.read(b.PAK, b.entries['scripts/items/items_game.txt'], b.start).decode('utf-8-sig', 'replace'))['items_game']
by_bundle, by_items = {}, {}
for s in game.get('item_sets', {}).values():
    img = s.get('portrait_image')
    if not img:
        continue
    if s.get('store_bundle'):
        by_bundle[s['store_bundle']] = img
    by_items[frozenset(s.get('items', {}))] = img

os.makedirs(os.path.join(ROOT, 'img', 'sets'), exist_ok=True)
got = tot = 0
for f in glob.glob(os.path.join(ROOT, 'data', 'heroes', '*.json')):
    d = json.load(open(f, encoding='utf8'))
    names = {i['id']: i['n'] for i in d['items']}
    for st in d['sets']:
        tot += 1
        img = by_bundle.get(st['n']) or by_items.get(frozenset(names.get(i) for i in st['items']))
        dst = os.path.join(ROOT, 'img', 'sets', f"{st['id']}.webp")
        if img and not os.path.exists(dst):
            pic = b.png(f'panorama/images/{img.lower()}_png.vtex_c')
            if pic:
                pic.save(dst, 'WEBP', quality=82)
        st['p2d'] = os.path.exists(dst)
        got += st['p2d']
    json.dump(d, open(f, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print('рендеры', got, 'из', tot)
