import { CENTER_INDICES, FACE_COLORS, FACES, GRID_COLS, GRID_ROWS, PLACEMENTS } from './cube'
import type { Face } from './cube'

export type ImageBuffer = {
  width: number
  height: number
  /** RGBA, row-major. data.length === width * height * 4. */
  data: Uint8ClampedArray
}

export type RgbSample = [number, number, number]
type LabSample = [number, number, number]

export type ParseResult =
  | { ok: true; state: string; samples: Record<number, RgbSample> }
  | { ok: false; reason: string }

export type ParseOptions = {
  /**
   * Half-size of the sample patch around each sticker center, in pixels.
   * Final patch is (2k+1) x (2k+1). Default 4 -> 9x9 patch.
   */
  sampleHalfWidth?: number
  /**
   * If true (default), uses "smart calibration": samples the six center
   * stickers, finds the globally optimal 6-way assignment of those samples
   * to the six WCA faces (minimum total Lab distance over 6! permutations),
   * then classifies every other sticker against those *image* samples.
   * Robust to palette drift (e.g. Ruwix's orange is yellow-shifted enough
   * that nearest-WCA matching would individually misclassify it as yellow,
   * but the bipartite assignment correctly puts orange→L and yellow→D).
   */
  calibrateFromCenters?: boolean
  /**
   * If true, crop the input to the bounding box of non-background pixels
   * before sampling. Lets the parser handle screenshots with surrounding
   * whitespace. Default true.
   */
  autoCrop?: boolean
  /**
   * Per-channel tolerance when classifying a pixel as "background" during
   * auto-crop. Default 16. The background reference is sampled from the
   * image corners.
   */
  backgroundTolerance?: number
  /**
   * Face grid size for single-face sampling. 3 for a standard cube face, 2 for
   * a 2x2 mini cube face, 4 for a 4x4 face, 5 for a 5x5 face. Default 3.
   */
  gridSize?: 2 | 3 | 4 | 5
}

const HEX_RE = /^#([0-9a-f]{6})$/i
function hexToRgb(hex: string): [number, number, number] {
  const m = HEX_RE.exec(hex)
  if (!m) throw new Error(`Bad hex color: ${hex}`)
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

/** sRGB (0-255) -> linear-light (0-1). */
function srgbToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/** Convert sRGB tuple to CIE Lab, using D65 reference white. */
function rgbToLab([r, g, b]: [number, number, number]): [number, number, number] {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  // Linear sRGB -> XYZ (D65)
  const x = lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175
  const z = lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041
  // D65 reference white
  const xn = x / 0.95047
  const yn = y / 1.0
  const zn = z / 1.08883
  const f = (t: number) =>
    t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27) * t / 116 + 16 / 116
  const fx = f(xn)
  const fy = f(yn)
  const fz = f(zn)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function labDistance(
  a: LabSample,
  b: LabSample,
): number {
  const dl = a[0] - b[0]
  const da = a[1] - b[1]
  const db = a[2] - b[2]
  return dl * dl + da * da + db * db
}

function wcaLabByFace(): Record<Face, LabSample> {
  const out: Record<Face, LabSample> = {} as Record<Face, LabSample>
  for (const face of FACES) out[face] = rgbToLab(hexToRgb(FACE_COLORS[face]))
  return out
}

function nearestFace(
  lab: LabSample,
  refsByFace: Record<Face, LabSample>,
): Face {
  let best: Face = FACES[0]
  let bestDist = Infinity
  for (const face of FACES) {
    const d = labDistance(lab, refsByFace[face])
    if (d < bestDist) {
      bestDist = d
      best = face
    }
  }
  return best
}

function bestCenterAssignment(centerLab: Record<Face, LabSample>): Record<Face, Face> {
  const wcaLab = wcaLabByFace()
  let bestPerm: Face[] | null = null
  let bestTotal = Infinity

  function permute(arr: Face[], start: number) {
    if (start === arr.length) {
      let total = 0
      for (let i = 0; i < FACES.length; i++) {
        total += labDistance(centerLab[FACES[i]], wcaLab[arr[i]])
      }
      if (total < bestTotal) {
        bestTotal = total
        bestPerm = arr.slice()
      }
      return
    }
    for (let i = start; i < arr.length; i++) {
      ;[arr[start], arr[i]] = [arr[i], arr[start]]
      permute(arr, start + 1)
      ;[arr[start], arr[i]] = [arr[i], arr[start]]
    }
  }
  permute(FACES.slice() as Face[], 0)

  const centerPosToWcaFace: Record<Face, Face> = {} as Record<Face, Face>
  for (let i = 0; i < FACES.length; i++) {
    centerPosToWcaFace[FACES[i]] = bestPerm![i]
  }
  return centerPosToWcaFace
}

function sampleAverage(
  img: ImageBuffer,
  cx: number,
  cy: number,
  halfWidth: number,
): [number, number, number] {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  const x0 = Math.max(0, cx - halfWidth)
  const x1 = Math.min(img.width - 1, cx + halfWidth)
  const y0 = Math.max(0, cy - halfWidth)
  const y1 = Math.min(img.height - 1, cy + halfWidth)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * img.width + x) * 4
      r += img.data[i]
      g += img.data[i + 1]
      b += img.data[i + 2]
      n++
    }
  }
  return [r / n, g / n, b / n]
}

/**
 * Find the bounding box of non-background pixels. Background is sampled from
 * the corner pixels. Returns null if the entire image looks like background.
 */
function findContentBounds(
  img: ImageBuffer,
  tolerance: number,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const corners: Array<[number, number]> = [
    [0, 0],
    [img.width - 1, 0],
    [0, img.height - 1],
    [img.width - 1, img.height - 1],
  ]
  let br = 0
  let bg = 0
  let bb = 0
  for (const [x, y] of corners) {
    const i = (y * img.width + x) * 4
    br += img.data[i]
    bg += img.data[i + 1]
    bb += img.data[i + 2]
  }
  br /= 4
  bg /= 4
  bb /= 4

  let x0 = img.width
  let y0 = img.height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4
      const dr = Math.abs(img.data[i] - br)
      const dg = Math.abs(img.data[i + 1] - bg)
      const db = Math.abs(img.data[i + 2] - bb)
      if (dr > tolerance || dg > tolerance || db > tolerance) {
        if (x < x0) x0 = x
        if (y < y0) y0 = y
        if (x > x1) x1 = x
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return null
  return { x0, y0, x1, y1 }
}

function cropImage(img: ImageBuffer, x0: number, y0: number, w: number, h: number): ImageBuffer {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcI = ((y0 + y) * img.width + (x0 + x)) * 4
      const dstI = (y * w + x) * 4
      data[dstI] = img.data[srcI]
      data[dstI + 1] = img.data[srcI + 1]
      data[dstI + 2] = img.data[srcI + 2]
      data[dstI + 3] = img.data[srcI + 3]
    }
  }
  return { width: w, height: h, data }
}

/**
 * Parse a flat-net image (12 sticker columns wide, 9 sticker rows tall) into
 * a cube state string. With autoCrop enabled (default), the cross may have
 * surrounding background and will be cropped automatically.
 */
export function parseNet(img: ImageBuffer, options: ParseOptions = {}): ParseResult {
  const sampleHalfWidth = options.sampleHalfWidth ?? 4
  const calibrate = options.calibrateFromCenters ?? true
  const autoCrop = options.autoCrop ?? true
  const backgroundTolerance = options.backgroundTolerance ?? 16

  let workingImg = img
  if (autoCrop) {
    const bounds = findContentBounds(img, backgroundTolerance)
    if (!bounds) return { ok: false, reason: 'Image appears to be entirely background' }
    workingImg = cropImage(
      img,
      bounds.x0,
      bounds.y0,
      bounds.x1 - bounds.x0 + 1,
      bounds.y1 - bounds.y0 + 1,
    )
  }

  const stickerW = workingImg.width / GRID_COLS
  const stickerH = workingImg.height / GRID_ROWS
  const aspectMismatch = Math.abs(stickerW - stickerH) / Math.max(stickerW, stickerH)
  if (aspectMismatch > 0.1) {
    return {
      ok: false,
      reason: `Image aspect doesn't match a 12×9 grid (sticker w=${stickerW.toFixed(1)}, h=${stickerH.toFixed(1)})`,
    }
  }

  const samples: Record<number, RgbSample> = {}
  for (const p of PLACEMENTS) {
    const cx = Math.floor((p.col + 0.5) * stickerW)
    const cy = Math.floor((p.row + 0.5) * stickerH)
    samples[p.index] = sampleAverage(workingImg, cx, cy, sampleHalfWidth)
  }

  // Reference Lab values for the six WCA face colors. Used either directly
  // (no calibration) or as the "what does this center sample look like?"
  // lookup target during calibration.
  const wcaLab = wcaLabByFace()

  const stateChars: string[] = new Array(54)

  if (calibrate) {
    const centerLab: Record<Face, LabSample> = {} as Record<Face, LabSample>
    for (const face of FACES) {
      centerLab[face] = rgbToLab(samples[CENTER_INDICES[face]])
    }

    const centerPosToWcaFace = bestCenterAssignment(centerLab)

    // Each sticker takes the WCA letter of whichever center it most resembles.
    for (const p of PLACEMENTS) {
      const closestCenter = nearestFace(rgbToLab(samples[p.index]), centerLab)
      stateChars[p.index] = centerPosToWcaFace[closestCenter]
    }
    return { ok: true, state: stateChars.join(''), samples }
  }

  // No calibration: classify each sticker against the fixed WCA palette directly.
  for (const p of PLACEMENTS) {
    stateChars[p.index] = nearestFace(rgbToLab(samples[p.index]), wcaLab)
  }
  return { ok: true, state: stateChars.join(''), samples }
}

/**
 * Parse a single face (3x3 grid) from a tightly cropped image.
 * Returns an array of 9 Face characters.
 */
export function parseFace(img: ImageBuffer, options: ParseOptions = {}): Face[] {
  const wcaLab = wcaLabByFace()
  return sampleFace(img, options).map((sample) => nearestFace(rgbToLab(sample), wcaLab))
}

/**
 * Sample the 9 sticker centers from a single face image. The scanner stores
 * these raw samples for all six faces, then classifies them together so the
 * six center stickers calibrate the camera's lighting and color cast.
 */
export function sampleFace(img: ImageBuffer, options: ParseOptions = {}): RgbSample[] {
  const sampleHalfWidth = options.sampleHalfWidth ?? 4
  const gridSize = options.gridSize ?? 3
  const stickerW = img.width / gridSize
  const stickerH = img.height / gridSize
  const samples: RgbSample[] = []
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const cx = Math.floor((col + 0.5) * stickerW)
      const cy = Math.floor((row + 0.5) * stickerH)
      samples.push(sampleAverage(img, cx, cy, sampleHalfWidth))
    }
  }
  return samples
}

export function classifyScannedFaces(
  samplesByFace: Partial<Record<Face, readonly RgbSample[]>>,
): ParseResult {
  const centerLab: Record<Face, LabSample> = {} as Record<Face, LabSample>
  const flatSamples: Record<number, RgbSample> = {}
  for (const face of FACES) {
    const samples = samplesByFace[face]
    if (!samples || samples.length !== 9) {
      return { ok: false, reason: `Missing 9 samples for ${face} face` }
    }
    centerLab[face] = rgbToLab(samples[4])
  }

  const centerPosToWcaFace = bestCenterAssignment(centerLab)
  const stateChars: string[] = []
  for (const face of FACES) {
    const samples = samplesByFace[face]!
    for (let facePos = 0; facePos < 9; facePos++) {
      const sample = samples[facePos]
      const closestCenter = nearestFace(rgbToLab(sample), centerLab)
      stateChars.push(centerPosToWcaFace[closestCenter])
      flatSamples[stateChars.length - 1] = sample
    }
  }

  return { ok: true, state: stateChars.join(''), samples: flatSamples }
}

export function classifyScannedFaces2x2(
  samplesByFace: Partial<Record<Face, readonly RgbSample[]>>,
): ParseResult {
  return classifyFixedPaletteScannedFaces(samplesByFace, 2)
}

export function classifyScannedFaces4x4(
  samplesByFace: Partial<Record<Face, readonly RgbSample[]>>,
): ParseResult {
  return classifyFixedPaletteScannedFaces(samplesByFace, 4)
}

export function classifyScannedFaces5x5(
  samplesByFace: Partial<Record<Face, readonly RgbSample[]>>,
): ParseResult {
  return classifyFixedPaletteScannedFaces(samplesByFace, 5)
}

function classifyFixedPaletteScannedFaces(
  samplesByFace: Partial<Record<Face, readonly RgbSample[]>>,
  gridSize: 2 | 4 | 5,
): ParseResult {
  const wcaLab = wcaLabByFace()
  const stateChars: string[] = []
  const flatSamples: Record<number, RgbSample> = {}
  const counts: Record<Face, number> = { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0 }
  const stickerCount = gridSize * gridSize

  for (const face of FACES) {
    const samples = samplesByFace[face]
    if (!samples || samples.length !== stickerCount) {
      return { ok: false, reason: `Missing ${stickerCount} samples for ${face} face` }
    }
    for (const sample of samples) {
      const classified = nearestFace(rgbToLab(sample), wcaLab)
      stateChars.push(classified)
      flatSamples[stateChars.length - 1] = sample
      counts[classified] += 1
    }
  }

  for (const face of FACES) {
    if (counts[face] !== stickerCount) {
      return { ok: false, reason: `Expected ${stickerCount} ${face} stickers, got ${counts[face]}` }
    }
  }

  return { ok: true, state: stateChars.join(''), samples: flatSamples }
}
