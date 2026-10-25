"""Портреты героев в хорошем качестве из официальных рендеров dota2.com (1440x1440, прозрачный фон).

В файлах игры selection-портреты всего 71-142 px и мылят. Рендеры кладём в C:/Claude/_vendor/hero_renders:
  <key>.png   — https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/<key>.png
  w_<key>.png — https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/<key>.png (256x144)
python tools/build_cards.py → img/heroes/tall/<key>.webp (360x480), img/heroes/full/<key>.webp (600x900, прозрачный) и img/heroes/<key>.webp (256x144)
"""
import glob
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else 'C:/Claude/_vendor/hero_renders'
W, H = 360, 480


def backdrop():
    # тёмный фон с мягким светом сверху, как у карточек в клиенте
    y, x = np.mgrid[0:H, 0:W]
    d = np.sqrt(((x - W / 2) / W) ** 2 + ((y - H * 0.35) / H) ** 2)
    k = np.clip(1 - d * 1.6, 0, 1)[..., None]
    rgb = np.array([16, 19, 28]) * (1 - k) + np.array([52, 60, 82]) * k
    return Image.fromarray(np.dstack([rgb, np.full((H, W), 255)]).astype(np.uint8), 'RGBA')


BG = backdrop()
# где голова (доля ширины, доля высоты рендера) у героев с широким оружием/питомцем над головой — автоматика их путает
FIX = {'beastmaster': (0.62, 0.11), 'sven': (0.72, 0.18), 'techies': (0.64, 0.24), 'witch_doctor': (0.6, 0.32), 'primal_beast': (0.38, 0.2)}


def card(img, key=''):
    a = np.asarray(img.getchannel('A')) > 60
    rows = a.sum(1)
    # верх тела — первая строка, где фигура шире 15% от самой широкой: кончики мечей, посохи и птицы над головой узкие
    body = np.nonzero(rows > rows.max() * 0.15)[0]
    y0, y1 = body.min(), np.nonzero(rows)[0].max()
    fig = y1 - y0
    # голова: центр масс верхней части тела
    band = a[y0:y0 + int(fig * 0.18)]
    cols = band.sum(0)
    cx = int((np.arange(len(cols)) * cols).sum() / max(1, cols.sum()))
    if key in FIX:
        cx, y0 = int(FIX[key][0] * img.width), int(FIX[key][1] * img.height)
        fig = y1 - y0
    w = int(fig * 0.6)
    h = w * H // W
    left, top = cx - w // 2, y0 - int(fig * 0.06)
    crop = Image.new('RGBA', (w, h))
    crop.paste(img.crop((max(0, left), max(0, top), min(img.width, left + w), min(img.height, top + h))), (max(0, -left), max(0, -top)))
    out = BG.copy()
    out.alpha_composite(crop.resize((W, H), Image.LANCZOS))
    return out.convert('RGB')


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
        img = Image.open(f).convert('RGBA')
        full(img).save(os.path.join(ROOT, 'img', 'heroes', 'full', f'{key}.webp'), 'WEBP', quality=84)
        card(img, key).save(os.path.join(ROOT, 'img', 'heroes', 'tall', f'{key}.webp'), 'WEBP', quality=84)
        n += 1
    print('портретов', n)
