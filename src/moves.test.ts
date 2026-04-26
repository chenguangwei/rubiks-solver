import { describe, expect, it } from 'vitest'
import { describeMove, parseMove, stickerIndicesForFace } from './moves'

describe('parseMove', () => {
  it('parses a clockwise turn', () => {
    expect(parseMove('R')).toEqual({ raw: 'R', face: 'R', turns: 1 })
  })
  it('parses a counter-clockwise turn', () => {
    expect(parseMove("U'")).toEqual({ raw: "U'", face: 'U', turns: -1 })
  })
  it('parses a 180° turn', () => {
    expect(parseMove('F2')).toEqual({ raw: 'F2', face: 'F', turns: 2 })
  })
  it('returns null for invalid moves', () => {
    expect(parseMove('Z')).toBeNull()
    expect(parseMove('R3')).toBeNull()
    expect(parseMove('')).toBeNull()
  })
})

describe('describeMove', () => {
  it('gives a human-readable label per direction', () => {
    expect(describeMove(parseMove('R')!)).toMatch(/Right.*clockwise/)
    expect(describeMove(parseMove("U'")!)).toMatch(/Up.*counter-clockwise/)
    expect(describeMove(parseMove('F2')!)).toMatch(/Front.*180/)
  })
})

describe('stickerIndicesForFace', () => {
  it('returns 9 indices per face', () => {
    expect(stickerIndicesForFace('U')).toHaveLength(9)
    expect(stickerIndicesForFace('B')).toHaveLength(9)
  })
  it('U face indices are 0-8', () => {
    expect(stickerIndicesForFace('U').sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })
})
