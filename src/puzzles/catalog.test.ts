import { describe, expect, it } from 'vitest'
import { LIVE_PUZZLE_IDS, PUZZLE_CATALOG, getPuzzleDefinition } from './catalog'

describe('puzzle catalog', () => {
  it('lists the full approved solver family', () => {
    expect(Object.keys(PUZZLE_CATALOG).sort()).toEqual([
      '222',
      '333',
      '444',
      '555',
      'pyraminx',
      'skewb',
    ])
  })

  it('describes live route scope without overclaiming arbitrary-state solving', () => {
    expect(LIVE_PUZZLE_IDS).toEqual(['222', '333', '444', '555', 'pyraminx', 'skewb'])
    expect(getPuzzleDefinition('333').capabilities.solveScope).toBe('arbitrary-state')
    expect(getPuzzleDefinition('222').capabilities.solveScope).toBe('arbitrary-state')
    expect(getPuzzleDefinition('222').capabilities.entryModes).toEqual(
      expect.arrayContaining(['random', 'manual-moves', 'camera']),
    )
    expect(getPuzzleDefinition('444').capabilities.solveScope).toBe('known-history')
    expect(getPuzzleDefinition('444').capabilities.entryModes).toEqual(
      expect.arrayContaining(['random', 'manual-moves', 'camera']),
    )
    expect(getPuzzleDefinition('555').capabilities.solveScope).toBe('known-history')
    expect(getPuzzleDefinition('555').capabilities.entryModes).toEqual(
      expect.arrayContaining(['random', 'manual-moves', 'camera']),
    )
    expect(getPuzzleDefinition('pyraminx').capabilities.solveScope).toBe('arbitrary-state')
    expect(getPuzzleDefinition('skewb').capabilities.solveScope).toBe('arbitrary-state')
  })

  it('stores stable SEO routes for every planned puzzle page', () => {
    expect(getPuzzleDefinition('222').route).toBe('/2x2x2-solver')
    expect(getPuzzleDefinition('333').route).toBe('/')
    expect(getPuzzleDefinition('444').route).toBe('/4x4x4-solver')
    expect(getPuzzleDefinition('555').route).toBe('/5x5x5-solver')
    expect(getPuzzleDefinition('pyraminx').route).toBe('/pyraminx-solver')
    expect(getPuzzleDefinition('skewb').route).toBe('/skewb-solver')
  })
})
