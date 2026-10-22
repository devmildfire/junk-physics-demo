#!/bin/sh
# Builds every setup into the published page one folder up (archive-compare/). Needs rustup's toolchain (wasm32 target, wasm-bindgen-cli) and the
# Godot 4.7.2 editor with web export templates (GODOT env var).
set -e
cd "$(dirname "$0")"
export PATH="$HOME/.cargo/bin:$PATH"
(cd rust && RUSTFLAGS="-C target-feature=+simd128" cargo build --release --target wasm32-unknown-unknown)
rm -rf ../rust
wasm-bindgen --target web --no-typescript --out-dir ../rust rust/target/wasm32-unknown-unknown/release/fairbench.wasm
(cd godot && "$GODOT" --headless --path . --export-release web dist/index.html)
python3 -I patch-godot.py .
