import { FACE_COLORS, FACES, GRID_COLS, GRID_ROWS, PLACEMENTS } from './cube'
import type { Face } from './cube'

export type ImageBuffer = {
  width: number
  height: number
  /** RGBA, row-major. data.length === width * height * 4. */
  data: Uint8ClampedArray
}

export type ParseResult =
  | { ok: true; state: string; samples: Record<number, [number, number, number]> }
  | { ok: false; reason: string }

export type ParseOptions = {
  /**
   * Half-size of the sample patch around each sticker center, in pixels.
   * Final patch is (2k+1) x (2k+1). Default 4 -> 9x9 patch.
   */
  sampleHalfWidth?: number
  /**
   * If true, use the six center stickers' sampled colors as the reference
   * palette for nearest-color matching. Robust against palette differences
   * (e.g. Ruwix vs. our renderer). Default true.
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
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dl = a[0] - b[0]
  const da = a[1] - b[1]
  const db = a[2] - b[2]
  return dl * dl + da * da + db * db
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
  if (Math.abs(stickerW - stickerH) > 1) {
    return {
      ok: false,
      reason: `Image aspect doesn't match a 12x9 grid (stickerW=${stickerW}, stickerH=${stickerH})`,
    }
  }

  const samples: Record<number, [number, number, number]> = {}
  for (const p of PLACEMENTS) {
    const cx = Math.floor((p.col + 0.5) * stickerW)
    const cy = Math.floor((p.row + 0.5) * stickerH)
    samples[p.index] = sampleAverage(workingImg, cx, cy, sampleHalfWidth)
  }

  // Build the reference palette. Either WCA defaults, or the actual sampled
  // colors from the six center stickers (per-image calibration).
  const referencePalette: Record<Face, [number, number, number]> = {} as Record<
    Face,
    [number, number, number]
  >
  if (calibrate) {
    for (const face of FACES) {
      const centerPlacement = PLACEMENTS.find(
        (p) => p.face === face && p.facePos === 4,
      )!
      referencePalette[face] = samples[centerPlacement.index]
    }
  } else {
    for (const face of FACES) referencePalette[face] = hexToRgb(FACE_COLORS[face])
  }
  const referenceLab: Record<Face, [number, number, number]> = {} as Record<
    Face,
    [number, number, number]
  >
  for (const face of FACES) referenceLab[face] = rgbToLab(referencePalette[face])

  let stateChars: string[] = new Array(54)
  for (const p of PLACEMENTS) {
    const lab = rgbToLab(samples[p.index])
    let bestFace: Face = FACES[0]
    let bestDist = Infinity
    for (const face of FACES) {
      const d = labDistance(lab, referenceLab[face])
      if (d < bestDist) {
        bestDist = d
        bestFace = face
      }
    }
    stateChars[p.index] = bestFace
  }

  return { ok: true, state: stateChars.join(''), samples }
}
