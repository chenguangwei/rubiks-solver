import { FACES } from '../cube'
import type { Face, ValidationResult } from '../cube'

export type Axis = 'x' | 'y' | 'z'
export type Vec3 = readonly [number, number, number]

export type NxNMove = {
  raw: string
  face: Face
  turns: 1 | -1 | 2
  wide: boolean
}

export type NxNStickerRef = {
  face: Face
  index: number
  coord: Vec3
  normal: Vec3
}

export function solvedNxNState(size: number): string {
  const facelets = size * size
  return FACES.map((face) => face.repeat(facelets)).join('')
}

function coordsForSize(size: number): number[] {
  // Even: [-3,-1,1,3] for 4; Odd: [-4,-2,0,2,4] for 5.
  const half = (size - 1) / 2
  return Array.from({ length: size }, (_, i) => (i - half) * 2)
}

function stickerRefFor(
  coords: readonly number[],
  face: Face,
  row: number,
  col: number,
  index: number,
): NxNStickerRef {
  const leftToRight = coords
  const rightToLeft = [...coords].slice().reverse()
  const topToBottom = [...coords].slice().reverse()
  const bottomToTop = coords
  const max = coords[coords.length - 1] ?? 0
  const min = coords[0] ?? 0

  switch (face) {
    case 'U':
      return { face, index, coord: [leftToRight[col]!, max, bottomToTop[row]!], normal: [0, 1, 0] }
    case 'D':
      return { face, index, coord: [leftToRight[col]!, min, topToBottom[row]!], normal: [0, -1, 0] }
    case 'F':
      return { face, index, coord: [leftToRight[col]!, topToBottom[row]!, max], normal: [0, 0, 1] }
    case 'B':
      return { face, index, coord: [rightToLeft[col]!, topToBottom[row]!, min], normal: [0, 0, -1] }
    case 'R':
      return { face, index, coord: [max, topToBottom[row]!, rightToLeft[col]!], normal: [1, 0, 0] }
    case 'L':
      return { face, index, coord: [min, topToBottom[row]!, leftToRight[col]!], normal: [-1, 0, 0] }
  }
}

export function buildNxNStickerRefs(size: number): readonly NxNStickerRef[] {
  const facelets = size * size
  const coords = coordsForSize(size)
  return FACES.flatMap((face, faceIndex) =>
    Array.from({ length: facelets }, (_, facePos) => {
      const row = Math.floor(facePos / size)
      const col = facePos % size
      return stickerRefFor(coords, face, row, col, faceIndex * facelets + facePos)
    }),
  )
}

export function parseNxNMove(raw: string): NxNMove | null {
  const m = /^([URFDLB])(w?)(['2]?)$/.exec(raw.trim())
  if (!m) return null
  const suffix = m[3]
  return {
    raw,
    face: m[1] as Face,
    wide: m[2] === 'w',
    turns: suffix === "'" ? -1 : suffix === '2' ? 2 : 1,
  }
}

export function axisForFace(face: Face): Axis {
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

export function outerLayerForFace(size: number, face: Face): number {
  const coords = coordsForSize(size)
  const min = coords[0] ?? 0
  const max = coords[coords.length - 1] ?? 0
  switch (face) {
    case 'U':
    case 'R':
    case 'F':
      return max
    case 'D':
    case 'L':
    case 'B':
      return min
  }
}

export function innerLayerForWideMove(size: number, face: Face): number {
  const coords = coordsForSize(size)
  const outer = outerLayerForFace(size, face)
  // For NxN >= 4, "w" means two layers: the outer layer plus the adjacent inner layer.
  const idx = coords.indexOf(outer)
  const nextIdx = outer > 0 ? idx - 1 : idx + 1
  return coords[nextIdx] ?? outer
}

export function isCoordInNxNMoveLayer(size: number, move: NxNMove, coord: Vec3): boolean {
  const axis = axisForFace(move.face)
  const value = axis === 'x' ? coord[0] : axis === 'y' ? coord[1] : coord[2]
  return (
    value === outerLayerForFace(size, move.face) ||
    (move.wide && value === innerLayerForWideMove(size, move.face))
  )
}

function rotateQuarter([x, y, z]: Vec3, axis: Axis, quarterTurns: number): Vec3 {
  const turns = ((quarterTurns % 4) + 4) % 4
  let out: Vec3 = [x, y, z]
  for (let i = 0; i < turns; i++) {
    const [cx, cy, cz] = out
    if (axis === 'x') out = [cx, -cz, cy]
    if (axis === 'y') out = [cz, cy, -cx]
    if (axis === 'z') out = [-cy, cx, cz]
  }
  return out
}

function key(coord: Vec3, normal: Vec3): string {
  return `${coord.join(',')}:${normal.join(',')}`
}

function quarterTurnsForMove(face: Face, turns: 1 | -1 | 2): number {
  const base = face === 'U' || face === 'R' || face === 'F' ? -1 : 1
  return base * turns
}

function stateToStickerMap(stickerRefs: readonly NxNStickerRef[], state: string): Map<string, Face> {
  const map = new Map<string, Face>()
  stickerRefs.forEach((sticker) => {
    map.set(key(sticker.coord, sticker.normal), state[sticker.index] as Face)
  })
  return map
}

function stickerMapToState(stickerRefs: readonly NxNStickerRef[], map: Map<string, Face>): string {
  return stickerRefs.map((sticker) => map.get(key(sticker.coord, sticker.normal)) ?? sticker.face).join('')
}

export function applyNxNMove(
  size: number,
  stickerRefs: readonly NxNStickerRef[],
  state: string,
  rawMove: string,
): string {
  const move = parseNxNMove(rawMove)
  if (!move) throw new Error(`Unsupported ${size}x${size} move: ${rawMove}`)

  const source = stateToStickerMap(stickerRefs, state)
  const target = new Map<string, Face>()
  const axis = axisForFace(move.face)
  const quarterTurns = quarterTurnsForMove(move.face, move.turns)

  for (const sticker of stickerRefs) {
    const color = source.get(key(sticker.coord, sticker.normal))
    if (!color) continue
    if (isCoordInNxNMoveLayer(size, move, sticker.coord)) {
      target.set(
        key(
          rotateQuarter(sticker.coord, axis, quarterTurns),
          rotateQuarter(sticker.normal, axis, quarterTurns),
        ),
        color,
      )
    } else {
      target.set(key(sticker.coord, sticker.normal), color)
    }
  }

  return stickerMapToState(stickerRefs, target)
}

export function movesToArray(moves: string[] | string): string[] {
  if (Array.isArray(moves)) return moves
  return moves.split(/\s+/).filter(Boolean)
}

export function invertNxNMove(move: string): string {
  if (move.endsWith("'")) return move.slice(0, -1)
  if (move.endsWith('2')) return move
  return `${move}'`
}

export function invertNxNMoves(moves: readonly string[]): string[] {
  return [...moves].reverse().map(invertNxNMove)
}

export function validateNxNState(size: number, state: string): ValidationResult {
  const facelets = size * size
  if (state.length !== facelets * FACES.length) {
    return { ok: false, reason: `Expected ${facelets * 6} stickers, got ${state.length}` }
  }

  const counts = Object.fromEntries(FACES.map((face) => [face, 0])) as Record<Face, number>
  for (const ch of state) {
    if (!FACES.includes(ch as Face)) return { ok: false, reason: `Invalid sticker color: ${ch}` }
    counts[ch as Face]++
  }
  for (const face of FACES) {
    if (counts[face] !== facelets) {
      return { ok: false, reason: `Expected ${facelets} ${face} stickers, got ${counts[face]}` }
    }
  }
  return { ok: true }
}

export function visibleNxNStickers(size: number, state: string): Face[] {
  const facelets = size * size
  const stickers = state.split('').map((face) => face as Face)
  const offset = (face: Face) => FACES.indexOf(face) * facelets
  return [
    ...stickers.slice(offset('U'), offset('U') + facelets),
    ...stickers.slice(offset('F'), offset('F') + facelets),
    ...stickers.slice(offset('R'), offset('R') + facelets),
  ]
}
