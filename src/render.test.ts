import { describe, expect, it } from 'vitest'
import { FACE_COLORS, PLACEMENTS, SOLVED_STATE, setSticker } from './cube'
import { renderState, sampleStickerCenter } from './render'

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

describe('renderState', () => {
  it('produces canvas of expected dimensions', () => {
    const out = renderState(SOLVED_STATE, { stickerSize: 40 })
    expect(out.width).toBe(40 * 12)
    expect(out.height).toBe(40 * 9)
    expect(out.data.length).toBe(out.width * out.height * 4)
  })

  it('places each sticker at its expected color', () => {
    const out = renderState(SOLVED_STATE)
    for (const p of PLACEMENTS) {
      const expected = hexToRgb(FACE_COLORS[p.face])
      const actual = sampleStickerCenter(out, p.col, p.row)
      expect(actual).toEqual(expected)
    }
  })

  it('reflects sticker overrides at the right position', () => {
    const modified = setSticker(SOLVED_STATE, 0, 'R')
    const out = renderState(modified)
    const placement = PLACEMENTS.find((p) => p.index === 0)!
    expect(sampleStickerCenter(out, placement.col, placement.row)).toEqual(
      hexToRgb(FACE_COLORS.R),
    )
  })

  it('background pixel is not a sticker color', () => {
    const out = renderState(SOLVED_STATE, { background: [240, 240, 240] })
    // Top-left corner is outside the U face — should be background.
    const i = 0
    expect([out.data[i], out.data[i + 1], out.data[i + 2]]).toEqual([240, 240, 240])
  })
})
