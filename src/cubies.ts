import { FACES } from './cube'
import type { Face } from './cube'

export type Vec3 = [number, number, number]

export type Placement3D = {
  /** Index 0-53 into the cubejs facelet string. */
  index: number
  /** Face name this sticker belongs to. */
  face: Face
  /** Position 0-8 within the face (row-major). */
  facePos: number
  /** Cubie coordinate, each in {-1, 0, 1}. */
  cubie: Vec3
  /** Outward face direction, each in {-1, 0, 1} with exactly one non-zero. */
  normal: Vec3
}

const FACE_INDEX_OFFSETS: Record<Face, number> = {
  U: 0,
  R: 9,
  F: 18,
  D: 27,
  L: 36,
  B: 45,
}

const FACE_NORMALS: Record<Face, Vec3> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  L: [-1, 0, 0],
  R: [1, 0, 0],
}

/**
 * Map a sticker position on a face (col, row) -> 3D cubie coordinate.
 *
 * The cubejs facelet string lays out each face in row-major order matching
 * this unfolded view (U on top, D on bottom, L F R B in a strip):
 *
 *           +--------+
 *           |   U    |
 *           +--------+--------+--------+--------+
 *           |   L    |   F    |   R    |   B    |
 *           +--------+--------+--------+--------+
 *           |   D    |
 *           +--------+
 *
 * For each face I work out where (col=0, row=0) sits in 3D world coords by
 * finding the corner cubie shared with adjacent faces in that net layout.
 */
function cubieFor(face: Face, col: number, row: number): Vec3 {
  const c = col - 1 // -1, 0, 1
  const r = row - 1
  switch (face) {
    case 'U':
      // Top face. Net row 0 is the back edge (z=-1), col 0 is left (x=-1).
      return [c, 1, r]
    case 'D':
      // Bottom face. Net row 0 is the front edge (z=+1) -- D1..D3 are
      // adjacent to F7..F9.
      return [c, -1, -r]
    case 'F':
      // Front face. Net row 0 is the top (y=+1), col 0 is left (x=-1).
      return [c, -r, 1]
    case 'B':
      // Back face. Net col 0 (B1, B4, B7) is adjacent to R3,R6,R9 -- world x=+1.
      // Net col 2 (B3, B6, B9) is adjacent to L1,L4,L7 -- world x=-1.
      return [-c, -r, -1]
    case 'L':
      // Left face. Net col 0 (L1) is adjacent to B3 -- world z=-1.
      // Net col 2 (L3) is adjacent to F1 -- world z=+1.
      return [-1, -r, c]
    case 'R':
      // Right face. Net col 0 (R1) is adjacent to F3 -- world z=+1.
      // Net col 2 (R3) is adjacent to B1 -- world z=-1.
      return [1, -r, -c]
  }
}

export const PLACEMENTS_3D: readonly Placement3D[] = (() => {
  const out: Placement3D[] = []
  for (const face of FACES) {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const facePos = row * 3 + col
        out.push({
          index: FACE_INDEX_OFFSETS[face] + facePos,
          face,
          facePos,
          cubie: cubieFor(face, col, row),
          normal: FACE_NORMALS[face],
        })
      }
    }
  }
  out.sort((a, b) => a.index - b.index)
  return out
})()

/** Stickers grouped by cubie coordinate (key "x,y,z"). */
export const STICKERS_BY_CUBIE: Readonly<Record<string, readonly Placement3D[]>> =
  (() => {
    const map: Record<string, Placement3D[]> = {}
    for (const p of PLACEMENTS_3D) {
      const k = p.cubie.join(',')
      ;(map[k] ??= []).push(p)
    }
    return map
  })()

export function cubieKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`
}

/** Whether a cubie at (x,y,z) is part of the layer rotated by face F. */
export function cubieOnFace(face: Face, [x, y, z]: Vec3): boolean {
  switch (face) {
    case 'U':
      return y === 1
    case 'D':
      return y === -1
    case 'F':
      return z === 1
    case 'B':
      return z === -1
    case 'L':
      return x === -1
    case 'R':
      return x === 1
  }
}

/** Axis of rotation for a face turn: U/D rotate around y, R/L around x, F/B around z. */
export function rotationAxis(face: Face): 'x' | 'y' | 'z' {
  switch (face) {
    case 'U':
    case 'D':
      return 'y'
    case 'L':
    case 'R':
      return 'x'
    case 'F':
    case 'B':
      return 'z'
  }
}

/**
 * Rotation angle (radians) for an animated turn of `face` by `turns` quarter-
 * turns. The sign convention: a positive face turn (U, R, F clockwise) is
 * negative rotation around the OUTWARD normal axis using right-hand rule.
 */
export function rotationAngle(face: Face, turns: 1 | -1 | 2): number {
  const sign =
    face === 'U' || face === 'R' || face === 'F'
      ? -1 // CW from outside -> CCW around the +axis (right-hand rule)
      : 1
  return sign * turns * (Math.PI / 2)
}
