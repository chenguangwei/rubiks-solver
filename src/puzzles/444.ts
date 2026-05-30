import { puzzles } from 'cubing/puzzles'
import { randomScrambleForEvent } from 'cubing/scramble'
import type { Face, ValidationResult } from '../cube'
import type { PuzzleSolverAdapter } from './types'
import {
  applyNxNMove,
  buildNxNStickerRefs,
  invertNxNMove,
  invertNxNMoves,
  movesToArray,
  parseNxNMove,
  solvedNxNState,
  validateNxNState,
  visibleNxNStickers,
  isCoordInNxNMoveLayer,
} from './nxn'
import type { NxNMove, NxNStickerRef, Vec3 } from './nxn'

export type Cube444State = string

export type Parsed444Move = {
  raw: string
  face: Face
  turns: 1 | -1 | 2
  wide: boolean
}

export type Cube444StickerRef = {
  face: Face
  index: number
  coord: Vec3
  normal: Vec3
}

const SIZE = 4

export const SOLVED_444_STATE: Cube444State = solvedNxNState(SIZE)

export const CUBE_444_STICKER_REFS: readonly Cube444StickerRef[] =
  buildNxNStickerRefs(SIZE) as readonly NxNStickerRef[] as readonly Cube444StickerRef[]

export function parse444Move(raw: string): Parsed444Move | null {
  return parseNxNMove(raw) as NxNMove as Parsed444Move | null
}

export function isCoordIn444MoveLayer(move: Parsed444Move, [x, y, z]: Vec3): boolean {
  return isCoordInNxNMoveLayer(SIZE, move as NxNMove, [x, y, z])
}

export function apply444Move(state: Cube444State, rawMove: string): Cube444State {
  return applyNxNMove(SIZE, CUBE_444_STICKER_REFS, state, rawMove)
}

export function stickersFor444State(state: Cube444State): Face[] {
  return state.split('').map((face) => face as Face)
}

export function visible444Stickers(state: Cube444State): Face[] {
  return visibleNxNStickers(SIZE, state)
}

export function validate444State(state: Cube444State): ValidationResult {
  return validateNxNState(SIZE, state)
}

export const cube444Adapter: PuzzleSolverAdapter<Cube444State> & {
  randomStateWithScramble: () => Promise<{ state: Cube444State; scrambleMoves: string[] }>
} = {
  id: '444',
  async init() {
    await puzzles['4x4x4'].kpuzzle()
  },
  solvedState() {
    return SOLVED_444_STATE
  },
  async randomState() {
    return (await this.randomStateWithScramble()).state
  },
  async randomStateWithScramble() {
    const scramble = await randomScrambleForEvent('444')
    const scrambleMoves = movesToArray(scramble.toString())
    return {
      state: await this.applyMoves(SOLVED_444_STATE, scrambleMoves),
      scrambleMoves,
    }
  },
  async applyMoves(state, moves) {
    return movesToArray(moves).reduce((cursor, move) => apply444Move(cursor, move), state)
  },
  validate: validate444State,
  isReachable(state) {
    return validate444State(state).ok
  },
  async isSolved(state) {
    return state === SOLVED_444_STATE
  },
  async solve(state) {
    if (await this.isSolved(state)) return []
    throw new Error('4x4 AI Solve currently requires a generated scramble or manual history.')
  },
}

export const invert444Move = invertNxNMove
export const invert444Moves = invertNxNMoves
