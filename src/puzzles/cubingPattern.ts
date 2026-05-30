import { KPattern } from 'cubing/kpuzzle'
import type { KPatternData, KPuzzle } from 'cubing/kpuzzle'
import { puzzles } from 'cubing/puzzles'
import { randomScrambleForEvent } from 'cubing/scramble'
import type { ValidationResult } from '../cube'
import { movesToArray, splitAlgorithm } from './alg'
import type { PuzzleId, PuzzleSolverAdapter } from './types'

type CubingAlg = {
  toString(): string
}

export type CubingPatternState = {
  puzzleId: PuzzleId
  patternData: KPatternData
}

export type CubingPatternAdapter = PuzzleSolverAdapter<CubingPatternState> & {
  randomStateWithScramble: () => Promise<{ state: CubingPatternState; scrambleMoves: string[] }>
}

type CubingPatternAdapterConfig = {
  id: PuzzleId
  puzzleLoaderId: string
  eventId: string
  solvePattern?: (pattern: KPattern) => Promise<CubingAlg>
  ignoreOrientationForOrbits?: readonly string[]
}

function clonePatternData(patternData: KPatternData): KPatternData {
  return JSON.parse(JSON.stringify(patternData)) as KPatternData
}

export function createCubingPatternAdapter(
  config: CubingPatternAdapterConfig,
): CubingPatternAdapter {
  let kpuzzlePromise: Promise<KPuzzle> | null = null
  let kpuzzle: KPuzzle | null = null
  const ignoredOrientationOrbits = new Set(config.ignoreOrientationForOrbits ?? [])

  function loadKPuzzle(): Promise<KPuzzle> {
    if (!kpuzzlePromise) {
      const loader = puzzles[config.puzzleLoaderId]
      if (!loader) throw new Error(`Unknown cubing puzzle: ${config.puzzleLoaderId}`)
      kpuzzlePromise = loader.kpuzzle().then((loaded) => {
        kpuzzle = loaded
        return loaded
      })
    }
    return kpuzzlePromise
  }

  function requireLoadedKPuzzle(): KPuzzle {
    if (!kpuzzle) throw new Error(`Puzzle ${config.id} is not initialized`)
    return kpuzzle
  }

  function toState(pattern: KPattern): CubingPatternState {
    return {
      puzzleId: config.id,
      patternData: clonePatternData(pattern.patternData),
    }
  }

  async function toPattern(state: CubingPatternState): Promise<KPattern> {
    const kpuzzle = await loadKPuzzle()
    return new KPattern(kpuzzle, clonePatternData(state.patternData))
  }

  function patternMatchesSolved(pattern: KPattern): boolean {
    const solved = requireLoadedKPuzzle().defaultPattern().patternData
    const current = pattern.patternData
    for (const orbitName of Object.keys(solved)) {
      const solvedOrbit = solved[orbitName]
      const currentOrbit = current[orbitName]
      if (!currentOrbit) return false
      if (solvedOrbit.pieces.length !== currentOrbit.pieces.length) return false
      for (let i = 0; i < solvedOrbit.pieces.length; i++) {
        if (solvedOrbit.pieces[i] !== currentOrbit.pieces[i]) return false
      }
      if (ignoredOrientationOrbits.has(orbitName)) continue
      if (solvedOrbit.orientation.length !== currentOrbit.orientation.length) return false
      for (let i = 0; i < solvedOrbit.orientation.length; i++) {
        if (solvedOrbit.orientation[i] !== currentOrbit.orientation[i]) return false
      }
    }
    return true
  }

  function validatePatternState(state: CubingPatternState): ValidationResult {
    if (state.puzzleId !== config.id) {
      return { ok: false, reason: `Expected ${config.id} state, got ${state.puzzleId}` }
    }
    if (!state.patternData || typeof state.patternData !== 'object') {
      return { ok: false, reason: 'Expected cubing KPatternData' }
    }
    if (!kpuzzle) return { ok: false, reason: `Puzzle ${config.id} is not initialized` }
    const solvedPattern = kpuzzle.defaultPattern().patternData
    for (const orbitDef of kpuzzle.definition.orbits) {
      const orbit = state.patternData[orbitDef.orbitName]
      const solvedOrbit = solvedPattern[orbitDef.orbitName]
      if (!orbit) return { ok: false, reason: `Missing ${orbitDef.orbitName} orbit` }
      if (!Array.isArray(orbit.pieces) || !Array.isArray(orbit.orientation)) {
        return { ok: false, reason: `${orbitDef.orbitName} orbit must include pieces and orientation` }
      }
      if (orbit.pieces.length !== orbitDef.numPieces) {
        return { ok: false, reason: `${orbitDef.orbitName} has ${orbit.pieces.length} pieces` }
      }
      if (orbit.orientation.length !== orbitDef.numPieces) {
        return { ok: false, reason: `${orbitDef.orbitName} has ${orbit.orientation.length} orientations` }
      }

      const expectedPieceCounts = new Map<number, number>()
      for (const piece of solvedOrbit.pieces) {
        expectedPieceCounts.set(piece, (expectedPieceCounts.get(piece) ?? 0) + 1)
      }
      const currentPieceCounts = new Map<number, number>()
      for (const piece of orbit.pieces) {
        if (!Number.isInteger(piece) || piece < 0 || piece >= orbitDef.numPieces) {
          return { ok: false, reason: `${orbitDef.orbitName} has invalid piece ${piece}` }
        }
        if (!expectedPieceCounts.has(piece)) {
          return { ok: false, reason: `${orbitDef.orbitName} has unexpected piece ${piece}` }
        }
        currentPieceCounts.set(piece, (currentPieceCounts.get(piece) ?? 0) + 1)
      }
      for (const [piece, expectedCount] of expectedPieceCounts) {
        if ((currentPieceCounts.get(piece) ?? 0) !== expectedCount) {
          return { ok: false, reason: `${orbitDef.orbitName} has invalid count for piece ${piece}` }
        }
      }

      for (const orientation of orbit.orientation) {
        if (
          !Number.isInteger(orientation) ||
          orientation < 0 ||
          orientation >= orbitDef.numOrientations
        ) {
          return { ok: false, reason: `${orbitDef.orbitName} has invalid orientation ${orientation}` }
        }
      }
    }
    return { ok: true }
  }

  return {
    id: config.id,
    async init() {
      await loadKPuzzle()
    },
    solvedState() {
      return toState(requireLoadedKPuzzle().defaultPattern())
    },
    async randomState() {
      return (await this.randomStateWithScramble()).state
    },
    async randomStateWithScramble() {
      const kpuzzle = await loadKPuzzle()
      const scramble = await randomScrambleForEvent(config.eventId)
      return {
        state: toState(kpuzzle.defaultPattern().applyAlg(scramble)),
        scrambleMoves: splitAlgorithm(scramble.toString()),
      }
    },
    async applyMoves(state, moves) {
      const pattern = await toPattern(state)
      const algorithm = movesToArray(moves).join(' ')
      return toState(algorithm ? pattern.applyAlg(algorithm) : pattern)
    },
    validate(state) {
      return validatePatternState(state)
    },
    isReachable(state) {
      return validatePatternState(state).ok
    },
    async isSolved(state) {
      const pattern = await toPattern(state)
      return patternMatchesSolved(pattern)
    },
    async solve(state) {
      if (await this.isSolved(state)) return []
      if (!config.solvePattern) {
        throw new Error(`${config.id} solve requires known scramble history.`)
      }
      const pattern = await toPattern(state)
      const solution = await config.solvePattern(pattern)
      return splitAlgorithm(solution.toString())
    },
  }
}
