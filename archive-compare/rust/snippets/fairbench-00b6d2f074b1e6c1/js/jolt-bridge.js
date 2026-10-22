// Bridge between the Rust wasm and JoltPhysics.js (a separate wasm module). The page sets
// globalThis.__makeJoltWorld before creating the Rust Sim.
let w;
export function jb_create(threads) { w = globalThis.__makeJoltWorld(threads); return w.workers; }
export function jb_spawn(d) { w.spawn(d); }
export function jb_step() { w.step(); }
export function jb_sync_active(out) { return w.syncActive(out); }
export function jb_positions(out) { w.positions(out); }
export function jb_awake() { return w.awake(); }
