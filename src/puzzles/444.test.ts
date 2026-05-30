import { beforeAll, describe, expect, it } from 'vitest'
import {
  cube444Adapter,
  invert444Moves,
  parse444Move,
  SOLVED_444_STATE,
} from './444'

describe('cube444Adapter', () => {
  beforeAll(async () => {
    await cube444Adapter.init()
  }, 20_000)

  it('validates the solved 4x4 facelet state', async () => {
    expect(cube444Adapter.solvedState()).toBe(SOLVED_444_STATE)
    expect(cube444Adapter.validate(SOLVED_444_STATE)).toEqual({ ok: true })
    expect(await cube444Adapter.isSolved(SOLVED_444_STATE)).toBe(true)
  })

  it('parses face, inverse, double, and wide 4x4 moves', () => {
    expect(parse444Move('R')).toMatchObject({ face: 'R', turns: 1, wide: false })
    expect(parse444Move("Uw'")).toMatchObject({ face: 'U', turns: -1, wide: true })
    expect(parse444Move('Fw2')).toMatchObject({ face: 'F', turns: 2, wide: true })
    expect(parse444Move('2R')).toBeNull()
  })

  it('applies generated legal scrambles and verifies their inverse route', async () => {
    const { state, scrambleMoves } = await cube444Adapter.randomStateWithScramble()
    expect(cube444Adapter.validate(state)).toEqual({ ok: true })
    expect(await cube444Adapter.isSolved(state)).toBe(false)

    const solution = invert444Moves(scrambleMoves)
    const finalState = await cube444Adapter.applyMoves(state, solution)

    expect(solution.length).toBeGreaterThan(0)
    expect(await cube444Adapter.isSolved(finalState)).toBe(true)
  }, 30_000)

  it('keeps manual moves reversible for AI playback history', async () => {
    const scrambled = await cube444Adapter.applyMoves(SOLVED_444_STATE, ['R', 'Uw', "F'"])
    const finalState = await cube444Adapter.applyMoves(scrambled, invert444Moves(['R', 'Uw', "F'"]))

    expect(await cube444Adapter.isSolved(scrambled)).toBe(false)
    expect(await cube444Adapter.isSolved(finalState)).toBe(true)
  })
})
