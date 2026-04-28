# Usability Baseline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the current review findings and establish a simpler, more reliable path from cube input to solution playback.

**Architecture:** Keep the existing React/Vite/cubejs architecture. First restore the quality baseline by fixing storage access, lint violations, and theme mismatch; then improve the human workflow in small, testable UI changes: accessible sticker editing, automatic fast solve after successful input, and an honest guided camera-capture entry point that does not pretend a single photo can recover all 54 stickers.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest, Testing Library, cubejs, three.js/react-three-fiber, plain CSS.

---

### Task 1: Safe Local Storage Access

**Files:**
- Modify: `src/App.tsx:41-48`
- Modify: `src/App.tsx:333-338`
- Test: `src/App.test.tsx`

**Step 1: Run the existing failing test**

Run:

```bash
npm test -- --run src/App.test.tsx
```

Expected: FAIL with `TypeError: localStorage.getItem is not a function`.

**Step 2: Add safe storage helpers**

In `src/App.tsx`, replace `readNumber` with helper functions that only use `window.localStorage` when the Storage API is present:

```ts
function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    const storage = window.localStorage
    if (
      typeof storage?.getItem !== 'function' ||
      typeof storage?.setItem !== 'function'
    ) {
      return null
    }
    return storage
  } catch {
    return null
  }
}

function readNumber(key: string): number {
  const raw = getLocalStorage()?.getItem(key) ?? null
  const n = raw ? parseInt(raw, 10) : 0
  return Number.isFinite(n) ? n : 0
}

function writeNumber(key: string, value: number) {
  getLocalStorage()?.setItem(key, String(value))
}
```

**Step 3: Use the write helper**

In `bumpSavedTotals`, replace direct `localStorage.setItem` calls with:

```ts
writeNumber(LS_MOVES_SAVED, newSaved)
writeNumber(LS_TIGHT_COUNT, newCount)
```

**Step 4: Verify the App test passes**

Run:

```bash
npm test -- --run src/App.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "fix: guard local storage access"
```

### Task 2: Restore Lint Baseline

**Files:**
- Modify: `src/App.tsx:216-227`
- Modify: `src/Cube3D.tsx:174-192`
- Modify: `src/parser.ts:246`
- Test: `npm run lint`

**Step 1: Run lint to verify the current failures**

Run:

```bash
npm run lint
```

Expected: FAIL with `react-hooks/set-state-in-effect` in `src/App.tsx` and `src/Cube3D.tsx`, plus `prefer-const` in `src/parser.ts`.

**Step 2: Refactor auto-play completion**

In `src/App.tsx`, change the auto-play effect so it does not call `setAutoPlay(false)` directly in the effect body:

```ts
useEffect(() => {
  if (!autoPlay || !moves || stepIndex >= moves.length) return
  const id = window.setTimeout(() => {
    const nextStep = Math.min(moves.length, stepIndex + 1)
    setStepIndex(nextStep)
    if (nextStep >= moves.length) setAutoPlay(false)
  }, SPEED_MS[playSpeed])
  return () => window.clearTimeout(id)
}, [autoPlay, stepIndex, moves, playSpeed])
```

**Step 3: Defer 3D animation synchronization**

In `src/Cube3D.tsx`, keep the effect as synchronization with the external animation frame, but schedule the state updates through `requestAnimationFrame`:

```ts
useEffect(() => {
  if (state === rendered) return
  if (turn) return
  const frame = window.requestAnimationFrame(() => {
    const move = detectSingleMove(rendered, state)
    const parsed = move ? parseMove(move) : null
    if (parsed) {
      setTurn({
        face: parsed.face,
        turns: parsed.turns,
        startState: rendered,
        endState: state,
        durationMs: parsed.turns === 2 ? 380 : 240,
      })
      setStartedAt(performance.now())
    } else {
      setRendered(state)
    }
  })
  return () => window.cancelAnimationFrame(frame)
}, [state, rendered, turn])
```

**Step 4: Fix the parser const warning**

In `src/parser.ts`, change:

```ts
let stateChars: string[] = new Array(54)
```

to:

```ts
const stateChars: string[] = new Array(54)
```

**Step 5: Verify lint passes**

Run:

```bash
npm run lint
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/App.tsx src/Cube3D.tsx src/parser.ts
git commit -m "fix: restore lint baseline"
```

### Task 3: Explicit Light Theme Baseline

**Files:**
- Modify: `src/index.css:1-13`
- Test: `npm run build`

**Step 1: Check the current visual mismatch**

Run the app:

```bash
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/rubiks-solver/` in a browser using dark system appearance.

Expected: The body can render black while the app controls and panels are styled as a light UI.

**Step 2: Pin the page to the light color scheme**

In `src/index.css`, replace the root/body styles with:

```css
:root {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.5;
  color-scheme: light;
  color: #1f2328;
  background: #ffffff;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  background: #ffffff;
  color: #1f2328;
}

* {
  box-sizing: border-box;
}
```

**Step 3: Verify build still passes**

Run:

```bash
npm run build
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/index.css
git commit -m "fix: pin app to light theme"
```

### Task 4: Keyboard-Friendly Sticker Editing

**Files:**
- Modify: `src/CubeNet.tsx`
- Modify: `src/CubeNet.test.tsx`
- Optionally modify: `src/App.tsx`

**Step 1: Write a failing keyboard interaction test**

Add a test in `src/CubeNet.test.tsx`:

```tsx
it('lets keyboard users change editable stickers', () => {
  const onChange = vi.fn()
  render(<CubeNet state={SOLVED_STATE} editable onChange={onChange} />)
  const firstSticker = screen.getByRole('button', { name: 'U1: U' })
  firstSticker.focus()
  fireEvent.keyDown(firstSticker, { key: 'Enter' })
  expect(onChange).toHaveBeenCalledWith(0, 'R')
})
```

Expected: FAIL because stickers are not exposed as buttons.

**Step 2: Add semantic sticker controls**

Wrap each sticker in an SVG group with `role="button"` and `tabIndex={0}` when editable. Support `Enter` and `Space`:

```tsx
function handleKeyDown(e: React.KeyboardEvent<SVGGElement>, index: number) {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  handleClick(index)
}
```

The accessible name must stay stable as `${p.face}${p.facePos + 1}: ${face}`.

**Step 3: Verify targeted test passes**

Run:

```bash
npm test -- --run src/CubeNet.test.tsx
```

Expected: PASS.

**Step 4: Verify full test suite**

Run:

```bash
npm test -- --run
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/CubeNet.tsx src/CubeNet.test.tsx
git commit -m "feat: support keyboard sticker editing"
```

### Task 5: Automatic Fast Solve After Valid Image Import

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Step 1: Add a test for automatic solve after image parsing**

Mock `loadImageToBuffer`, `parseNet`, and `solve` so a synthetic image import returns a valid scrambled state, then assert the solution appears without clicking Solve.

Expected: FAIL because import currently only updates the cube state.

**Step 2: Extract a state-based fast solve helper**

Create an internal helper in `App`:

```ts
async function solveFastForState(requestState: string) {
  setSolveError(null)
  setMoves(null)
  setSolveMode(null)
  setTightInfo(null)
  setStepIndex(0)
  setAutoPlay(false)
  setSolveBusy('fast')
  try {
    const result = await solve(requestState)
    if (stateRef.current !== requestState) return
    setMoves(result)
    setSolveMode('fast')
  } catch (err) {
    if (stateRef.current !== requestState) return
    const message = err instanceof Error ? err.message : String(err)
    if (message !== 'Solver cancelled') setSolveError({ message })
  } finally {
    setSolveBusy(null)
  }
}
```

Make `handleSolveFast` call `solveFastForState(state)`.

**Step 3: Trigger auto solve after successful file parsing**

After `setStateAndClearMoves(result.state)`, call a new helper that commits the parsed state and then invokes `solveFastForState(result.state)` when validation succeeds and the solver is ready. If the solver is still initializing, show the normal Solve button instead of queueing hidden work.

**Step 4: Verify targeted test passes**

Run:

```bash
npm test -- --run src/App.test.tsx
```

Expected: PASS.

**Step 5: Verify full suite**

Run:

```bash
npm test -- --run
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: auto solve parsed cube states"
```

### Task 6: Honest Camera Capture Entry Point

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Modify: `README.md`

**Step 1: Add product copy constraints**

Do not claim single-photo solving. The UI must say six-face capture is required for real cubes because one photo cannot see all stickers.

**Step 2: Add a camera-capable file input**

Use the existing file input but expose a primary label such as `Import net image`; add a secondary `Use camera` control only when it opens the same image picker with `capture="environment"` and explanatory copy.

**Step 3: Add README roadmap detail**

Update the real-camera roadmap section to specify:

- six guided face captures
- perspective correction per face
- center-color calibration
- low-confidence sticker review
- automatic solve after valid reconstruction

**Step 4: Verify build**

Run:

```bash
npm run build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/App.tsx src/App.css README.md
git commit -m "docs: clarify camera capture path"
```

### Task 7: Final Verification

**Files:**
- No source changes unless verification finds defects.

**Step 1: Run all checks**

Run:

```bash
npm run lint
npm test -- --run
npm run build
```

Expected: all PASS. Build may still warn about chunk size until a separate 3D lazy-loading task is implemented.

**Step 2: Manual browser smoke test**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/rubiks-solver/` and verify:

- page is light themed even under dark system appearance
- Random scramble enables solving
- Solve produces a move list
- keyboard focus can reach editable stickers before solving
- Enter or Space changes a focused sticker

**Step 3: Commit any verification fixes**

If manual QA requires changes:

```bash
git add <changed-files>
git commit -m "fix: address usability QA"
```

Otherwise do not create an empty commit.
