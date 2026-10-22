// The archive scene ("jolt-drop-bench"), shared by every setup. Godot mirrors it in bench.gd.
export const SPEC = {
  half: 0.2, // box half extent, m
  mass: 1.0,
  friction: 0.5,
  restitution: 0.1,
  damping: 0.05, // linear and angular
  dt: 1 / 60,
  batchMin: 10,
  batchMax: 100,
  batchesPerSecond: 8,
  spawnHeight: 40,
  spawnHalf: 18,
  floorHalf: [30, 1, 30], // centred at y = -1, so its top is y = 0
  maxContactConstraints: 20480, // the archive's Jolt limit, kept for every Jolt setup
  settleCapSteps: 1200, // 20 s after the last batch
  fallenY: -1, // a body centre below this has gone through the floor
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Batches arrive on physics time: 8 per simulated second, 10..100 boxes each, dropped from 40 m
// at random x/z with a random rotation. Returns 7 floats per body (x y z qx qy qz qw) or null.
export function makeSpawner(seed, total) {
  const rand = mulberry32(seed);
  let spawned = 0;
  let batches = 0;
  return {
    get spawned() { return spawned; },
    done: () => spawned >= total,
    due(step) {
      if (spawned >= total || Math.floor((step * SPEC.batchesPerSecond) / 60) < batches) return null;
      batches++;
      const n = Math.min(total - spawned, SPEC.batchMin + Math.floor(rand() * (SPEC.batchMax - SPEC.batchMin + 1)));
      const d = new Float32Array(n * 7);
      for (let i = 0; i < n; i++) {
        const ax = rand() * 2 - 1, ay = rand() * 2 - 1, az = rand() * 2 - 1;
        const len = Math.hypot(ax, ay, az) || 1;
        const angle = rand() * Math.PI * 2;
        const s = Math.sin(angle / 2) / len;
        d.set([rand() * 2 * SPEC.spawnHalf - SPEC.spawnHalf, SPEC.spawnHeight, 0, ax * s, ay * s, az * s, Math.cos(angle / 2)], i * 7);
        d[i * 7 + 2] = rand() * 2 * SPEC.spawnHalf - SPEC.spawnHalf;
      }
      spawned += n;
      return d;
    },
  };
}
