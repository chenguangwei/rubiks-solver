import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import CameraScanner from './CameraScanner'
import { Cube5553D } from './Cube5553D'
import { useI18n } from './i18n'
import {
  cube555HistoryAdapter,
  invert555Move,
  invert555Moves,
  parse555Move,
  SOLVED_555_STATE,
  stickersFor555State,
  validate555State,
} from './puzzles/555-cube'
import type { Cube555State } from './puzzles/555-cube'
import { msg, msgKey, rawMsg, translateMessage } from './solverText'
import type { SolverMessage, Translate } from './solverText'

type Cube555Status =
  | 'loading'
  | 'ready'
  | 'scrambling'
  | 'solving'
  | 'solution'
  | 'solved'
  | 'error'

const PLAYBACK_MS = 700
const PUZZLE_VALUE = msgKey('practice.short.555')
const MANUAL_MOVES = ['U', 'R', 'F', 'D', 'L', 'B', 'Uw', 'Rw', 'Fw', 'Dw', 'Lw', 'Bw'] as const

function statusLabel(status: Cube555Status, t: Translate): string {
  return t(`practice.status.${status}`)
}

function stateFingerprint(state: Cube555State): string {
  let hash = 0
  for (let i = 0; i < state.length; i++) {
    hash = (hash * 31 + state.charCodeAt(i)) >>> 0
  }
  return hash.toString(36).toUpperCase().padStart(7, '0')
}

function solveHintLabel(solutionHint: string[] | null, t: Translate): string {
  if (solutionHint === null) return t('practice.metric.manualOnly')
  return solutionHint.length
    ? t('practice.metric.reversibleMoves', { count: solutionHint.length })
    : t('practice.metric.solvedBaseline')
}

export function Cube555SolverPage() {
  const { t } = useI18n()
  const displayName = t('practice.display.555')
  const puzzleName = t('practice.short.555')
  const [state, setState] = useState<Cube555State>(SOLVED_555_STATE)
  const [solutionHint, setSolutionHint] = useState<string[] | null>([])
  const [moves, setMoves] = useState<string[] | null>(null)
  const [solutionStates, setSolutionStates] = useState<Cube555State[]>([])
  const [stepIndex, setStepIndex] = useState(0)
  const [autoPlay, setAutoPlay] = useState(false)
  const [playbackTurnMove, setPlaybackTurnMove] = useState<string | null>(null)
  const [manualActive, setManualActive] = useState(false)
  const [manualMoves, setManualMoves] = useState<string[]>([])
  const [status, setStatus] = useState<Cube555Status>('loading')
  const [message, setMessage] = useState<SolverMessage>(() =>
    msg('practice.message.preparing', { puzzle: PUZZLE_VALUE }),
  )
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let mounted = true
    cube555HistoryAdapter
      .init()
      .then(() => {
        if (!mounted) return
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
  const stickers = useMemo(() => stickersFor555State(displayState), [displayState])
  const fingerprint = useMemo(() => stateFingerprint(displayState), [displayState])
  const canManualMove = !busy && status !== 'loading'
  const canSolve = !busy && status !== 'loading'
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
      setPlaybackTurnMove(invert555Move(moves[clamped] ?? ''))
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
    setShowScanner(false)
    setMessage(msg('practice.message.scrambleGenerating', { puzzle: PUZZLE_VALUE }))
    try {
      const result = await cube555HistoryAdapter.randomStateWithScramble()
      setState(result.state)
      setSolutionHint(invert555Moves(result.scrambleMoves))
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
    setShowScanner(false)
    const validation = validate555State(facelets)
    if (!validation.ok) {
      setStatus('error')
      setMessage(rawMsg(validation.reason))
      return
    }
    setState(facelets)
    setSolutionHint(null)
    clearSolution()
    setManualActive(false)
    setManualMoves([])
    setStatus('ready')
    setMessage(msg('practice.message.photoHistoryComplete', { puzzle: PUZZLE_VALUE }))
  }

  function handleImageImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    if (!file) return
    setShareMessage(t('practice.message.imageSelected', { file: file.name }))
    setMessage(msg('practice.message.imageImport.todo', { puzzle: PUZZLE_VALUE }))
    window.setTimeout(() => setShareMessage(null), 3500)
  }

  function handleManualSolveStart() {
    if (status === 'loading') return
    clearSolution()
    setManualActive(true)
    setShowScanner(false)
    setStatus('ready')
    setMessage(msg('practice.message.manualActive.wide', { puzzle: PUZZLE_VALUE }))
  }

  async function handleManualMove(move: string) {
    if (!canManualMove || !parse555Move(move)) return
    setBusy(true)
    clearSolution()
    setManualActive(true)
    setPlaybackTurnMove(move)
    setMessage(msg('practice.message.applying', { move }))
    try {
      const nextState = await cube555HistoryAdapter.applyMoves(state, move)
      const solved = await cube555HistoryAdapter.isSolved(nextState)
      setState(nextState)
      setSolutionHint((current) => (current ? [invert555Move(move), ...current] : null))
      setManualMoves((current) => [...current, move])
      setStatus(solved ? 'solved' : 'ready')
      setMessage(
        solved
          ? msg('practice.message.solvedVerified')
          : msg('practice.message.manualMoveApplied', { move }),
      )
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? rawMsg(error.message) : rawMsg(`Could not apply ${move}.`))
    } finally {
      setBusy(false)
    }
  }

  async function handleSolve() {
    setBusy(true)
    setStatus('solving')
    clearSolution()
    setManualActive(false)
    setShowScanner(false)
    setMessage(msg('practice.message.solving', { puzzle: PUZZLE_VALUE }))
    try {
      if (solutionHint === null) {
        setStatus('error')
        setMessage(msg('practice.message.solveNeedsHistory', { puzzle: PUZZLE_VALUE }))
        return
      }
      const solution = solutionHint
      const states: Cube555State[] = [state]
      let cursor = state
      for (const move of solution) {
        cursor = await cube555HistoryAdapter.applyMoves(cursor, move)
        states.push(cursor)
      }
      const solvedState = states[states.length - 1] ?? state
      const verified = await cube555HistoryAdapter.isSolved(solvedState)
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
    setState(SOLVED_555_STATE)
    setSolutionHint([])
    clearSolution()
    setManualActive(false)
    setManualMoves([])
    setShowScanner(false)
    setStatus('ready')
    setMessage(msg('practice.message.ready', { puzzle: PUZZLE_VALUE }))
  }

  function handlePasteState(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) return
    const validation = validate555State(trimmed)
    if (!validation.ok) {
      setStatus('error')
      setMessage(rawMsg(validation.reason))
      return
    }
    setState(trimmed)
    setSolutionHint(null)
    clearSolution()
    setManualActive(false)
    setManualMoves([])
    setShowScanner(false)
    setStatus('ready')
    setMessage(msg('practice.message.loadedStickerState', { puzzle: PUZZLE_VALUE }))
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
    <section className="workspace workspace-scan workspace-mini2x2 workspace-cube555" aria-label={displayName}>
      {showScanner && (
        <div className="scanner-modal">
          <CameraScanner
            gridSize={5}
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
              <span className="step-badge">5</span>
              <div>
                <h2>{t('practice.control.555.heading')}</h2>
                <p>{t('practice.control.555.description')}</p>
              </div>
            </div>
          </div>
          <div className="tool-buttons">
            <button onClick={handleRotateView}>{t('stage.rotateView')}</button>
            <button onClick={handleShare}>{t('stage.share')}</button>
          </div>
        </div>

        <div className="main-control-screen mini-cube-main-control">
          <div className="main-cube-frame mini-cube-main-frame" aria-label="5x5 main cube frame">
            <Cube5553D state={displayState} turnMove={playbackTurnMove} />

            <div className="corner-actions top-left">
              <button className="glass-action" onClick={handlePhotoSolve} disabled={status === 'loading'}>
                <span aria-hidden="true">[]</span>
                {t('scan.photoSolve')}
              </button>
            </div>

            <div className="corner-actions top-right">
              <button
                className="glass-action"
                onClick={handleRandomScramble}
                disabled={busy || status === 'loading'}
                aria-label={t('practice.random.555')}
              >
                <span aria-hidden="true">R</span>
                {t('scan.randomScramble')}
              </button>
            </div>

            <div className="corner-actions bottom-left">
              <button className="glass-action" onClick={handleReset} disabled={busy || status === 'loading'}>
                <span aria-hidden="true">0</span>
                {t('scan.reset')}
              </button>
            </div>

            <div className="corner-actions bottom-right">
              <label className="glass-action file-glass-action">
                <span aria-hidden="true">+</span>
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
              <div className="step-hud mini-cube-step-hud" aria-label="5x5 current step">
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
              <div className="floating-playback-dock" aria-label="5x5 playback controls">
                <button onClick={() => setPlaybackStep(stepIndex - 1)} disabled={stepIndex === 0}>
                  {t('solution.prev')}
                </button>
                <button
                  className="play-toggle primary"
                  onClick={() => setAutoPlay((playing) => !playing)}
                  disabled={stepIndex >= moveCount}
                  aria-pressed={autoPlay}
                >
                  {autoPlay ? t('solution.pause') : t('solution.play')}
                </button>
                <button onClick={() => setPlaybackStep(stepIndex + 1)} disabled={stepIndex >= moveCount}>
                  {t('solution.next')}
                </button>
              </div>
            ) : (
              <section className="solve-choice-dock mini-cube-solve-dock" aria-label="5x5 solve dock">
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
            <section className="main-manual-panel mini-cube-manual-panel" aria-label="5x5 manual controls">
              <div className="operation-title-row">
                <h2>{t('main.manualSolve')}</h2>
                <span>{t('practice.manualMoveCount', { count: manualMoves.length })}</span>
              </div>
              <div className="manual-controls cube-555-manual-controls">
                {MANUAL_MOVES.map((move) => (
                  <button key={move} onClick={() => handleManualMove(move)} disabled={!canManualMove}>
                    {move}
                  </button>
                ))}
              </div>
              <label className="mini-cube-state-input">
                {t('practice.loadStickerState')}
                <input
                  type="text"
                  placeholder={t('practice.pasteStatePlaceholder')}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    const input = event.currentTarget
                    const value = input.value
                    input.value = ''
                    handlePasteState(value)
                  }}
                  disabled={busy}
                />
              </label>
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
            <div className="status-metrics" aria-label="5x5 state summary">
              <span>{statusLabel(status, t)}</span>
              <span>{t('practice.metric.state', { fingerprint })}</span>
              <span>{moves ? t('practice.metric.moves', { count: moves.length }) : t('practice.metric.noRoute')}</span>
              <span>{t('practice.metric.manualMoves', { count: manualMoves.length })}</span>
              <span>{solveHintLabel(solutionHint, t)}</span>
              <span>{t('practice.scope.known-history')}</span>
              <span>{t('practice.metric.stickers', { count: 150 })}</span>
            </div>
          </section>

          <div className="mini-cube-state-a11y">
            {stickers.map((face, index) => (
              <span key={`${index}-${face}`} aria-label={`5x5 sticker ${index + 1} ${face}`} />
            ))}
          </div>

          <section className="main-route-panel mini-cube-route" aria-label={`${displayName} solution route`}>
            <div className="route-title-row">
              <strong>{t('practice.route.title', { puzzle: puzzleName })}</strong>
              <span>{moves ? t('practice.route.verified') : t('practice.route.generateThenSolve')}</span>
            </div>

            {moves && moves.length > 0 ? (
              <div className="compact-moves" aria-label="5x5 move sequence">
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
                    data-testid="pattern-puzzle-move"
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
