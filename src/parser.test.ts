import { beforeAll, describe, expect, it } from 'vitest'
import { SOLVED_STATE } from './cube'
import { parseNet } from './parser'
import { renderState } from './render'
import { initSolver, randomState } from './solver'

describe('parseNet', () => {
  beforeAll(async () => {
    await initSolver()
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
