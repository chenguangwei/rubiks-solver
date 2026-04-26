import { PLACEMENTS } from './cube'
import type { Face } from './cube'

const FACE_NAMES: Record<Face, string> = {
  U: 'Up',
  D: 'Down',
  L: 'Left',
  R: 'Right',
  F: 'Front',
  B: 'Back',
}

export type ParsedMove = {
  raw: string
  face: Face
  /** 1 = 90° CW, -1 = 90° CCW, 2 = 180°. */
  turns: 1 | -1 | 2
}

export function parseMove(raw: string): ParsedMove | null {
  const m = /^([URFDLB])(['2]?)$/.exec(raw)
  if (!m) return null
  const face = m[1] as Face
  const suffix = m[2]
  const turns = suffix === "'" ? -1 : suffix === '2' ? 2 : 1
  return { raw, face, turns }
}

export function describeMove(move: ParsedMove): string {
  const name = FACE_NAMES[move.face]
  switch (move.turns) {
    case 1:
      return `${name} face — 90° clockwise`
    case -1:
      return `${name} face — 90° counter-clockwise`
    case 2:
      return `${name} face — 180°`
  }
}

/** Sticker indices that belong to a given face (the 9 stickers on it). */
export function stickerIndicesForFace(face: Face): number[] {
  return PLACEMENTS.filter((p) => p.face === face).map((p) => p.index)
}
