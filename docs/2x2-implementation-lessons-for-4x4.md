# 2x2 Implementation Lessons for Future Puzzle Solvers

This document summarizes the 2x2 solver implementation experience and the mistakes that should not be repeated when implementing 4x4, 5x5, Pyraminx, or Skewb modes.

The main lesson: do not treat a new puzzle as only a smaller or larger visual variant of 3x3. UI can be shared, but state representation, legal move mapping, capture flow, solver adapter, and animation rules must be verified against the puzzle's own model.

## Final 2x2 Scope

The 2x2 page now shares the same product workflow as the 3x3 page:

1. Preview the cube in 3D.
2. Generate a legal random scramble.
3. Use `Manual Solve` face controls.
4. Use `AI Solve` to produce a move sequence.
5. Play solution steps with visible moves such as `R`, `F2`, `U'`.
6. Use `Photo Solve` through the shared scanner, with a 2x2 grid.
7. Keep the route and playback UI consistent with the 3x3 page.

Core implementation files:

- `src/MiniCubeSolverPage.tsx`: 2x2 page workflow, scan handling, solve/playback state.
- `src/MiniCube3D.tsx`: 2x2 Three.js cubie rendering and layer-turn animation.
- `src/puzzles/222.ts`: cubing.js solver adapter using `experimentalSolve2x2x2`.
- `src/puzzles/cubingPattern.ts`: shared adapter for cubing.js `KPattern` based puzzles.
- `src/CameraScanner.tsx`: shared camera scanner with `gridSize={2 | 3}`.
- `src/parser.ts`: shared face sampling plus 2x2 scanned-face classification.

## What Went Wrong During 2x2

### 1. UI Looked Similar but Behavior Was Not Shared

Early 2x2 UI had a separate simplified flow:

- `Solve 2x2` instead of the 3x3-style `Manual Solve` and `AI Solve`.
- Missing `Photo Solve`.
- Missing `Import Image`.
- Layout did not match the 3x3 `3D Cube Control` surface.

This caused feature drift. The page looked like a new prototype instead of another mode of the same solver.

Avoid this for 4x4:

- Start from the 3x3 workflow contract, not from a blank puzzle page.
- Keep shared interaction names and button positions unless the puzzle truly needs a different flow.
- Add puzzle-specific behavior behind the same controls.
- Write a route-level UI checklist before implementation:
  - Preview
  - Photo Solve
  - Random Scramble
  - Reset
  - Import Image
  - Manual Solve
  - AI Solve
  - Move route
  - Playback dock
  - Status and verification messages

### 2. Solve Button Produced State Changes but Not Real Turning

An early 2x2 solve playback changed sticker colors between states without animating a physical layer turn. This looked like colors flashing rather than a cube rotating.

Root cause:

- The UI updated directly to the next solved/intermediate state.
- The 3D renderer did not render the previous state on the moving layer while rotating that layer.

Correct pattern:

1. Keep an internal `renderedState`.
2. When the external state changes by one move, detect the move.
3. Render non-moving cubies from the start state.
4. Render moving cubies from the start state inside a rotating group.
5. Commit the end state only after animation completes.

The 3x3 implementation already had this pattern in `Cube3D.tsx`; the 2x2 renderer needed the same principle.

Avoid this for 4x4:

- Never animate by changing sticker colors mid-turn.
- Animate cubies or pieces from the previous state.
- Commit the new state only after the visual rotation finishes.
- For wide moves and slice moves, define exactly which cubies belong to the rotating layer before animation.

### 3. Layer Rotation Worked but Colors Appeared to Change

After adding real layer rotation, some cubies appeared to change color after the turn.

Root cause:

- The 2x2 visual corner ordering did not match cubing.js `CORNERS` orbit ordering.
- The renderer assumed one position/piece order, while `KPattern.patternData.CORNERS` used another.

The fixed 2x2 corner order is:

```text
0 URF
1 UBR
2 UBL
3 UFL
4 DFR
5 DLF
6 DBL
7 DRB
```

This order is used by both `MiniCube3D.tsx` and `MiniCubeSolverPage.tsx`.

Avoid this for 4x4:

- Do not invent piece ordering from visual intuition.
- Inspect the cubing.js `KPuzzle` definition and moves before rendering.
- Create one canonical mapping table for each orbit:
  - centers
  - edges
  - corners
  - inner slices, if exposed by the puzzle model
- Use the same mapping in:
  - renderer
  - scanner/import conversion
  - state validation
  - animation layer membership
- Add tests or debug assertions for single moves such as `R`, `U`, `F`, `Rw`, `Uw`, and slice moves.

### 4. 2x2 Photo Solve Was Initially a Placeholder

The first 2x2 `Photo Solve` handler only displayed:

```text
2x2 Photo Solve is not connected yet
```

This was a product-level mismatch because 3x3 already had working camera capture.

Fix:

- Reuse `CameraScanner`.
- Add `gridSize={2}`.
- Let scanner overlay and thumbnails switch between 2x2 and 3x3 grids.
- Add `classifyScannedFaces2x2`.
- Convert 24 scanned facelets into cubing.js `CORNERS.pieces` and `CORNERS.orientation`.

Important limitation:

- 3x3 color classification uses center stickers for calibration.
- 2x2 has no center stickers, so the first implementation uses fixed WCA color matching and validates that each color appears exactly 4 times.
- This is functional, but less robust under weak lighting or camera color shifts.

Avoid this for 4x4:

- 4x4 also has no fixed single center sticker like 3x3.
- Do not blindly reuse 3x3 center-based calibration.
- 4x4 scanning needs a different calibration strategy:
  - Use all 16 stickers per face after the user labels the face being scanned.
  - Prefer clustered color classification across all scanned samples.
  - Validate exactly 16 stickers per color.
  - Validate center-piece constraints separately from edge/corner constraints.
- Treat `Photo Solve` as a first-class feature from the start, not a placeholder.

### 5. 2x2 State Conversion Needed a Real Puzzle Model

2x2 scanned facelets are not directly accepted by the solver adapter. The solver works with cubing.js `KPattern` data:

```ts
patternData.CORNERS = {
  pieces: number[],
  orientation: number[],
}
```

So the implementation had to map each scanned corner's three colors into:

- which cubie piece it is
- what orientation that cubie has
- which position it occupies

Avoid this for 4x4:

- Do not assume a facelet string is enough.
- Identify the solver input type first.
- If the solver uses `KPattern`, build conversion functions from scanned/rendered facelets to orbit data.
- Keep conversion deterministic and reject invalid states early.
- Separate concerns:
  - image samples -> classified facelets
  - facelets -> puzzle model state
  - puzzle model state -> solver
  - solver moves -> playback states

### 6. Random Scramble and AI Solve Should Use Legal States Only

The successful 2x2 path uses `randomScrambleForEvent('222')` through the cubing.js adapter. That guarantees a legal state before solving.

Avoid this for 4x4:

- Generate scrambles through cubing.js event/puzzle APIs where available.
- Do not randomize stickers manually.
- Always verify generated solution states with `isSolved`.
- If 4x4 solve support has restrictions, expose that clearly in the adapter instead of hiding failure in UI.

### 7. Tests Passed, But Visual QA Still Mattered

Unit tests caught route and UI regressions, but they did not prove that the 3D cube looked physically correct.

For 2x2, visual bugs included:

- sticker flashing
- layer rotation without stable cubie colors
- UI inconsistency with 3x3
- button clicks showing placeholder text

Avoid this for 4x4:

- Keep unit tests for route, controls, and solver output.
- Add targeted checks for adapter conversion.
- Use browser QA for visual behavior:
  - load the route
  - click `Random Scramble`
  - click `AI Solve`
  - step through at least `R`, `U`, `F`
  - verify cubies/layers rotate as physical pieces
  - verify no color changes during rotation
  - verify the move route updates with the current step

## Recommended 4x4 Implementation Plan

Use this sequence instead of jumping straight to a full UI:

1. Create a `444` puzzle adapter using cubing.js and verify:
   - init
   - solved state
   - random legal scramble
   - apply one move
   - solve, if available
   - solved verification

2. Define the 4x4 state/render mapping:
   - inspect `KPuzzle` or puzzle geometry
   - document orbit names and piece ordering
   - create one mapping table used by renderer and scanner conversion

3. Implement 4x4 3D renderer:
   - render physical cubies, not sticker-only surfaces
   - support face turns first
   - add wide/slice moves only after face turns are verified
   - keep colors attached to cubies during rotation

4. Reuse the 3x3/2x2 page workflow:
   - same control locations
   - same solve dock
   - same route and playback behavior
   - same status strip pattern

5. Add scanner only after state mapping is stable:
   - `gridSize={4}`
   - no center-based 3x3 calibration assumption
   - color-count validation: 16 stickers per color
   - model-level validation before enabling solve

6. Validate with a strict move checklist:
   - `R`, `U`, `F`
   - `R2`, `U2`, `F2`
   - `Rw`, `Uw`, `Fw` if supported
   - inverse moves
   - random scramble then AI solve
   - playback forward and backward

## Engineering Rules for Future Puzzle Modes

- Reuse UI flow, not puzzle internals.
- Verify solver state representation before writing renderer code.
- Keep one canonical orbit/piece mapping table per puzzle.
- Never animate by swapping colors during a turn.
- Treat scanner calibration as puzzle-specific.
- Prefer legal random scrambles from the solver library.
- Always verify the generated solution end state.
- Keep placeholder copy out of finished buttons.
- Add route-level UI parity tests early.
- Run both code tests and browser visual QA before calling a mode complete.

## Quick Pre-Implementation Checklist for 4x4

Before coding 4x4, answer these:

- What is the cubing.js puzzle id and event id?
- What exact state type does the solver accept?
- What are the orbit names, piece counts, and orientation rules?
- Which moves must be supported in playback?
- Which moves are face turns, wide turns, or slice turns?
- How will scanned 4x4 facelets become solver state?
- How will color calibration work without 3x3-style centers?
- What UI must stay identical to 3x3 and 2x2?
- What tests prove the adapter is correct?
- What browser steps prove animation is physical, not sticker swapping?

