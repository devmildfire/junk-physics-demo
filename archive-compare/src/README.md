# Source of the fair engine comparison

Built page: the folder above (`archive-compare/`). Live: https://devmildfire.github.io/junk-physics-demo/archive-compare/

- `rust/`: one wasm crate with Rapier 0.36, Avian 0.8 and a bridge to JoltPhysics.js, plus a shared WebGL2 renderer.
- `godot/`: the Godot 4.7.2 project (built-in Jolt); `patch-godot.py` copies its export into `../godot/` and adds the
  thread count and result hooks.
- `build.sh`: rebuilds `../rust/` and `../godot/` (needs rustup with `wasm32-unknown-unknown`, wasm-bindgen-cli 0.2.129,
  and `GODOT` pointing at the Godot 4.7.2 editor with web export templates).
- `scripts/`: `serve-coi.mjs <dir> <port>` serves with COOP/COEP headers; `fb-ladder.mjs`, `fb-render.mjs` and
  `fb-summary.mjs` produce `../data/*.jsonl` and `../results.json` (need `playwright-core` and Chrome).
