import Cube from 'cubejs'
import { canonicalizeOrientation } from './cube'

export type Move = string

let initialized = false
let initPromise: Promise<void> | null = null

export function initSolver(): Promise<void> {
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

export function isSolverReady(): boolean {
  return initialized
}

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

export function solve(state: string): Move[] {
  if (!initialized) {
    throw new Error('Solver not initialized — call initSolver() first')
  }
  // Kociemba targets a canonical "all U at U" solved state, so first relabel
  // the input letters so its centers are canonical. The output moves are in
  // notation that's relative to whatever orientation the user is holding the
  // cube in, so they apply directly without translation.
  const canonical = canonicalizeOrientation(state)
  const cube = Cube.fromString(canonical)
  // cubejs silently "fixes" parity violations and other unreachable cubie
  // configurations during fromString — a flipped single edge, twisted single
  // corner, or constructed states like permuted centers all get rewritten
  // into the closest reachable cube. If the round-trip changed any sticker,
  // the input wasn't a valid representation of a real cube.
  if (cube.asString() !== canonical) {
    throw new UnsolvableCubeError()
  }
  const algorithm = cube.solve()
  // Defense in depth: also verify the produced solution actually reaches the
  // identity. (Kociemba can return a best-effort approximation in pathological
  // cases not caught by the round-trip check.)
  const verifyCube = Cube.fromString(canonical)
  if (algorithm.trim().length > 0) verifyCube.move(algorithm)
  if (!verifyCube.isSolved()) {
    throw new UnsolvableCubeError()
  }
  return algorithm.split(' ').filter(Boolean)
}

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
