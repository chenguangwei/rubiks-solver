# RubikSolver

A browser-based 3×3 Rubik's Cube solver. Upload a flat-net image of a scrambled cube and get a step-by-step solution.

**Live demo:** https://jeffhuber.github.io/rubiks-solver/

100% client-side: no server, no upload — image processing and solving both run in your browser.

## What it does

1. **Get a cube state in** — three ways: click **Upload net image**, drop a net image anywhere on the page, or paste one with ⌘V. **Random scramble** generates a programmatic state for testing. **Share** copies a URL that reproduces the exact current state.
2. The CV pipeline crops the cross, samples each sticker, and snaps every color via per-image calibration: it finds the globally optimal 6-way assignment of the center stickers to the WCA palette, then classifies every other sticker against those calibrated centers (handles palette drift like Ruwix's yellow-shifted orange).
3. The detected state appears in an editable cube net — click any sticker to fix a wrong color before solving. Any of the 24 rotational orientations is accepted; the centers themselves define which face is which.
4. Click **Solve** to compute a 22-moves-or-less solution via Kociemba's two-phase algorithm.
5. Step through the solution one move at a time, or hit **▶ Play** for auto-advance with slow/normal/fast speeds. The face being rotated is highlighted on the net, and the cube animates to the new state at each step.

## How it works

- **Solver:** [`cubejs`](https://www.npmjs.com/package/cubejs) — a JS port of Kociemba's two-phase algorithm. Returns near-optimal solutions in milliseconds after a one-time ~3-second table init.
- **Cube model** ([src/cube.ts](src/cube.ts)): the cube state is a 54-character facelet string in `URFDLB` face order. The `PLACEMENTS` table maps each sticker index to its `(row, col)` on the unfolded cross — used by both the renderer and the parser, so the two are guaranteed to agree.
- **Renderer** ([src/CubeNet.tsx](src/CubeNet.tsx), [src/render.ts](src/render.ts)): SVG component for the UI, plus a pure RGBA-buffer renderer used as a deterministic test fixture for the parser.
- **Parser** ([src/parser.ts](src/parser.ts)): finds the cross's bounding box by detecting non-background pixels at the image corners, samples a small patch at each sticker's geometric center, converts to CIE Lab, and assigns each sticker to its nearest reference color. By default the reference palette is calibrated from the six center stickers in the same image, which makes the parser robust to palette differences (e.g. a Ruwix screenshot vs. our own renderer).
- **Validation** ([src/cube.ts](src/cube.ts)): checks the state has 9 stickers per color and 6 distinct centers before sending to the solver. (Permutational impossibility is caught when the solver itself rejects the state.)

The parser round-trips 50 random scrambles at 100% sticker accuracy against the in-app renderer; see [src/parser.test.ts](src/parser.test.ts).

## Run locally

```sh
npm install
npm run dev      # http://localhost:5173/rubiks-solver/
npm test         # vitest, ~5s
npm run build    # production bundle
```

## Project structure

```
src/
├── App.tsx            # top-level UI, state, upload + solve flow
├── CubeNet.tsx        # SVG renderer for the unfolded cross
├── cube.ts            # state types, layout, validation
├── render.ts          # RGBA-buffer renderer (test fixture)
├── parser.ts          # image -> cube state
├── solver.ts          # cubejs wrapper
├── moves.ts           # move parsing + face-highlight helpers
├── imageLoader.ts     # File -> ImageBuffer via canvas
└── *.test.ts(x)       # vitest specs
patches/
└── cubejs+1.3.2.patch # one-line fix so cubejs works under Vite ESM
```

## Known limitations

- **The parser is tuned for synthetic flat-net images** (in-app renderer or similar tools like [Ruwix Cube Solver](https://ruwix.com/online-puzzle-simulators/)). Real-cube photos would need perspective correction, lighting normalization, and a 6-face capture flow — see roadmap below.
- **No 3D animation yet** — the solution is shown as a step-through over the 2D net.

## Roadmap

- [ ] 3D cube preview with animated solution playback (Three.js)
- [ ] Real-camera capture flow (six face captures, center-anchored color calibration)
- [ ] iOS native version (Swift / SwiftUI / VisionKit)

## Releases

- **v0.2.0** — Paste / drag-and-drop image upload, share-via-URL hash, auto-play step-through with speed control, accept any rotational orientation, smart calibration via globally optimal 6-way assignment.
- **v0.1.0** — Initial MVP: Vite + React + TS, Kociemba solver, flat-net image parser, editable cube net, step-through solution viewer.

## Tech stack

Vite · React 19 · TypeScript · Vitest · cubejs · GitHub Pages
