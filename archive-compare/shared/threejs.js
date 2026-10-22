// Three.js + JoltPhysics.js: InstancedMesh, Lambert material, one directional light, no shadows.
import * as THREE from '../vendor/three.module.js';
import { SPEC } from './spec.js';
import { makeJoltWorld } from './jolt-world.js';

// Colour management off: raw linear output, like the Rust and Godot renderers.
THREE.ColorManagement.enabled = false;

export function create(Jolt, threads, canvas, maxBodies) {
  const world = makeJoltWorld(Jolt, threads);
  const active = new Float32Array(maxBodies * 8);
  let bodies = 0, mesh, renderer, scene, camera;
  const m = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);

  if (canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setPixelRatio(1);
    renderer.setSize(canvas.width, canvas.height, false);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0.043, 0.055, 0.078);
    camera = new THREE.PerspectiveCamera(60, canvas.width / canvas.height, 0.2, 2000);
    camera.position.set(0, 16, 42);
    camera.lookAt(0, 8, 0);
    const sun = new THREE.DirectionalLight(0xffffff, 0.65 * Math.PI);
    sun.position.set(0.4, 0.85, 0.35);
    scene.add(sun, new THREE.AmbientLight(0xffffff, 0.35 * Math.PI));
    const f = SPEC.floorHalf;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(f[0] * 2, f[1] * 2, f[2] * 2), new THREE.MeshLambertMaterial({ color: new THREE.Color(0.16, 0.18, 0.22) }));
    floor.position.y = -1;
    scene.add(floor);
    const s = SPEC.half * 2;
    mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshLambertMaterial({ color: new THREE.Color(0.78, 0.83, 0.9) }), maxBodies);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  return {
    workers: world.workers,
    spawn(d) {
      world.spawn(d);
      if (mesh) for (let o = 0; o < d.length; o += 7, bodies++) {
        mesh.setMatrixAt(bodies, m.compose(pos.set(d[o], d[o + 1], d[o + 2]), q.set(d[o + 3], d[o + 4], d[o + 5], d[o + 6]), one));
      }
      if (mesh) mesh.count = bodies;
    },
    step: () => world.step(),
    sync() {
      const n = world.syncActive(active);
      if (mesh) {
        for (let i = 0; i < n; i++) {
          const a = active, o = i * 8;
          mesh.setMatrixAt(a[o], m.compose(pos.set(a[o + 1], a[o + 2], a[o + 3]), q.set(a[o + 4], a[o + 5], a[o + 6], a[o + 7]), one));
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
      return n;
    },
    render: () => renderer.render(scene, camera),
    lost: (y) => world.lost(y),
    awake: () => world.awake(),
  };
}

