import type { ImageBuffer } from './parser'

/**
 * Load a user-uploaded image into an RGBA pixel buffer compatible with
 * `parseNet`. Browser-only (uses HTMLImageElement + canvas).
 */
export async function loadImageToBuffer(file: File | Blob): Promise<ImageBuffer> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Failed to decode image'))
      el.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not create 2D canvas context')
    ctx.drawImage(img, 0, 0)
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return {
      width: imgData.width,
      height: imgData.height,
      data: imgData.data,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}
