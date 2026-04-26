import { describe, expect, it } from 'vitest'
import { CENTER_INDICES, FACES } from './cube'
import {
  PLACEMENTS_3D,
  STICKERS_BY_CUBIE,
  cubieKey,
  cubieOnFace,
} from './cubies'

describe('PLACEMENTS_3D', () => {
  it('has exactly 54 entries', () => {
    expect(PLACEMENTS_3D).toHaveLength(54)
  })

  it('covers all facelet indices 0..53', () => {
    expect(PLACEMENTS_3D.map((p) => p.index).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 54 }, (_, i) => i),
    )
  })

  it('every cubie coordinate is in {-1, 0, 1}', () => {
    for (const p of PLACEMENTS_3D) {
      for (const c of p.cubie) expect([-1, 0, 1]).toContain(c)
    }
  })

  it('partitions stickers correctly: 6 centers, 12 edges, 8 corners', () => {
    const counts = { 1: 0, 2: 0, 3: 0 } as Record<number, number>
    for (const stickers of Object.values(STICKERS_BY_CUBIE)) {
      counts[stickers.length] = (counts[stickers.length] ?? 0) + 1
    }
    expect(counts[1]).toBe(6) // centers
    expect(counts[2]).toBe(12) // edges
    expect(counts[3]).toBe(8) // corners
  })

  it('each face has exactly 9 stickers, all sharing that face direction', () => {
    for (const face of FACES) {
      const onFace = PLACEMENTS_3D.filter((p) => p.face === face)
      expect(onFace).toHaveLength(9)
      for (const p of onFace) {
        expect(cubieOnFace(face, p.cubie)).toBe(true)
      }
    }
  })

  it('face centers (positions 4) sit at cubie centers (one nonzero coord)', () => {
    for (const face of FACES) {
      const center = PLACEMENTS_3D.find((p) => p.index === CENTER_INDICES[face])!
      const nonZero = center.cubie.filter((c) => c !== 0).length
      expect(nonZero).toBe(1) // center cubie has exactly one face exposed
    }
  })

  it('the URF corner cubie has stickers from U, R, F facelet positions', () => {
    const stickers = STICKERS_BY_CUBIE[cubieKey(1, 1, 1)]
    expect(stickers).toBeDefined()
    expect(stickers!.map((s) => s.face).sort()).toEqual(['F', 'R', 'U'])
  })

  it('the DLB corner cubie has stickers from D, L, B', () => {
    const stickers = STICKERS_BY_CUBIE[cubieKey(-1, -1, -1)]
    expect(stickers!.map((s) => s.face).sort()).toEqual(['B', 'D', 'L'])
  })

  it('shared corners agree on the same cubie (URF: U9, R1, F3)', () => {
    // URF should be cubie (1, 1, 1).
    const u9 = PLACEMENTS_3D.find((p) => p.index === 8)!
    const r1 = PLACEMENTS_3D.find((p) => p.index === 9)!
    const f3 = PLACEMENTS_3D.find((p) => p.index === 20)!
    expect(u9.cubie).toEqual([1, 1, 1])
    expect(r1.cubie).toEqual([1, 1, 1])
    expect(f3.cubie).toEqual([1, 1, 1])
  })

  it('shared corners agree on the same cubie (ULB: U1, L1, B3)', () => {
    const u1 = PLACEMENTS_3D.find((p) => p.index === 0)!
    const l1 = PLACEMENTS_3D.find((p) => p.index === 36)!
    const b3 = PLACEMENTS_3D.find((p) => p.index === 47)!
    expect(u1.cubie).toEqual([-1, 1, -1])
    expect(l1.cubie).toEqual([-1, 1, -1])
    expect(b3.cubie).toEqual([-1, 1, -1])
  })
})
