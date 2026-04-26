import { describe, expect, it } from 'vitest'
import { SOLVED_STATE } from './cube'
import { decodeStateFromHash, shareUrl } from './share'

describe('share URL helpers', () => {
  it('encodes and decodes the solved state', () => {
    const url = shareUrl(SOLVED_STATE, 'http://example.com/app/')
    expect(url).toBe(`http://example.com/app/#state=${SOLVED_STATE}`)
    const hash = url.slice(url.indexOf('#'))
    expect(decodeStateFromHash(hash)).toBe(SOLVED_STATE)
  })

  it('round-trips a non-canonical orientation', () => {
    const swap: Record<string, string> = { U: 'D', D: 'U', F: 'B', B: 'F', L: 'L', R: 'R' }
    const rotated = [...SOLVED_STATE].map((c) => swap[c]).join('')
    const hash = `#state=${rotated}`
    expect(decodeStateFromHash(hash)).toBe(rotated)
  })

  it('returns null for missing or invalid hashes', () => {
    expect(decodeStateFromHash('')).toBeNull()
    expect(decodeStateFromHash('#nothing-relevant')).toBeNull()
    expect(decodeStateFromHash('#state=tooshort')).toBeNull()
    expect(decodeStateFromHash('#state=' + 'X'.repeat(54))).toBeNull()
  })

  it('tolerates additional hash params', () => {
    const hash = `#other=foo&state=${SOLVED_STATE}&extra=bar`
    expect(decodeStateFromHash(hash)).toBe(SOLVED_STATE)
  })
})
