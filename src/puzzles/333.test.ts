import { beforeAll, describe, expect, it } from 'vitest'
import { cube333Adapter } from './333'

describe('cube333Adapter', () => {
  beforeAll(async () => {
    await cube333Adapter.init()
  }, 20_000)

  it('wraps the existing 3x3 solver without changing solved-state behavior', async () => {
    const solved = cube333Adapter.solvedState()
    expect(cube333Adapter.validate(solved)).toEqual({ ok: true })
    expect(await cube333Adapter.isSolved(solved)).toBe(true)
    expect(await cube333Adapter.solve(solved)).toEqual([])
  })

  it('solves and verifies a generated 3x3 state through the adapter boundary', async () => {
    const scrambled = await cube333Adapter.randomState()
    expect(cube333Adapter.validate(scrambled)).toEqual({ ok: true })
    expect(cube333Adapter.isReachable(scrambled)).toBe(true)

    const moves = await cube333Adapter.solve(scrambled)
    const finalState = await cube333Adapter.applyMoves(scrambled, moves)

    expect(moves.length).toBeLessThanOrEqual(22)
    expect(await cube333Adapter.isSolved(finalState)).toBe(true)
  }, 30_000)
})
