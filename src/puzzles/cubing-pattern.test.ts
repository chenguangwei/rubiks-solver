import { beforeAll, describe, expect, it } from 'vitest'
import { setSearchDebug } from 'cubing/search'
import { cube222Adapter } from './222'
import { pyraminxAdapter } from './pyraminx'
import { skewbAdapter } from './skewb'
import type { CubingPatternAdapter } from './cubingPattern'

const adapters: CubingPatternAdapter[] = [
  cube222Adapter,
  pyraminxAdapter,
  skewbAdapter,
]

describe('cubing pattern puzzle adapters', () => {
  beforeAll(async () => {
    setSearchDebug({ logPerf: false })
    await Promise.all(adapters.map((adapter) => adapter.init()))
  }, 20_000)

  for (const adapter of adapters) {
    it(`${adapter.id} reports its solved state as solved`, async () => {
      const solved = adapter.solvedState()

      expect(adapter.validate(solved)).toEqual({ ok: true })
      expect(await adapter.isSolved(solved)).toBe(true)
      expect(await adapter.solve(solved)).toEqual([])
    })

    it(`${adapter.id} solves and verifies generated scrambles`, async () => {
      for (let i = 0; i < 5; i++) {
        const scrambled = await adapter.randomState()
        expect(adapter.validate(scrambled)).toEqual({ ok: true })
        expect(await adapter.isSolved(scrambled)).toBe(false)

        const moves = await adapter.solve(scrambled)
        const finalState = await adapter.applyMoves(scrambled, moves)

        expect(moves.length).toBeGreaterThan(0)
        expect(await adapter.isSolved(finalState)).toBe(true)
      }
    }, 30_000)

    it(`${adapter.id} rejects malformed pattern data`, () => {
      const solved = adapter.solvedState()
      const [firstOrbitName, firstOrbit] = Object.entries(solved.patternData)[0]
      const malformed = {
        puzzleId: adapter.id,
        patternData: {
          ...solved.patternData,
          [firstOrbitName]: {
            ...firstOrbit,
            pieces: firstOrbit.pieces.slice(1),
          },
        },
      }

      expect(adapter.validate(malformed)).toMatchObject({ ok: false })
      expect(adapter.isReachable(malformed)).toBe(false)
    })
  }
})
