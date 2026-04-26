import Cube from 'cubejs'
import { canonicalizeOrientation } from './cube'

export type Move = string

let initialized = false
let initPromise: Promise<void> | null = null

export class UnsolvableCubeError extends Error {
  constructor() {
    super(
      "This cube state isn't reachable by twisting a real Rubik's cube — " +
        'the corners, edges, or centers are in a configuration no sequence ' +
        'of face rotations can produce. Click any sticker to fix it, or use ' +
        'Random scramble for a guaranteed-solvable state.',
    )
    this.name = 'UnsolvableCubeError'
  }
}

export function initSolverCore(): Promise<void> {
  if (initialized) return Promise.resolve()
  if (initPromise) return initPromise
  initPromise = new Promise<void>((resolve) => {
    queueMicrotask(() => {
      Cube.initSolver()
      initialized = true
      resolve()
    })
  })
  return initPromise
}

export function isSolverCoreReady(): boolean {
  return initialized
}

/**
 * Solve a canonicalized state, optionally with a max-depth bound. Throws
 * UnsolvableCubeError if the state isn't reachable from a real cube — caught
 * by either the round-trip check or the post-solve verification.
 *
 * cubejs's solve() returns the FIRST solution found within the bound, not
 * the optimal one. Pass a tighter maxDepth to ask for a shorter solution
 * (and accept it may take much longer / throw if no such solution exists).
 */
function solveCanonical(canonical: string, maxDepth?: number): Move[] {
  const cube = Cube.fromString(canonical)
  if (cube.asString() !== canonical) throw new UnsolvableCubeError()
  const algorithm = maxDepth !== undefined ? cube.solve(maxDepth) : cube.solve()
  const verifyCube = Cube.fromString(canonical)
  if (algorithm.trim().length > 0) verifyCube.move(algorithm)
  if (!verifyCube.isSolved()) throw new UnsolvableCubeError()
  return algorithm.split(' ').filter(Boolean)
}

export function solveFastSync(state: string): Move[] {
  if (!initialized) throw new Error('Solver not initialized — call initSolverCore() first')
  return solveCanonical(canonicalizeOrientation(state))
}

export type TightSolvePhase = 'baseline' | 'tightening' | 'done'
export type TightSolveProgress = { moves: Move[]; phase: TightSolvePhase }

export type TightSolveOptions = {
  /** Total time budget in ms. Default 6000. Individual cubejs.solve() calls
   * can't be preempted, so we MAY exceed this if a single call blows
   * through it; the App layer enforces a hard timeout via worker
   * termination. Once the soft deadline is exceeded, no further attempts
   * are made. */
  deadlineMs?: number
  /** Floor on how tight to try. Defaults to 20 (God's Number) — solve()
   * calls below 20 are usually 30s–10min, which isn't worth the wait
   * for the 0–1 move improvement. */
  minDepth?: number
  /** Called whenever a tighter solution is found. */
  onProgress?: (progress: TightSolveProgress) => void
}

/**
 * Iteratively tighten a Kociemba solution. Starts from the default-depth
 * baseline, then tries solve(state, baseline-1), solve(state, baseline-2),
 * ... until the budget runs out, the floor is hit, or cubejs throws (no
 * solution at that depth -> baseline is locally optimal).
 */
export function solveTightSync(state: string, options: TightSolveOptions = {}): Move[] {
  if (!initialized) throw new Error('Solver not initialized — call initSolverCore() first')
  const deadline = options.deadlineMs ?? 6000
  const minDepth = options.minDepth ?? 20
  const onProgress = options.onProgress ?? (() => {})

  const canonical = canonicalizeOrientation(state)
  const baseline = solveCanonical(canonical)
  let best = baseline
  onProgress({ moves: best, phase: 'baseline' })

  const start = performance.now()
  for (let limit = best.length - 1; limit >= minDepth; limit--) {
    if (performance.now() - start >= deadline) break
    try {
      const sol = solveCanonical(canonical, limit)
      if (sol.length < best.length) {
        best = sol
        onProgress({ moves: best, phase: 'tightening' })
      }
      if (best.length <= minDepth) break // hit the floor — no further improvement possible
    } catch {
      // No solution at this depth -> we've proven this length is locally optimal.
      break
    }
  }
  onProgress({ moves: best, phase: 'done' })
  return best
}

// Sync utility wrappers — main thread can call these directly, no init needed.

export function applyMoves(state: string, moves: Move[] | string): string {
  const cube = Cube.fromString(state)
  const algorithm = Array.isArray(moves) ? moves.join(' ') : moves
  if (algorithm.trim().length > 0) cube.move(algorithm)
  return cube.asString()
}

export function solvedState(): string {
  return new Cube().asString()
}

export function isSolved(state: string): boolean {
  return Cube.fromString(state).isSolved()
}

export function randomState(): string {
  return Cube.random().asString()
}
