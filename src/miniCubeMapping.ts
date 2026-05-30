import type { Face } from './cube'
import type { CubingPatternState } from './puzzles/cubingPattern'

export type MiniVec3 = readonly [number, number, number]

export const MINI_CUBE_CORNER_FACES: readonly (readonly Face[])[] = [
  // cubing.js 2x2 CORNERS orbit order:
  // 0 UFR, 1 URB, 2 UBL, 3 ULF, 4 DRF, 5 DFL, 6 DLB, 7 DBR.
  // The order inside each entry is the sticker order used by cubing.js orientation.
  ['U', 'F', 'R'],
  ['U', 'R', 'B'],
  ['U', 'B', 'L'],
  ['U', 'L', 'F'],
  ['D', 'R', 'F'],
  ['D', 'F', 'L'],
  ['D', 'L', 'B'],
  ['D', 'B', 'R'],
]

export const MINI_CUBE_CORNER_POSITIONS: readonly MiniVec3[] = [
  [1, 1, 1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, 1, 1],
  [1, -1, 1],
  [-1, -1, 1],
  [-1, -1, -1],
  [1, -1, -1],
]

export function miniCubeRotateFaces(faces: readonly Face[], turns: number): Face[] {
  const normalized = ((turns % faces.length) + faces.length) % faces.length
  return faces.map((_, index) => faces[(index + normalized) % faces.length])
}

export function miniCubeStateFingerprint(state: CubingPatternState | null): string {
  if (!state) return 'loading'
  const serialized = JSON.stringify(state.patternData)
  let hash = 0
  for (let i = 0; i < serialized.length; i++) {
    hash = (hash * 31 + serialized.charCodeAt(i)) >>> 0
  }
  return hash.toString(36).toUpperCase().padStart(7, '0')
}

export function miniCubeCornerColorsByPosition(
  state: CubingPatternState | null,
): Partial<Record<Face, Face>>[] {
  const corners = state?.patternData.CORNERS
  return MINI_CUBE_CORNER_FACES.map((positionFaces, position) => {
    const piece = corners?.pieces[position] ?? position
    const orientation = corners?.orientation[position] ?? 0
    const pieceFaces = MINI_CUBE_CORNER_FACES[piece] ?? positionFaces
    const colors = miniCubeRotateFaces(pieceFaces, orientation)
    return Object.fromEntries(positionFaces.map((face, index) => [face, colors[index]])) as Partial<
      Record<Face, Face>
    >
  })
}

export function miniCubeStickersForState(state: CubingPatternState | null): Face[] {
  const corners = state?.patternData.CORNERS
  if (!corners) return MINI_CUBE_CORNER_FACES.flat()

  return corners.pieces.flatMap((piece, position) => {
    const faces =
      MINI_CUBE_CORNER_FACES[piece] ??
      MINI_CUBE_CORNER_FACES[position] ??
      MINI_CUBE_CORNER_FACES[0]
    return miniCubeRotateFaces(faces, corners.orientation[position] ?? 0)
  })
}

export function miniCubeCubieOnMoveFace(face: Face, [x, y, z]: MiniVec3): boolean {
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

export function miniCubeTurnAxis(face: Face): 'x' | 'y' | 'z' {
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

export function miniCubeTurnAngleRad(face: Face, turns: 1 | -1 | 2): number {
  const sign = face === 'U' || face === 'R' || face === 'F' ? -1 : 1
  return sign * turns * (Math.PI / 2)
}
