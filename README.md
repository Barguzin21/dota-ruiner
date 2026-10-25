# Кто заруинил?

Разбор матча Dota 2 по ID: кто заруинил, кто MVP, где решился матч, карта смертей и вардов, эпизоды, номинации, билды, драфт, чат и разбор от ИИ. Плюс примерочная сетов с ценами маркета и подбором образа под бюджет.

## Как устроено

- `index.html`, `css/`, `js/` — сайт без сборки (GitHub Pages).
- `js/analyze.js` — модель: счёт влияния игрока по перцентилям OpenDota и ожиданиям роли, сигналы ошибок, руинер/MVP, эпизоды, номинации.
- `api/` — функции Vercel (`dota-ruiner.vercel.app`): `prices` (цены market.dota2.net в рублях), `ai` (Gemini, ключ `GEMINI_API_KEY`).
- `data/`, `img/` — справочники и картинки, собранные из файлов установленной Dota 2.

## Обновить данные после патча

```bash
python tools/build_consts.py   # герои и предметы OpenDota
python tools/build_icons.py    # портреты героев и иконки предметов из pak01_dir.vpk
python tools/build_items.py    # косметика: наборы, слоты, русские названия, иконки
```

## Локально

```bash
node dev.mjs        # http://localhost:3141
node test.mjs       # прогон модели на tools/sample-match.json
```

Не аффилировано с Valve. Dota 2 и Steam — товарные знаки Valve Corporation.
