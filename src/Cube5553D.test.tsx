import { describe, expect, it } from 'vitest'
import { CUBE_555_RENDER_LAYOUT } from './Cube5553DLayout'

describe('Cube5553D render layout', () => {
  it('keeps adjacent 5x5 cubies separated so sticker grid lines stay visible', () => {
    const adjacentCenterDistance = 2 * CUBE_555_RENDER_LAYOUT.positionScale
    const gap = adjacentCenterDistance - CUBE_555_RENDER_LAYOUT.cubieSize

    expect(gap).toBeGreaterThan(0.025)
  })
})
