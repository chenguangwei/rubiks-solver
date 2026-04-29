# RubikSolver

RubikSolver is a browser-based 3x3 Rubik's Cube solver for setting a cube state, generating a solution, and following the moves step by step.

**Website:** https://rubikssolver.pro

The app runs client-side in the browser. Cube editing, image parsing, validation, solving, playback, and share links are handled locally.

## Core Workflow

1. **Set Cube** - start from a random legal scramble, import a flat-net image, use the camera input, or paint stickers manually.
2. **Solve** - generate a fast Kociemba solution or search longer for a tighter solution.
3. **Follow Moves** - step through the algorithm, autoplay it, and inspect the cube in 3D.
4. **Guide** - review the shortest path through the app: create a cube, correct stickers, use Picker, then solve and replay.

## Features

- Editable 3x3 cube net with color-count and reachability validation.
- Random scramble for a guaranteed legal cube state.
- Flat-net image import with automatic sticker classification.
- Paint and Picker modes for correcting individual stickers.
- 3D cube preview with draggable view and solution playback.
- Fast solve plus best-effort tight solve.
- Step-by-step controls with autoplay speed options.
- Shareable URL hash for the current cube state.
- Mobile-focused layout for Set Cube, Solve Coach, and Guide.

## Run Locally

```sh
npm install
npm run dev
```

Local development URL:

```text
http://localhost:5173/
```

Other commands:

```sh
npm test       # run Vitest
npm run lint   # run ESLint
npm run build  # type-check and build production assets
```

## Project Structure

```text
src/
  App.tsx            Main app UI and workflow state
  CubeNet.tsx        SVG unfolded cube net
  Cube3D.tsx         Three.js cube preview and move animation
  cube.ts            Cube state, layout, validation, orientation helpers
  cubies.ts          3D cubie and sticker placement data
  moves.ts           Move parsing and face-highlight helpers
  parser.ts          Image buffer to cube-state parser
  render.ts          Deterministic cube-net renderer for tests
  share.ts           URL hash encode/decode helpers
  solver.ts          Main-thread solver API and worker proxy
  solver-core.ts     cubejs wrapper for fast and tight solving
  solver.worker.ts   Web Worker solver runtime
  *.test.ts(x)       Unit and UI tests
patches/
  cubejs+1.3.2.patch Vite compatibility patch for cubejs
```

## Technical Notes

- **Solver:** uses `cubejs`, a JavaScript implementation of Kociemba's two-phase algorithm.
- **Worker:** solving runs in a Web Worker so the UI stays responsive during tighter searches.
- **Validation:** the app checks color counts, center uniqueness, and whether a state is reachable on a real 3x3 cube.
- **Image parsing:** flat-net images are cropped, sampled, calibrated from center stickers, and classified into cube face colors.
- **Rendering:** the UI combines an SVG net for editing with a Three.js 3D cube for inspection and move playback.

## Current Limitations

- Real-world camera capture is still basic. A single photo cannot see all 54 stickers, so reliable physical-cube capture needs a guided six-face flow.
- Tight solve is best-effort within a time budget. It often improves the first solution but is not a formal optimal-solver guarantee.
- The production bundle is dominated by Three.js and react-three-fiber. Future work could split the 3D viewer into a lazy-loaded chunk.

## Roadmap

- Guided six-face camera capture.
- Better low-confidence sticker review after image import.
- Optional notation and beginner-mode improvements.
- Smaller production bundle through code splitting.
- Future solver upgrades for faster near-20-move solutions.

## Tech Stack

Vite, React 19, TypeScript, Vitest, ESLint, cubejs, Three.js, react-three-fiber, drei.

## License

MIT. See [LICENSE](LICENSE).
