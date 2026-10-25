"""Портреты героев в стиле игры (selection), но чёткие: увеличение нейросетью Real-ESRGAN.

В игре эти портреты всего 71x94 / 142x188. Запуск питоном ComfyUI (там есть torch с CUDA и spandrel):
  C:/ComfyUI/ComfyUI_windows_portable/python_embeded/python.exe tools/upscale_heroes.py [модель] [герои...]
Исходники — C:/Claude/_vendor/hero_sel/<key>.png (selection из pak01), результат — img/heroes/tall/<key>.webp 360x480.
"""
import glob
import os
import sys

import numpy as np
import torch
from PIL import Image
from spandrel import ModelLoader

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = 'C:/Claude/_vendor/hero_sel'
MODELS = 'C:/ComfyUI/ComfyUI_windows_portable/ComfyUI/models/upscale_models'
name = sys.argv[1] if len(sys.argv) > 1 else 'RealESRGAN_x4plus.pth'
only = set(sys.argv[2:])
out_dir = os.environ.get('OUT') or os.path.join(ROOT, 'img', 'heroes', 'tall')

dev = 'cuda' if torch.cuda.is_available() else 'cpu'
model = ModelLoader().load_from_file(os.path.join(MODELS, name)).eval().to(dev)


def up(img):
    x = torch.from_numpy(np.asarray(img.convert('RGB'), dtype=np.float32) / 255).permute(2, 0, 1)[None].to(dev)
    with torch.no_grad():
        y = model(x)
    return Image.fromarray((y[0].permute(1, 2, 0).clamp(0, 1).cpu().numpy() * 255).round().astype(np.uint8))


os.makedirs(out_dir, exist_ok=True)
for f in sorted(glob.glob(os.path.join(SRC, '*.png'))):
    key = os.path.basename(f)[:-4]
    if only and key not in only:
        continue
    img = Image.open(f)
    big = up(img)
    if img.width < 100:  # 71x94: второй проход, иначе после x4 всё ещё мелко
        big = up(big.resize((big.width // 2, big.height // 2), Image.LANCZOS))
    big.resize((360, 480), Image.LANCZOS).save(os.path.join(out_dir, f'{key}.webp'), 'WEBP', quality=88)
print('готово', dev)
