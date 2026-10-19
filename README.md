# Junk Heap Physics: live demo

**Live:** https://devmildfire.github.io/junk-physics-demo/

A browser test bench for a game about pulling pieces out of a tangled scrap heap. Five kinds of junk (truss sections,
car doors with window openings, kinked pipes, cogs, sheet-metal brackets) are built as compounds of simple shapes, dropped
into a 3 x 3 m bin, and one buried piece is pulled out with a force-limited spring. The same scene runs on three physics
engines compiled to WebAssembly, so you can watch and compare them live.

## What you see

- The heap settling, then the grabbed piece (highlighted) pulled out; the yellow line is the spring to its moving target.
- The panel at the top left shows live numbers: physics time per step (last, median and 95th percentile of the last
  120 steps), a sparkline against the **8 ms budget** (half of a 60 fps frame), bodies awake, frame rate, and the result
  (extracted; for the tangle tests: passed through, obstacle dragged, released).
- Controls at the bottom left: engine, scene, number of pieces, random seed.

Scenes: **settle** (drop and settle), **pullout** (settle, then pull a buried piece out; "skip settle" fast-forwards the
drop), **tangle-a** (a pipe through a door's window, pulled sideways, then up), **tangle-b** (a cog caught in a truss).

Engines: Rapier 0.21 (with and without SIMD), Jolt 1.1 (single-threaded and multithreaded), Havok 1.3.14 (1 and 8
substeps per frame). Multithreaded Jolt needs cross-origin isolation; GitHub Pages cannot send those headers, so a small
service worker ([coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker)) adds them. **The page reloads itself
once on the first visit**; after that "Jolt MT" is available.

Links can preselect a setup, for example
`?engine=jolt-mt&scene=pullout&n=100&seed=1&skipSettle=1`.

The numbers on screen are measured on the viewer's own machine.

## Measured results (pull-out scene, desktop Chrome)

95th-percentile physics step in ms with the whole heap awake; median over 3 seeds. Pass bar: 8 ms.

| Engine | 100 pieces | 200 pieces | 100 pieces, CPU throttled 4x |
|---|---:|---:|---:|
| Jolt, multithreaded | 1.65 | 2.75 | 4.20 * |
| Havok | 3.09 | 7.21 | 13.59 |
| Rapier SIMD | 2.87 | 9.25 | 15.65 |
| Jolt | 4.06 | 8.78 | 17.56 |
| Rapier | 4.68 | 12.77 | 24.68 |

\* Chrome's CPU throttling slows only the main thread, not worker threads, so the multithreaded figure is optimistic for
a genuinely slow machine. Havok does not let this heap of long thin pieces fall asleep; with 8 substeps it settles but
costs 42 ms at 200 pieces.

## Licenses

Built with three.js (MIT), Rapier (Apache-2.0), Jolt Physics / JoltPhysics.js (MIT), Havok for the web via
@babylonjs/havok (MIT) and coi-serviceworker (MIT).
