import { beforeAll, describe, expect, it } from 'vitest'
import type { Face } from './cube'
import { parseMove } from './moves'
import { cube222Adapter } from './puzzles/222'
import {
  MINI_CUBE_CORNER_FACES,
  MINI_CUBE_CORNER_POSITIONS,
  miniCubeCornerColorsByPosition,
  miniCubeCubieOnMoveFace,
  miniCubeTurnAngleRad,
  miniCubeTurnAxis,
} from './miniCubeMapping'

const FACE_NORMALS: Record<Face, readonly [number, number, number]> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  L: [-1, 0, 0],
  R: [1, 0, 0],
}

const FACE_BY_NORMAL = Object.fromEntries(
  Object.entries(FACE_NORMALS).map(([face, normal]) => [normal.join(','), face as Face]),
) as Record<string, Face>

const POSITION_INDEX_BY_COORD = new Map(
  MINI_CUBE_CORNER_POSITIONS.map((position, index) => [position.join(','), index]),
)

function rotateVector(
  [x, y, z]: readonly [number, number, number],
  axis: 'x' | 'y' | 'z',
  angle: number,
): readonly [number, number, number] {
  const cos = Math.round(Math.cos(angle))
  const sin = Math.round(Math.sin(angle))

  if (axis === 'x') return [x, cos * y - sin * z, sin * y + cos * z]
  if (axis === 'y') return [cos * x + sin * z, y, -sin * x + cos * z]
  return [cos * x - sin * y, sin * x + cos * y, z]
}

function physicallyTurnCornerColors(
  startColors: readonly Partial<Record<Face, Face>>[],
  move: string,
): Partial<Record<Face, Face>>[] {
  const parsed = parseMove(move)
  if (!parsed) throw new Error(`Invalid move in test: ${move}`)

  const axis = miniCubeTurnAxis(parsed.face)
  const angle = miniCubeTurnAngleRad(parsed.face, parsed.turns)
  const nextColors = startColors.map((colors) => ({ ...colors }))

  MINI_CUBE_CORNER_POSITIONS.forEach((oldPosition, oldIndex) => {
    if (!miniCubeCubieOnMoveFace(parsed.face, oldPosition)) return
    const newPosition = rotateVector(oldPosition, axis, angle)
    const newIndex = POSITION_INDEX_BY_COORD.get(newPosition.join(','))
    if (newIndex === undefined) {
      throw new Error(`No mini cube corner at ${newPosition.join(',')}`)
    }

    nextColors[newIndex] = {}
    for (const [oldFace, color] of Object.entries(startColors[oldIndex]) as [Face, Face][]) {
      const newNormal = rotateVector(FACE_NORMALS[oldFace], axis, angle)
      const newFace = FACE_BY_NORMAL[newNormal.join(',')]
      nextColors[newIndex][newFace] = color
    }
  })

  return nextColors
}

describe('2x2 visual corner mapping', () => {
  beforeAll(async () => {
    await cube222Adapter.init()
  })

  it('keeps cubie sticker colors attached through every basic face turn', async () => {
    const moves = [
      'R',
      "R'",
      'R2',
      'U',
      "U'",
      'U2',
      'F',
      "F'",
      'F2',
      'L',
      "L'",
      'L2',
      'D',
      "D'",
      'D2',
      'B',
      "B'",
      'B2',
    ]

    for (const move of moves) {
      const solved = cube222Adapter.solvedState()
      const expected = physicallyTurnCornerColors(
        miniCubeCornerColorsByPosition(solved),
        move,
      )
      const nextState = await cube222Adapter.applyMoves(solved, move)

      expect(miniCubeCornerColorsByPosition(nextState), move).toEqual(expected)
    }
  })

  it('uses cubing.js corner sticker order, not visual axis order', () => {
    expect(MINI_CUBE_CORNER_FACES).toEqual([
      ['U', 'F', 'R'],
      ['U', 'R', 'B'],
      ['U', 'B', 'L'],
      ['U', 'L', 'F'],
      ['D', 'R', 'F'],
      ['D', 'F', 'L'],
      ['D', 'L', 'B'],
      ['D', 'B', 'R'],
    ])
  })
})
