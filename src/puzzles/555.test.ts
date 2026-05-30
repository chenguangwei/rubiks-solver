import { beforeAll, describe, expect, it } from 'vitest'
import { invertMoves } from './alg'
import { cube555Adapter } from './555'

describe('cube555Adapter', () => {
  beforeAll(async () => {
    await cube555Adapter.init()
  }, 20_000)

  it('reports its solved pattern as solved', async () => {
    const solved = cube555Adapter.solvedState()

    expect(cube555Adapter.validate(solved)).toEqual({ ok: true })
    expect(await cube555Adapter.isSolved(solved)).toBe(true)
    expect(await cube555Adapter.solve(solved)).toEqual([])
  })

  it('generates legal 5x5 scrambles and verifies inverse playback', async () => {
    const { state, scrambleMoves } = await cube555Adapter.randomStateWithScramble()

    expect(cube555Adapter.validate(state)).toEqual({ ok: true })
    expect(await cube555Adapter.isSolved(state)).toBe(false)

    const solution = invertMoves(scrambleMoves)
    const finalState = await cube555Adapter.applyMoves(state, solution)

    expect(solution.length).toBeGreaterThan(0)
    expect(await cube555Adapter.isSolved(finalState)).toBe(true)
  }, 30_000)

  it('does not claim arbitrary 5x5 solving without known history', async () => {
    const state = await cube555Adapter.applyMoves(cube555Adapter.solvedState(), 'U')

    await expect(cube555Adapter.solve(state)).rejects.toThrow(/known scramble history/i)
  })
})
