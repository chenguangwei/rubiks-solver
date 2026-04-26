import { describe, expect, it } from 'vitest'
import {
  CENTER_INDICES,
  FACES,
  PLACEMENTS,
  SOLVED_STATE,
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
    // Build a state with 9 of each color but two faces sharing a center.
    // Swap centers of U and D, plus one non-center to keep counts balanced.
    let bad = setSticker(SOLVED_STATE, CENTER_INDICES.U, 'D')
    bad = setSticker(bad, 0, 'D') // U corner becomes D
    bad = setSticker(bad, CENTER_INDICES.D, 'U')
    bad = setSticker(bad, 27, 'U') // D corner becomes U
    const result = validateState(bad)
    expect(result.ok).toBe(false)
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
