// node test.mjs [match.json] — прогон анализа на сохранённом матче + базовые проверки.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { analyze, turningPoint, defend } from './js/analyze.js';

const consts = JSON.parse(readFileSync('data/consts.json', 'utf8'));
const itemsById = Object.fromEntries(Object.entries(consts.items).map(([id, it]) => [id, it.key]));
const file = process.argv[2] || 'tools/sample-match.json';
const m = JSON.parse(readFileSync(file, 'utf8'));
const a = analyze(m, { heroes: consts.heroes, itemsById });

for (const p of [...a.players].sort((x, y) => x.team.localeCompare(y.team) || x.score - y.score)) {
  console.log(p.team.padEnd(8), p.win ? 'W' : 'L', `pos${p.role}`, p.hero.padEnd(18), String(p.score).padStart(3), p.neg.map((x) => x.title).join(' | '));
}
console.log('РУИНЕР:', a.ruiner.hero, a.ruiner.name, `уверенность ${a.confidence}%, устойчивость ${a.stability}%`, '| MVP:', a.mvp.hero, '| перелом', a.turning);
console.log('доля руина:', a.players.filter((p) => !p.win).map((p) => `${p.hero} ${p.share}%`).join(', '));
console.log('линии:', a.lanes.map((l) => `${l.lane}: ${l.winner || 'ничья'} ${l.diff}`).join(' | '));
// Lifestealer с Rage не должен получать «нет BKB»
assert(!a.players.find((p) => p.heroKey === 'life_stealer')?.neg.some((x) => x.title === 'Нет сейв-предметов'));
assert.equal(a.players.filter((p) => !p.win).reduce((s, p) => s + p.share, 0) >= 99, true);
assert(a.players.every((p) => Math.abs(p.breakdown.reduce((s, b) => s + b.weight, 0) - 1) < 1e-9));
console.log('номинации:', a.noms.map((n) => `${n.title}=${n.p.hero}`).join(', '));
console.log('эпизодов:', a.episodes.length, 'оправдание:', defend(a, a.ruiner));

assert(!a.ruiner.win && a.mvp.win);
assert(a.players.every((p) => p.score >= 0 && p.score <= 100));
assert.deepEqual(turningPoint([100, -50, 200, 300], 'radiant').minute, 2);
assert.equal(turningPoint([-100, -5000, -9000], 'dire').minute, 0);
console.log('OK');
