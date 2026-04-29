import { beforeAll, describe, expect, it } from 'vitest'
import { CENTER_INDICES, FACES, SOLVED_STATE } from './cube'
import {
  UnsolvableCubeError,
  applyMoves,
  initSolverCore,
  isReachableState,
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

  it('returns the optimal 1-move solution for a 1-move scramble (regression for #user-bug)', () => {
    // cubejs.solve() default returns 9 moves for a B'-away cube; the
    // short-probe should catch this as 1 move.
    const scrambled = applyMoves(solvedState(), "B'")
    const moves = solveFastSync(scrambled)
    expect(moves).toHaveLength(1)
    expect(applyMoves(scrambled, moves)).toBe(solvedState())
  })

  it('returns optimal solutions for 2-, 3-, and 4-move scrambles', () => {
    for (const scramble of ["B' U", "B' U R", "B' U R F"]) {
      const expectedLen = scramble.split(' ').filter(Boolean).length
      const scrambled = applyMoves(solvedState(), scramble)
      const moves = solveFastSync(scrambled)
      expect(moves.length).toBe(expectedLen)
      expect(applyMoves(scrambled, moves)).toBe(solvedState())
    }
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

  it('reports whether a balanced sticker layout is physically reachable', () => {
    const flipped =
      SOLVED_STATE.slice(0, 7) + 'F' + SOLVED_STATE.slice(8, 19) + 'U' + SOLVED_STATE.slice(20)
    expect(isReachableState(SOLVED_STATE)).toBe(true)
    expect(isReachableState(flipped)).toBe(false)
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

    // Note: we don't unit-test "tight mode actually tightens" -- whether
    // a cubejs.solve(N) call returns within any given budget depends on
    // the specific scramble + machine speed, and a hard cube on a slow CI
    // runner can spend 25+ seconds in a single un-preemptable call. The
    // tightening behaviour is verified manually in the dev preview; the
    // <= baseline property is tautologically guaranteed by the algorithm.

    it('rejects unsolvable states immediately', () => {
      const flipped =
        SOLVED_STATE.slice(0, 7) + 'F' + SOLVED_STATE.slice(8, 19) + 'U' + SOLVED_STATE.slice(20)
      expect(() => solveTightSync(flipped, { deadlineMs: 1000 })).toThrowError(UnsolvableCubeError)
    })
  })
})
