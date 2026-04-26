export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B'

export const FACES: readonly Face[] = ['U', 'R', 'F', 'D', 'L', 'B'] as const

export const FACE_COLORS: Readonly<Record<Face, string>> = {
  U: '#ffffff', // white
  R: '#b71234', // red
  F: '#009b48', // green
  D: '#ffd500', // yellow
  L: '#ff5800', // orange
  B: '#0046ad', // blue
}

export const SOLVED_STATE: string =
  'UUUUUUUUU' + 'RRRRRRRRR' + 'FFFFFFFFF' + 'DDDDDDDDD' + 'LLLLLLLLL' + 'BBBBBBBBB'

export type FacePlacement = {
  /** Index 0-53 into the cubejs facelet string. */
  index: number
  /** Which face this sticker belongs to. */
  face: Face
  /** Position within the face (0-8, row-major). */
  facePos: number
  /** Column in the 12-wide cross grid (0-11). */
  col: number
  /** Row in the 9-tall cross grid (0-8). */
  row: number
}

/**
 *           +--------+
 *           | U      |
 *           +--------+--------+--------+--------+
 *           | L      | F      | R      | B      |
 *           +--------+--------+--------+--------+
 *           | D      |
 *           +--------+
 *
 * Indices in the cubejs facelet string match this layout: U(0..8) R(9..17)
 * F(18..26) D(27..35) L(36..44) B(45..53).
 */
const FACE_GRID_OFFSETS: Record<Face, { col: number; row: number }> = {
  U: { col: 3, row: 0 },
  L: { col: 0, row: 3 },
  F: { col: 3, row: 3 },
  R: { col: 6, row: 3 },
  B: { col: 9, row: 3 },
  D: { col: 3, row: 6 },
}

const FACE_INDEX_OFFSETS: Record<Face, number> = {
  U: 0,
  R: 9,
  F: 18,
  D: 27,
  L: 36,
  B: 45,
}

export const PLACEMENTS: readonly FacePlacement[] = (() => {
  const out: FacePlacement[] = []
  for (const face of FACES) {
    const { col: colOff, row: rowOff } = FACE_GRID_OFFSETS[face]
    const idxOff = FACE_INDEX_OFFSETS[face]
    for (let pos = 0; pos < 9; pos++) {
      out.push({
        index: idxOff + pos,
        face,
        facePos: pos,
        col: colOff + (pos % 3),
        row: rowOff + Math.floor(pos / 3),
      })
    }
  }
  out.sort((a, b) => a.index - b.index)
  return out
})()

export const GRID_COLS = 12
export const GRID_ROWS = 9

export const CENTER_INDICES: Readonly<Record<Face, number>> = {
  U: 4,
  R: 13,
  F: 22,
  D: 31,
  L: 40,
  B: 49,
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string }

export function validateState(state: string): ValidationResult {
  if (state.length !== 54) {
    return { ok: false, reason: `Expected 54 stickers, got ${state.length}` }
  }
  const counts: Record<string, number> = {}
  for (const ch of state) {
    if (!FACES.includes(ch as Face)) {
      return { ok: false, reason: `Invalid sticker '${ch}' (must be one of ${FACES.join(', ')})` }
    }
    counts[ch] = (counts[ch] ?? 0) + 1
  }
  for (const face of FACES) {
    if (counts[face] !== 9) {
      return { ok: false, reason: `Expected 9 ${face} stickers, got ${counts[face] ?? 0}` }
    }
  }
  const centers = FACES.map((f) => state[CENTER_INDICES[f]])
  const uniqueCenters = new Set(centers)
  if (uniqueCenters.size !== 6) {
    return { ok: false, reason: 'Center stickers must be 6 distinct colors' }
  }
  // Note: we do NOT require centers at canonical positions (i.e. U letter at
  // U center, etc.). Real cube images can be in any of 24 rotational
  // orientations and are still solvable; canonicalizeOrientation() lets the
  // solver treat the input as canonical for its internal purposes.
  return { ok: true }
}

/**
 * Permute the face letters in a state so that centers are at canonical
 * positions (U letter at U center, R at R, etc.). Equivalent to picking up
 * the cube and rotating it so the user's "up face" is what cubejs sees as up.
 *
 * The Rubik's cube has 24 rotational symmetries; this collapses any of them
 * to the canonical one. The actual sticker permutation isn't applied — only
 * the labels are renamed — because Rubik's move notation is defined relative
 * to whatever orientation the cube is in. So a solver run on the canonical-
 * letter version produces moves that work directly when the user follows
 * them on their physically-oriented cube.
 */
export function canonicalizeOrientation(state: string): string {
  const substitution: Record<Face, Face> = {} as Record<Face, Face>
  for (const face of FACES) {
    const currentLetter = state[CENTER_INDICES[face]] as Face
    substitution[currentLetter] = face
  }
  let out = ''
  for (const ch of state) out += substitution[ch as Face]
  return out
}

/** Replace the sticker at the given facelet index with the given face color. */
export function setSticker(state: string, index: number, face: Face): string {
  if (index < 0 || index >= 54) throw new RangeError(`index ${index} out of range`)
  return state.slice(0, index) + face + state.slice(index + 1)
}

/** Cycle a sticker to the next face color (used by the editable UI). */
export function cycleSticker(state: string, index: number): string {
  const current = state[index] as Face
  const next = FACES[(FACES.indexOf(current) + 1) % FACES.length]
  return setSticker(state, index, next)
}
