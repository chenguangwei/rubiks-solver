import { beforeAll, describe, expect, it } from 'vitest'
import { invert555Moves, cube555HistoryAdapter, SOLVED_555_STATE, validate555State } from './555-cube'

describe('cube555HistoryAdapter', () => {
  beforeAll(async () => {
    await cube555HistoryAdapter.init()
  }, 20_000)

  it('validates solved state', () => {
    expect(validate555State(SOLVED_555_STATE)).toEqual({ ok: true })
  })

  it('generates legal 5x5 scrambles and verifies inverse playback', async () => {
    const { state, scrambleMoves } = await cube555HistoryAdapter.randomStateWithScramble()

    expect(cube555HistoryAdapter.validate(state)).toEqual({ ok: true })
    expect(await cube555HistoryAdapter.isSolved(state)).toBe(false)

    const solution = invert555Moves(scrambleMoves)
    const finalState = await cube555HistoryAdapter.applyMoves(state, solution)

    expect(solution.length).toBeGreaterThan(0)
    expect(await cube555HistoryAdapter.isSolved(finalState)).toBe(true)
  }, 30_000)
})

