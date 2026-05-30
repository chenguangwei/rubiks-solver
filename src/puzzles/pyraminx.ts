import { solvePyraminx } from 'cubing/search'
import { createCubingPatternAdapter } from './cubingPattern'

export const pyraminxAdapter = createCubingPatternAdapter({
  id: 'pyraminx',
  puzzleLoaderId: 'pyraminx',
  eventId: 'pyram',
  solvePattern: solvePyraminx,
})
