// JoltPhysics.js world for the archive scene. Used by the Three.js setup and, through
// rust/js/jolt-bridge.js, by Rust + Jolt, so both run byte-identical physics.
import { SPEC } from './spec.js';

export function makeJoltWorld(Jolt, threads) {
  const s = new Jolt.JoltSettings();
  s.mMaxBodies = 20000;
  s.mMaxBodyPairs = 65536;
  s.mMaxContactConstraints = SPEC.maxContactConstraints;
  s.mMaxWorkerThreads = threads; // JoltJS.h: workers = min(hardwareConcurrency - 1, threads, 16)
  const filter = new Jolt.ObjectLayerPairFilterTable(2);
  filter.EnableCollision(0, 1);
  filter.EnableCollision(1, 1);
  const bp = new Jolt.BroadPhaseLayerInterfaceTable(2, 2);
  bp.MapObjectToBroadPhaseLayer(0, new Jolt.BroadPhaseLayer(0));
  bp.MapObjectToBroadPhaseLayer(1, new Jolt.BroadPhaseLayer(1));
  s.mObjectLayerPairFilter = filter;
  s.mBroadPhaseLayerInterface = bp;
  s.mObjectVsBroadPhaseLayerFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(bp, 2, filter, 2);
  const jolt = new Jolt.JoltInterface(s);
  const system = jolt.GetPhysicsSystem();
  const bi = system.GetBodyInterfaceNoLock();

  // Floor and walls are body indices 0..4; boxes start at 5.
  for (const [f, c] of [[SPEC.floorHalf, [0, -1, 0]], ...SPEC.walls]) {
    const s = new Jolt.BodyCreationSettings(new Jolt.BoxShape(new Jolt.Vec3(f[0], f[1], f[2]), 0.05, null), new Jolt.RVec3(c[0], c[1], c[2]), new Jolt.Quat(0, 0, 0, 1), Jolt.EMotionType_Static, 0);
    s.mFriction = SPEC.friction;
    s.mRestitution = SPEC.restitution;
    bi.CreateAndAddBody(s, Jolt.EActivation_DontActivate);
    Jolt.destroy(s);
  }
  const statics = 1 + SPEC.walls.length;

  const h = SPEC.half;
  const box = new Jolt.BoxShape(new Jolt.Vec3(h, h, h), 0.05, null);
  box.SetDensity(SPEC.mass / (8 * h * h * h));
  box.AddRef();
  const ids = [];
  const active = new Jolt.BodyIDVector();
  const pos = new Jolt.RVec3(0, 0, 0);
  const rot = new Jolt.Quat(0, 0, 0, 1);

  return {
    workers: Math.min((navigator.hardwareConcurrency || 1) - 1, threads, 16),
    spawn(d) {
      for (let o = 0; o < d.length; o += 7) {
        pos.Set(d[o], d[o + 1], d[o + 2]);
        rot.Set(d[o + 3], d[o + 4], d[o + 5], d[o + 6]);
        const c = new Jolt.BodyCreationSettings(box, pos, rot, Jolt.EMotionType_Dynamic, 1);
        c.mFriction = SPEC.friction;
        c.mRestitution = SPEC.restitution;
        c.mLinearDamping = SPEC.damping;
        c.mAngularDamping = SPEC.damping;
        // CreateAndAddBody returns a shared temporary that the next call overwrites, so keep a copy.
        ids.push(new Jolt.BodyID(bi.CreateAndAddBody(c, Jolt.EActivation_Activate).GetIndexAndSequenceNumber()));
        Jolt.destroy(c);
      }
    },
    step() {
      jolt.Step(SPEC.dt, 1);
    },
    // Writes [instance index, x y z qx qy qz qw] per awake body; returns the count.
    syncActive(out) {
      system.GetActiveBodies(Jolt.EBodyType_RigidBody, active);
      const n = active.size();
      for (let i = 0; i < n; i++) {
        const id = active.at(i);
        const p = bi.GetPosition(id);
        const q = bi.GetRotation(id);
        out.set([id.GetIndex() - statics, p.GetX(), p.GetY(), p.GetZ(), q.GetX(), q.GetY(), q.GetZ(), q.GetW()], i * 8);
      }
      return n;
    },
    positions(out) {
      for (let i = 0; i < ids.length; i++) {
        const p = bi.GetPosition(ids[i]);
        out[i * 3] = p.GetX();
        out[i * 3 + 1] = p.GetY();
        out[i * 3 + 2] = p.GetZ();
      }
    },
    lost(y) {
      const out = [0, 0];
      for (const id of ids) {
        const p = bi.GetPosition(id);
        if (p.GetY() < y) out[+(Math.abs(p.GetX()) > SPEC.floorHalf[0] || Math.abs(p.GetZ()) > SPEC.floorHalf[2])]++;
      }
      return out;
    },
    awake: () => system.GetNumActiveBodies(Jolt.EBodyType_RigidBody),
  };
}
