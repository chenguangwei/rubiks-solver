import { solveSkewb } from 'cubing/search'
import { createCubingPatternAdapter } from './cubingPattern'

export const skewbAdapter = createCubingPatternAdapter({
  id: 'skewb',
  puzzleLoaderId: 'skewb',
  eventId: 'skewb',
  solvePattern: solveSkewb,
  ignoreOrientationForOrbits: ['CENTERS'],
})
