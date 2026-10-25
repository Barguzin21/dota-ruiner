"""Портреты героев, у которых в игре selection-картинка всего 71x94 (новые герои): крупный план из рендера 448x678.

python tools/build_cards.py (после build_icons.py) → перезаписывает img/heroes/tall/<key>.webp
"""
import glob
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def card(full):
    a = np.asarray(full.getchannel('A')) > 40
    ys, xs = np.nonzero(a)
    y0, y1 = ys.min(), ys.max()
    # голова: середина непрозрачного в верхних 15% фигуры (оружие и крылья сбоку не сдвигают кадр)
    band = a[y0:y0 + max(8, int((y1 - y0) * 0.15))]
    cx = int(np.nonzero(band.any(0))[0].mean())
    w = int(full.width * 0.5)
    h = w * 4 // 3
    left = min(max(0, cx - w // 2), full.width - w)
    top = max(0, y0 - w // 25)
    return full.crop((left, top, left + w, top + h)).resize((300, 400), Image.LANCZOS)


done = []
for f in glob.glob(os.path.join(ROOT, 'img', 'heroes', 'tall', '*.webp')):
    key = os.path.basename(f)[:-5]
    full = os.path.join(ROOT, 'img', 'heroes', 'full', f'{key}.webp')
    if Image.open(f).width < 120 and os.path.exists(full):
        bg = Image.new('RGBA', (300, 400), (24, 28, 40, 255))  # без прозрачности, как остальные портреты
        bg.alpha_composite(card(Image.open(full).convert('RGBA')))
        bg.convert('RGB').save(f, 'WEBP', quality=84)
        done.append(key)
print(done)
