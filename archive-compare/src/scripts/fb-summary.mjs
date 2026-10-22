// Collapses JSONL runs into web/results.json: one row per setup, box count and mode, with the median
// across seeds of every timing; a row is valid only if every seed was valid.
// Usage: node fb-summary.mjs <out results.json> <note> <in.jsonl> [<in.jsonl> …]
import fs from 'node:fs';
const [out, note, ...inputs] = process.argv.slice(2);
const runs = inputs.flatMap((f) => fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
const med = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
const groups = new Map();
for (const r of runs) {
  const k = `${r.setup}|${r.n}|${r.render}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const ORDER = ['threejs', 'rust-jolt', 'godot', 'rust-rapier', 'rust-avian'];
const rows = [...groups.values()].map((g) => {
  const ok = g.filter((r) => !r.error);
  if (!ok.length) return { ...g[0], seed: g.map((r) => r.seed).join(',') };
  const pick = (key, stat) => { const v = med(ok.map((r) => r[key]?.[stat])); return v == null ? null : { [stat]: v }; };
  const st = (key) => (ok.some((r) => r[key]) ? { p50: med(ok.map((r) => r[key]?.p50)), p95: med(ok.map((r) => r[key]?.p95)) } : null);
  const settled = ok.map((r) => r.settleSeconds);
  return {
    setup: g[0].setup, n: g[0].n, bodies: g[0].n, render: g[0].render, workers: ok[0].workers, seed: g.map((r) => r.seed).join(','),
    spawnStepMs: st('spawnStepMs'), settleStepMs: st('settleStepMs'), syncMs: st('syncMs'), drawMs: st('drawMs'), frameMs: st('frameMs'),
    settleSeconds: settled.every((s) => s != null) ? med(settled) : null,
    awakeAtEnd: Math.max(...ok.map((r) => r.awakeAtEnd ?? 0)),
    throughFloor: Math.max(...g.map((r) => r.throughFloor ?? 0)),
    offEdge: Math.max(...g.map((r) => r.offEdge ?? 0)),
    // Recomputed from raw counts so older runs follow the current rule (runner.js).
    settle: (() => { const a = Math.max(...ok.map((r) => (r.awakeAtEnd ?? 0) / r.n)); return settled.every((s) => s != null) || a <= 0.01 ? 'settled' : a <= 0.5 ? 'slow' : 'never'; })(),
    valid: g.every((r) => !r.error && !r.throughFloor && (r.awakeAtEnd ?? 0) <= r.n * 0.5),
    gpu: ok[0].gpu,
  };
}).sort((a, b) => (a.render - b.render) || (a.n - b.n) || (ORDER.indexOf(a.setup) - ORDER.indexOf(b.setup)));
fs.writeFileSync(out, JSON.stringify({ note, runs: rows }, null, 1));
console.log(rows.length, 'rows');
