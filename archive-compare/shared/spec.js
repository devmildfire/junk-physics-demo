// The archive scene ("jolt-drop-bench"), shared by every setup. Godot mirrors it in bench.gd.
// Two fixes over the archive: boxes never spawn inside each other (see makeSpawner), and each 1/60 s frame
// runs 4 steps of 1/240 s, so a box falling at 28 m/s moves 0.12 m per step instead of 0.47 m (box: 0.4 m).
export const SPEC = {
  half: 0.2, // box half extent, m
  mass: 1.0,
  friction: 0.5,
  restitution: 0.1,
  damping: 0.05, // linear and angular
  dt: 1 / 240, // one physics step
  substeps: 4, // steps per 1/60 s frame
  batchMin: 10,
  batchMax: 100,
  batchesPerSecond: 8,
  spawnHeight: 40,
  spawnHalf: 18,
  floorHalf: [30, 1, 30], // centred at y = -1, so its top is y = 0
  // Invisible walls round the floor, 1 m thick and 50 m high (above the drop), so no box leaves the heap.
  // [half extents, centre]; the floor plus these are the 5 static bodies created before any box.
  walls: [[[0.5, 25, 31], [30.5, 25, 0]], [[0.5, 25, 31], [-30.5, 25, 0]], [[31, 25, 0.5], [0, 25, 30.5]], [[31, 25, 0.5], [0, 25, -30.5]]],
  maxContactConstraints: 20480, // the archive's Jolt limit, kept for every Jolt setup
  settleCapSteps: 1200, // frames: 20 s after the last batch
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

// Batches arrive on simulated time (`frame` is 1/60 s): 8 per second, 10..100 boxes each, dropped from 40 m
// with a random rotation. Each box takes a random free cell of a 0.8 m grid (jittered by up to 0.05 m); a cell
// stays taken for 4 batches, by which time its last box has fallen 1.2 m, so no two boxes ever start
// overlapping (a 0.4 m box spans at most 0.69 m). Returns 7 floats per body (x y z qx qy qz qw) or null.
export function makeSpawner(seed, total) {
  const rand = mulberry32(seed);
  let spawned = 0;
  let batches = 0;
  const cell = 0.8, side = Math.round((2 * SPEC.spawnHalf) / cell), takenUntil = new Int32Array(side * side);
  return {
    get spawned() { return spawned; },
    done: () => spawned >= total,
    due(frame) {
      if (spawned >= total || Math.floor((frame * SPEC.batchesPerSecond) / 60) < batches) return null;
      batches++;
      const n = Math.min(total - spawned, SPEC.batchMin + Math.floor(rand() * (SPEC.batchMax - SPEC.batchMin + 1)));
      const d = new Float32Array(n * 7);
      for (let i = 0; i < n; i++) {
        const ax = rand() * 2 - 1, ay = rand() * 2 - 1, az = rand() * 2 - 1;
        const len = Math.hypot(ax, ay, az) || 1;
        const angle = rand() * Math.PI * 2;
        const s = Math.sin(angle / 2) / len;
        let c;
        do c = Math.floor(rand() * side * side); while (takenUntil[c] > batches);
        takenUntil[c] = batches + 4;
        const x = -SPEC.spawnHalf + ((c % side) + 0.5) * cell + (rand() * 2 - 1) * 0.05;
        const z = -SPEC.spawnHalf + (Math.floor(c / side) + 0.5) * cell + (rand() * 2 - 1) * 0.05;
        d.set([x, SPEC.spawnHeight, z, ax * s, ay * s, az * s, Math.cos(angle / 2)], i * 7);
      }
      spawned += n;
      return d;
    },
  };
}
