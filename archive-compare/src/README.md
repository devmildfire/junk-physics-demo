# Source of the fair engine comparison

Built page: the folder above (`archive-compare/`). Live: https://devmildfire.github.io/junk-physics-demo/archive-compare/

- `rust/`: one wasm crate with Rapier 0.36, Avian 0.8 and a bridge to JoltPhysics.js, plus a shared WebGL2 renderer.
- `godot/`: the Godot 4.7.2 project (built-in Jolt); `patch-godot.py` copies its export into `../godot/` and adds the
  thread count and result hooks.
- `build.sh`: rebuilds `../rust/` and `../godot/` (needs rustup with `wasm32-unknown-unknown`, wasm-bindgen-cli 0.2.129,
  and `GODOT` pointing at the Godot 4.7.2 editor with web export templates).
- `scripts/`: `serve-coi.mjs <dir> <port>` serves with COOP/COEP headers; `fb-ladder.mjs`, `fb-render.mjs` and
  `fb-summary.mjs` produce `../data/*.jsonl` and `../results.json`; `overlap.mjs` checks that no boxes spawn inside
  each other.

## Measuring on your own machine

The quickest way: open the live page, pick a setup, thread count and box count, and press Run (or "Run all five").
Results stay in your browser. Keep the tab in front and do not scroll while a render run is going.

For the full ladder (every setup, 1000 to 10000 boxes, 3 seeds, physics only), from `archive-compare/src/scripts`:

```sh
npm i playwright-core                                   # once
node serve-coi.mjs ../.. 8765 &                         # serves archive-compare/ with COOP/COEP headers
CHROME=/path/to/chrome node fb-ladder.mjs http://localhost:8765 ladder.jsonl
node fb-summary.mjs results.json "your machine, date" ladder.jsonl
```

`CHROME` defaults to `/usr/bin/google-chrome`. A full ladder takes several hours; `fb-run.mjs <base> <query>…` runs
single setups, e.g. `run.html?setup=threejs&threads=4&n=6000&seed=1&render=0`.
