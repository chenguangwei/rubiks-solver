import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'

const IMPORTED_STATE =
  'UUUUUUUUU' + 'RRRRRRRRR' + 'FFFFFFFFF' + 'DDDDDDDDD' + 'LLLLLLLLL' + 'BBBBBBBBB'

const appMocks = vi.hoisted(() => ({
  initSolver: vi.fn(),
  isSolverReady: vi.fn(),
  loadImageToBuffer: vi.fn(),
  parseNet: vi.fn(),
  solve: vi.fn(),
  solveTight: vi.fn(),
  terminateSolver: vi.fn(),
}))

// jsdom has no WebGL, so swap the 3D component for a stub.
vi.mock('./Cube3D', () => ({
  Cube3D: () => null,
}))

vi.mock('./imageLoader', () => ({
  loadImageToBuffer: appMocks.loadImageToBuffer,
}))

vi.mock('./parser', () => ({
  parseNet: appMocks.parseNet,
}))

// jsdom's Worker support is limited. Mock the solver layer so App can mount
// without spinning up a real worker. Re-export the sync utilities cubejs is
// already happy to provide; only the async solve/solveTight/init are stubbed.
vi.mock('./solver', async () => {
  const core = await import('./solver-core')
  return {
    ...core,
    initSolver: appMocks.initSolver,
    isSolverReady: appMocks.isSolverReady,
    solve: appMocks.solve,
    solveTight: appMocks.solveTight,
    terminateSolver: appMocks.terminateSolver,
  }
})

import App from './App'

describe('App', () => {
  beforeEach(() => {
    appMocks.initSolver.mockResolvedValue(undefined)
    appMocks.isSolverReady.mockReturnValue(true)
    appMocks.loadImageToBuffer.mockResolvedValue({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray(4),
    })
    appMocks.parseNet.mockReturnValue({
      ok: true,
      state: IMPORTED_STATE,
      samples: {},
    })
    appMocks.solve.mockResolvedValue(['R'])
    appMocks.solveTight.mockResolvedValue(['R'])
    appMocks.terminateSolver.mockImplementation(() => {})
  })

  it('renders the title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /RubikSolver/i })).toBeInTheDocument()
  })

  it('automatically solves a valid imported image state', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, {
      target: { files: [new File(['cube'], 'cube.png', { type: 'image/png' })] },
    })

    await waitFor(() => expect(appMocks.solve).toHaveBeenCalledWith(IMPORTED_STATE))
    expect(
      await screen.findByRole('heading', { name: 'Solution: 1 move' }),
    ).toBeInTheDocument()
  })
})
