"""Портреты героев и иконки игровых предметов из Dota 2 → img/heroes/<key>.webp, img/game/<key>.webp."""
import io
import json
import os
import struct
import sys

import numpy as np
from PIL import Image

import vpk

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAK = sys.argv[1] if len(sys.argv) > 1 else r'C:/Program Files (x86)/Steam/steamapps/common/dota 2 beta/game/dota/pak01_dir.vpk'
entries, start = vpk.index(PAK)
consts = json.load(open(os.path.join(ROOT, 'data', 'consts.json'), encoding='utf8'))


BCN = {1: (1, 8), 2: (3, 16), 20: (7, 16)}  # формат vtex → (bcn-тип Pillow, байт на блок 4x4)
RAW = {4: 'RGBA', 28: 'BGRA'}


def png(key):
    if key not in entries:
        return None
    raw = vpk.read(PAK, entries[key], start)
    i = raw.find(b'\x89PNG')
    if i >= 0:
        return Image.open(io.BytesIO(raw[i:])).convert('RGBA')
    return vtex(raw)


def is_dxt(key):
    if key not in entries:
        return False
    raw = vpk.read(PAK, entries[key], start)
    if raw.find(b'\x89PNG') >= 0:
        return False
    return raw_format(raw) in (1, 2)


def raw_format(raw):
    _hs, _, _, boff, count = struct.unpack_from('<IHHII', raw, 0)
    pos = 8 + boff
    for _ in range(count):
        if raw[pos:pos + 4] == b'DATA':
            d = pos + 4 + struct.unpack_from('<I', raw, pos + 4)[0]
            return struct.unpack_from('<HHffffHHHBB', raw, d)[9]
        pos += 12


def ycocg(img):
    """Valve хранит цветные DXT5 как Scaled YCoCg: R=Co, G=Cg, B=масштаб, A=Y."""
    a = np.asarray(img, dtype=np.float32) / 255
    scale = a[..., 2] * (255 / 8) + 1
    co = (a[..., 0] - 128 / 255) / scale
    cg = (a[..., 1] - 128 / 255) / scale
    y = a[..., 3]
    rgb = np.stack([y + co - cg, y + cg, y - co - cg], -1)
    return Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8), 'RGB').convert('RGBA')


def vtex(raw):
    """Несжатые (без LZ4) BCn/RGBA текстуры: самый большой мип лежит в конце файла."""
    head_size, _, _, boff, count = struct.unpack_from('<IHHII', raw, 0)
    pos = 8 + boff
    for _ in range(count):
        name = raw[pos:pos + 4]
        off, _size = struct.unpack_from('<II', raw, pos + 4)
        if name == b'DATA':
            d = pos + 4 + off
        pos += 12
    _v, _f, _r1, _r2, _r3, _r4, w, h, _depth, fmt, _mips = struct.unpack_from('<HHffffHHHBB', raw, d)
    if fmt in BCN:
        bcn, block = BCN[fmt]
        need = ((w + 3) // 4) * ((h + 3) // 4) * block
        if len(raw) - head_size < need:
            return None
        img = Image.frombuffer('RGBA', (w, h), raw[-need:], 'bcn', bcn)
        return ycocg(img) if fmt == 2 else img
    if fmt in RAW:
        need = w * h * 4
        return Image.frombuffer('RGBA', (w, h), raw[-need:], 'raw', RAW[fmt], 0, 1)
    print('format', fmt, 'не поддержан')
    return None


def save(img, dst, width):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    img.thumbnail((width, width))
    img.save(dst, 'WEBP', quality=82)


miss = []
for h in consts['heroes'].values():
    key = h['name'].replace('npc_dota_hero_', '')
    tall = png(f"panorama/images/heroes/selection/{h['name']}_png.vtex_c")
    if tall:
        save(tall.copy(), os.path.join(ROOT, 'img', 'heroes', 'tall', f'{key}.webp'), 300)
    # DXT5-портреты у Valve декодируются блёкло — для них режем горизонтальный кадр из вертикального
    img = png(f"panorama/images/heroes/{h['name']}_png.vtex_c") if not is_dxt(f"panorama/images/heroes/{h['name']}_png.vtex_c") else None
    if not img and tall:
        w, hh = tall.size
        img = tall.crop((0, int(hh * 0.12), w, int(hh * 0.12 + w * 9 / 16)))
    if img:
        save(img, os.path.join(ROOT, 'img', 'heroes', f'{key}.webp'), 256)
    else:
        miss.append(h['name'])
    icon = png(f"panorama/images/heroes/icons/{h['name']}_png.vtex_c")
    if icon:
        save(icon, os.path.join(ROOT, 'img', 'heroes', 'icons', f'{key}.webp'), 64)

for it in consts['items'].values():
    key = it['key']
    img = png(f'panorama/images/items/{key}_png.vtex_c')
    if img:
        save(img, os.path.join(ROOT, 'img', 'game', f'{key}.webp'), 88)
    elif not key.startswith('recipe'):
        miss.append(key)
print('missing', len(miss), miss[:30])
