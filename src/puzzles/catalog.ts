import type { PuzzleDefinition, PuzzleId } from './types'

export const PUZZLE_IDS: readonly PuzzleId[] = [
  '222',
  '333',
  '444',
  '555',
  'pyraminx',
  'skewb',
]

export const PUZZLE_CATALOG: Record<PuzzleId, PuzzleDefinition> = {
  '222': {
    id: '222',
    route: '/2x2x2-solver',
    eventId: '222',
    displayName: 'Mini Cube Solver 2x2x2',
    navLabel: '2x2 Solver',
    seoTitle: 'Mini Cube Solver 2x2x2',
    stickerCount: 24,
    capabilities: {
      entryModes: ['random', 'manual-moves', 'camera'],
      solveScope: 'arbitrary-state',
      playback: true,
      publicRoute: true,
    },
  },
  '333': {
    id: '333',
    route: '/',
    eventId: '333',
    displayName: "Rubik's Cube Solver 3x3x3",
    navLabel: '3x3 Solver',
    seoTitle: "Online 3x3 Rubik's Cube Solver",
    stickerCount: 54,
    capabilities: {
      entryModes: ['random', 'manual-moves', 'manual-stickers', 'camera', 'image-import'],
      solveScope: 'arbitrary-state',
      playback: true,
      publicRoute: true,
    },
  },
  '444': {
    id: '444',
    route: '/4x4x4-solver',
    eventId: '444',
    displayName: "Rubik's Revenge Solver 4x4x4",
    navLabel: '4x4 Solver',
    seoTitle: "Rubik's Revenge Solver 4x4x4",
    stickerCount: 96,
    capabilities: {
      entryModes: ['random', 'manual-moves', 'camera'],
      solveScope: 'known-history',
      playback: true,
      publicRoute: true,
    },
  },
  '555': {
    id: '555',
    route: '/5x5x5-solver',
    eventId: '555',
    displayName: "Professor's Cube Solver 5x5x5",
    navLabel: '5x5 Solver',
    seoTitle: "Professor's Cube Solver 5x5x5",
    stickerCount: 150,
    capabilities: {
      entryModes: ['random', 'manual-moves', 'camera'],
      solveScope: 'known-history',
      playback: true,
      publicRoute: true,
    },
  },
  pyraminx: {
    id: 'pyraminx',
    route: '/pyraminx-solver',
    eventId: 'pyram',
    displayName: 'Pyraminx Solver',
    navLabel: 'Pyraminx Solver',
    seoTitle: 'Pyraminx Solver',
    stickerCount: 36,
    capabilities: {
      entryModes: ['random', 'manual-moves'],
      solveScope: 'arbitrary-state',
      playback: true,
      publicRoute: true,
    },
  },
  skewb: {
    id: 'skewb',
    route: '/skewb-solver',
    eventId: 'skewb',
    displayName: 'Skewb Solver',
    navLabel: 'Skewb Solver',
    seoTitle: 'Skewb Solver',
    stickerCount: 30,
    capabilities: {
      entryModes: ['random', 'manual-moves'],
      solveScope: 'arbitrary-state',
      playback: true,
      publicRoute: true,
    },
  },
}

export const LIVE_PUZZLE_IDS: PuzzleId[] = PUZZLE_IDS.filter(
  (id) => PUZZLE_CATALOG[id].capabilities.publicRoute,
)

export function getPuzzleDefinition(id: PuzzleId): PuzzleDefinition {
  return PUZZLE_CATALOG[id]
}
