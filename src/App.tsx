import { useEffect, useRef, useState } from 'react'
import { CubeNet } from './CubeNet'
import { SOLVED_STATE, validateState } from './cube'
import type { Face } from './cube'
import { loadImageToBuffer } from './imageLoader'
import { describeMove, parseMove, stickerIndicesForFace } from './moves'
import { parseNet } from './parser'
import { applyMoves, initSolver, isSolverReady, randomState, solve } from './solver'
import './App.css'

type SolverStatus = 'initializing' | 'ready'
type SolveError = { message: string }

function App() {
  const [state, setState] = useState(SOLVED_STATE)
  const [solverStatus, setSolverStatus] = useState<SolverStatus>(
    isSolverReady() ? 'ready' : 'initializing',
  )
  const [parseError, setParseError] = useState<string | null>(null)
  const [moves, setMoves] = useState<string[] | null>(null)
  const [solveError, setSolveError] = useState<SolveError | null>(null)
  /** Number of moves applied so far while stepping through the solution. 0..moves.length. */
  const [stepIndex, setStepIndex] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    initSolver().then(() => setSolverStatus('ready'))
  }, [])

  // Keyboard navigation through the solution. Bound to window so the focus
  // doesn't matter, scoped off when no solution is active.
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
        setStepIndex((i) => Math.min(moves!.length, i + 1))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setStepIndex((i) => Math.max(0, i - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moves])

  const validation = validateState(state)
  const canSolve = validation.ok && solverStatus === 'ready'

  const displayState = moves ? applyMoves(state, moves.slice(0, stepIndex)) : state
  const upcomingMove =
    moves && stepIndex < moves.length ? parseMove(moves[stepIndex]) : null
  const highlight = upcomingMove ? stickerIndicesForFace(upcomingMove.face) : []

  function setStateAndClearMoves(next: string) {
    setState(next)
    setMoves(null)
    setSolveError(null)
    setStepIndex(0)
  }

  function handleStickerChange(index: number, nextFace: Face) {
    setStateAndClearMoves(state.slice(0, index) + nextFace + state.slice(index + 1))
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

  function handleSolve() {
    setSolveError(null)
    setMoves(null)
    setStepIndex(0)
    try {
      const result = solve(state)
      setMoves(result)
    } catch (err) {
      setSolveError({ message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <main>
      <header>
        <h1>RubikSolver</h1>
        <p className="tagline">
          Upload an unfolded-net image of a scrambled cube — get a step-by-step solution.
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
        <span className={`status status-${solverStatus}`}>
          Solver: {solverStatus === 'ready' ? 'ready' : 'initializing…'}
        </span>
      </section>

      {parseError && <p className="error">Image parse error: {parseError}</p>}

      <section className="cube-area">
        <CubeNet
          state={displayState}
          editable={!moves}
          onChange={handleStickerChange}
          highlightIndices={highlight}
        />
      </section>

      {!moves && (
        <section className="validation">
          {validation.ok ? (
            <p className="valid">Valid cube state — click any sticker to fix a wrong color.</p>
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
          {solveError && (
            <p className="error">
              Solver error: {solveError.message}. The cube state may be unreachable from a
              solved cube.
            </p>
          )}
        </section>
      )}

      {moves && (
        <Solution moves={moves} stepIndex={stepIndex} setStepIndex={setStepIndex} />
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
}: {
  moves: string[]
  stepIndex: number
  setStepIndex: (n: number) => void
}) {
  const completed = stepIndex >= moves.length
  const upcoming = !completed ? parseMove(moves[stepIndex]) : null
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
      <p className="step-hint">Tip: use ← / → arrow keys to step through.</p>
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
