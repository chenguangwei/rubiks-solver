import { FACE_COLORS, GRID_COLS, GRID_ROWS, PLACEMENTS } from './cube'
import type { Face } from './cube'

export type RenderedNet = {
  width: number
  height: number
  data: Uint8ClampedArray
  /** Pixel size of each sticker, including its share of the gap. */
  stickerSize: number
  /** Inset between sticker boundary and where the colored fill starts. */
  gap: number
}

export type RenderOptions = {
  /** Pixel size of each sticker cell (default 40). */
  stickerSize?: number
  /** Pixel gap between adjacent stickers, drawn as the background color (default 4). */
  gap?: number
  /** RGB background for empty cells and gaps. Default medium gray, chosen
   * to be far from every face color (incl. white) so auto-crop works. */
  background?: [number, number, number]
}

const HEX_RE = /^#([0-9a-f]{6})$/i

function hexToRgb(hex: string): [number, number, number] {
  const m = HEX_RE.exec(hex)
  if (!m) throw new Error(`Bad hex color: ${hex}`)
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function fillRect(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  rgb: [number, number, number],
) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * width + x) * 4
      data[i] = rgb[0]
      data[i + 1] = rgb[1]
      data[i + 2] = rgb[2]
      data[i + 3] = 255
    }
  }
}

/**
 * Render a cube state to an RGBA pixel buffer in the same cross layout that
 * `<CubeNet />` produces. Used by the parser tests as a known-good input so
 * we can do a state → render → parse → state round-trip.
 */
export function renderState(state: string, options: RenderOptions = {}): RenderedNet {
  if (state.length !== 54) throw new Error(`Expected 54-char state, got ${state.length}`)
  const stickerSize = options.stickerSize ?? 40
  const gap = options.gap ?? 4
  const background = options.background ?? [128, 128, 128]
  const width = GRID_COLS * stickerSize
  const height = GRID_ROWS * stickerSize
  const data = new Uint8ClampedArray(width * height * 4)
  fillRect(data, width, 0, 0, width, height, background)

  for (const placement of PLACEMENTS) {
    const face = state[placement.index] as Face
    const fillSize = stickerSize - gap
    const x0 = placement.col * stickerSize + Math.floor(gap / 2)
    const y0 = placement.row * stickerSize + Math.floor(gap / 2)
    fillRect(data, width, x0, y0, fillSize, fillSize, hexToRgb(FACE_COLORS[face]))
  }

  return { width, height, data, stickerSize, gap }
}

/**
 * Sample the RGB color at the geometric center of the sticker at the given
 * facelet index, given a `RenderedNet` (or any compatible {width, data}).
 * Useful for tests and for the parser's own sampling step.
 */
export function sampleStickerCenter(
  net: Pick<RenderedNet, 'width' | 'data' | 'stickerSize'>,
  placementCol: number,
  placementRow: number,
): [number, number, number] {
  const cx = placementCol * net.stickerSize + Math.floor(net.stickerSize / 2)
  const cy = placementRow * net.stickerSize + Math.floor(net.stickerSize / 2)
  const i = (cy * net.width + cx) * 4
  return [net.data[i], net.data[i + 1], net.data[i + 2]]
}
