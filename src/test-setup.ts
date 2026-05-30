import '@testing-library/jest-dom/vitest'

// @react-three/fiber (via react-use-measure) expects ResizeObserver in the environment.
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).ResizeObserver = ResizeObserver
}
