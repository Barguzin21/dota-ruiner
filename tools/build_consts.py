"""Снимок справочников OpenDota (герои, предметы) → data/consts.json. python tools/build_consts.py"""
import json
import os
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get(path):
    req = urllib.request.Request(f'https://api.opendota.com/api/constants/{path}', headers={'User-Agent': 'dota-ruiner/1.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


heroes = {k: {'id': h['id'], 'name': h['name'], 'localized_name': h['localized_name'], 'primary_attr': h['primary_attr'],
              'img': h['img'].split('?')[0], 'icon': h['icon'].split('?')[0], 'roles': h['roles']}
          for k, h in get('heroes').items()}
items = {}
for key, it in get('items').items():
    if 'id' not in it:
        continue
    items[it['id']] = {'key': key, 'name': it.get('dname') or key, 'img': (it.get('img') or '').split('?')[0], 'cost': it.get('cost') or 0}

with open(os.path.join(ROOT, 'data', 'consts.json'), 'w', encoding='utf8') as f:
    json.dump({'heroes': heroes, 'items': items}, f, ensure_ascii=False, separators=(',', ':'))
print(len(heroes), 'heroes', len(items), 'items')
