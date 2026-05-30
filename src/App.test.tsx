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
  classifyScannedFaces2x2: vi.fn(),
  classifyScannedFaces4x4: vi.fn(),
  classifyScannedFaces5x5: vi.fn(),
  solve: vi.fn(),
  solveTight: vi.fn(),
  terminateSolver: vi.fn(),
}))

// jsdom has no WebGL, so swap the 3D component for a stub.
vi.mock('./Cube3D', () => ({
  Cube3D: () => null,
}))

vi.mock('./MiniCube3D', () => ({
  MiniCube3D: () => (
    <div aria-label="2x2 3D cube preview">
      {Array.from({ length: 12 }, (_, index) => (
        <span key={index} aria-label={`2x2 3D sticker ${index + 1}`} />
      ))}
    </div>
  ),
}))

vi.mock('./Cube4443D', () => ({
  Cube4443D: () => (
    <div aria-label="4x4 3D cube preview">
      {Array.from({ length: 48 }, (_, index) => (
        <span key={index} aria-label={`4x4 3D sticker ${index + 1}`} />
      ))}
    </div>
  ),
}))

vi.mock('./Cube5553D', () => ({
  Cube5553D: () => (
    <div aria-label="5x5 3D cube preview">
      {Array.from({ length: 75 }, (_, index) => (
        <span key={index} aria-label={`5x5 3D sticker ${index + 1}`} />
      ))}
    </div>
  ),
}))

vi.mock('./imageLoader', () => ({
  loadImageToBuffer: appMocks.loadImageToBuffer,
}))

vi.mock('./parser', () => ({
  parseNet: appMocks.parseNet,
  parseFace: appMocks.parseFace,
  sampleFace: appMocks.sampleFace,
  classifyScannedFaces: appMocks.classifyScannedFaces,
  classifyScannedFaces2x2: appMocks.classifyScannedFaces2x2,
  classifyScannedFaces4x4: appMocks.classifyScannedFaces4x4,
  classifyScannedFaces5x5: appMocks.classifyScannedFaces5x5,
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
import { LIVE_PUZZLE_IDS } from './puzzles/catalog'

describe('App', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
      },
    })
    window.history.replaceState(null, '', '/')
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
    appMocks.classifyScannedFaces5x5.mockReturnValue({
      ok: true,
      state:
        'U'.repeat(25) +
        'R'.repeat(25) +
        'F'.repeat(25) +
        'D'.repeat(25) +
        'L'.repeat(25) +
        'B'.repeat(25),
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

  it('renders solver-family navigation without duplicate phase rails', () => {
    const { container } = render(<App />)
    const nav = screen.getByLabelText('Workspace')

    expect(within(nav).getByRole('link', { name: /Cube Solver/i })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: /All Solvers/i })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /2x2 Solver/i })).toHaveAttribute(
      'href',
      '/2x2x2-solver',
    )
    expect(within(nav).getByRole('link', { name: /4x4 Solver/i })).toHaveAttribute(
      'href',
      '/4x4x4-solver',
    )
    expect(within(nav).getByRole('link', { name: /5x5 Solver/i })).toHaveAttribute(
      'href',
      '/5x5x5-solver',
    )
    expect(within(nav).getByRole('link', { name: /Pyraminx Solver/i })).toHaveAttribute(
      'href',
      '/pyraminx-solver',
    )
    expect(within(nav).getByRole('link', { name: /Skewb Solver/i })).toHaveAttribute(
      'href',
      '/skewb-solver',
    )
    expect(within(nav).queryByRole('link', { name: /^Solve$/i })).not.toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Guide/i })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /About/i })).toHaveAttribute('href', '/about')
    expect(screen.queryByRole('button', { name: /Challenge/i })).not.toBeInTheDocument()
    expect(container.querySelector('.phase-rail')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: /Guide/i }))
    expect(screen.getAllByRole('heading', { name: /Operation Guide/i }).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Solve Flow/i)).not.toBeInTheDocument()
  })

  it('toggles the mobile solver tray from the All Solvers control', () => {
    const { container } = render(<App />)
    const button = screen.getByRole('button', { name: /All Solvers/i })
    const tray = container.querySelector('#mobile-solver-tray') as HTMLElement

    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(tray).toHaveAttribute('hidden')

    fireEvent.click(button)

    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(tray).not.toHaveAttribute('hidden')
    expect(within(tray).getByRole('link', { name: /2x2 Solver/i })).toHaveAttribute(
      'href',
      '/2x2x2-solver',
    )
    expect(within(tray).getByRole('link', { name: /5x5 Solver/i })).toHaveAttribute(
      'href',
      '/5x5x5-solver',
    )

    fireEvent.click(within(tray).getByRole('link', { name: /5x5 Solver/i }))

    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(window.location.pathname).toBe('/5x5x5-solver')
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

  it('renders puzzle-specific guides for every live solver', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('link', { name: /Guide/i }))
    expect(screen.getByRole('heading', { name: /3x3 Rubik's Cube Guide/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Learn the solve in four visual stages/i })).toBeInTheDocument()

    const expectedHeadings: Record<(typeof LIVE_PUZZLE_IDS)[number], RegExp> = {
      '222': /2x2 Mini Cube Guide/i,
      '333': /3x3 Rubik's Cube Guide/i,
      '444': /4x4 Rubik's Revenge Guide/i,
      '555': /5x5 Professor's Cube Guide/i,
      pyraminx: /^Pyraminx Guide$/i,
      skewb: /^Skewb Guide$/i,
    }
    const selectorNames: Record<(typeof LIVE_PUZZLE_IDS)[number], RegExp> = {
      '222': /2x2/i,
      '333': /3x3/i,
      '444': /4x4/i,
      '555': /5x5/i,
      pyraminx: /Pyraminx/i,
      skewb: /Skewb/i,
    }

    for (const puzzleId of LIVE_PUZZLE_IDS) {
      fireEvent.click(screen.getByRole('button', { name: selectorNames[puzzleId] }))
      expect(screen.getByRole('heading', { name: expectedHeadings[puzzleId] })).toBeInTheDocument()
    }

    fireEvent.click(screen.getByRole('button', { name: selectorNames['333'] }))
    expect(screen.getByText(/White cross/i)).toBeInTheDocument()
    expect(screen.getByText(/First two layers/i)).toBeInTheDocument()
    expect(screen.getByText(/Orient the last layer/i)).toBeInTheDocument()
    expect(screen.getByText(/Permute the last layer/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Edit Net/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /3D Preview/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/F2L_01/i)).not.toBeInTheDocument()
  })

  it('does not expose cube-size selector buttons in the solve surface', () => {
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
    expect(within(nav).getByRole('link', { name: /魔方求解/i })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /介绍/i })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /^求解$/i })).not.toBeInTheDocument()
  })

  it('localizes every non-3x3 solver workspace in Chinese', async () => {
    window.localStorage.setItem('rubiks-solver:language', 'zh')
    window.localStorage.setItem('rubiks-solver:language-source', 'manual')

    const cases = [
      {
        route: '/2x2x2-solver',
        heading: /2x2 魔方主控/i,
        randomLabel: /随机 2x2 打乱/i,
      },
      {
        route: '/4x4x4-solver',
        heading: /4x4 魔方主控/i,
        randomLabel: /随机 4x4 打乱/i,
      },
      {
        route: '/5x5x5-solver',
        heading: /5x5 魔方主控/i,
        randomLabel: /随机 5x5 打乱/i,
      },
      {
        route: '/pyraminx-solver',
        heading: /金字塔求解器/i,
        randomLabel: /随机金字塔打乱/i,
      },
      {
        route: '/skewb-solver',
        heading: /Skewb 求解器/i,
        randomLabel: /随机 Skewb 打乱/i,
      },
    ] as const

    for (const testCase of cases) {
      window.history.replaceState(null, '', testCase.route)
      const { unmount } = render(
        <I18nProvider>
          <App />
        </I18nProvider>,
      )

      expect(await screen.findByRole('heading', { name: testCase.heading })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: testCase.randomLabel })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /手工求解/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /AI 求解/i })).toBeInTheDocument()
      expect(screen.queryByText(/Cube Control|Preview the|Photo Solve|Random Scramble|Manual Solve/i)).not.toBeInTheDocument()

      unmount()
    }
  })

  it('links from the home page to an SEO about page with route metadata', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('link', { name: /About/i }))

    expect(screen.getByRole('heading', { name: /Online help for every supported twisty puzzle/i })).toBeInTheDocument()
    expect(screen.getByText(/What RubikSolver can do/i)).toBeInTheDocument()
    expect(screen.getByText(/Independent puzzle introductions/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /2x2 Mini Cube/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Rubik's Revenge 4x4/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Pyraminx/i })).toBeInTheDocument()
    expect(screen.getByText(/How it helps in practice/i)).toBeInTheDocument()
    expect(window.location.pathname).toBe('/about')
    await waitFor(() => {
      expect(document.title).toMatch(/What RubikSolver Can Do/i)
      expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
        'href',
        'https://rubikssolver.pro/about',
      )
    })

    fireEvent.click(screen.getByRole('button', { name: /Open Cube Solver/i }))
    expect(window.location.pathname).toBe('/')
    expect(screen.getByRole('heading', { name: /3D Cube Control/i })).toBeInTheDocument()
  })

  it('opens the 2x2 solver route with route metadata', async () => {
    window.history.replaceState(null, '', '/2x2x2-solver')

    render(<App />)

    expect(screen.getByRole('heading', { name: /Mini Cube Solver 2x2x2/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /2x2 Cube Control/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rotate View/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Share/i })).toBeInTheDocument()
    expect(screen.getByLabelText('2x2 main cube frame')).toBeInTheDocument()
    expect(screen.getByLabelText('2x2 solve dock')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Photo Solve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Manual Solve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /AI Solve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Random 2x2 scramble/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Solve 2x2$/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText('2x2 3D cube preview')).toBeInTheDocument()
    expect(screen.getAllByLabelText(/2x2 3D sticker/i)).toHaveLength(12)
    expect(screen.getAllByLabelText(/2x2 sticker/i)).toHaveLength(24)
    const manualButton = screen.getByRole('button', { name: /Manual Solve/i })
    await waitFor(() => expect(manualButton).not.toBeDisabled())
    fireEvent.click(manualButton)
    const manualControls = await screen.findByLabelText('2x2 manual controls')
    expect(within(manualControls).getByRole('button', { name: /^U$/i })).toBeInTheDocument()
    await waitFor(() => {
      expect(document.title).toMatch(/Mini Cube Solver 2x2x2/i)
      expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
        'href',
        'https://rubikssolver.pro/2x2x2-solver',
      )
    })
  })

  it('generates and verifies a 2x2 solution route', async () => {
    window.history.replaceState(null, '', '/2x2x2-solver')

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: /Random 2x2 scramble/i }))
    await screen.findByText(/Scramble ready/i)
    fireEvent.click(screen.getByRole('button', { name: /AI Solve/i }))

    const routePanel = await screen.findByLabelText('2x2 solution route')
    await waitFor(() =>
      expect(screen.getByText('Solution ready. Step through the moves.')).toBeInTheDocument(),
    )
    const routeMoves = within(routePanel).getAllByTestId('mini-cube-move')
    expect(routeMoves.length).toBeGreaterThan(0)
    expect(screen.getByText(/^Current step$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Play/i })).toBeInTheDocument()

    for (let i = 0; i < routeMoves.length; i++) {
      fireEvent.click(screen.getByRole('button', { name: /Next/i }))
    }

    expect(screen.getByText(/Solved and verified/i)).toBeInTheDocument()
  })

  it('opens the 4x4 solver route with the same control workflow', async () => {
    window.history.replaceState(null, '', '/4x4x4-solver')

    render(<App />)

    expect(screen.getByRole('heading', { name: /Rubik's Revenge Solver 4x4x4/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /4x4 Cube Control/i })).toBeInTheDocument()
    expect(screen.getByLabelText('4x4 main cube frame')).toBeInTheDocument()
    expect(screen.getByLabelText('4x4 solve dock')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Photo Solve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Manual Solve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /AI Solve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Random 4x4 scramble/i })).toBeInTheDocument()
    expect(screen.getByLabelText('4x4 3D cube preview')).toBeInTheDocument()
    expect(screen.getAllByLabelText(/4x4 3D sticker/i)).toHaveLength(48)
    expect(screen.getAllByLabelText(/4x4 sticker/i)).toHaveLength(96)
    const manualButton = screen.getByRole('button', { name: /Manual Solve/i })
    await waitFor(() => expect(manualButton).not.toBeDisabled())
    fireEvent.click(manualButton)
    const manualControls = await screen.findByLabelText('4x4 manual controls')
    expect(within(manualControls).getByRole('button', { name: /^U$/i })).toBeInTheDocument()
    expect(within(manualControls).getByRole('button', { name: /^Uw$/i })).toBeInTheDocument()
    await waitFor(() => {
      expect(document.title).toMatch(/Rubik's Revenge Solver 4x4x4/i)
      expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
        'href',
        'https://rubikssolver.pro/4x4x4-solver',
      )
    })
  })

  it('generates and verifies a 4x4 solution route from a legal scramble', async () => {
    window.history.replaceState(null, '', '/4x4x4-solver')

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: /Random 4x4 scramble/i }))
    await screen.findByText(/Scramble ready/i, undefined, { timeout: 30_000 })
    fireEvent.click(screen.getByRole('button', { name: /AI Solve/i }))

    const routePanel = await screen.findByLabelText('4x4 solution route')
    await waitFor(() =>
      expect(screen.getByText('Solution ready. Step through the moves.')).toBeInTheDocument(),
    )
    const routeMoves = within(routePanel).getAllByTestId('cube-444-move')
    expect(routeMoves.length).toBeGreaterThan(0)
    expect(screen.getByText(/^Current step$/i)).toBeInTheDocument()

    for (let i = 0; i < routeMoves.length; i++) {
      fireEvent.click(screen.getByRole('button', { name: /Next/i }))
    }

    expect(screen.getByText(/Solved and verified/i)).toBeInTheDocument()
  }, 35_000)

  it('opens the Pyraminx solver route and verifies a generated solution', async () => {
    window.history.replaceState(null, '', '/pyraminx-solver')

    render(<App />)

    expect(await screen.findByRole('heading', { name: /^Pyraminx Solver$/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Pyraminx Solver main puzzle frame')).toBeInTheDocument()
    expect(screen.getByLabelText('Pyraminx Solver interactive puzzle preview')).toHaveAttribute(
      'data-puzzle',
      'pyraminx',
    )
    expect(screen.getByLabelText('Pyraminx Solver solve dock')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Random Pyraminx scramble/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Random Pyraminx scramble/i }))
    await screen.findByText(/Scramble ready/i)
    await waitFor(() =>
      expect(screen.getByLabelText('Pyraminx Solver interactive puzzle preview')).not.toHaveAttribute(
        'data-setup-moves',
        '',
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: /AI Solve/i }))

    const routePanel = await screen.findByLabelText('Pyraminx Solver solution route')
    await waitFor(() =>
      expect(screen.getByText('Solution ready. Step through the moves.')).toBeInTheDocument(),
    )
    expect(within(routePanel).getAllByTestId('pattern-puzzle-move').length).toBeGreaterThan(0)
    await waitFor(() => {
      expect(document.title).toMatch(/Pyraminx Solver/i)
      expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
        'href',
        'https://rubikssolver.pro/pyraminx-solver',
      )
    })
  }, 30_000)

  it('opens the Skewb solver route and verifies a generated solution', async () => {
    window.history.replaceState(null, '', '/skewb-solver')

    render(<App />)

    expect(await screen.findByRole('heading', { name: /^Skewb Solver$/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Skewb Solver main puzzle frame')).toBeInTheDocument()
    expect(screen.getByLabelText('Skewb Solver interactive puzzle preview')).toHaveAttribute(
      'data-puzzle',
      'skewb',
    )
    expect(screen.getByLabelText('Skewb Solver solve dock')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Random Skewb scramble/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Random Skewb scramble/i }))
    await screen.findByText(/Scramble ready/i)
    fireEvent.click(screen.getByRole('button', { name: /AI Solve/i }))

    const routePanel = await screen.findByLabelText('Skewb Solver solution route')
    await waitFor(() =>
      expect(screen.getByText('Solution ready. Step through the moves.')).toBeInTheDocument(),
    )
    expect(within(routePanel).getAllByTestId('pattern-puzzle-move').length).toBeGreaterThan(0)
    await waitFor(() => {
      expect(document.title).toMatch(/Skewb Solver/i)
      expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
        'href',
        'https://rubikssolver.pro/skewb-solver',
      )
    })
  }, 30_000)

  it('supports inverse manual moves in Pyraminx and Skewb practice previews', async () => {
    window.history.replaceState(null, '', '/pyraminx-solver')

    const { unmount } = render(<App />)

    expect(await screen.findByRole('heading', { name: /^Pyraminx Solver$/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Manual Solve/i }))
    fireEvent.click(await screen.findByRole('button', { name: "U'" }))

    await waitFor(() =>
      expect(screen.getByLabelText('Pyraminx Solver interactive puzzle preview')).toHaveAttribute(
        'data-setup-moves',
        "U'",
      ),
    )

    unmount()
    window.history.replaceState(null, '', '/skewb-solver')
    render(<App />)

    expect(await screen.findByRole('heading', { name: /^Skewb Solver$/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Manual Solve/i }))
    fireEvent.click(await screen.findByRole('button', { name: "R'" }))

    await waitFor(() =>
      expect(screen.getByLabelText('Skewb Solver interactive puzzle preview')).toHaveAttribute(
        'data-setup-moves',
        "R'",
      ),
    )
  }, 30_000)

  it('opens the 5x5 solver route as verified known-history practice', async () => {
    window.history.replaceState(null, '', '/5x5x5-solver')

    render(<App />)

    expect(await screen.findByRole('heading', { name: /Professor's Cube Solver 5x5x5/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /5x5 Cube Control/i })).toBeInTheDocument()
    expect(screen.getByLabelText('5x5 main cube frame')).toBeInTheDocument()
    expect(screen.getByLabelText('5x5 solve dock')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Photo Solve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Manual Solve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /AI Solve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Random 5x5 scramble/i })).toBeInTheDocument()
    expect(screen.getByLabelText('5x5 3D cube preview')).toBeInTheDocument()
    expect(screen.getAllByLabelText(/5x5 3D sticker/i)).toHaveLength(75)
    expect(screen.getAllByLabelText(/5x5 sticker/i)).toHaveLength(150)
    expect(screen.getByText(/Known-history practice/i)).toBeInTheDocument()
    const manualButton = screen.getByRole('button', { name: /Manual Solve/i })
    await waitFor(() => expect(manualButton).not.toBeDisabled())
    fireEvent.click(manualButton)
    const manualControls = await screen.findByLabelText('5x5 manual controls')
    expect(within(manualControls).getByRole('button', { name: /^U$/i })).toBeInTheDocument()
    expect(within(manualControls).getByRole('button', { name: /^Uw$/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Random 5x5 scramble/i }))
    await screen.findByText(/Scramble ready/i, undefined, { timeout: 30_000 })
    fireEvent.click(screen.getByRole('button', { name: /AI Solve/i }))

    const routePanel = await screen.findByLabelText("Professor's Cube Solver 5x5x5 solution route")
    await waitFor(() =>
      expect(screen.getByText('Solution ready. Step through the moves.')).toBeInTheDocument(),
    )
    expect(within(routePanel).getAllByTestId('pattern-puzzle-move').length).toBeGreaterThan(0)
    await waitFor(() => {
      expect(document.title).toMatch(/Professor's Cube Solver 5x5x5/i)
      expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
        'href',
        'https://rubikssolver.pro/5x5x5-solver',
      )
    })
  }, 35_000)

  it('opens 5x5 photo solve with a five-by-five scanner', async () => {
    window.history.replaceState(null, '', '/5x5x5-solver')

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: /Photo Solve/i }))

    expect(screen.getByText(/6-face capture/i)).toBeInTheDocument()
    expect(screen.getByText(/0 \/ 6 faces captured/i)).toBeInTheDocument()
    expect(document.querySelectorAll('.ar-cell')).toHaveLength(25)
  })
})
