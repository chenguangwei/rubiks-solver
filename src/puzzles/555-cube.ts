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

export type Cube555State = string

export type Parsed555Move = {
  raw: string
  face: Face
  turns: 1 | -1 | 2
  wide: boolean
}

export type Cube555StickerRef = {
  face: Face
  index: number
  coord: Vec3
  normal: Vec3
}

const SIZE = 5

export const SOLVED_555_STATE: Cube555State = solvedNxNState(SIZE)

export const CUBE_555_STICKER_REFS: readonly Cube555StickerRef[] =
  buildNxNStickerRefs(SIZE) as readonly NxNStickerRef[] as readonly Cube555StickerRef[]

export function parse555Move(raw: string): Parsed555Move | null {
  return parseNxNMove(raw) as NxNMove as Parsed555Move | null
}

export function isCoordIn555MoveLayer(move: Parsed555Move, [x, y, z]: Vec3): boolean {
  return isCoordInNxNMoveLayer(SIZE, move as NxNMove, [x, y, z])
}

export function apply555Move(state: Cube555State, rawMove: string): Cube555State {
  return applyNxNMove(SIZE, CUBE_555_STICKER_REFS, state, rawMove)
}

export function invert555Move(move: string): string {
  return invertNxNMove(move)
}

export function invert555Moves(moves: readonly string[]): string[] {
  return invertNxNMoves(moves)
}

export function stickersFor555State(state: Cube555State): Face[] {
  return state.split('').map((face) => face as Face)
}

export function visible555Stickers(state: Cube555State): Face[] {
  return visibleNxNStickers(SIZE, state)
}

export function validate555State(state: Cube555State): ValidationResult {
  return validateNxNState(SIZE, state)
}

export const cube555HistoryAdapter: PuzzleSolverAdapter<Cube555State> & {
  randomStateWithScramble: () => Promise<{ state: Cube555State; scrambleMoves: string[] }>
} = {
  id: '555',
  async init() {
    await puzzles['5x5x5'].kpuzzle()
  },
  solvedState() {
    return SOLVED_555_STATE
  },
  async randomState() {
    return (await this.randomStateWithScramble()).state
  },
  async randomStateWithScramble() {
    const scramble = await randomScrambleForEvent('555')
    const scrambleMoves = movesToArray(scramble.toString())
    return {
      state: await this.applyMoves(SOLVED_555_STATE, scrambleMoves),
      scrambleMoves,
    }
  },
  async applyMoves(state, moves) {
    return movesToArray(moves).reduce((cursor, move) => apply555Move(cursor, move), state)
  },
  validate: validate555State,
  isReachable(state) {
    return validate555State(state).ok
  },
  async isSolved(state) {
    return state === SOLVED_555_STATE
  },
  async solve(state) {
    if (await this.isSolved(state)) return []
    throw new Error('5x5 AI Solve currently requires a generated scramble or manual history.')
  },
}

