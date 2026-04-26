import { describe, expect, it } from 'vitest'
import {
  CENTER_INDICES,
  FACES,
  PLACEMENTS,
  SOLVED_STATE,
  canonicalizeOrientation,
  cycleSticker,
  setSticker,
  validateState,
} from './cube'

describe('cube layout', () => {
  it('has exactly 54 placements', () => {
    expect(PLACEMENTS).toHaveLength(54)
  })

  it('placements cover all indices 0..53', () => {
    const indices = PLACEMENTS.map((p) => p.index).sort((a, b) => a - b)
    expect(indices).toEqual(Array.from({ length: 54 }, (_, i) => i))
  })

  it('placements occupy distinct grid cells', () => {
    const cells = PLACEMENTS.map((p) => `${p.row},${p.col}`)
    expect(new Set(cells).size).toBe(54)
  })

  it('center stickers sit at the geometric center of each face', () => {
    for (const face of FACES) {
      const center = PLACEMENTS.find((p) => p.index === CENTER_INDICES[face])!
      expect(center.facePos).toBe(4)
      expect(center.face).toBe(face)
    }
  })
})

describe('validateState', () => {
  it('accepts the solved cube', () => {
    expect(validateState(SOLVED_STATE)).toEqual({ ok: true })
  })

  it('rejects wrong length', () => {
    expect(validateState('UUU')).toEqual({ ok: false, reason: expect.any(String) })
  })

  it('rejects invalid characters', () => {
    const bad = 'X' + SOLVED_STATE.slice(1)
    const result = validateState(bad)
    expect(result.ok).toBe(false)
  })

  it('rejects wrong color counts', () => {
    // Swap one U for an R: now 8 U and 10 R.
    const bad = setSticker(SOLVED_STATE, 0, 'R')
    const result = validateState(bad)
    expect(result.ok).toBe(false)
  })

  it('rejects when centers are not distinct', () => {
    // U and D centers both end up as D (only 5 distinct centers). Keep counts
    // balanced: change U center -> D (10 D, 8 U), then a D corner -> U (9 D,
    // 9 U). Now centers are {D, R, F, D, L, B} — only 5 unique.
    let bad = setSticker(SOLVED_STATE, CENTER_INDICES.U, 'D')
    bad = setSticker(bad, 27, 'U') // D corner becomes U so counts stay 9/9
    const result = validateState(bad)
    expect(result.ok).toBe(false)
  })

  it('accepts non-canonical but valid orientations', () => {
    // Cube rotated 180° around the L-R axis: U<->D and F<->B as labels.
    // This is a valid rotational orientation of a solved cube and should pass.
    const swap: Record<string, string> = { U: 'D', D: 'U', F: 'B', B: 'F', L: 'L', R: 'R' }
    const rotated = [...SOLVED_STATE].map((c) => swap[c]).join('')
    expect(validateState(rotated)).toEqual({ ok: true })
  })
})

describe('canonicalizeOrientation', () => {
  it('is a no-op for an already-canonical state', () => {
    expect(canonicalizeOrientation(SOLVED_STATE)).toBe(SOLVED_STATE)
  })

  it('relabels letters so centers land at canonical positions after a 180° flip', () => {
    const swap: Record<string, string> = { U: 'D', D: 'U', F: 'B', B: 'F', L: 'L', R: 'R' }
    const rotated = [...SOLVED_STATE].map((c) => swap[c]).join('')
    const canonical = canonicalizeOrientation(rotated)
    expect(canonical).toBe(SOLVED_STATE)
    for (const f of FACES) expect(canonical[CENTER_INDICES[f]]).toBe(f)
  })
})

describe('setSticker / cycleSticker', () => {
  it('setSticker replaces only the targeted index', () => {
    const out = setSticker(SOLVED_STATE, 5, 'R')
    expect(out[5]).toBe('R')
    expect(out.length).toBe(54)
    expect(out.slice(0, 5) + out.slice(6)).toBe(SOLVED_STATE.slice(0, 5) + SOLVED_STATE.slice(6))
  })

  it('cycleSticker walks through all six faces and returns to start', () => {
    let s = SOLVED_STATE
    for (let i = 0; i < FACES.length; i++) s = cycleSticker(s, 0)
    expect(s[0]).toBe('U')
  })
})
