import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  it('renders the simplified product navigation without duplicate phase rails', () => {
    const { container } = render(<App />)

    expect(screen.getByRole('button', { name: /Set Cube/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Solve$/i }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Guide/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /2x2/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /4x4/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /5x5/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Challenge/i })).not.toBeInTheDocument()
    expect(container.querySelector('.phase-rail')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Guide/i }))
    expect(screen.getAllByRole('heading', { name: /Operation Guide/i }).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Solve Flow/i)).not.toBeInTheDocument()
  })

  it('keeps Set Cube focused on net editing and blocks impossible paint edits', () => {
    const { container } = render(<App />)

    expect(screen.queryByRole('button', { name: /Review U/i })).not.toBeInTheDocument()
    expect(screen.getByText(/Paint color/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Solve$/i }).at(-1)).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /Select F Green/i }))
    fireEvent.click(container.querySelector('rect[data-index="0"]')!)
    expect(screen.getByText(/Edit blocked/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Apply Repair Suggestion/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Rotate View/i }))
    expect(screen.getByText(/Net view rotated 90/i)).toBeInTheDocument()
  })

  it('supports solve controls and records manual moves', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Random Scramble/i }))
    fireEvent.click(screen.getAllByRole('button', { name: /^Solve$/i }).at(-1)!)
    expect(await screen.findByRole('heading', { name: /Solve Coach/i })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /Current Algorithm/i })).toBeInTheDocument()

    fireEvent.click(within(screen.getByLabelText('Workspace')).getByRole('button', { name: /^Solve$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^U$/i }))
    expect(within(screen.getByLabelText('Operation Controls')).getByText(/1 moves/i)).toBeInTheDocument()
  })

  it('renders the operation guide instead of the old case library', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Guide/i }))
    expect(screen.getByText(/Create a cube/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Correct stickers/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Use Picker/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { name: /Edit Net/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /3D Preview/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/F2L_01/i)).not.toBeInTheDocument()
  })

  it('does not expose incomplete non-3x3 cube-size controls', () => {
    render(<App />)

    expect(screen.queryByRole('button', { name: /2x2/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /4x4/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /5x5/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Solve$/i }).at(-1)).not.toBeDisabled()
  })

  it('makes picker selection visible and disables fill', () => {
    const { container } = render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Picker/i }))
    fireEvent.click(container.querySelector('rect[data-index="0"]')!)

    expect(screen.getByText(/Picked U/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Fill disabled/i })).toBeDisabled()
  })
})
