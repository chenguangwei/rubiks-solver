import { useEffect, useState } from 'react'
import { CubeNet } from './CubeNet'
import { SOLVED_STATE, validateState } from './cube'
import type { Face } from './cube'
import { initSolver, randomState } from './solver'
import './App.css'

function App() {
  const [state, setState] = useState(SOLVED_STATE)
  const [solverReady, setSolverReady] = useState(false)

  useEffect(() => {
    initSolver().then(() => setSolverReady(true))
  }, [])

  const validation = validateState(state)

  function handleStickerChange(index: number, nextFace: Face) {
    setState((prev) => prev.slice(0, index) + nextFace + prev.slice(index + 1))
  }

  return (
    <main>
      <h1>RubikSolver</h1>
      <p>Click any sticker to cycle its color. (Upload + solve coming soon.)</p>
      <div className="toolbar">
        <button onClick={() => setState(SOLVED_STATE)}>Reset</button>
        <button onClick={() => setState(randomState())}>Random scramble</button>
        <span className="status">
          Solver: {solverReady ? 'ready' : 'initializing…'}
        </span>
      </div>
      <CubeNet state={state} editable onChange={handleStickerChange} />
      <p className={validation.ok ? 'valid' : 'invalid'}>
        {validation.ok ? 'Valid cube state' : `Invalid: ${validation.reason}`}
      </p>
    </main>
  )
}

export default App
