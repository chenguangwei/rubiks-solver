# RubikSolver Product PRD Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the PRD-defined RubikSolver product experience: Scan, Solve, Steps, Challenge, Replay, and Profile, using the provided visual references as the product UI target.

**Architecture:** Keep the current Vite + React single-page app and reuse the existing cube state, image import, Kociemba solver worker, editable net, and Three.js cube. Add product-level state in `App.tsx` for navigation, guided capture, solve coaching, learning content, challenges, replay history, achievements, and local analytics; keep persistence in `localStorage` to avoid introducing backend scope before APIs exist. Style the app as a responsive product workspace in `App.css`, with the three provided designs mapped to Scan, Steps/net coaching, and Solve/3D coaching states.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest, Testing Library, cubejs, three.js/react-three-fiber, plain CSS, browser `localStorage`.

---

### Task 1: Product IA And Navigation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Test: `src/App.test.tsx`

**Step 1: Write the failing test**

Add assertions that the app renders all PRD navigation destinations and switches to Challenge:

```ts
it('renders the full product navigation and switches pages', () => {
  render(<App />)
  expect(screen.getByRole('button', { name: /Scan/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Solve/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Steps/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Challenge/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Replay/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Profile/i })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /Challenge/i }))
  expect(screen.getByRole('heading', { name: /Challenge/i })).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/App.test.tsx`

Expected: FAIL because Challenge, Replay, and Profile navigation are not implemented.

**Step 3: Implement navigation**

In `src/App.tsx`, expand `WorkspaceTab` to:

```ts
type WorkspaceTab = 'scan' | 'solve' | 'steps' | 'challenge' | 'replay' | 'profile'
```

Render six product tabs in the header. Scan/Solve/Steps keep the three-column workspace; Challenge/Replay/Profile render dedicated full-width product panels.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/App.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/App.tsx src/App.css src/App.test.tsx
git commit -m "feat: add product navigation"
```

### Task 2: Scan Flow Completion

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Test: `src/App.test.tsx`

**Step 1: Write the failing test**

Add a test for guided six-face capture state and repair suggestions:

```ts
it('tracks guided face capture and exposes repair suggestions for invalid states', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: /Capture U/i }))
  expect(screen.getByText(/1 of 6 faces captured/i)).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /F Green/i }))
  const sticker = document.querySelector('rect[data-index="0"]')!
  fireEvent.click(sticker)
  expect(screen.getByRole('button', { name: /Apply Repair Suggestion/i })).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/App.test.tsx`

Expected: FAIL because capture progress and repair suggestions are absent.

**Step 3: Implement scan features**

Add local state:

```ts
const [capturedFaces, setCapturedFaces] = useState<Face[]>([])
```

Add helpers:

```ts
function markFaceCaptured(face: Face) {
  setCapturedFaces((faces) => faces.includes(face) ? faces : [...faces, face])
}

function repairColorCounts(input: string): string {
  const chars = input.split('') as Face[]
  const counts = Object.fromEntries(FACES.map((face) => [face, 0])) as Record<Face, number>
  chars.forEach((face) => counts[face]++)
  const missing = FACES.flatMap((face) => Array(Math.max(0, 9 - counts[face])).fill(face)) as Face[]
  const over = new Set(FACES.filter((face) => counts[face] > 9))
  for (let i = 0; i < chars.length && missing.length; i++) {
    if (over.has(chars[i])) {
      counts[chars[i]]--
      chars[i] = missing.shift()!
    }
  }
  return chars.join('')
}
```

Render per-face capture buttons, captured count, invalid-state repair message, and `Apply Repair Suggestion`.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/App.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/App.tsx src/App.css src/App.test.tsx
git commit -m "feat: complete scan workflow"
```

### Task 3: Solve Coaching System

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Test: `src/App.test.tsx`

**Step 1: Write the failing test**

Add a test for manual operations, solve stats, and completion feedback:

```ts
it('supports solve controls and records manual moves', async () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: /^Solve$/i }))
  expect(await screen.findByText(/Current Algorithm/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^U$/i }))
  expect(screen.getByText(/Manual moves: 1/i)).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/App.test.tsx`

Expected: FAIL because manual operation controls and stats are incomplete.

**Step 3: Implement solve coaching**

Add solve-side state:

```ts
const [manualMoves, setManualMoves] = useState<string[]>([])
const [solveStartedAt, setSolveStartedAt] = useState<number | null>(null)
const [solveFinishedAt, setSolveFinishedAt] = useState<number | null>(null)
const [feedback, setFeedback] = useState<'correct' | 'error' | 'repairable' | null>(null)
```

Add `handleManualMove(move: string)` that applies `applyMoves(state, move)`, records the move, sets feedback, and clears generated solution state.

Render:
- Stage nav Cross/F2L/OLL/PLL with done/current/locked states
- Operation controls U/D/L/R/F/B plus prime/180 options
- Auto-play and speed controls using existing playback state
- Timer, move count, error count placeholder, achievement cards
- Green/red/repairable feedback card

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/App.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/App.tsx src/App.css src/App.test.tsx
git commit -m "feat: add solve coaching controls"
```

### Task 4: Steps Learning System

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Test: `src/App.test.tsx`

**Step 1: Write the failing test**

Add a test for stage tabs, sub-tabs, and case practice:

```ts
it('renders learning stages, cases, moves, and practice entry', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: /Steps/i }))
  expect(screen.getByRole('button', { name: /Cross/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Cases/i })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Cases/i }))
  expect(screen.getByText(/F2L_01/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Practice Case/i }))
  expect(screen.getByText(/Case practice started/i)).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/App.test.tsx`

Expected: FAIL because structured learning content is absent.

**Step 3: Implement learning content**

Add static local data:

```ts
const LEARNING_CASES = [
  { case_id: 'F2L_01', stage: 'F2L', pattern: 'corner-edge pair in top layer', moves: ['U', 'R', "U'"], difficulty: 2 },
  { case_id: 'OLL_01', stage: 'OLL', pattern: 'top cross missing', moves: ['F', 'R', 'U', "R'", "U'", "F'"], difficulty: 3 },
]
```

Render stage tabs `Cross | F2L | OLL | PLL`, sub-tabs `Overview | Cases | Moves | Tips`, case cards, animation preview using `Cube3D`, and a `Practice Case` button that switches to Challenge Random mode or records a local practice-started message.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/App.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/App.tsx src/App.css src/App.test.tsx
git commit -m "feat: add steps learning system"
```

### Task 5: Challenge, Replay, And Profile

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Test: `src/App.test.tsx`

**Step 1: Write the failing test**

Add tests for Challenge modes, Replay history, and Profile achievements:

```ts
it('renders challenge, replay, and profile product areas', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: /Challenge/i }))
  expect(screen.getByRole('button', { name: /Speed/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /No Hint/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Daily/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Random/i })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /Replay/i }))
  expect(screen.getByText(/Compare with optimal/i)).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /Profile/i }))
  expect(screen.getByText(/Achievements/i)).toBeInTheDocument()
  expect(screen.getByText(/Mastery/i)).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/App.test.tsx`

Expected: FAIL because those pages are incomplete.

**Step 3: Implement local product areas**

Render:
- Challenge modes: Speed, No Hint, Daily, Random
- Local leaderboard and PB cards from local sample data
- Replay timeline using generated/manual moves, optimal move count, and error-position placeholders
- Profile achievements, history, mastery bars, settings controls
- Analytics tiles for solve completion, step dwell, error count, and challenge participation

Persist simple records in localStorage keys:

```ts
rubiks-solver:product-history
rubiks-solver:product-achievements
rubiks-solver:product-challenge-pb
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/App.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/App.tsx src/App.css src/App.test.tsx
git commit -m "feat: add challenge replay profile"
```

### Task 6: Responsive Polish And Verification

**Files:**
- Modify: `src/App.css`
- Test: `src/App.test.tsx`

**Step 1: Run full tests**

Run:

```bash
npm test -- --run
```

Expected: PASS.

**Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: PASS, with only the existing Vite chunk-size warning allowed.

**Step 3: Verify browser UI**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Open:

```text
http://127.0.0.1:5173/rubiks-solver/
```

Check:
- Desktop: Scan resembles image 1, Steps resembles image 2, Solve resembles image 3.
- Mobile: header, tabs, phase rail, panels, cube net, and 3D preview do not overlap.
- Core path: Scan → Solve → Steps → Challenge → Replay → Profile works.

**Step 4: Commit**

```bash
git add src/App.tsx src/App.css src/App.test.tsx docs/plans/2026-04-28-rubiksolver-product-prd.md
git commit -m "feat: implement rubiksolver product prd"
```
