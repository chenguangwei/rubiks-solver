import { useEffect, useRef, useState } from 'react'
import { Cube3D } from './Cube3D'
import { CubeNet } from './CubeNet'
import { SOLVED_STATE, validateState } from './cube'
import type { Face } from './cube'
import { loadImageToBuffer } from './imageLoader'
import { describeMove, parseMove, stickerIndicesForFace } from './moves'
import { parseNet } from './parser'
import { decodeStateFromHash, shareUrl } from './share'
import { applyMoves, initSolver, isSolverReady, randomState, solve } from './solver'
import './App.css'

type SolverStatus = 'initializing' | 'ready'
type SolveError = { message: string }
type PlaySpeed = 'slow' | 'normal' | 'fast'

const SPEED_MS: Record<PlaySpeed, number> = {
  slow: 1500,
  normal: 700,
  fast: 300,
}

function readInitialState(): string {
  if (typeof window === 'undefined') return SOLVED_STATE
  return decodeStateFromHash(window.location.hash) ?? SOLVED_STATE
}

function App() {
  const [state, setState] = useState(readInitialState)
  const [solverStatus, setSolverStatus] = useState<SolverStatus>(
    isSolverReady() ? 'ready' : 'initializing',
  )
  const [parseError, setParseError] = useState<string | null>(null)
  const [moves, setMoves] = useState<string[] | null>(null)
  const [solveError, setSolveError] = useState<SolveError | null>(null)
  /** Number of moves applied so far while stepping through the solution. 0..moves.length. */
  const [stepIndex, setStepIndex] = useState(0)
  const [autoPlay, setAutoPlay] = useState(false)
  const [playSpeed, setPlaySpeed] = useState<PlaySpeed>('normal')
  const [shareFeedback, setShareFeedback] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    initSolver().then(() => setSolverStatus('ready'))
  }, [])

  // Refs so global event handlers see the freshest values without re-binding.
  const stateRef = useRef(state)
  const movesRef = useRef(moves)
  useEffect(() => {
    stateRef.current = state
  }, [state])
  useEffect(() => {
    movesRef.current = moves
  }, [moves])

  function setStateAndClearMoves(next: string) {
    setState(next)
    setMoves(null)
    setSolveError(null)
    setStepIndex(0)
    setAutoPlay(false)
  }

  async function handleFile(file: File) {
    setParseError(null)
    try {
      const img = await loadImageToBuffer(file)
      const result = parseNet(img)
      if (!result.ok) {
        setParseError(result.reason)
        return
      }
      setStateAndClearMoves(result.state)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err))
    }
  }

  // Paste image from clipboard (Cmd+V / Ctrl+V) anywhere on the page.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            handleFile(file)
            return
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Drag-and-drop image upload anywhere on the page.
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    let dragCount = 0
    function onDragEnter(e: DragEvent) {
      if (!e.dataTransfer?.types.includes('Files')) return
      dragCount++
      setDragging(true)
    }
    function onDragLeave() {
      dragCount = Math.max(0, dragCount - 1)
      if (dragCount === 0) setDragging(false)
    }
    function onDragOver(e: DragEvent) {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    function onDrop(e: DragEvent) {
      e.preventDefault()
      dragCount = 0
      setDragging(false)
      const file = e.dataTransfer?.files?.[0]
      if (file && file.type.startsWith('image/')) handleFile(file)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keyboard navigation through the solution. Bound to window so the focus
  // doesn't matter, scoped off when no solution is active. Pauses auto-play
  // on any manual nudge.
  useEffect(() => {
    if (!moves) return
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setAutoPlay(false)
        setStepIndex((i) => Math.min(moves!.length, i + 1))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setAutoPlay(false)
        setStepIndex((i) => Math.max(0, i - 1))
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault()
        setAutoPlay((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moves])

  // Auto-play tick. Each tick schedules the next via setTimeout so the
  // cancellation story stays simple — toggling autoPlay or moves immediately
  // clears the pending tick.
  useEffect(() => {
    if (!autoPlay || !moves) return
    if (stepIndex >= moves.length) {
      setAutoPlay(false)
      return
    }
    const id = window.setTimeout(() => {
      setStepIndex((i) => Math.min(moves.length, i + 1))
    }, SPEED_MS[playSpeed])
    return () => window.clearTimeout(id)
  }, [autoPlay, stepIndex, moves, playSpeed])

  const validation = validateState(state)
  const canSolve = validation.ok && solverStatus === 'ready'

  const displayState = moves ? applyMoves(state, moves.slice(0, stepIndex)) : state
  const upcomingMove =
    moves && stepIndex < moves.length ? parseMove(moves[stepIndex]) : null
  const highlight = upcomingMove ? stickerIndicesForFace(upcomingMove.face) : []

  function handleStickerChange(index: number, nextFace: Face) {
    setStateAndClearMoves(state.slice(0, index) + nextFace + state.slice(index + 1))
  }

  function handleSolve() {
    setSolveError(null)
    setMoves(null)
    setStepIndex(0)
    setAutoPlay(false)
    try {
      const result = solve(state)
      setMoves(result)
    } catch (err) {
      setSolveError({ message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function handleShare() {
    const url = shareUrl(state)
    try {
      await navigator.clipboard.writeText(url)
      setShareFeedback('Link copied!')
    } catch {
      setShareFeedback(url)
    }
    window.setTimeout(() => setShareFeedback(null), 2500)
  }

  function manualSetStep(next: number) {
    setAutoPlay(false)
    setStepIndex(next)
  }

  return (
    <main className={dragging ? 'dragging' : undefined}>
      <header>
        <h1>RubikSolver</h1>
        <p className="tagline">
          Upload, paste, or drop an unfolded-net image of a scrambled cube — get a
          step-by-step solution.
        </p>
      </header>

      <section className="toolbar">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />
        <button onClick={() => fileInputRef.current?.click()}>Upload net image</button>
        <button onClick={() => setStateAndClearMoves(randomState())}>Random scramble</button>
        <button onClick={() => setStateAndClearMoves(SOLVED_STATE)}>Reset</button>
        <button onClick={handleShare} title="Copy a link that reproduces this exact state">
          Share
        </button>
        <span className={`status status-${solverStatus}`}>
          Solver: {solverStatus === 'ready' ? 'ready' : 'initializing…'}
        </span>
      </section>

      {shareFeedback && <p className="share-feedback">{shareFeedback}</p>}
      {parseError && <p className="error">Image parse error: {parseError}</p>}

      <section className="cube-area">
        <div className="cube-net">
          <CubeNet
            state={displayState}
            editable={!moves}
            onChange={handleStickerChange}
            highlightIndices={highlight}
          />
        </div>
        <div className="cube-3d">
          <Cube3D state={displayState} />
        </div>
      </section>

      {!moves && (
        <section className="validation">
          {validation.ok ? (
            <p className="valid">
              Valid cube state — click any sticker to fix a wrong color. Tip: paste
              (⌘V) or drop a net image anywhere on the page.
            </p>
          ) : (
            <p className="invalid">Invalid: {validation.reason}</p>
          )}
        </section>
      )}

      {!moves && (
        <section className="solve-area">
          <button
            className="primary"
            disabled={!canSolve}
            onClick={handleSolve}
            title={!canSolve && !validation.ok ? validation.reason : undefined}
          >
            Solve
          </button>
          {solveError && <p className="error">{solveError.message}</p>}
        </section>
      )}

      {moves && (
        <Solution
          moves={moves}
          stepIndex={stepIndex}
          setStepIndex={manualSetStep}
          autoPlay={autoPlay}
          setAutoPlay={setAutoPlay}
          playSpeed={playSpeed}
          setPlaySpeed={setPlaySpeed}
        />
      )}

      <footer>
        <Notation />
      </footer>
    </main>
  )
}

function Solution({
  moves,
  stepIndex,
  setStepIndex,
  autoPlay,
  setAutoPlay,
  playSpeed,
  setPlaySpeed,
}: {
  moves: string[]
  stepIndex: number
  setStepIndex: (n: number) => void
  autoPlay: boolean
  setAutoPlay: (next: boolean | ((prev: boolean) => boolean)) => void
  playSpeed: PlaySpeed
  setPlaySpeed: (s: PlaySpeed) => void
}) {
  const completed = stepIndex >= moves.length
  const upcoming = !completed ? parseMove(moves[stepIndex]) : null
  const speeds: PlaySpeed[] = ['slow', 'normal', 'fast']
  return (
    <section className="solution">
      <h2>
        Solution: {moves.length} {moves.length === 1 ? 'move' : 'moves'}
      </h2>
      <p className="move-list">
        {moves.map((m, i) => {
          const cls =
            i < stepIndex
              ? 'move done'
              : i === stepIndex
                ? 'move current'
                : 'move'
          return (
            <span key={i} className={cls}>
              {m}
            </span>
          )
        })}
      </p>
      <div className="step-controls">
        <button
          onClick={() => setStepIndex(Math.max(0, stepIndex - 1))}
          disabled={stepIndex === 0}
        >
          ← Prev
        </button>
        <button
          className="play-toggle"
          onClick={() => setAutoPlay((p) => !p)}
          disabled={completed}
          aria-pressed={autoPlay}
        >
          {autoPlay ? '⏸ Pause' : '▶ Play'}
        </button>
        <span className="step-status">
          {completed ? (
            <>Solved! All {moves.length} moves applied.</>
          ) : (
            <>
              Move {stepIndex + 1} of {moves.length}
              {upcoming && <span className="step-detail"> — {describeMove(upcoming)}</span>}
            </>
          )}
        </span>
        <button
          onClick={() => setStepIndex(Math.min(moves.length, stepIndex + 1))}
          disabled={stepIndex >= moves.length}
        >
          Next →
        </button>
      </div>
      <div className="speed-controls">
        <span className="speed-label">Speed:</span>
        {speeds.map((s) => (
          <button
            key={s}
            className={`speed ${s === playSpeed ? 'active' : ''}`}
            onClick={() => setPlaySpeed(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <p className="step-hint">Tip: ← / → to step, space to play/pause.</p>
    </section>
  )
}

function Notation() {
  return (
    <details className="notation">
      <summary>Notation legend</summary>
      <ul>
        <li>
          <code>U</code>, <code>D</code>, <code>L</code>, <code>R</code>, <code>F</code>,
          <code>B</code> — Up, Down, Left, Right, Front, Back face
        </li>
        <li>Bare letter = 90° clockwise (looking at that face from outside the cube)</li>
        <li>
          <code>'</code> suffix = 90° counter-clockwise (e.g. <code>R'</code>)
        </li>
        <li>
          <code>2</code> suffix = 180° (e.g. <code>F2</code>)
        </li>
      </ul>
    </details>
  )
}

export default App
