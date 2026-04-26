import { validateState } from './cube'

const HASH_KEY = 'state'

/** Build a shareable URL whose hash encodes the given cube state. */
export function shareUrl(state: string, base?: string): string {
  const origin = base ?? window.location.origin + window.location.pathname
  return `${origin}#${HASH_KEY}=${state}`
}

/**
 * Pull a cube state out of a hash fragment of the form `#state=...` (or
 * `#state=...&other=...`). Returns null if no valid state is encoded.
 */
export function decodeStateFromHash(hash: string): string | null {
  if (!hash) return null
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash
  for (const part of fragment.split('&')) {
    const [k, v] = part.split('=', 2)
    if (k === HASH_KEY && v) {
      const decoded = decodeURIComponent(v)
      if (validateState(decoded).ok) return decoded
    }
  }
  return null
}
