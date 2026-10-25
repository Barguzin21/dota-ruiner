"""Проставляет одну версию во все локальные импорты и ссылки (против старого кэша GitHub Pages).

python tools/stamp.py   — запускать перед каждой заливкой.
"""
import os
import re
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V = time.strftime('%Y%m%d%H%M')
JS = re.compile(r"""(['"])\./([\w-]+)\.js(?:\?v=[^'"]*)?\1""")
HTML = re.compile(r"""((?:href|src)=")((?:css|js)/[\w-]+\.(?:css|js))(?:\?v=[^"]*)?(")""")

for f in os.listdir(os.path.join(ROOT, 'js')):
    if f.endswith('.js'):
        p = os.path.join(ROOT, 'js', f)
        s = open(p, encoding='utf8').read()
        open(p, 'w', encoding='utf8', newline='\n').write(JS.sub(lambda m: f"{m[1]}./{m[2]}.js?v={V}{m[1]}", s))

p = os.path.join(ROOT, 'index.html')
s = open(p, encoding='utf8').read()
open(p, 'w', encoding='utf8', newline='\n').write(HTML.sub(lambda m: f'{m[1]}{m[2]}?v={V}{m[3]}', s))
print('версия', V)
