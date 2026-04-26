import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// jsdom has no WebGL, so swap the 3D component for a stub.
vi.mock('./Cube3D', () => ({
  Cube3D: () => null,
}))

// jsdom's Worker support is limited. Mock the solver layer so App can mount
// without spinning up a real worker. Re-export the sync utilities cubejs is
// already happy to provide; only the async solve/solveTight/init are stubbed.
vi.mock('./solver', async () => {
  const core = await import('./solver-core')
  return {
    ...core,
    initSolver: () => Promise.resolve(),
    isSolverReady: () => true,
    solve: async (state: string) => core.solveFastSync(state),
    solveTight: async (state: string) => core.solveFastSync(state),
    terminateSolver: () => {},
  }
})

import App from './App'

describe('App', () => {
  it('renders the title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /RubikSolver/i })).toBeInTheDocument()
  })
})
