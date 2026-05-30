import type { ValidationResult } from '../cube'

export type PuzzleId = '222' | '333' | '444' | '555' | 'pyraminx' | 'skewb'

export type EntryMode = 'random' | 'manual-moves' | 'manual-stickers' | 'camera' | 'image-import'

export type SolveScope = 'none' | 'generated-scramble' | 'known-history' | 'arbitrary-state'

export type PuzzleCapabilitySet = {
  entryModes: EntryMode[]
  solveScope: SolveScope
  playback: boolean
  publicRoute: boolean
}

export type PuzzleDefinition = {
  id: PuzzleId
  route: string
  eventId?: string
  displayName: string
  navLabel: string
  seoTitle: string
  stickerCount: number
  capabilities: PuzzleCapabilitySet
}

export type MaybePromise<T> = T | Promise<T>

export type PuzzleSolverAdapter<State = string> = {
  id: PuzzleId
  init: () => Promise<void>
  solvedState: () => State
  randomState: () => MaybePromise<State>
  applyMoves: (state: State, moves: string[] | string) => MaybePromise<State>
  validate: (state: State) => ValidationResult
  isReachable: (state: State) => boolean
  isSolved: (state: State) => MaybePromise<boolean>
  solve: (state: State) => Promise<string[]>
}
