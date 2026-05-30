import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { FACES } from './cube'
import type { Face } from './cube'
import CameraScanner from './CameraScanner'
import { MiniCube3D } from './MiniCube3D'
import { useI18n } from './i18n'
import { cube222Adapter } from './puzzles/222'
import type { CubingPatternState } from './puzzles/cubingPattern'
import { msg, msgKey, rawMsg, translateMessage } from './solverText'
import type { SolverMessage, Translate } from './solverText'

type MiniCubeStatus =
  | 'loading'
  | 'ready'
  | 'scrambling'
  | 'solving'
  | 'solution'
  | 'solved'
  | 'error'

const PLAYBACK_MS = 700
const PUZZLE_VALUE = msgKey('practice.short.222')

const CORNER_FACES: readonly (readonly Face[])[] = [
  // Keep in sync with cubing.js 2x2 kpuzzle CORNERS orbit ordering:
  // 0 URF, 1 UBR, 2 UBL, 3 UFL, 4 DFR, 5 DLF, 6 DBL, 7 DRB.
  ['U', 'R', 'F'],
  ['U', 'R', 'B'],
  ['U', 'L', 'B'],
  ['U', 'L', 'F'],
  ['D', 'R', 'F'],
  ['D', 'L', 'F'],
  ['D', 'L', 'B'],
  ['D', 'R', 'B'],
]

type FaceletRef = {
  face: Face
  pos: number
}

const FACELET_OFFSETS: Record<Face, number> = {
  U: 0,
  R: 4,
  F: 8,
  D: 12,
  L: 16,
  B: 20,
}

const CORNER_FACELETS: readonly (readonly FaceletRef[])[] = [
  [{ face: 'U', pos: 3 }, { face: 'R', pos: 1 }, { face: 'F', pos: 1 }],
  [{ face: 'U', pos: 1 }, { face: 'R', pos: 0 }, { face: 'B', pos: 0 }],
  [{ face: 'U', pos: 0 }, { face: 'L', pos: 0 }, { face: 'B', pos: 1 }],
  [{ face: 'U', pos: 2 }, { face: 'L', pos: 1 }, { face: 'F', pos: 0 }],
  [{ face: 'D', pos: 1 }, { face: 'R', pos: 3 }, { face: 'F', pos: 3 }],
  [{ face: 'D', pos: 0 }, { face: 'L', pos: 3 }, { face: 'F', pos: 2 }],
  [{ face: 'D', pos: 2 }, { face: 'L', pos: 2 }, { face: 'B', pos: 3 }],
  [{ face: 'D', pos: 3 }, { face: 'R', pos: 2 }, { face: 'B', pos: 2 }],
]

function rotateFaces(faces: readonly Face[], turns: number): Face[] {
  const normalized = ((turns % faces.length) + faces.length) % faces.length
  return faces.map((_, index) => faces[(index + normalized) % faces.length])
}

function faceletAt(facelets: string, ref: FaceletRef): Face {
  return facelets[FACELET_OFFSETS[ref.face] + ref.pos] as Face
}

function findCornerPiece(colors: readonly Face[]): { piece: number; orientation: number } | null {
  for (let piece = 0; piece < CORNER_FACES.length; piece++) {
    for (let orientation = 0; orientation < 3; orientation++) {
      const candidate = rotateFaces(CORNER_FACES[piece], orientation)
      if (candidate.every((face, index) => face === colors[index])) {
        return { piece, orientation }
      }
    }
  }
  return null
}

function stateFrom2x2Facelets(facelets: string): { ok: true; state: CubingPatternState } | { ok: false; reason: string } {
  if (facelets.length !== 24) {
    return { ok: false, reason: `Expected 24 stickers, got ${facelets.length}` }
  }

  const usedPieces = new Set<number>()
  const pieces: number[] = []
  const orientation: number[] = []

  for (let position = 0; position < CORNER_FACELETS.length; position++) {
    const colors = CORNER_FACELETS[position].map((ref) => faceletAt(facelets, ref))
    const corner = findCornerPiece(colors)
    if (!corner) {
      return { ok: false, reason: `Invalid 2x2 corner at position ${position + 1}: ${colors.join('')}` }
    }
    if (usedPieces.has(corner.piece)) {
      return { ok: false, reason: `Duplicate 2x2 corner: ${colors.join('')}` }
    }
    usedPieces.add(corner.piece)
    pieces.push(corner.piece)
    orientation.push(corner.orientation)
  }

  const solvedState = cube222Adapter.solvedState()
  return {
    ok: true,
    state: {
      puzzleId: '222',
      patternData: {
        ...solvedState.patternData,
        CORNERS: {
          pieces,
          orientation,
        },
      },
    },
  }
}

function stickersForState(state: CubingPatternState | null): Face[] {
  const corners = state?.patternData.CORNERS
  if (!corners) return CORNER_FACES.flat()

  return corners.pieces.flatMap((piece, position) => {
    const faces = CORNER_FACES[piece] ?? CORNER_FACES[position] ?? CORNER_FACES[0]
    return rotateFaces(faces, corners.orientation[position] ?? 0)
  })
}

function stateFingerprint(state: CubingPatternState | null): string {
  if (!state) return 'loading'
  const serialized = JSON.stringify(state.patternData)
  let hash = 0
  for (let i = 0; i < serialized.length; i++) {
    hash = (hash * 31 + serialized.charCodeAt(i)) >>> 0
  }
  return hash.toString(36).toUpperCase().padStart(7, '0')
}

function statusLabel(status: MiniCubeStatus, t: Translate): string {
  return t(`practice.status.${status}`)
}

function invertMove(move: string): string {
  if (move.endsWith("'")) return move.slice(0, -1)
  if (move.endsWith('2')) return move
  return `${move}'`
}

export function MiniCubeSolverPage() {
  const { t } = useI18n()
  const puzzleName = t('practice.short.222')
  const displayName = t('practice.display.222')
  const [state, setState] = useState<CubingPatternState | null>(null)
  const [moves, setMoves] = useState<string[] | null>(null)
  const [solutionStates, setSolutionStates] = useState<CubingPatternState[]>([])
  const [stepIndex, setStepIndex] = useState(0)
  const [autoPlay, setAutoPlay] = useState(false)
  const [playbackTurnMove, setPlaybackTurnMove] = useState<string | null>(null)
  const [manualActive, setManualActive] = useState(false)
  const [manualMoves, setManualMoves] = useState<string[]>([])
  const [status, setStatus] = useState<MiniCubeStatus>('loading')
  const [message, setMessage] = useState<SolverMessage>(() =>
    msg('practice.message.preparing', { puzzle: PUZZLE_VALUE }),
  )
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let mounted = true
    cube222Adapter
      .init()
      .then(() => {
        if (!mounted) return
        setState(cube222Adapter.solvedState())
        setSolutionStates([])
        setStatus('ready')
        setMessage(msg('practice.message.ready', { puzzle: PUZZLE_VALUE }))
      })
      .catch((error: unknown) => {
        if (!mounted) return
        setStatus('error')
        setMessage(
          error instanceof Error
            ? rawMsg(error.message)
            : msg('practice.message.initFailed', { puzzle: PUZZLE_VALUE }),
        )
      })

    return () => {
      mounted = false
    }
  }, [])

  const displayState = moves ? (solutionStates[stepIndex] ?? state) : state
  const stickers = useMemo(() => stickersForState(displayState), [displayState])
  const fingerprint = useMemo(() => stateFingerprint(displayState), [displayState])
  const canSolve = !!state && !busy && status !== 'loading'
  const canManualMove = !!state && !busy && status !== 'loading'
  const canPlayback = !!moves && moves.length > 0
  const currentMove = moves && stepIndex < moves.length ? moves[stepIndex] : null
  const moveCount = moves?.length ?? 0
  const messageText = translateMessage(message, t)

  useEffect(() => {
    if (!autoPlay || !moves || stepIndex >= moves.length) return
    const id = window.setTimeout(() => {
      const nextStep = Math.min(moves.length, stepIndex + 1)
      setPlaybackTurnMove(moves[stepIndex] ?? null)
      setStepIndex(nextStep)
      if (nextStep >= moves.length) {
        setAutoPlay(false)
        setStatus('solved')
        setMessage(msg('practice.message.solvedVerified'))
      }
    }, PLAYBACK_MS)
    return () => window.clearTimeout(id)
  }, [autoPlay, moves, stepIndex])

  function clearSolution() {
    setMoves(null)
    setSolutionStates([])
    setStepIndex(0)
    setAutoPlay(false)
    setPlaybackTurnMove(null)
  }

  function setPlaybackStep(nextStep: number) {
    if (!moves) return
    const clamped = Math.max(0, Math.min(moves.length, nextStep))
    if (clamped === stepIndex) return

    if (clamped === stepIndex + 1) {
      setPlaybackTurnMove(moves[stepIndex] ?? null)
    } else if (clamped === stepIndex - 1) {
      setPlaybackTurnMove(invertMove(moves[clamped] ?? ''))
    } else {
      setPlaybackTurnMove(null)
    }

    setStepIndex(clamped)
    if (clamped >= moves.length) {
      setAutoPlay(false)
      setStatus('solved')
      setMessage(msg('practice.message.solvedVerified'))
    } else {
      setStatus('solution')
      setMessage(msg('practice.message.solutionReady'))
    }
  }

  async function handleRandomScramble() {
    setBusy(true)
    setStatus('scrambling')
    clearSolution()
    setManualActive(false)
    setManualMoves([])
    setMessage(msg('practice.message.scrambleGenerating', { puzzle: PUZZLE_VALUE }))
    try {
      const nextState = await cube222Adapter.randomState()
      setState(nextState)
      setStatus('ready')
      setMessage(msg('practice.message.scrambleReady'))
    } catch (error) {
      setStatus('error')
      setMessage(
        error instanceof Error
          ? rawMsg(error.message)
          : msg('practice.message.scrambleFailed', { puzzle: PUZZLE_VALUE }),
      )
    } finally {
      setBusy(false)
    }
  }

  function handlePhotoSolve() {
    if (status === 'loading') return
    clearSolution()
    setManualActive(false)
    setShowScanner(true)
    setMessage(msg('practice.message.scanFaces', { puzzle: PUZZLE_VALUE }))
  }

  function handleScannerComplete(facelets: string) {
    const result = stateFrom2x2Facelets(facelets)
    setShowScanner(false)
    if (!result.ok) {
      setStatus('error')
      setMessage(rawMsg(result.reason))
      return
    }
    setState(result.state)
    clearSolution()
    setManualActive(false)
    setManualMoves([])
    setStatus('ready')
    setMessage(msg('practice.message.photoComplete', { puzzle: PUZZLE_VALUE }))
  }

  function handleImageImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    if (!file) return
    setShareMessage(t('practice.message.imageSelected', { file: file.name }))
    setMessage(msg('practice.message.imageImport.222Todo'))
    window.setTimeout(() => setShareMessage(null), 3500)
  }

  function handleManualSolveStart() {
    if (!state || status === 'loading') return
    clearSolution()
    setManualActive(true)
    setStatus('ready')
    setMessage(msg('practice.message.manualActive.face', { puzzle: PUZZLE_VALUE }))
  }

  async function handleManualMove(face: Face) {
    if (!state || !canManualMove) return
    setBusy(true)
    clearSolution()
    setManualActive(true)
    setPlaybackTurnMove(face)
    setMessage(msg('practice.message.applying', { move: face }))
    try {
      const nextState = await cube222Adapter.applyMoves(state, face)
      const solved = await cube222Adapter.isSolved(nextState)
      setState(nextState)
      setManualMoves((current) => [...current, face])
      setStatus(solved ? 'solved' : 'ready')
      setMessage(
        solved
          ? msg('practice.message.solvedVerified')
          : msg('practice.message.manualMoveApplied', { move: face }),
      )
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? rawMsg(error.message) : rawMsg(`Could not apply ${face}.`))
    } finally {
      setBusy(false)
    }
  }

  async function handleSolve() {
    if (!state) return
    setBusy(true)
    setStatus('solving')
    clearSolution()
    setManualActive(false)
    setMessage(msg('practice.message.solving', { puzzle: PUZZLE_VALUE }))
    try {
      const solution = await cube222Adapter.solve(state)
      const states: CubingPatternState[] = [state]
      let cursor = state
      for (const move of solution) {
        cursor = await cube222Adapter.applyMoves(cursor, move)
        states.push(cursor)
      }
      const solvedState = states[states.length - 1] ?? state
      const verified = await cube222Adapter.isSolved(solvedState)
      setMoves(solution)
      setSolutionStates(states)
      setStepIndex(0)
      setPlaybackTurnMove(null)
      setStatus(verified ? (solution.length > 0 ? 'solution' : 'solved') : 'error')
      setMessage(
        verified
          ? solution.length > 0
            ? msg('practice.message.solutionReady')
            : msg('practice.message.solvedVerified')
          : msg('practice.message.solutionDidNotVerify'),
      )
    } catch (error) {
      setStatus('error')
      setMessage(
        error instanceof Error
          ? rawMsg(error.message)
          : msg('practice.message.solveFailed', { puzzle: PUZZLE_VALUE }),
      )
    } finally {
      setBusy(false)
    }
  }

  function handleReset() {
    if (status === 'loading') return
    setState(cube222Adapter.solvedState())
    clearSolution()
    setManualActive(false)
    setManualMoves([])
    setStatus('ready')
    setMessage(msg('practice.message.ready', { puzzle: PUZZLE_VALUE }))
  }

  function handleRotateView() {
    setShareMessage(t('practice.message.previewDraggable', { puzzle: puzzleName }))
    window.setTimeout(() => setShareMessage(null), 2500)
  }

  async function handleShare() {
    const url = window.location.href
    try {
      await window.navigator.clipboard?.writeText(url)
      setShareMessage(t('practice.message.linkCopied', { puzzle: puzzleName }))
    } catch {
      setShareMessage(url)
    }
    window.setTimeout(() => setShareMessage(null), 3500)
  }

  return (
    <section className="workspace workspace-scan workspace-mini2x2" aria-label={displayName}>
      {showScanner && (
        <div className="scanner-modal">
          <CameraScanner
            gridSize={2}
            onComplete={handleScannerComplete}
            onCancel={() => setShowScanner(false)}
          />
        </div>
      )}
      <h2 className="visually-hidden">{displayName}</h2>
      {shareMessage && <p className="share-feedback mini-cube-share-feedback">{shareMessage}</p>}

      <section className="stage-panel panel mini-cube-stage-panel">
        <div className="stage-toolbar">
          <div>
            <div className="panel-heading compact">
              <span className="step-badge">2</span>
              <div>
                <h2>{t('practice.control.222.heading')}</h2>
                <p>{t('practice.control.222.description')}</p>
              </div>
            </div>
          </div>
          <div className="tool-buttons">
            <button onClick={handleRotateView}>{t('stage.rotateView')}</button>
            <button onClick={handleShare}>{t('stage.share')}</button>
          </div>
        </div>

        <div className="main-control-screen mini-cube-main-control">
          <div className="main-cube-frame mini-cube-main-frame" aria-label="2x2 main cube frame">
            <MiniCube3D state={displayState} turnMove={playbackTurnMove} />

            <div className="corner-actions top-left">
              <button className="glass-action" onClick={handlePhotoSolve} disabled={status === 'loading'}>
                <span aria-hidden="true">▣</span>
                {t('scan.photoSolve')}
              </button>
            </div>

            <div className="corner-actions top-right">
              <button
                className="glass-action"
                onClick={handleRandomScramble}
                disabled={busy || status === 'loading'}
                aria-label={t('practice.random.222')}
              >
                <span aria-hidden="true">↻</span>
                {t('scan.randomScramble')}
              </button>
            </div>

            <div className="corner-actions bottom-left">
              <button className="glass-action" onClick={handleReset} disabled={busy || status === 'loading'}>
                <span aria-hidden="true">⌂</span>
                {t('scan.reset')}
              </button>
            </div>

            <div className="corner-actions bottom-right">
              <label className="glass-action file-glass-action">
                <span aria-hidden="true">＋</span>
                {t('scan.importImage')}
                <input
                  className="visually-hidden"
                  type="file"
                  accept="image/*"
                  onChange={handleImageImport}
                  disabled={busy || status === 'loading'}
                />
              </label>
            </div>

            {canPlayback && (
              <div className="step-hud mini-cube-step-hud" aria-label="2x2 current step">
                <span>{t('practice.currentStep')}</span>
                <strong>{currentMove ?? t('practice.solved')}</strong>
                <small>
                  {stepIndex >= moveCount
                    ? t('practice.solvedInMoves', { count: moveCount })
                    : t('practice.moveOf', { current: stepIndex + 1, total: moveCount })}
                </small>
              </div>
            )}

            {canPlayback ? (
              <div className="floating-playback-dock" aria-label="2x2 playback controls">
                <button onClick={() => setPlaybackStep(stepIndex - 1)} disabled={stepIndex === 0}>
                  ← {t('solution.prev')}
                </button>
                <button
                  className="play-toggle primary"
                  onClick={() => setAutoPlay((playing) => !playing)}
                  disabled={stepIndex >= moveCount}
                  aria-pressed={autoPlay}
                >
                  {autoPlay ? `⏸ ${t('solution.pause')}` : `▶ ${t('solution.play')}`}
                </button>
                <button onClick={() => setPlaybackStep(stepIndex + 1)} disabled={stepIndex >= moveCount}>
                  {t('solution.next')} →
                </button>
              </div>
            ) : (
              <section className="solve-choice-dock mini-cube-solve-dock" aria-label="2x2 solve dock">
                <button
                  className={manualActive ? 'active' : ''}
                  onClick={handleManualSolveStart}
                  disabled={!canManualMove}
                >
                  {t('main.manualSolve')}
                </button>
                <button
                  className="primary"
                  onClick={handleSolve}
                  disabled={!canSolve}
                >
                  {status === 'solving' ? t('solve.solving') : t('main.aiSolve')}
                </button>
              </section>
            )}
          </div>

          {manualActive && !canPlayback && (
            <section className="main-manual-panel mini-cube-manual-panel" aria-label="2x2 manual controls">
              <div className="operation-title-row">
                <h2>{t('main.manualSolve')}</h2>
                <span>{t('practice.manualMoveCount', { count: manualMoves.length })}</span>
              </div>
              <div className="manual-controls">
                {FACES.map((face) => (
                  <button key={face} onClick={() => handleManualMove(face)} disabled={!canManualMove}>
                    {face}
                  </button>
                ))}
              </div>
              <div className="operation-meta">
                <span>{manualMoves.length ? manualMoves.join(' ') : t('practice.noManualMoves')}</span>
                <span>{statusLabel(status, t)}</span>
              </div>
            </section>
          )}

          <section className="solve-status-strip">
            <div>
              <strong>{displayName}</strong>
              <span>{messageText}</span>
            </div>
            <div className="status-metrics" aria-label="2x2 state summary">
              <span>{statusLabel(status, t)}</span>
              <span>{t('practice.metric.state', { fingerprint })}</span>
              <span>{moves ? t('practice.metric.moves', { count: moves.length }) : t('practice.metric.noRoute')}</span>
              <span>{t('practice.metric.manualMoves', { count: manualMoves.length })}</span>
              <span>{t('practice.metric.stickers', { count: 24 })}</span>
            </div>
          </section>

          <div className="mini-cube-state-a11y">
            {stickers.map((face, index) => (
              <span key={`${index}-${face}`} aria-label={`2x2 sticker ${index + 1} ${face}`} />
            ))}
          </div>

          <section className="main-route-panel mini-cube-route" aria-label="2x2 solution route">
            <div className="route-title-row">
              <strong>{t('practice.route.title', { puzzle: puzzleName })}</strong>
              <span>{moves ? t('practice.route.verified') : t('practice.route.generateThenSolve')}</span>
            </div>

            {moves && moves.length > 0 ? (
              <div className="compact-moves" aria-label="2x2 move sequence">
                {moves.map((move, index) => (
                  <span
                    key={`${move}-${index}`}
                    className={
                      index < stepIndex
                        ? 'move done'
                        : index === stepIndex
                          ? 'move current'
                          : 'move'
                    }
                    data-testid="mini-cube-move"
                  >
                    {move}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mini-cube-empty-route">
                {status === 'solved'
                  ? t('practice.route.alreadySolved')
                  : t('practice.route.empty', { puzzle: puzzleName })}
              </p>
            )}
          </section>
        </div>
      </section>
    </section>
  )
}
