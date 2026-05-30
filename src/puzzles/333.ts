import {
  applyMoves,
  initSolverCore,
  isReachableState,
  isSolved,
  randomState,
  solveFastSync,
  solvedState,
} from '../solver-core'
import { validateState } from '../cube'
import type { PuzzleSolverAdapter } from './types'

export const cube333Adapter: PuzzleSolverAdapter<string> = {
  id: '333',
  init: initSolverCore,
  solvedState,
  randomState,
  applyMoves,
  validate: validateState,
  isReachable: isReachableState,
  isSolved,
  async solve(state) {
    return solveFastSync(state)
  },
}
