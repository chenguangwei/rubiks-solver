import { useEffect, useRef, useState } from 'react'
import { CubeNet } from './CubeNet'
import { SOLVED_STATE, validateState } from './cube'
import type { Face } from './cube'
import { loadImageToBuffer } from './imageLoader'
import { describeMove, parseMove, stickerIndicesForFace } from './moves'
import { parseNet } from './parser'
import { initSolver, isSolverReady, randomState, solve } from './solver'
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
  const [moveIndex, setMoveIndex] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    initSolver().then(() => setSolverStatus('ready'))
  }, [])

  const validation = validateState(state)
  const canSolve = validation.ok && solverStatus === 'ready'

  function setStateAndClearMoves(next: string) {
    setState(next)
    setMoves(null)
    setSolveError(null)
    setMoveIndex(0)
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
    setMoveIndex(0)
    try {
      const result = solve(state)
      setMoves(result)
    } catch (err) {
      setSolveError({ message: err instanceof Error ? err.message : String(err) })
    }
  }

  const currentMove = moves && moveIndex < moves.length ? moves[moveIndex] : null
  const currentMoveParsed = currentMove ? parseMove(currentMove) : null
  const highlight = currentMoveParsed ? stickerIndicesForFace(currentMoveParsed.face) : []

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
          state={state}
          editable
          onChange={handleStickerChange}
          highlightIndices={highlight}
        />
      </section>

      <section className="validation">
        {validation.ok ? (
          <p className="valid">Valid cube state — click any sticker to fix a wrong color.</p>
        ) : (
          <p className="invalid">Invalid: {validation.reason}</p>
        )}
      </section>

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

      {moves && <Solution moves={moves} index={moveIndex} setIndex={setMoveIndex} />}

      <footer>
        <Notation />
      </footer>
    </main>
  )
}

function Solution({
  moves,
  index,
  setIndex,
}: {
  moves: string[]
  index: number
  setIndex: (n: number) => void
}) {
  const current = moves[index]
  const parsed = current ? parseMove(current) : null
  return (
    <section className="solution">
      <h2>
        Solution: {moves.length} {moves.length === 1 ? 'move' : 'moves'}
      </h2>
      <p className="move-list">
        {moves.map((m, i) => (
          <span key={i} className={i === index ? 'move current' : 'move'}>
            {m}
          </span>
        ))}
      </p>
      <div className="step-controls">
        <button onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}>
          ← Prev
        </button>
        <span className="step-status">
          Step {index + 1} of {moves.length}
          {parsed && <span className="step-detail"> — {describeMove(parsed)}</span>}
        </span>
        <button
          onClick={() => setIndex(Math.min(moves.length - 1, index + 1))}
          disabled={index >= moves.length - 1}
        >
          Next →
        </button>
      </div>
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
