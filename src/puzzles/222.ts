import { experimentalSolve2x2x2 } from 'cubing/search'
import { createCubingPatternAdapter } from './cubingPattern'

export const cube222Adapter = createCubingPatternAdapter({
  id: '222',
  puzzleLoaderId: '2x2x2',
  eventId: '222',
  solvePattern: experimentalSolve2x2x2,
})
