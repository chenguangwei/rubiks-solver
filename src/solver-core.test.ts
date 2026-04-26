import { beforeAll, describe, expect, it } from 'vitest'
import { CENTER_INDICES, FACES, SOLVED_STATE } from './cube'
import {
  UnsolvableCubeError,
  applyMoves,
  initSolverCore,
  isSolved,
  randomState,
  solveFastSync,
  solveTightSync,
  solvedState,
} from './solver-core'

describe('solver-core', () => {
  beforeAll(async () => {
    await initSolverCore()
  }, 20_000)

  it('reports the solved cube as solved', () => {
    expect(isSolved(solvedState())).toBe(true)
  })

  it('returns no moves when the input is already solved', () => {
    expect(solveFastSync(SOLVED_STATE)).toEqual([])
  })

  it('returns no moves when a non-canonical solved orientation is the input', () => {
    // Cube rotated 180° around the L-R axis: U<->D and F<->B labels.
    // Each face is uniformly one color, just not the canonical scheme.
    const swap: Record<string, string> = { U: 'D', D: 'U', F: 'B', B: 'F', L: 'L', R: 'R' }
    const rotatedSolved = [...SOLVED_STATE].map((c) => swap[c]).join('')
    expect(solveFastSync(rotatedSolved)).toEqual([])
  })

  it('tight mode also returns no moves on an already-solved cube', () => {
    expect(solveTightSync(SOLVED_STATE, { deadlineMs: 1000 })).toEqual([])
  })

  it('solves a single-move scramble', () => {
    const scrambled = applyMoves(solvedState(), 'R')
    const moves = solveFastSync(scrambled)
    expect(applyMoves(scrambled, moves)).toBe(solvedState())
  })

  it('round-trips 30 random scrambles', () => {
    for (let i = 0; i < 30; i++) {
      const scrambled = randomState()
      const moves = solveFastSync(scrambled)
      expect(moves.length).toBeLessThanOrEqual(22)
      expect(applyMoves(scrambled, moves)).toBe(solvedState())
    }
  }, 60_000)

  it('throws UnsolvableCubeError on a state with permuted centers', () => {
    const unreachable =
      'UUUURUUUU' +
      'RRRRFRRRR' +
      'FFFFDFFFF' +
      'DDDDLDDDD' +
      'LLLLBLLLL' +
      'BBBBUBBBB'
    expect(() => solveFastSync(unreachable)).toThrowError(UnsolvableCubeError)
  })

  it('throws UnsolvableCubeError on a single flipped edge', () => {
    const flipped =
      SOLVED_STATE.slice(0, 7) + 'F' + SOLVED_STATE.slice(8, 19) + 'U' + SOLVED_STATE.slice(20)
    expect(() => solveFastSync(flipped)).toThrowError(UnsolvableCubeError)
  })

  it('solves a scrambled cube with a non-canonical orientation', () => {
    const scrambled = randomState()
    const swap: Record<string, string> = { U: 'D', D: 'U', F: 'B', B: 'F', L: 'L', R: 'R' }
    const rotated = [...scrambled].map((c) => swap[c]).join('')
    const moves = solveFastSync(rotated)
    const finalState = applyMoves(rotated, moves)
    for (const f of FACES) {
      const expected = finalState[CENTER_INDICES[f]]
      const faceStart = SOLVED_STATE.indexOf(f)
      for (let i = 0; i < 9; i++) {
        expect(finalState[faceStart + i]).toBe(expected)
      }
    }
  })

  describe('solveTightSync', () => {
    it('returns the baseline if the budget is exhausted before any tightening', () => {
      const scrambled = randomState()
      // 0ms deadline -> never tightens, just returns baseline.
      const moves = solveTightSync(scrambled, { deadlineMs: 0 })
      expect(moves.length).toBeLessThanOrEqual(22)
      expect(applyMoves(scrambled, moves)).toBe(solvedState())
    })

    it('reports baseline progress and a final done event', () => {
      const scrambled = randomState()
      const phases: string[] = []
      solveTightSync(scrambled, {
        deadlineMs: 0,
        onProgress: (p) => phases.push(p.phase),
      })
      expect(phases[0]).toBe('baseline')
      expect(phases[phases.length - 1]).toBe('done')
    })

    it('with a generous budget, returns a solution at least as good as baseline', () => {
      const scrambled = randomState()
      const baseline = solveFastSync(scrambled)
      // Budget 4s -- typically enough to tighten 22->20 on a typical cube,
      // but the test only asserts <= baseline so it can't flake.
      const moves = solveTightSync(scrambled, { deadlineMs: 4000 })
      expect(moves.length).toBeLessThanOrEqual(baseline.length)
      expect(applyMoves(scrambled, moves)).toBe(solvedState())
    }, 10_000)

    it('rejects unsolvable states immediately', () => {
      const flipped =
        SOLVED_STATE.slice(0, 7) + 'F' + SOLVED_STATE.slice(8, 19) + 'U' + SOLVED_STATE.slice(20)
      expect(() => solveTightSync(flipped, { deadlineMs: 1000 })).toThrowError(UnsolvableCubeError)
    })
  })
})
