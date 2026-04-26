import { beforeAll, describe, expect, it } from 'vitest'
import { CENTER_INDICES, FACES, SOLVED_STATE } from './cube'
import {
  applyMoves,
  initSolver,
  isSolved,
  randomState,
  solve,
  solvedState,
} from './solver'

describe('solver', () => {
  beforeAll(async () => {
    await initSolver()
  }, 20_000)

  it('reports the solved cube as solved', () => {
    expect(isSolved(solvedState())).toBe(true)
  })

  it('solves a single-move scramble', () => {
    const scrambled = applyMoves(solvedState(), 'R')
    const moves = solve(scrambled)
    expect(applyMoves(scrambled, moves)).toBe(solvedState())
  })

  it('round-trips 50 random scrambles', () => {
    for (let i = 0; i < 50; i++) {
      const scrambled = randomState()
      const moves = solve(scrambled)
      expect(moves.length).toBeLessThanOrEqual(22)
      expect(applyMoves(scrambled, moves)).toBe(solvedState())
    }
  }, 60_000)

  it('solves a scrambled cube with a non-canonical orientation', () => {
    // Take a real scramble, then swap U<->D and F<->B labels (a 180° rotation
    // around the L-R axis). Result is a cube the user might upload from a
    // photo where they happened to hold it yellow-on-top. solve() should
    // produce moves that, applied to the rotated state, yield a uniformly
    // colored (rotated-solved) cube.
    const scrambled = randomState()
    const swap: Record<string, string> = { U: 'D', D: 'U', F: 'B', B: 'F', L: 'L', R: 'R' }
    const rotated = [...scrambled].map((c) => swap[c]).join('')
    const moves = solve(rotated)
    const finalState = applyMoves(rotated, moves)
    // Each face has 9 of one letter (uniform color), even if the centers
    // aren't at canonical positions.
    for (const f of FACES) {
      const expected = finalState[CENTER_INDICES[f]]
      const faceStart = SOLVED_STATE.indexOf(f) // canonical position of this face
      for (let i = 0; i < 9; i++) {
        expect(finalState[faceStart + i]).toBe(expected)
      }
    }
  })
})
