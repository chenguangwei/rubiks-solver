import { beforeAll, describe, expect, it } from 'vitest'
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
})
