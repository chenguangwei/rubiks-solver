import { beforeAll, describe, expect, it } from 'vitest'
import { FACE_COLORS, FACES, SOLVED_STATE } from './cube'
import {
  classifyScannedFaces,
  classifyScannedFaces4x4,
  classifyScannedFaces5x5,
  parseNet,
} from './parser'
import type { Face } from './cube'
import type { RgbSample } from './parser'
import { renderState } from './render'
import { initSolverCore, randomState } from './solver-core'

describe('parseNet', () => {
  beforeAll(async () => {
    await initSolverCore()
  }, 20_000)

  it('round-trips the solved state', () => {
    const img = renderState(SOLVED_STATE)
    const result = parseNet(img)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.state).toBe(SOLVED_STATE)
  })

  it('round-trips 50 random scrambles with 100% sticker accuracy', () => {
    let totalStickers = 0
    let correctStickers = 0
    let perfectScrambles = 0
    for (let i = 0; i < 50; i++) {
      const expected = randomState()
      const img = renderState(expected)
      const result = parseNet(img)
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      totalStickers += 54
      let correctHere = 0
      for (let j = 0; j < 54; j++) {
        if (result.state[j] === expected[j]) correctHere++
      }
      correctStickers += correctHere
      if (correctHere === 54) perfectScrambles++
    }
    expect(correctStickers).toBe(totalStickers)
    expect(perfectScrambles).toBe(50)
  })

  it('works at a non-default sticker size', () => {
    const expected = randomState()
    const img = renderState(expected, { stickerSize: 60, gap: 6 })
    const result = parseNet(img)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.state).toBe(expected)
  })

  it('autoCrops surrounding whitespace', () => {
    const expected = randomState()
    const inner = renderState(expected, { stickerSize: 40, gap: 4, background: [255, 255, 255] })
    // Wrap inner in a bigger canvas with white margin around it.
    const margin = 30
    const W = inner.width + margin * 2
    const H = inner.height + margin * 2
    const data = new Uint8ClampedArray(W * H * 4)
    for (let i = 0; i < W * H; i++) {
      data[i * 4] = 255
      data[i * 4 + 1] = 255
      data[i * 4 + 2] = 255
      data[i * 4 + 3] = 255
    }
    for (let y = 0; y < inner.height; y++) {
      for (let x = 0; x < inner.width; x++) {
        const srcI = (y * inner.width + x) * 4
        const dstI = ((y + margin) * W + (x + margin)) * 4
        data[dstI] = inner.data[srcI]
        data[dstI + 1] = inner.data[srcI + 1]
        data[dstI + 2] = inner.data[srcI + 2]
        data[dstI + 3] = inner.data[srcI + 3]
      }
    }
    const padded = { width: W, height: H, data }
    const result = parseNet(padded)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.state).toBe(expected)
  })
})

function hexToRgb(hex: string): RgbSample {
  const value = parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

describe('classifyScannedFaces', () => {
  it('classifies six camera faces with center calibration', () => {
    const expected = randomState()
    const observedPalette: Record<Face, RgbSample> = {
      ...Object.fromEntries(FACES.map((face) => [face, hexToRgb(FACE_COLORS[face])])) as Record<Face, RgbSample>,
      // Deliberately shift orange toward yellow; center calibration keeps L and D distinct.
      L: [232, 182, 22],
    }
    const samplesByFace: Partial<Record<Face, RgbSample[]>> = {}
    for (let faceIndex = 0; faceIndex < FACES.length; faceIndex++) {
      const face = FACES[faceIndex]
      const offset = faceIndex * 9
      samplesByFace[face] = expected
        .slice(offset, offset + 9)
        .split('')
        .map((letter) => observedPalette[letter as Face])
    }

    const result = classifyScannedFaces(samplesByFace)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.state).toBe(expected)
  })

  it('classifies 4x4 camera faces and validates 16 stickers per color', () => {
    const samplesByFace: Partial<Record<Face, RgbSample[]>> = {}
    for (const face of FACES) {
      samplesByFace[face] = Array.from({ length: 16 }, () => hexToRgb(FACE_COLORS[face]))
    }

    const result = classifyScannedFaces4x4(samplesByFace)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.state).toHaveLength(96)
      expect(result.state).toBe(
        'U'.repeat(16) +
          'R'.repeat(16) +
          'F'.repeat(16) +
          'D'.repeat(16) +
          'L'.repeat(16) +
          'B'.repeat(16),
      )
    }
  })

  it('classifies 5x5 camera faces and validates 25 stickers per color', () => {
    const samplesByFace: Partial<Record<Face, RgbSample[]>> = {}
    for (const face of FACES) {
      samplesByFace[face] = Array.from({ length: 25 }, () => hexToRgb(FACE_COLORS[face]))
    }

    const result = classifyScannedFaces5x5(samplesByFace)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.state).toHaveLength(150)
      expect(result.state).toBe(
        'U'.repeat(25) +
          'R'.repeat(25) +
          'F'.repeat(25) +
          'D'.repeat(25) +
          'L'.repeat(25) +
          'B'.repeat(25),
      )
    }
  })
})
