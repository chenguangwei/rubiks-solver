import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'

const IMPORTED_STATE =
  'UUUUUUUUU' + 'RRRRRRRRR' + 'FFFFFFFFF' + 'DDDDDDDDD' + 'LLLLLLLLL' + 'BBBBBBBBB'

const appMocks = vi.hoisted(() => ({
  initSolver: vi.fn(),
  isSolverReady: vi.fn(),
  loadImageToBuffer: vi.fn(),
  parseNet: vi.fn(),
  parseFace: vi.fn(),
  sampleFace: vi.fn(),
  classifyScannedFaces: vi.fn(),
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
  parseFace: appMocks.parseFace,
  sampleFace: appMocks.sampleFace,
  classifyScannedFaces: appMocks.classifyScannedFaces,
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
import { I18nProvider } from './i18n'

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
    appMocks.parseFace.mockReturnValue(['U', 'U', 'U', 'U', 'U', 'U', 'U', 'U', 'U'])
    appMocks.sampleFace.mockReturnValue([
      [255, 255, 255],
      [255, 255, 255],
      [255, 255, 255],
      [255, 255, 255],
      [255, 255, 255],
      [255, 255, 255],
      [255, 255, 255],
      [255, 255, 255],
      [255, 255, 255],
    ])
    appMocks.classifyScannedFaces.mockReturnValue({
      ok: true,
      state: IMPORTED_STATE,
      samples: {},
    })
    appMocks.solve.mockResolvedValue(['R'])
    appMocks.solveTight.mockResolvedValue(['R'])
    appMocks.terminateSolver.mockImplementation(() => {})
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    })
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('renders the title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /RubikSolver/i })).toBeInTheDocument()
  })

  it('automatically solves a valid imported image state on the main screen', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, {
      target: { files: [new File(['cube'], 'cube.png', { type: 'image/png' })] },
    })

    await waitFor(() => expect(appMocks.solve).toHaveBeenCalledWith(IMPORTED_STATE))
    expect(await screen.findByLabelText('AI solution route')).toBeInTheDocument()
    expect(screen.getByLabelText('Playback controls')).toBeInTheDocument()
  })

  it('renders the simplified two-tab product navigation without duplicate phase rails', () => {
    const { container } = render(<App />)
    const nav = screen.getByLabelText('Workspace')

    expect(within(nav).getByRole('button', { name: /Cube Solver/i })).toBeInTheDocument()
    expect(within(nav).queryByRole('button', { name: /^Solve$/i })).not.toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: /Guide/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /2x2/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /4x4/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /5x5/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Challenge/i })).not.toBeInTheDocument()
    expect(container.querySelector('.phase-rail')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Guide/i }))
    expect(screen.getAllByRole('heading', { name: /Operation Guide/i }).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Solve Flow/i)).not.toBeInTheDocument()
  })

  it('prioritizes photo solve and random scramble as the main setup actions', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /3D Cube Control/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Photo Solve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Random Scramble/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Manual Solve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /AI Solve/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Photo Solve/i }))
    expect(screen.getByText(/6-face capture/i)).toBeInTheDocument()
    expect(screen.getByText(/0 \/ 6 faces captured/i)).toBeInTheDocument()
    const captureFaces = screen.getByLabelText('Faces to capture')
    expect(within(captureFaces).getByTitle('U Up')).toHaveTextContent('U')
    expect(within(captureFaces).getByTitle('U Up')).toHaveTextContent('Up')
    expect(within(captureFaces).getByTitle('R Right')).toHaveTextContent('R')
    expect(within(captureFaces).getByTitle('R Right')).toHaveTextContent('Right')
  })

  it('keeps the main screen focused on 3D preview and solve choices', () => {
    render(<App />)

    expect(screen.queryByRole('button', { name: /Review U/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/3D cube preview/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Solve choices/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /AI Solve/i })).not.toBeDisabled()
    expect(screen.queryByRole('heading', { name: /Edit Net/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Rotate View/i }))
    expect(screen.getByText(/3D preview is draggable/i)).toBeInTheDocument()
  })

  it('supports solve controls and records manual moves', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Random Scramble/i }))
    fireEvent.click(screen.getByRole('button', { name: /AI Solve/i }))
    const routePanel = await screen.findByLabelText('AI solution route')
    expect(within(routePanel).getByText(/^AI route$/i)).toBeInTheDocument()
    expect(await screen.findByLabelText('Playback controls')).toBeInTheDocument()
    expect(screen.queryByLabelText('Solve choices')).not.toBeInTheDocument()
    expect(within(routePanel).getByText(/^R$/)).toBeInTheDocument()
  })

  it('renders the visual beginner tutorial instead of secondary product pages', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Guide/i }))
    expect(screen.getByRole('heading', { name: /Learn the solve in four visual stages/i })).toBeInTheDocument()
    expect(screen.getByText(/White cross/i)).toBeInTheDocument()
    expect(screen.getByText(/First two layers/i)).toBeInTheDocument()
    expect(screen.getByText(/Orient the last layer/i)).toBeInTheDocument()
    expect(screen.getByText(/Permute the last layer/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Edit Net/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /3D Preview/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/F2L_01/i)).not.toBeInTheDocument()
  })

  it('does not expose incomplete non-3x3 cube-size controls', () => {
    render(<App />)

    expect(screen.queryByRole('button', { name: /2x2/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /4x4/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /5x5/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /AI Solve/i })).not.toBeDisabled()
  })

  it('shows a share card with a copyable state link', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /^Share$/i }))

    expect(await screen.findByLabelText('Share card')).toBeInTheDocument()
    expect(screen.getByText(/#state=/i)).toBeInTheDocument()
    expect(window.navigator.clipboard.writeText).toHaveBeenCalled()
  })

  it('shows manual turn controls on the main screen', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Manual Solve/i }))

    expect(screen.getByLabelText('Operation Controls')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^U$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^R$/i })).toBeInTheDocument()
  })

  it('switches the interface language from settings', () => {
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByTitle('Settings'))
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'zh' } })

    const nav = screen.getByLabelText('工作区')
    expect(within(nav).getByRole('button', { name: /魔方求解/i })).toBeInTheDocument()
    expect(within(nav).queryByRole('button', { name: /^求解$/i })).not.toBeInTheDocument()
  })
})
