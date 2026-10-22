// Counts box pairs that are spawned overlapping (centres closer than 0.4 m = certainly inside each other,
// closer than 0.69 m = bounding spheres touch), including boxes from earlier batches still near y = 40.
import { SPEC, makeSpawner } from '../../shared/spec.js';
const [n, seed] = [+process.argv[2], +process.argv[3] || 1];
const sp = makeSpawner(seed, n), live = [];
let sure = 0, maybe = 0;
for (let step = 0; !sp.done(); step++) {
  const d = sp.due(step);
  if (!d) continue;
  for (let o = 0; o < d.length; o += 7) {
    const b = { x: d[o], z: d[o + 2], t0: step };
    for (const a of live) {
      const t = (step - a.t0) / 60, dy = 0.5 * 9.81 * t * t;
      const dist = Math.hypot(a.x - b.x, dy, a.z - b.z);
      if (dist < 0.4) sure++; else if (dist < 0.693) maybe++;
    }
    live.push(b);
  }
  for (let i = live.length - 1; i >= 0; i--) if (step - live[i].t0 > 40) live.splice(i, 1);
}
console.log(`n=${n} seed=${seed}: ${sure} pairs certainly overlapping at spawn, ${maybe} more possibly`);
console.log(`impact speed ${Math.sqrt(2 * 9.81 * 40).toFixed(1)} m/s = ${(Math.sqrt(2 * 9.81 * 40) * SPEC.dt).toFixed(2)} m per step; box is 0.4 m`);
