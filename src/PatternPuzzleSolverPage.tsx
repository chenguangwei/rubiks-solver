import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from './i18n'
import { invertMove, invertMoves } from './puzzles/alg'
import type { CubingPatternAdapter, CubingPatternState } from './puzzles/cubingPattern'
import type { PuzzleDefinition } from './puzzles/types'
import { msg, msgKey, rawMsg, translateMessage } from './solverText'
import type { SolverMessage, Translate } from './solverText'

type PatternPuzzleStatus =
  | 'loading'
  | 'ready'
  | 'scrambling'
  | 'solving'
  | 'solution'
  | 'solved'
  | 'error'

type PatternPuzzleSolverPageProps = {
  adapter: CubingPatternAdapter
  definition: PuzzleDefinition
  manualMoves: readonly string[]
}

const PLAYBACK_MS = 700
const TWISTY_PUZZLE_IDS = new Set(['pyraminx', 'skewb'])

type TwistyPracticePuzzleId = 'pyraminx' | 'skewb'

type TwistyPlayerElement = HTMLElement & {
  alg: string
  experimentalSetupAlg: string
  experimentalSetupAnchor: 'start' | 'end'
  pause: () => void
  play: () => void
  jumpToStart: (options?: { flash: boolean }) => void
}

function isTwistyPracticePuzzle(id: string): id is TwistyPracticePuzzleId {
  return TWISTY_PUZZLE_IDS.has(id)
}

function statusLabel(status: PatternPuzzleStatus, t: Translate): string {
  return t(`practice.status.${status}`)
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

function solveScopeLabel(definition: PuzzleDefinition, t: Translate): string {
  return t(`practice.scope.${definition.capabilities.solveScope}`)
}

function PatternPuzzlePlayer({
  definition,
  displayName,
  setupMoves,
  solutionMoves,
  stepIndex,
  autoPlay,
  currentMove,
}: {
  definition: PuzzleDefinition
  displayName: string
  setupMoves: readonly string[]
  solutionMoves: readonly string[] | null
  stepIndex: number
  autoPlay: boolean
  currentMove: string | null
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<TwistyPlayerElement | null>(null)
  const completedSolutionMoves = solutionMoves?.slice(0, stepIndex) ?? []
  const visualSetupMoves = [...setupMoves, ...completedSolutionMoves]
  const setupAlg = visualSetupMoves.join(' ')
  const visibleAlg = currentMove ?? ''
  const dataSetupMoves = setupMoves.join(' ')
  const puzzleId = isTwistyPracticePuzzle(definition.id) ? definition.id : 'pyraminx'

  useEffect(() => {
    const host = hostRef.current
    if (!host || import.meta.env.MODE === 'test') return
    const target = host

    let cancelled = false

    async function mountTwistyPlayer() {
      const { TwistyPlayer } = await import('cubing/twisty')
      if (cancelled) return

      const player = new TwistyPlayer({
        puzzle: puzzleId,
        visualization: '3D',
        background: 'none',
        controlPanel: 'none',
        hintFacelets: 'none',
        experimentalSetupAnchor: 'start',
        cameraLatitude: definition.id === 'pyraminx' ? 28 : 22,
        cameraLongitude: definition.id === 'pyraminx' ? 32 : 38,
        cameraDistance: definition.id === 'pyraminx' ? 5.4 : 5.8,
      }) as TwistyPlayerElement

      player.classList.add('pattern-twisty-player-element')
      target.replaceChildren(player)
      playerRef.current = player
    }

    void mountTwistyPlayer()

    return () => {
      cancelled = true
      playerRef.current?.pause()
      playerRef.current?.remove()
      playerRef.current = null
    }
  }, [definition.id, puzzleId])

  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    player.pause()
    player.experimentalSetupAlg = setupAlg
    player.experimentalSetupAnchor = 'start'
    player.alg = visibleAlg
    player.jumpToStart({ flash: false })
    if (autoPlay && visibleAlg) player.play()
  }, [autoPlay, setupAlg, visibleAlg])

  return (
    <div
      className={`pattern-puzzle-player pattern-puzzle-player-${definition.id}`}
      aria-label={`${displayName} interactive puzzle preview`}
      data-puzzle={puzzleId}
      data-setup-moves={dataSetupMoves}
      data-display-setup-moves={setupAlg}
      data-current-move={visibleAlg}
    >
      <div ref={hostRef} className="pattern-twisty-host" aria-hidden="true" />
      <div className={`pattern-puzzle-fallback ${definition.id}`} aria-hidden="true">
        {definition.id === 'pyraminx' ? (
          <>
            <span className="pattern-pyramid-face face-U" />
            <span className="pattern-pyramid-face face-R" />
            <span className="pattern-pyramid-face face-L" />
            <span className="pattern-pyramid-face face-B" />
          </>
        ) : (
          <>
            <span className="pattern-skewb-face face-U" />
            <span className="pattern-skewb-face face-R" />
            <span className="pattern-skewb-face face-F" />
            <span className="pattern-skewb-face face-L" />
            <span className="pattern-skewb-face face-B" />
          </>
        )}
      </div>
    </div>
  )
}

export function PatternPuzzleSolverPage({
  adapter,
  definition,
  manualMoves,
}: PatternPuzzleSolverPageProps) {
  const { t } = useI18n()
  const puzzleValue = useMemo(() => msgKey(`practice.short.${definition.id}`), [definition.id])
  const notationValue = useMemo(() => msgKey(`practice.notation.${definition.id}`), [definition.id])
  const puzzleName = t(`practice.short.${definition.id}`)
  const displayName = t(`practice.display.${definition.id}`)
  const randomLabel = t(`practice.random.${definition.id}`)
  const description = t(`practice.pattern.${definition.id}.description`)
  const notation = t(`practice.notation.${definition.id}`)
  const [state, setState] = useState<CubingPatternState | null>(null)
  const [solutionHint, setSolutionHint] = useState<string[] | null>(
    definition.capabilities.solveScope === 'known-history' ? [] : null,
  )
  const [moves, setMoves] = useState<string[] | null>(null)
  const [solutionStates, setSolutionStates] = useState<CubingPatternState[]>([])
  const [stepIndex, setStepIndex] = useState(0)
  const [autoPlay, setAutoPlay] = useState(false)
  const [manualActive, setManualActive] = useState(false)
  const [manualHistory, setManualHistory] = useState<string[]>([])
  const [setupMoves, setSetupMoves] = useState<string[]>([])
  const [status, setStatus] = useState<PatternPuzzleStatus>('loading')
  const [message, setMessage] = useState<SolverMessage>(() =>
    msg('practice.message.preparing', { puzzle: puzzleValue }),
  )
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let mounted = true
    adapter
      .init()
      .then(() => {
        if (!mounted) return
        setState(adapter.solvedState())
        setStatus('ready')
        setMessage(msg('practice.message.ready', { puzzle: puzzleValue }))
      })
      .catch((error: unknown) => {
        if (!mounted) return
        setStatus('error')
        setMessage(
          error instanceof Error
            ? rawMsg(error.message)
            : msg('practice.message.initFailed', { puzzle: puzzleValue }),
        )
      })

    return () => {
      mounted = false
    }
  }, [adapter, puzzleValue])

  const displayState = moves ? (solutionStates[stepIndex] ?? state) : state
  const fingerprint = useMemo(() => stateFingerprint(displayState), [displayState])
  const canPlayback = !!moves && moves.length > 0
  const canManualMove = !!state && !busy && status !== 'loading'
  const canSolve =
    !!state &&
    !busy &&
    status !== 'loading' &&
    (definition.capabilities.solveScope !== 'known-history' || solutionHint !== null)
  const currentMove = moves && stepIndex < moves.length ? moves[stepIndex] : null
  const moveCount = moves?.length ?? 0
  const messageText = translateMessage(message, t)

  useEffect(() => {
    if (!autoPlay || !moves || stepIndex >= moves.length) return
    const id = window.setTimeout(() => {
      const nextStep = Math.min(moves.length, stepIndex + 1)
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
  }

  function setPlaybackStep(nextStep: number) {
    if (!moves) return
    const clamped = Math.max(0, Math.min(moves.length, nextStep))
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
    setManualHistory([])
    setMessage(msg('practice.message.scrambleGenerating', { puzzle: puzzleValue }))
    try {
      const result = await adapter.randomStateWithScramble()
      setState(result.state)
      setSetupMoves(result.scrambleMoves)
      setSolutionHint(
        definition.capabilities.solveScope === 'known-history'
          ? invertMoves(result.scrambleMoves)
          : null,
      )
      setStatus('ready')
      setMessage(msg('practice.message.scrambleReady'))
    } catch (error) {
      setStatus('error')
      setMessage(
        error instanceof Error
          ? rawMsg(error.message)
          : msg('practice.message.scrambleFailed', { puzzle: puzzleValue }),
      )
    } finally {
      setBusy(false)
    }
  }

  function handleManualSolveStart() {
    if (!state || status === 'loading') return
    clearSolution()
    setManualActive(true)
    setStatus('ready')
    setMessage(msg('practice.message.manualActive.notation', { notation: notationValue }))
  }

  async function handleManualMove(move: string) {
    if (!state || !canManualMove) return
    setBusy(true)
    clearSolution()
    setManualActive(true)
    setMessage(msg('practice.message.applying', { move }))
    try {
      const nextState = await adapter.applyMoves(state, move)
      const solved = await adapter.isSolved(nextState)
      setState(nextState)
      setSetupMoves((current) => [...current, move])
      setSolutionHint((current) =>
        definition.capabilities.solveScope === 'known-history' && current
          ? [invertMove(move), ...current]
          : current,
      )
      setManualHistory((current) => [...current, move])
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
    if (!state) return
    setBusy(true)
    setStatus('solving')
    clearSolution()
    setManualActive(false)
    setMessage(msg('practice.message.solving', { puzzle: puzzleValue }))
    try {
      const solution =
        definition.capabilities.solveScope === 'known-history'
          ? solutionHint ?? []
          : await adapter.solve(state)
      const states: CubingPatternState[] = [state]
      let cursor = state
      for (const move of solution) {
        cursor = await adapter.applyMoves(cursor, move)
        states.push(cursor)
      }
      const solvedState = states[states.length - 1] ?? state
      const verified = await adapter.isSolved(solvedState)
      setMoves(solution)
      setSolutionStates(states)
      setStepIndex(0)
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
          : msg('practice.message.solveFailed', { puzzle: puzzleValue }),
      )
    } finally {
      setBusy(false)
    }
  }

  function handleReset() {
    if (status === 'loading') return
    setState(adapter.solvedState())
    setSolutionHint(definition.capabilities.solveScope === 'known-history' ? [] : null)
    setSetupMoves([])
    clearSolution()
    setManualActive(false)
    setManualHistory([])
    setStatus('ready')
    setMessage(msg('practice.message.ready', { puzzle: puzzleValue }))
  }

  function handleRotateView() {
    setShareMessage(t('practice.message.previewOrbits', { puzzle: puzzleName }))
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
    <section className="workspace workspace-scan workspace-pattern-puzzle" aria-label={displayName}>
      {shareMessage && <p className="share-feedback mini-cube-share-feedback">{shareMessage}</p>}

      <section className="stage-panel panel mini-cube-stage-panel">
        <div className="stage-toolbar">
          <div>
            <div className="panel-heading compact">
              <span className="step-badge">{definition.id === '555' ? '5' : '*'}</span>
              <div>
                <h2>{displayName}</h2>
                <p>{description}</p>
              </div>
            </div>
          </div>
          <div className="tool-buttons">
            <button onClick={handleRotateView}>{t('practice.inspectState')}</button>
            <button onClick={handleShare}>{t('stage.share')}</button>
          </div>
        </div>

        <div className="main-control-screen mini-cube-main-control pattern-puzzle-main-control">
          <div
            className="main-cube-frame mini-cube-main-frame pattern-puzzle-main-frame"
            aria-label={`${displayName} main puzzle frame`}
          >
              <PatternPuzzlePlayer
                definition={definition}
                displayName={displayName}
                setupMoves={setupMoves}
              solutionMoves={moves}
              stepIndex={stepIndex}
              autoPlay={autoPlay}
              currentMove={currentMove}
            />

            <div className="corner-actions top-right">
              <button
                className="glass-action"
                onClick={handleRandomScramble}
                disabled={busy || status === 'loading'}
                aria-label={randomLabel}
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

            {canPlayback && (
              <div className="step-hud mini-cube-step-hud" aria-label={`${displayName} current step`}>
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
              <div className="floating-playback-dock" aria-label={`${displayName} playback controls`}>
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
              <section
                className="solve-choice-dock mini-cube-solve-dock"
                aria-label={`${displayName} solve dock`}
              >
                <button
                  className={manualActive ? 'active' : ''}
                  onClick={handleManualSolveStart}
                  disabled={!canManualMove}
                >
                  {t('main.manualSolve')}
                </button>
                <button className="primary" onClick={handleSolve} disabled={!canSolve}>
                  {status === 'solving' ? t('solve.solving') : t('main.aiSolve')}
                </button>
              </section>
            )}
          </div>

          {manualActive && !canPlayback && (
            <section className="main-manual-panel mini-cube-manual-panel" aria-label={`${displayName} manual controls`}>
              <div className="operation-title-row">
                <h2>{t('main.manualSolve')}</h2>
                <span>{t('practice.manualMoveCount', { count: manualHistory.length })}</span>
              </div>
              <div className="manual-controls pattern-manual-controls">
                {manualMoves.map((move) => (
                  <button key={move} onClick={() => handleManualMove(move)} disabled={!canManualMove}>
                    {move}
                  </button>
                ))}
              </div>
              <div className="operation-meta">
                <span>{manualHistory.length ? manualHistory.join(' ') : t('practice.noManualMoves')}</span>
                <span>{statusLabel(status, t)}</span>
              </div>
            </section>
          )}

          <section className="solve-status-strip">
            <div>
              <strong>{displayName}</strong>
              <span>{messageText}</span>
            </div>
            <div className="status-metrics" aria-label={`${displayName} state summary`}>
              <span>{statusLabel(status, t)}</span>
              <span>{solveScopeLabel(definition, t)}</span>
              <span>{t('practice.metric.state', { fingerprint })}</span>
              <span>{moves ? t('practice.metric.moves', { count: moves.length }) : t('practice.metric.noRoute')}</span>
              <span>{t('practice.metric.manualMoves', { count: manualHistory.length })}</span>
              <span>{t('practice.metric.stickers', { count: definition.stickerCount })}</span>
            </div>
          </section>

          <section className="main-route-panel mini-cube-route" aria-label={`${displayName} solution route`}>
            <div className="route-title-row">
              <strong>{t('practice.route.title', { puzzle: displayName })}</strong>
              <span>{moves ? t('practice.route.verified') : notation}</span>
            </div>

            {moves && moves.length > 0 ? (
              <div className="compact-moves" aria-label={`${displayName} move sequence`}>
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
                  : t('practice.route.empty', { puzzle: displayName })}
              </p>
            )}
          </section>
        </div>
      </section>
    </section>
  )
}
