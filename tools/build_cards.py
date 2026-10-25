"""Портреты героев в хорошем качестве из официальных рендеров dota2.com (1440x1440, прозрачный фон).

В файлах игры selection-портреты всего 71-142 px и мылят. Рендеры кладём в C:/Claude/_vendor/hero_renders:
  <key>.png   — https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/<key>.png
  w_<key>.png — https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/<key>.png (256x144)
python tools/build_cards.py → img/heroes/full/<key>.webp (600x900, прозрачный) и img/heroes/<key>.webp (256x144).
Карточки героев (tall) — в стиле игры через tools/upscale_heroes.py.
"""
import glob
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else 'C:/Claude/_vendor/hero_renders'
def full(img):
    # фигура во всю высоту кадра 2:3, по центру масс; широкое оружие по бокам обрезается — иначе широкие герои мелкие
    a = np.asarray(img.getchannel('A')) > 20
    ys, xs = np.nonzero(a)
    y0, y1 = ys.min(), ys.max()
    h = (y1 - y0) * 104 // 100
    w = h * 2 // 3
    left = int(xs.mean()) - w // 2
    out = Image.new('RGBA', (w, h))
    out.paste(img.crop((max(0, left), y0, min(img.width, left + w), y1 + 1)), (max(0, -left), h - (y1 + 1 - y0)))
    return out.resize((600, 900), Image.LANCZOS)


if __name__ == '__main__':
    n = 0
    for f in glob.glob(os.path.join(SRC, '*.png')):
        key = os.path.basename(f)[:-4]
        if key.startswith('w_'):
            Image.open(f).convert('RGB').save(os.path.join(ROOT, 'img', 'heroes', f'{key[2:]}.webp'), 'WEBP', quality=86)
            continue
        full(Image.open(f).convert('RGBA')).save(os.path.join(ROOT, 'img', 'heroes', 'full', f'{key}.webp'), 'WEBP', quality=84)
        n += 1
    print('портретов', n)
