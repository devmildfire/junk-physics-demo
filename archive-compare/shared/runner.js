// The measurement protocol, shared by every setup except Godot (bench.gd mirrors it).
// One tick is a 1/60 s frame: SPEC.substeps physics steps of SPEC.dt, never tied to the wall clock.
// "Step" times are the physics time of a whole frame (all substeps); sync runs once per frame.
// Validity: a run is broken if a box goes through the floor or over half the boxes on it never sleep
// (Jolt's contact budget overflowing); 1-50% still awake after the 20 s window is 'slow to settle'. Boxes flung off
// the floor's edge are counted separately (the archive scene has no walls).
// render=0: frames run back to back; step and sync are timed. render=1: one frame per
// animation frame; step, sync, draw submission and the frame interval are timed.
import { SPEC, makeSpawner } from './spec.js';

const stats = (a) => {
  if (!a.length) return null;
  const s = Float64Array.from(a).sort();
  const q = (p) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3);
  return { n: s.length, p50: q(0.5), p95: q(0.95), max: +s[s.length - 1].toFixed(3), mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) };
};

export async function run(adapter, p) {
  const spawner = makeSpawner(p.seed, p.n);
  const t = { spawnStep: [], settleStep: [], sync: [], draw: [], frame: [] };
  let step = 0, settleSteps = 0, settledAt = null, spawnMs = 0, lastFrame = 0;
  let lost = [0, 0], maxThrough = 0, maxOffEdge = 0;
  const checkLost = () => {
    lost = adapter.lost(SPEC.fallenY);
    maxThrough = Math.max(maxThrough, lost[0]);
    maxOffEdge = Math.max(maxOffEdge, lost[1]);
  };
  // Lost boxes keep falling and never sleep, so they do not count against settling.
  const awakeOnFloor = () => adapter.awake() - lost[0] - lost[1];
  const status = (s) => p.onStatus?.(s);

  const tick = () => {
    const d = spawner.due(step);
    if (d) {
      const a = performance.now();
      adapter.spawn(d);
      spawnMs += performance.now() - a;
    }
    const spawning = !spawner.done();
    const t0 = performance.now();
    for (let i = 0; i < SPEC.substeps; i++) adapter.step();
    const t1 = performance.now();
    adapter.sync();
    const t2 = performance.now();
    (spawning || d ? t.spawnStep : t.settleStep).push(t1 - t0);
    t.sync.push(t2 - t1);
    if (p.render) {
      adapter.render();
      t.draw.push(performance.now() - t2);
    }
    step++;
    if (!spawning && !d) settleSteps++;
    if (step % 60 === 0) checkLost();
    if (!spawning && settleSteps % 15 === 0 && settleSteps > 0) {
      checkLost();
      if (awakeOnFloor() <= 0) settledAt = settleSteps;
    }
    return !spawning && (settledAt !== null || settleSteps >= SPEC.settleCapSteps);
  };

  await new Promise((resolve, reject) => {
    const loop = (now) => {
      try {
        if (p.render) {
          if (lastFrame) t.frame.push(now - lastFrame);
          lastFrame = now;
          if (tick()) return resolve();
          status(`step ${step}, bodies ${spawner.spawned}`);
          requestAnimationFrame(loop);
        } else {
          const end = performance.now() + 50;
          while (performance.now() < end) if (tick()) return resolve();
          status(`step ${step}, bodies ${spawner.spawned}`);
          setTimeout(loop, 0);
        }
      } catch (e) {
        reject(e);
      }
    };
    p.render ? requestAnimationFrame(loop) : loop();
  });

  checkLost();
  const awake = awakeOnFloor();
  return {
    bodies: spawner.spawned,
    steps: step,
    spawnStepMs: stats(t.spawnStep),
    settleStepMs: stats(t.settleStep),
    syncMs: stats(t.sync),
    drawMs: stats(t.draw),
    frameMs: stats(t.frame),
    spawnTotalMs: +spawnMs.toFixed(1),
    settleSeconds: settledAt === null ? null : +(settledAt / 60).toFixed(2),
    awakeAtEnd: awake,
    throughFloor: maxThrough,
    offEdge: maxOffEdge,
    settle: settledAt !== null || awake <= spawner.spawned * 0.01 ? 'settled' : awake <= spawner.spawned * 0.5 ? 'slow' : 'never',
    valid: maxThrough === 0 && awake <= spawner.spawned * 0.5,
  };
}
