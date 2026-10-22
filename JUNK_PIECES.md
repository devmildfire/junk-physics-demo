# How the junk pieces are generated

This is the method behind the junk heap in the live demo (https://devmildfire.github.io/junk-physics-demo/): how the
five kinds of scrap are built, how they are given mass, how each physics engine receives them, and how a heap of them
is dropped into the bin without exploding. It is written so the same rubble can be rebuilt in any engine (Jolt,
Rapier, Havok, Godot, Avian, ...) and stay comparable with our measurements.

The reference implementation is TypeScript in the spike project (`src/pieces.ts`, `src/geometry.ts`,
`src/scenes/settle.ts`, `src/scenes/bin.ts`, `src/engines/*.ts`); all numbers below are taken from that code. A
GDScript port of the same pieces and spawner exists for Godot (built-in Jolt) and gives the same spawn sequence.

## 1. Principles

- **Rigid bodies only.** No cutting, bending or soft bodies. A piece of scrap is one rigid body.
- **Every piece is a compound of simple primitives**: boxes, capsules, cylinders (spheres are supported but unused).
  Every engine has fast, robust collision for these. We never use triangle-mesh colliders on moving bodies: a mesh
  has no "inside", so a piece pushed into another one is not pushed back out (Rapier's and Jolt's docs both warn about
  this). Convex hulls are kept for genuinely blobby pieces only.
- **Holes are real holes.** A door's window or the gap inside a truss is simply where no primitive is. That is what
  lets a pipe go through a window or a cog wedge into a truss, which is the whole point of a tangled heap.
- **One recipe, every engine.** A piece is defined once as data (primitives with local positions and rotations, plus
  a mass). Each engine has a thin adapter that turns that data into its own shapes. No engine gets its own tuned
  version of a piece.
- **Thin-part limits.** No sheet thinner than 1.6 cm, no rod with radius below 1.4 cm in the current set. Thinner parts
  are possible but tunnel more easily and need continuous collision detection (section 5).
- **Deterministic.** All randomness (which piece, spawn order, orientation) comes from one seeded generator
  (mulberry32), so a run is reproducible per seed in every engine.

## 2. Data format

```ts
type Primitive =
  | { kind: "box"; halfExtents: [number, number, number] }
  | { kind: "sphere"; radius: number }
  // length = full length of the straight (cylindrical) part, NOT the half length and NOT including the caps.
  // Overall capsule length is length + 2 * radius.
  | { kind: "capsule"; radius: number; length: number }
  // length = full height of the cylinder.
  | { kind: "cylinder"; radius: number; length: number };

interface SubShape {
  primitive: Primitive;
  position: [number, number, number];          // in the piece's local frame, metres
  rotation: [number, number, number, number];  // quaternion x, y, z, w
}

interface PieceDefinition {
  name: string;
  mass: number;        // kg, for the whole piece
  subShapes: SubShape[];
}
```

Conventions that matter (most cross-engine bugs come from these):

- Capsules and cylinders point along their **local +Y axis**. To lay one along another direction, rotate the
  sub-shape.
- The **capsule length** convention differs per engine. Ours is "length of the straight part". Rapier's
  `capsule(halfHeight, r)` and Jolt's `CapsuleShape(halfHeightOfCylinder, r)` take `length / 2`; Godot's capsule
  `height` is the overall length, `length + 2 * radius`; three.js `CapsuleGeometry(radius, length)` takes our
  `length` directly.
- The body's origin is the **piece's local origin**, not its centre of mass. Every engine computes the centre of mass
  itself from the shapes (section 4); positions you give to the engine and get back are the origin's.
- Units are metres and kilograms, gravity 9.81 m/s² along −Y.

Two helpers are used throughout:

```ts
const at = (primitive, position, rotation = [0, 0, 0, 1]) => ({ primitive, position, rotation });
const aboutZ = (a) => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];   // rotation by angle a (radians) about Z
const aboutY = (a) => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];   // rotation about Y
const alignYTo = (dx, dy) => aboutZ(Math.atan2(-dx, dy));         // maps local +Y onto direction (dx, dy, 0)
```

## 3. The five pieces

| Piece | Size | Mass | Sub-shapes | What it tests |
|---|---|---:|---:|---|
| Truss section | 1.5 × 0.33 × 0.33 m | 10 kg | 10 capsules | long open lattice; things get caught inside it |
| Car door with window | 1.1 × 0.9 × 0.03 m | 15 kg | 4 boxes | large flat panel with a real opening |
| Kinked pipe | 4 segments of 0.4 m, Ø 8 cm, bends 30° and 60° | 3 kg | 4 capsules | thin, long, non-convex; hooks onto things |
| Cog | Ø 40 cm, 4 cm thick, 12 teeth | 8 kg | 1 cylinder + 12 boxes | many small features; teeth interlock |
| Sheet-metal bracket | U-channel 20 × 10 cm, walls 16 cm, sheet 1.6 cm | 2 kg | 3 boxes | thin sheet; tunnelling risk |

### Truss section (lies along X)

Two flat side lattices at z = ±0.15, joined only by their shared ends, so there is an open 0.3 m gap between them.

- **Chords:** 4 capsules, radius 0.014 m, along X at (y, z) = (±0.15, ±0.15). Overall length 1.5 m, so the straight
  part is `1.5 − 2 × 0.014 = 1.472` m. Rotation `aboutZ(−π/2)` turns the capsule's Y axis onto X.
- **Diagonals:** in each side plane (z = ±0.15) 3 capsules, radius 0.014 m, centred at x = −0.5, 0, +0.5, y = 0.
  Each spans 0.5 m in x and 0.3 m in y (chord to chord), alternating up and down: directions (0.5, +0.3), (0.5, −0.3),
  (0.5, +0.3). Straight length `hypot(0.5, 0.3) − 2 × 0.014 ≈ 0.555` m, rotation `alignYTo(0.5, ±0.3)`.
- The diagonals' ends overlap the chords. That is intended: overlapping primitives of one body never collide with
  each other, and the overlap makes the joints solid.

```ts
function truss() {
  const R = 0.014, subShapes = [];
  for (const z of [-0.15, 0.15]) for (const y of [-0.15, 0.15])
    subShapes.push(at({ kind: "capsule", radius: R, length: 1.5 - 2 * R }, [0, y, z], aboutZ(-Math.PI / 2)));
  const dx = 0.5, dy = 0.3, len = Math.hypot(dx, dy) - 2 * R;
  for (const z of [-0.15, 0.15]) for (let i = 0; i < 3; i++)
    subShapes.push(at({ kind: "capsule", radius: R, length: len }, [-0.5 + i * 0.5, 0, z], alignYTo(dx, i % 2 === 0 ? dy : -dy)));
  return { name: "truss", mass: 10, subShapes };
}
```

### Car door with a window (in the XY plane, thickness along Z)

Door 1.1 m wide, 0.9 m tall, 3 cm thick; the window frame is 2 cm wide. The window sill is at y = −0.15 (the door
spans y = −0.45 … +0.45).

- **Lower panel:** box, full width, from the bottom edge up to the sill: half extents (0.55, 0.15, 0.015), centre
  (0, −0.30, 0).
- **Top rail:** box (0.55, 0.01, 0.015) at (0, 0.44, 0).
- **Two stiles** framing the window on the left and right: boxes (0.01, 0.29, 0.015) at (±0.54, 0.14, 0), spanning
  from the sill (y = −0.15) to the underside of the top rail (y = 0.43).
- The window opening is therefore 1.06 × 0.58 m, open on all sides inside the frame.

```ts
function carDoor() {
  const W = 1.1, H = 0.9, T = 0.03, F = 0.02, hw = W / 2, hh = H / 2, hd = T / 2;
  const sill = -0.15, railBottom = hh - F, panelH = sill + hh, stileH = railBottom - sill;
  return { name: "car-door", mass: 15, subShapes: [
    at({ kind: "box", halfExtents: [hw, panelH / 2, hd] }, [0, -hh + panelH / 2, 0]),
    at({ kind: "box", halfExtents: [hw, F / 2, hd] }, [0, hh - F / 2, 0]),
    at({ kind: "box", halfExtents: [F / 2, stileH / 2, hd] }, [-hw + F / 2, sill + stileH / 2, 0]),
    at({ kind: "box", halfExtents: [F / 2, stileH / 2, hd] }, [hw - F / 2, sill + stileH / 2, 0]),
  ] };
}
```

### Kinked pipe (in the XY plane)

A chain of 4 capsules, radius 0.04 m (Ø 8 cm), straight part 0.4 m each. Segment directions, measured from +X in the
XY plane: 0°, 0°, 30°, 90°. That gives a straight run of two segments, then a 30° bend, then a 60° bend.

Each segment's centre is placed so its start meets the previous segment's end: with `half = 0.2`,
`centre[i] = centre[i−1] + half × (dir[i−1] + dir[i])`, starting from (0, 0, 0). The capsule's Y axis is turned onto
the segment direction with `aboutZ(angle − π/2)`. The rounded caps make the joints smooth.

```ts
function kinkedPipe() {
  const angles = [0, 0, 30, 90].map((d) => (d * Math.PI) / 180), half = 0.2, centres = [];
  let x = 0, y = 0;
  angles.forEach((a, i) => {
    if (i > 0) { x += half * (Math.cos(angles[i - 1]) + Math.cos(a)); y += half * (Math.sin(angles[i - 1]) + Math.sin(a)); }
    centres.push([x, y, 0]);
  });
  return { name: "kinked-pipe", mass: 3, subShapes: angles.map((a, i) =>
    at({ kind: "capsule", radius: 0.04, length: 0.4 }, centres[i], aboutZ(a - Math.PI / 2))) };
}
```

### Cog (axis along Y)

- **Hub:** cylinder, radius 0.14 m, thickness 0.04 m, at the origin (its axis is local Y already).
- **Teeth:** 12 boxes, each 7 cm radial × 4 cm thick (same as the hub) × 4 cm wide: half extents
  (0.035, 0.02, 0.02) in (radial, axial, tangential) order. Tooth *i* sits at angle `a = i × 30°` with its centre at
  radius `0.2 − 0.035 = 0.165` m, i.e. at (cos a × 0.165, 0, sin a × 0.165), rotated `aboutY(−a)` so its long side
  points outward. Outer radius is 0.2 m (Ø 40 cm); each tooth reaches 1 cm into the hub.

```ts
function cog() {
  const subShapes = [at({ kind: "cylinder", radius: 0.14, length: 0.04 }, [0, 0, 0])];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r = 0.2 - 0.035;
    subShapes.push(at({ kind: "box", halfExtents: [0.035, 0.02, 0.02] }, [Math.cos(a) * r, 0, Math.sin(a) * r], aboutY(-a)));
  }
  return { name: "cog", mass: 8, subShapes };
}
```

### Sheet-metal bracket (U-channel, open upward)

Sheet thickness 1.6 cm (half 0.008), depth 10 cm along Z.

- **Base plate:** box (0.1, 0.008, 0.05) at the origin: 20 × 1.6 × 10 cm.
- **Two walls:** boxes (0.008, 0.08, 0.05) at x = ±(0.1 − 0.008) = ±0.092, y = 0.008 + 0.08 = 0.088. They stand on the
  plate's top face, flush with its outer edges, and rise 16 cm.

```ts
function bracket() {
  const P = 0.1, S = 0.008, D = 0.05, WH = 0.08, off = P - S;
  return { name: "bracket", mass: 2, subShapes: [
    at({ kind: "box", halfExtents: [P, S, D] }, [0, 0, 0]),
    at({ kind: "box", halfExtents: [S, WH, D] }, [off, S + WH, 0]),
    at({ kind: "box", halfExtents: [S, WH, D] }, [-off, S + WH, 0]),
  ] };
}
```

## 4. Mass and inertia

Each piece has a target mass. It is spread evenly over its primitives:

1. Sum the volumes of the primitives: box `8·hx·hy·hz`, cylinder `π·r²·length`, capsule
   `π·r²·length + 4/3·π·r³`, sphere `4/3·π·r³`.
2. `density = mass / total volume`, and give **every** sub-shape that same density.
3. Let the engine compute the centre of mass and the inertia tensor of the compound (it applies the parallel-axis
   theorem per sub-shape). The resulting mass equals the target mass.

Overlapping regions (truss joints, cog teeth inside the hub) are counted twice in the volume sum. We accept that: it
shifts the mass distribution very slightly, and it is the same in every engine.

Per engine:

- **Rapier:** `ColliderDesc.setDensity(density)` on each collider attached to the body.
- **Jolt (JoltPhysics.js):** `settings.mDensity = density` on each sub-shape's settings, then a
  `StaticCompoundShapeSettings` with all sub-shapes (`AddShape(position, rotation, settings, 0)`), `Create()` once per
  piece type and reuse (cache) the shape for every body of that type.
- **Havok:** a container shape with one child per sub-shape. `HP_Shape_BuildMassProperties(container)` gives the
  centre of mass and the inertia for unit mass; replace the mass with the target mass and set it with
  `HP_Body_SetMassProperties`.
- **Godot (PhysicsServer3D, built-in Jolt):** one body with all shapes added via
  `body_add_shape(body, shape, local_transform)`, and `BODY_PARAM_MASS = mass`. Godot derives the centre of mass and
  inertia from the shapes. Create the shape resources once per piece type and reuse them.

## 5. Body and material settings

These are the values every engine got in the junk heap test:

| Setting | Value | Notes |
|---|---|---|
| Fixed step | 1/60 s | one step per frame, never tied to the wall clock |
| Friction | 0.6 | Godot combines with min, Jolt with sqrt(a·b): equal values give 0.6 in both |
| Restitution | 0.1 | Godot sums the two bodies' bounce, so set 0.05 per body there |
| Linear / angular damping | 0.1 / 0.4 | in Godot use `BODY_DAMP_MODE_REPLACE`, or it adds the world defaults |
| Continuous collision detection | on | Rapier `setCcdEnabled(true)`, Jolt `mMotionQuality = EMotionQuality_LinearCast`, Godot `body_set_enable_continuous_collision_detection` |
| Sleeping | allowed | Jolt `mAllowSleeping = true`, Godot `BODY_STATE_CAN_SLEEP` |
| Convex radius (Jolt) | `min(0.01, smallest half extent × 0.5)` for boxes; `min(0.01, r × 0.5, half height × 0.5)` for cylinders | Jolt needs the rounding to fit inside the shape; the outer size stays the given one |
| Shape margin (Godot) | 0.01, with `jolt_physics_3d/collisions/collision_margin_fraction = 0.5` | the Godot equivalent of the convex radius above |
| Enhanced internal edge removal (Godot) | off | matches JoltPhysics.js defaults |

CCD matters for these pieces: a 1.4 cm truss rod or a 1.6 cm sheet moving at a few m/s crosses its own thickness in
one 1/60 s step.

## 6. The bin

- A floor box plus four walls. Up to 200 pieces the bin is 3 × 3 m with 3 m high walls.
- Above 200 pieces the footprint grows with `3 × sqrt(n / 200)` (4.74 m for 500, 6.71 m for 1000) and the walls stay
  3 m high, so the heap keeps about the same height.
- Floor: half extents (w/2, 0.05, d/2) at y = −0.05, so its top is at y = 0. Walls are 0.3 m thick (half 0.15) and
  stand **outside** the footprint, inner faces exactly at ±w/2, ±d/2: thick enough that heavy pieces cannot tunnel
  through them.

## 7. Building a heap: which pieces, where, and when

**Which pieces.** For n pieces, take the five types round-robin (truss, door, pipe, cog, bracket, truss, ...) so every
type appears n/5 times, then shuffle that list with the seeded RNG (Fisher-Yates using mulberry32(seed)). That mixes
the types across the heap instead of dropping them in stripes.

```js
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

**In batches.** The list is dropped in about five batches: `batchSize = max(8, round(n / 5))`. The first batch goes
in at once. Each next batch waits until every body is asleep, or at most 2 s, so the heap never has to absorb one huge
drop.

**Where: shelf packing, never overlapping.** A batch is laid out in non-overlapping cells just above the current heap
top. Spawning pieces inside each other is the most common cause of "explosions" in physics demos, and this layout
rules it out. For each piece of the batch, in order:

1. Compute its local axis-aligned bounding box from the corners of every primitive (capsule half height along its
   axis = `length / 2 + radius`, cylinder = `length / 2`), each corner rotated by the sub-shape rotation.
2. **Lay it flat:** rotate so the bounding box's smallest axis points up (a door lies flat instead of standing on an
   edge), then add a random yaw about Y from the RNG.
3. Take the world-aligned size of that rotated box: its footprint (x, z) and height (y).
4. Place it on a shelf: cells are filled along x; when the next piece does not fit in the usable width
   (bin side − 0.1 m) a new row starts along z; when the rows are full, a new layer starts on top of the tallest
   piece of the previous layer. Cells are separated by 1 cm gaps.
5. Position the piece so its bounding box is centred in its cell: `position = cell centre − rotate(bbox centre)`,
   because the body origin is not the bounding-box centre.

The bottom of the first layer is at `max(0.05, heap top + 0.15)`, where the heap top is the highest body origin
currently in the bin (0 for the first batch). Pieces therefore fall only a short distance onto the heap, as scrap
tipped from a container would, instead of being dropped from high up.

## 8. Rendering

For drawing, each primitive becomes a mesh (three.js: `BoxGeometry(2hx, 2hy, 2hz)`,
`CapsuleGeometry(r, length, 4, 10)`, `CylinderGeometry(r, r, length, 16)`), transformed by its sub-shape position
and rotation and merged into **one geometry per piece** (`BufferGeometryUtils.mergeGeometries`). Each piece is then
one mesh following its body's transform: one draw call per piece instead of one per primitive, which matters at 500
and 1000 pieces. The collision shapes and the render meshes come from the same definition, so what you see is exactly
what collides.

## 9. What we learned

- **Engines differ most on long, thin compounds.** Trusses, kinked pipes and thin brackets are where heaps keep
  jittering. In Havok (Babylon's 1.3.14 binding) a heap of mixed pieces never went to sleep with one step per frame,
  while boxes, spheres, cogs and doors alone did; its sleep thresholds cannot be tuned from JavaScript.
- **Check the capsule convention** first when a piece looks wrong in one engine (section 2): a capsule built with the
  overall length as the straight length is 2r too long on every rod.
- **Never spawn overlapping bodies.** The engine resolves the overlap by pushing the bodies apart in a few steps,
  which looks like an explosion and wakes the whole heap. Packing (section 7) avoids it.
- **Keep fast thin parts on CCD**, or use a smaller step. Tunnelling shows up first on truss rods and bracket sheets.
- **Count what went wrong.** We recorded explosions (a body's speed jumping by more than 5 m/s between frames), pieces
  out of the bin, whether everything fell asleep within the time budget, and the 95th-percentile step time.

## 10. Adding a new kind of junk

1. Write it as a `PieceDefinition`: a list of primitives with local positions and rotations, and a mass. Keep sheets
   at least ~1.5 cm thick and rods at least ~1.4 cm in radius, or test thinner ones with CCD.
2. Leave real gaps where the object has openings; overlap primitives where they are joined.
3. Keep it to a few dozen primitives at most: collision cost grows with the number of sub-shapes per body.
4. Put it in the round-robin list. The packing, mass distribution and every engine adapter work for it unchanged.
5. Drop a single-type heap of it and a mixed heap, and check that both settle (all asleep) without explosions,
   before trusting it in a game scene.
