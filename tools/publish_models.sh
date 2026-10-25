#!/usr/bin/env bash
# Доделать 3D после build_models.py: стойки героев, индекс, отдельный репозиторий моделей на GitHub Pages.
# Запуск из Git Bash:  bash tools/publish_models.sh
set -e
cd "$(dirname "$0")/.."
OUT=C:/Claude/dota-ruiner-models
GH="/c/Program Files/GitHub CLI/gh.exe"

PYTHONIOENCODING=utf8 python tools/fix_idle.py "$OUT"
python -c "
import os,json;O='$OUT'
h=sorted(x for x in os.listdir(O) if os.path.exists(f'{O}/{x}/hero.glb') and os.path.exists(f'{O}/{x}/manifest.json'))
json.dump(h,open(O+'/index.json','w'));print('героев в 3D:',len(h))"

cd "$OUT"
touch .nojekyll
[ -d .git ] || git init -q -b main
git config user.name "Barguzin21"
git config user.email "74183069+Barguzin21@users.noreply.github.com"
git add -A
git commit -q -m "3D-модели героев и предметов Dota 2 для примерочной" || true
if ! "$GH" repo view Barguzin21/dota-ruiner-models >/dev/null 2>&1; then
  "$GH" repo create Barguzin21/dota-ruiner-models --public --source . --remote origin --push
  "$GH" api -X POST repos/Barguzin21/dota-ruiner-models/pages -f "source[branch]=main" -f "source[path]=/" >/dev/null
else
  git push -q origin main
fi
echo "Готово: https://barguzin21.github.io/dota-ruiner-models/ (Pages собирается пару минут)"
