import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Cube3D } from './Cube3D'
import { CubeNet } from './CubeNet'
import { CENTER_INDICES, FACE_COLORS, FACES, SOLVED_STATE, validateState } from './cube'
import type { Face } from './cube'
import { describeMove, parseMove, stickerIndicesForFace } from './moves'
import { decodeStateFromHash, shareUrl } from './share'
import {
  applyMoves,
  initSolver,
  isReachableState,
  isSolverReady,
  randomState,
  solve,
  solveTight,
  terminateSolver,
  cancelPendingSolves,
} from './solver'
import './App.css'
import CameraScanner from './CameraScanner'

type SolverStatus = 'initializing' | 'ready'
type SolveError = { message: string }
type PlaySpeed = 'slow' | 'normal' | 'fast'
type SolveMode = 'fast' | 'tight'
type TightInfo = { baseline: number; current: number }
type WorkspaceTab = 'scan' | 'solve' | 'steps' | 'challenge' | 'replay' | 'profile'
type LearningStage = 'Cross' | 'F2L' | 'OLL' | 'PLL'
type LearningSubTab = 'Overview' | 'Cases' | 'Moves' | 'Tips'
type ChallengeMode = 'Speed' | 'No Hint' | 'Daily' | 'Random'
type UtilityPanel = 'help' | 'settings' | null
type ThemePreference = 'light' | 'focus'
type EditMode = 'paint' | 'fill' | 'picker'
type UserLevel = 'newcomer' | 'learner' | 'advanced' | 'player'

const SPEED_MS: Record<PlaySpeed, number> = {
  slow: 1500,
  normal: 700,
  fast: 300,
}

/** Soft deadline in the worker — between calls, stop trying to tighten further. */
const TIGHT_DEADLINE_MS = 6000
/** Hard deadline on the main thread. If a single cubejs.solve() call blows
 * through the soft deadline, the worker is terminated and we fall back to
 * the latest progress result. The worker is then re-initialised in the
 * background (~3s) so the next solve isn't penalised. */
const TIGHT_HARD_TIMEOUT_MS = 9000

const LS_MOVES_SAVED = 'rubiks-solver:moves-saved'
const LS_TIGHT_COUNT = 'rubiks-solver:tight-count'

const FACE_LABELS: Record<Face, string> = {
  U: 'White',
  R: 'Red',
  F: 'Green',
  D: 'Yellow',
  L: 'Orange',
  B: 'Blue',
}

const CENTER_INDEX_SET = new Set<number>(Object.values(CENTER_INDICES))

const PRODUCT_TABS: readonly { id: WorkspaceTab; label: string }[] = [
  { id: 'scan', label: 'Set Cube' },
  { id: 'solve', label: 'Solve' },
  { id: 'steps', label: 'Guide' },
]

const LEARNING_STAGES: readonly LearningStage[] = ['Cross', 'F2L', 'OLL', 'PLL']
const LEARNING_SUBTABS: readonly LearningSubTab[] = ['Overview', 'Cases', 'Moves', 'Tips']
const CHALLENGE_MODES: readonly ChallengeMode[] = ['Speed', 'No Hint', 'Daily', 'Random']

const LEARNING_CASES = [
  {
    case_id: 'F2L_01',
    stage: 'F2L',
    pattern: 'Corner-edge pair in top layer',
    moves: ['U', 'R', "U'"],
    difficulty: 2,
    alias: 'Insert Pair',
    highlights: [8, 11]
  },
  {
    case_id: 'OLL_01',
    stage: 'OLL',
    pattern: 'Top cross missing',
    moves: ['F', 'R', 'U', "R'", "U'", "F'"],
    difficulty: 3,
    alias: 'F (Sexy Move) F\'',
    highlights: [1, 3, 5, 7]
  },
  {
    case_id: 'PLL_01',
    stage: 'PLL',
    pattern: 'Adjacent corner swap',
    moves: ['R', 'U', "R'", 'F', 'R', "F'"],
    difficulty: 4,
    alias: 'T-Perm (partial)',
    highlights: [0, 2, 6, 8]
  },
] as const

const LS_PRODUCT_HISTORY = 'rubiks-solver:product-history'
const LS_PRODUCT_PB = 'rubiks-solver:product-challenge-pb'
const LS_PRODUCT_RECORDS = 'rubiks-solver:product-challenge-records'

const USER_LEVELS: readonly { id: UserLevel; label: string; description: string }[] = [
  { id: 'newcomer', label: 'Newcomer', description: 'Guided scan and step-by-step solve' },
  { id: 'learner', label: 'Learner', description: 'Understand notation and follow each move' },
  { id: 'advanced', label: 'Advanced', description: 'Use tighter solves and manual turns' },
  { id: 'player', label: 'Player', description: 'Scramble quickly and solve from the move list' },
]

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    const storage = window.localStorage
    if (
      typeof storage?.getItem !== 'function' ||
      typeof storage?.setItem !== 'function'
    ) {
      return null
    }
    return storage
  } catch {
    return null
  }
}

function readNumber(key: string): number {
  const raw = getLocalStorage()?.getItem(key) ?? null
  const n = raw ? parseInt(raw, 10) : 0
  return Number.isFinite(n) ? n : 0
}

function writeNumber(key: string, value: number) {
  getLocalStorage()?.setItem(key, String(value))
}

function readStringArray(key: string): string[] {
  const raw = getLocalStorage()?.getItem(key)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

function writeStringArray(key: string, value: string[]) {
  getLocalStorage()?.setItem(key, JSON.stringify(value.slice(0, 12)))
}

function countFaces(input: string): Record<Face, number> {
  const counts = Object.fromEntries(FACES.map((face) => [face, 0])) as Record<Face, number>
  for (const ch of input) {
    if (FACES.includes(ch as Face)) counts[ch as Face]++
  }
  return counts
}

function repairColorCounts(input: string): string {
  // Not used anymore as we want users to manually fix colors.
  return input
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
  const [solveMode, setSolveMode] = useState<SolveMode | null>(null)
  const [tightInfo, setTightInfo] = useState<TightInfo | null>(null)
  const [solveBusy, setSolveBusy] = useState<SolveMode | null>(null)
  const [solveError, setSolveError] = useState<SolveError | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [autoPlay, setAutoPlay] = useState(false)
  const [playSpeed, setPlaySpeed] = useState<PlaySpeed>('normal')
  const [shareFeedback, setShareFeedback] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('scan')
  const [selectedFace, setSelectedFace] = useState<Face>('F')
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanel>(null)
  const [themePreference, setThemePreference] = useState<ThemePreference>('light')
  const [editMode, setEditMode] = useState<EditMode>('paint')
  const [editMessage, setEditMessage] = useState<string | null>(null)
  const [netRotation, setNetRotation] = useState(0)
  const [userLevel, setUserLevel] = useState<UserLevel>('newcomer')
  const [showNotation, setShowNotation] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [manualMoves, setManualMoves] = useState<string[]>([])
  const [feedback, setFeedback] = useState<'correct' | 'error' | 'repairable' | null>(null)
  const [learningStage, setLearningStage] = useState<LearningStage>('F2L')
  const [learningSubTab, setLearningSubTab] = useState<LearningSubTab>('Overview')
  const [challengeMode, setChallengeMode] = useState<ChallengeMode>('Speed')
  const [practiceMessage, setPracticeMessage] = useState<string | null>(null)
  const [practiceCaseId, setPracticeCaseId] = useState<string | null>(null)
  const [solveStartedAt, setSolveStartedAt] = useState<number | null>(null)
  const [solveFinishedAt, setSolveFinishedAt] = useState<number | null>(null)
  const [productHistory, setProductHistory] = useState(() => readStringArray(LS_PRODUCT_HISTORY))
  const [challengeRecords, setChallengeRecords] = useState(() => readStringArray(LS_PRODUCT_RECORDS))
  const [challengePb, setChallengePb] = useState(() => readNumber(LS_PRODUCT_PB) || 48)
  const [challengeStartedAt, setChallengeStartedAt] = useState<number | null>(null)
  const [replayIndex, setReplayIndex] = useState(0)
  const [savedTotals, setSavedTotals] = useState({
    movesSaved: readNumber(LS_MOVES_SAVED),
    tightCount: readNumber(LS_TIGHT_COUNT),
  })
  const [showScanner, setShowScanner] = useState(false)

  useEffect(() => {
    initSolver().then(() => setSolverStatus('ready'))
  }, [])

  // stateRef tracks the latest committed state so async solve handlers can
  // detect whether the cube changed during their await window and discard
  // stale results.
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])
  const solveBusyRef = useRef<SolveMode | null>(null)
  useEffect(() => {
    solveBusyRef.current = solveBusy
  }, [solveBusy])

  function setStateAndClearMoves(next: string) {
    // If a solve is in flight when the cube state changes (random scramble,
    // reset, sticker edit, paste, drop), cancel the pending request.
    // The worker will discard the result when it eventually finishes.
    if (solveBusyRef.current) {
      cancelPendingSolves()
      setSolveBusy(null)
      setTightInfo(null)
    }
    stateRef.current = next
    setState(next)
    setMoves(null)
    setSolveMode(null)
    setTightInfo(null)
    setSolveError(null)
    setStepIndex(0)
    setAutoPlay(false)
    setActiveTab('scan')
    setManualMoves([])
    setSolveStartedAt(null)
    setSolveFinishedAt(null)
    setReplayIndex(0)
    setFeedback(null)
    setEditMessage(null)
    setPracticeMessage(null)
    setPracticeCaseId(null)
  }

  // Keyboard nav through the solution.
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

  // Auto-play tick.
  useEffect(() => {
    if (!autoPlay || !moves || stepIndex >= moves.length) return
    const id = window.setTimeout(() => {
      const nextStep = Math.min(moves.length, stepIndex + 1)
      setStepIndex(nextStep)
      if (nextStep >= moves.length) setAutoPlay(false)
    }, SPEED_MS[playSpeed])
    return () => window.clearTimeout(id)
  }, [autoPlay, stepIndex, moves, playSpeed])

  const validation = validateState(state)
  const reachable = useMemo(() => isReachableState(state), [state])
  const canSolve = validation.ok && reachable && solverStatus === 'ready' && !solveBusy

  const displayState = moves ? applyMoves(state, moves.slice(0, stepIndex)) : state
  const upcomingMove =
    moves && stepIndex < moves.length ? parseMove(moves[stepIndex]) : null
  const highlight = upcomingMove ? stickerIndicesForFace(upcomingMove.face) : []

  function findPaintSwapIndex(chars: string[], index: number, targetFace: Face): number | null {
    if (CENTER_INDEX_SET.has(index)) {
      const targetCenter = CENTER_INDICES[targetFace]
      return targetCenter !== index && chars[targetCenter] === targetFace ? targetCenter : null
    }
    const nonCenter = chars.findIndex(
      (face, candidate) =>
        candidate !== index && face === targetFace && !CENTER_INDEX_SET.has(candidate),
    )
    if (nonCenter !== -1) return nonCenter
    const targetCenter = CENTER_INDICES[targetFace]
    return targetCenter !== index && chars[targetCenter] === targetFace ? targetCenter : null
  }

  function commitStrictEdit(next: string, successMessage: string) {
    const nextValidation = validateState(next)
    if (!nextValidation.ok) {
      setFeedback('error')
      setEditMessage(`Edit blocked: ${nextValidation.reason}.`)
      return
    }
    if (!isReachableState(next)) {
      setFeedback('error')
      setEditMessage('Edit blocked: that sticker change would create a cube a real 3x3 cannot reach.')
      return
    }
    setStateAndClearMoves(next)
    setFeedback('correct')
    setEditMessage(successMessage)
  }

  function handleStickerChange(index: number, nextFace: Face) {
    if (editMode === 'picker') {
      setSelectedFace(state[index] as Face)
      setEditMessage(`Picked ${state[index]} (${FACE_LABELS[state[index] as Face]}).`)
      setFeedback('correct')
      return
    }
    const face = selectedFace ?? nextFace
    if (editMode === 'fill') {
      setFeedback('error')
      setEditMessage('Fill is disabled because painting a whole face usually creates an impossible cube. Use Paint or Random Scramble.')
      return
    }
    const current = state[index] as Face
    if (current === face) {
      setFeedback('correct')
      setEditMessage(`Sticker is already ${face}.`)
      return
    }
    const chars = state.split('')
    const swapIndex = findPaintSwapIndex(chars, index, face)
    if (swapIndex === null) {
      setFeedback('error')
      setEditMessage(`Edit blocked: no ${face} sticker is available to swap, so color counts would be invalid.`)
      return
    }
    chars[index] = face
    chars[swapIndex] = current
    commitStrictEdit(chars.join(''), `Painted ${face}; swapped one ${current} sticker to keep a legal color count.`)
  }

  async function solveFastForState(requestState: string) {
    setSolveError(null)
    setMoves(null)
    setSolveMode(null)
    setTightInfo(null)
    setStepIndex(0)
    setAutoPlay(false)
    setSolveBusy('fast')
    try {
      const result = await solve(requestState)
      // Belt-and-suspenders: if the cube changed under us (and the worker
      // wasn't terminated for some reason), don't apply stale moves.
      if (stateRef.current !== requestState) return
      setMoves(result)
      setSolveMode('fast')
      setActiveTab('solve')
      setSolveStartedAt(Date.now())
      setSolveFinishedAt(null)
      setFeedback('correct')
    } catch (err) {
      if (stateRef.current !== requestState) return
      const message = err instanceof Error ? err.message : String(err)
      if (message !== 'Solver cancelled') setSolveError({ message })
    } finally {
      setSolveBusy(null)
    }
  }

  async function handleSolveFast() {
    await solveFastForState(state)
  }

  async function handleSolveTight() {
    setSolveError(null)
    setMoves(null)
    setSolveMode(null)
    setTightInfo(null)
    setStepIndex(0)
    setAutoPlay(false)
    setSolveBusy('tight')

    const requestState = state
    let baseline = 0
    let latestProgress: string[] | null = null
    let timedOut = false

    // Hard timeout: if a single solve() call inside the worker blows past
    // the soft deadline (~6s) we terminate the worker and recover with the
    // best progress we've heard so far.
    const hardTimer = window.setTimeout(() => {
      timedOut = true
      terminateSolver()
      if (stateRef.current === requestState) {
        if (latestProgress) {
          setMoves(latestProgress)
          setSolveMode('tight')
          setTightInfo({ baseline, current: latestProgress.length })
          const saved = Math.max(0, baseline - latestProgress.length)
          if (saved > 0) bumpSavedTotals(saved)
        } else {
          setSolveError({
            message: `Tight solve timed out after ${TIGHT_HARD_TIMEOUT_MS / 1000}s with no result. Try Solve (fast) or Random scramble.`,
          })
        }
      }
      setSolveBusy(null)
      setSolverStatus('initializing')
      initSolver().then(() => setSolverStatus('ready'))
    }, TIGHT_HARD_TIMEOUT_MS)

    try {
      const result = await solveTight(requestState, {
        deadlineMs: TIGHT_DEADLINE_MS,
        onProgress: ({ moves: m, phase }) => {
          if (stateRef.current !== requestState) return
          if (phase === 'baseline') baseline = m.length
          latestProgress = m
          setTightInfo({ baseline, current: m.length })
        },
      })
      window.clearTimeout(hardTimer)
      if (timedOut) return
      if (stateRef.current !== requestState) return
      setMoves(result)
      setSolveMode('tight')
      setActiveTab('solve')
      setSolveStartedAt(Date.now())
      setSolveFinishedAt(null)
      setFeedback('correct')
      setTightInfo({ baseline, current: result.length })
      const saved = Math.max(0, baseline - result.length)
      if (saved > 0) bumpSavedTotals(saved)
    } catch (err) {
      window.clearTimeout(hardTimer)
      if (timedOut) return
      if (stateRef.current !== requestState) return
      const message = err instanceof Error ? err.message : String(err)
      if (message !== 'Solver cancelled') setSolveError({ message })
    } finally {
      if (!timedOut) setSolveBusy(null)
    }
  }

  function bumpSavedTotals(saved: number) {
    const newSaved = savedTotals.movesSaved + saved
    const newCount = savedTotals.tightCount + 1
    writeNumber(LS_MOVES_SAVED, newSaved)
    writeNumber(LS_TIGHT_COUNT, newCount)
    setSavedTotals({ movesSaved: newSaved, tightCount: newCount })
  }

  function handleCancelTight() {
    terminateSolver()
    setSolveBusy(null)
    setTightInfo(null)
    setSolverStatus('initializing')
    initSolver().then(() => setSolverStatus('ready'))
  }

  async function handleShare() {
    const url = shareUrl(state)
    try {
      await navigator.clipboard.writeText(url)
      setShareFeedback('Link copied!')
      if (activeTab === 'scan') setEditMessage('Share link copied.')
    } catch {
      setShareFeedback(url)
      if (activeTab === 'scan') setEditMessage('Share link is shown above.')
    }
    window.setTimeout(() => setShareFeedback(null), 2500)
  }

  function manualSetStep(next: number) {
    setAutoPlay(false)
    setStepIndex(next)
    if (moves && next >= moves.length && !solveFinishedAt) {
      setSolveFinishedAt(Date.now())
      const entry = `${new Date().toLocaleDateString()}: solved in ${moves.length} moves`
      const nextHistory = [entry, ...productHistory].slice(0, 12)
      setProductHistory(nextHistory)
      writeStringArray(LS_PRODUCT_HISTORY, nextHistory)
      if (challengeStartedAt) finishChallenge()
    }
  }

  const noHintChallengeActive = challengeStartedAt !== null && challengeMode === 'No Hint'
  const showStepMode =
    (activeTab === 'solve' || activeTab === 'steps') &&
    !!moves &&
    moves.length > 0 &&
    !noHintChallengeActive
  const isProductPage = activeTab === 'challenge' || activeTab === 'replay' || activeTab === 'profile'
  const faceCounts = countFaces(state)
  const hasRepairSuggestion = !validation.ok && state.length === 54
  const canRequestSolve = canSolve && !noHintChallengeActive
  const validationOk = validation.ok && reachable
  const validationMessage = !validation.ok
    ? `Invalid: ${validation.reason}`
    : !reachable
      ? 'Invalid: color counts are balanced, but this sticker layout is not reachable on a real 3x3.'
      : activeTab === 'scan'
        ? 'Cube state is valid and ready to solve.'
        : 'Cube state is valid.'
  const replayMoves = moves?.length ? moves : manualMoves
  const currentReplayMove = replayMoves[replayIndex] ?? null
  const solvedPercent = moves?.length
    ? Math.round((Math.min(stepIndex, moves.length) / moves.length) * 100)
    : validation.ok
      ? 42
      : 0
  const solveElapsedSeconds =
    solveStartedAt === null
      ? 0
      : Math.max(0, Math.round(((solveFinishedAt ?? Date.now()) - solveStartedAt) / 1000))
  function handleRandomScramble() {
    const next = randomState()
    setStateAndClearMoves(next)
    setEditMessage('Random legal scramble loaded. Click Solve or edit stickers.')
  }

  function handleResetScan() {
    setStateAndClearMoves(SOLVED_STATE)
    setNetRotation(0)
  }

  function handleManualMove(face: Face) {
    try {
      if (practiceCaseId) {
        const caseData = LEARNING_CASES.find(c => c.case_id === practiceCaseId)
        if (caseData) {
          const expectedMove = caseData.moves[manualMoves.length]
          if (expectedMove && !expectedMove.startsWith(face)) {
            setFeedback('error')
            setPracticeMessage(`Wrong turn! Expected ${expectedMove}, not ${face}.`)
            return
          }
        }
      }

      const next = applyMoves(state, face)
      stateRef.current = next
      setState(next)
      setMoves(null)
      setSolveMode(null)
      setStepIndex(0)
      setManualMoves((items) => [...items, face])
      setActiveTab('solve')
      setFeedback(validateState(next).ok ? 'correct' : 'error')
      if (practiceCaseId) {
        const caseData = LEARNING_CASES.find(c => c.case_id === practiceCaseId)
        if (caseData && manualMoves.length + 1 >= caseData.moves.length) {
          setPracticeMessage('Case completed successfully!')
          setPracticeCaseId(null)
        } else {
          setPracticeMessage(null)
        }
      }
    } catch {
      setFeedback('error')
    }
  }

  function startChallenge(mode: ChallengeMode) {
    setChallengeMode(mode)
    const next = randomState()
    setStateAndClearMoves(next)
    setActiveTab('solve')
    const startedAt = Date.now()
    setSolveStartedAt(startedAt)
    setChallengeStartedAt(startedAt)
    const record = `${mode}: started ${new Date(startedAt).toLocaleTimeString()}`
    const nextRecords = [record, ...challengeRecords].slice(0, 12)
    setChallengeRecords(nextRecords)
    writeStringArray(LS_PRODUCT_RECORDS, nextRecords)
  }

  function startCasePractice(caseId: string) {
    const caseData = LEARNING_CASES.find(c => c.case_id === caseId)
    if (!caseData) return
    const inverseMoves = [...caseData.moves].reverse().map(m => m.endsWith("'") ? m[0] : (m.endsWith("2") ? m : m + "'"))
    const practiceState = applyMoves(SOLVED_STATE, inverseMoves)
    setStateAndClearMoves(practiceState)
    setPracticeCaseId(caseId)
    setPracticeMessage(`Practice started: ${caseData.alias || caseId}. Do ${caseData.moves.join(' ')}`)
    setActiveTab('solve')
  }

  function handleRotateView() {
    if (activeTab === 'scan') {
      setNetRotation((rotation) => {
        const next = (rotation + 90) % 360
        setEditMessage(`Net view rotated ${next}°. Sticker positions are unchanged.`)
        setFeedback('correct')
        return next
      })
      return
    }
    setShareFeedback('3D preview is draggable.')
    window.setTimeout(() => setShareFeedback(null), 2500)
  }

  function switchTab(tab: WorkspaceTab) {
    setActiveTab(tab)
    if (tab === 'solve' && validation.ok && !moves && solverStatus === 'ready') {
      setFeedback('correct')
    }
  }

  function recordReplayStep(delta: number) {
    setReplayIndex((index) => {
      if (replayMoves.length === 0) return 0
      return Math.max(0, Math.min(replayMoves.length - 1, index + delta))
    })
  }

  function finishChallenge() {
    const elapsed = challengeStartedAt
      ? Math.max(1, Math.round((Date.now() - challengeStartedAt) / 1000))
      : challengePb
    const label = `${challengeMode}: ${elapsed}s, ${manualMoves.length || moves?.length || 0} moves`
    const nextRecords = [label, ...challengeRecords].slice(0, 12)
    setChallengeRecords(nextRecords)
    writeStringArray(LS_PRODUCT_RECORDS, nextRecords)
    if (elapsed < challengePb) {
      setChallengePb(elapsed)
      writeNumber(LS_PRODUCT_PB, elapsed)
    }
    setChallengeStartedAt(null)
    setPracticeMessage(`Challenge complete: ${label}`)
  }

  return (
    <main className={`app-shell theme-${themePreference} ${reducedMotion ? 'reduce-motion' : ''}`}>
      {showScanner && (
        <div className="scanner-modal">
          <CameraScanner 
            onComplete={(nextState) => {
              setStateAndClearMoves(nextState)
              setShowScanner(false)
              if (validateState(nextState).ok && (solverStatus === 'ready' || isSolverReady())) {
                void solveFastForState(nextState)
              }
            }} 
            onCancel={() => setShowScanner(false)} 
          />
        </div>
      )}

      <header className="product-header">
        <div className="brand-lockup">
          <div className="brand-cube" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <h1>RubikSolver</h1>
          <span className={`status-pill status-${solverStatus}`}>
            <span />
            Solver: {solverStatus === 'ready' ? 'ready' : 'initializing'}
          </span>
        </div>

        <nav className="workspace-tabs" aria-label="Workspace">
          {PRODUCT_TABS.map(({ id, label }) => (
            <button
              key={id}
              className={activeTab === id ? 'active' : ''}
              onClick={() => switchTab(id)}
            >
              <span className={`tab-icon tab-icon-${id}`} aria-hidden="true">
                <span />
              </span>
              {label}
            </button>
          ))}
        </nav>

        <div className="header-actions" aria-label="Utility actions">
          <button onClick={() => setUtilityPanel('help')} title="Help">?</button>
          <button onClick={() => setUtilityPanel('settings')} title="Settings">⚙</button>
          <button
            onClick={() => setThemePreference((theme) => (theme === 'light' ? 'focus' : 'light'))}
            title="Theme"
          >
            {themePreference === 'light' ? '◐' : '☀'}
          </button>
        </div>
      </header>

      {utilityPanel && (
        <section className="utility-popover panel" role="dialog" aria-label={utilityPanel}>
          <div className="card-title-row">
            <h2>{utilityPanel === 'help' ? 'Help Center' : 'Settings'}</h2>
            <button onClick={() => setUtilityPanel(null)}>Close</button>
          </div>
          {utilityPanel === 'help' ? (
            <div className="help-grid">
              <p>Set Cube: use Random Scramble, import a net image, or correct stickers manually.</p>
              <p>Paint swaps colors only when the resulting 3x3 is still physically reachable.</p>
              <p>Picker samples a sticker color; Fill is disabled because it usually creates impossible cubes.</p>
              <p>Solve: generate moves, step forward/back, or autoplay the solution.</p>
              <button onClick={handleShare}>Copy Share Link</button>
            </div>
          ) : (
            <div className="settings-grid">
              <label>
                <input
                  type="checkbox"
                  checked={showNotation}
                  onChange={(event) => setShowNotation(event.target.checked)}
                />
                Show notation legend
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={(event) => setReducedMotion(event.target.checked)}
                />
                Reduce motion cues
              </label>
              <div className="segmented-row">
                {USER_LEVELS.map((level) => (
                  <button
                    key={level.id}
                    className={userLevel === level.id ? 'active' : ''}
                    onClick={() => setUserLevel(level.id)}
                    title={level.description}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {(shareFeedback || parseError || solveError) && (
        <section className="notice-strip">
          {shareFeedback && <p className="share-feedback">{shareFeedback}</p>}
          {parseError && <p className="error">Image parse error: {parseError}</p>}
          {solveError && <p className="error">{solveError.message}</p>}
        </section>
      )}

      {isProductPage ? (
        <ProductPage
          activeTab={activeTab}
          challengeMode={challengeMode}
          challengePb={challengePb}
          challengeRecords={challengeRecords}
          challengeStartedAt={challengeStartedAt}
          faceCounts={faceCounts}
          learningStage={learningStage}
          learningSubTab={learningSubTab}
          manualMoves={manualMoves}
          moves={moves}
          practiceMessage={practiceMessage}
          productHistory={productHistory}
          replayIndex={replayIndex}
          replayMoves={replayMoves}
          solvedPercent={solvedPercent}
          onChallengeStart={startChallenge}
          onFinishChallenge={finishChallenge}
          onLearningStage={setLearningStage}
          onLearningSubTab={setLearningSubTab}
          onPracticeCase={startCasePractice}
          onReplayStep={recordReplayStep}
        />
      ) : (
      <section className={`workspace workspace-${activeTab} ${showStepMode ? 'workspace-has-steps' : ''}`}>
        {activeTab === 'scan' && (
        <aside className="capture-panel panel">
          <>
            <div className="panel-heading">
              <span className="step-badge">1</span>
              <div>
                <h2>Set Cube</h2>
                <p>Start with a legal scramble, image import, or camera capture.</p>
              </div>
            </div>
            <div className="setup-actions">
              <button className="primary" onClick={handleRandomScramble}>Random Scramble</button>
              <button onClick={() => setShowScanner(true)}>Use Camera (AR)</button>
              <button onClick={handleResetScan}>Reset</button>
            </div>
            <div className="capture-progress">
              <strong>Paint color</strong>
              <span>{selectedFace} · {FACE_LABELS[selectedFace]}</span>
              <span>{validationMessage}</span>
            </div>
            <div className="tips-card compact">
              <strong>{USER_LEVELS.find((level) => level.id === userLevel)?.label} path</strong>
              <p>{USER_LEVELS.find((level) => level.id === userLevel)?.description}</p>
            </div>
          </>
        </aside>
        )}

        <section className="stage-panel panel">
          <div className="stage-toolbar">
            <div>
              <div className="panel-heading compact">
                <span className="step-badge">{activeTab === 'solve' ? '2' : '1'}</span>
                <div>
                  <h2>
                    {activeTab === 'solve'
                      ? 'Solve Coach'
                      : activeTab === 'steps'
                        ? 'Operation Guide'
                        : showStepMode
                          ? 'Follow Solution'
                          : 'Edit Net'}
                  </h2>
                  <p>
                    {activeTab === 'solve'
                      ? 'Follow the algorithm, rotate manually, or auto-play the next move.'
                      : activeTab === 'steps'
                        ? 'Use the shortest path through the app without extra drills.'
                        : showStepMode
                      ? 'Apply each highlighted move in order.'
                      : editMode === 'picker'
                        ? 'Click a sticker to sample its color.'
                        : 'Click a sticker to swap in the selected color when the result stays legal.'}
                  </p>
                </div>
              </div>
            </div>
            {activeTab !== 'steps' && (
              <div className="tool-buttons">
                <button onClick={handleRotateView}>Rotate View</button>
                <button onClick={handleShare}>Share</button>
              </div>
            )}
          </div>

          {activeTab === 'solve' ? (
            <div className="solve-coach-stage">
              <div className="coach-cube">
                <Cube3D 
                  state={displayState} 
                  highlights={practiceCaseId ? LEARNING_CASES.find(c => c.case_id === practiceCaseId)?.highlights : undefined} 
                />
              </div>
              <div className="coach-card">
                <strong>{currentReplayMove ? `Next move: ${currentReplayMove}` : 'Ready to solve'}</strong>
                <p className="status-message">
                  {solveMode === 'tight'
                    ? `Showing tightest solve (${moves?.length} moves).`
                    : noHintChallengeActive
                    ? 'No Hint challenge is active. Use manual controls and your own recall.'
                    : upcomingMove
                    ? describeMove(upcomingMove)
                    : moves?.length
                      ? 'All generated moves have been applied.'
                      : 'Use Solve to generate an algorithm or practice with manual controls.'}
                </p>
                <div className="coach-stats">
                  <span>{solvedPercent}% progress</span>
                  <span>{manualMoves.length} manual moves</span>
                  <span>{solveElapsedSeconds}s timer</span>
                </div>
                <section className="operation-controls-panel" aria-label="Operation Controls">
                  <div className="operation-title-row">
                    <h2>Operation Controls</h2>
                    <span>{manualMoves.length} moves</span>
                  </div>
                  <div className="manual-controls">
                    {FACES.map((face) => (
                      <button key={face} onClick={() => handleManualMove(face)}>
                        {face}
                      </button>
                    ))}
                  </div>
                <div className="operation-meta">
                  <span>Timer {solveElapsedSeconds}s</span>
                  <span>Progress {solvedPercent}%</span>
                  {challengeStartedAt && (
                    <span>
                      {challengeMode}
                      {noHintChallengeActive ? ' no hints' : ''}
                    </span>
                  )}
                </div>
                {practiceMessage && <p className="practice-hint" style={{ color: 'var(--blue-deep)', fontWeight: 'bold' }}>{practiceMessage}</p>}
                {feedback && <p className={`feedback ${feedback}`}>Status: {feedback}</p>}
              </section>
            </div>
          </div>
        ) : activeTab === 'steps' ? (
            <section className="guide-panel">
              <OperationManual
                onSetCube={() => setActiveTab('scan')}
                onSolve={() => setActiveTab('solve')}
              />
            </section>
          ) : (
            <>
              <div className="net-stage">
                <CubeNet
                  state={displayState}
                  editable={!moves && !solveBusy}
                  onChange={handleStickerChange}
                  highlightIndices={highlight}
                  className={`product-net ${netRotation % 180 === 0 ? '' : 'net-rotated'}`.trim()}
                  style={{ '--net-rotation': `${netRotation}deg` } as CSSProperties}
                />
              </div>

              {activeTab === 'scan' && (
                <>
                  <div className="paint-row" aria-label="Paint colors">
                    {FACES.map((face) => (
                      <button
                        key={face}
                        className={selectedFace === face ? 'active' : ''}
                        style={{ '--face-color': FACE_COLORS[face] } as CSSProperties}
                        onClick={() => setSelectedFace(face)}
                        title={FACE_LABELS[face]}
                        aria-label={`Select ${face} ${FACE_LABELS[face]}`}
                      />
                    ))}
                  </div>
                  <p className="edit-status">
                    Mode: {editMode}. Selected {selectedFace} ({FACE_LABELS[selectedFace]}).
                    {editMessage ? ` ${editMessage}` : ''}
                  </p>

                  <div className="mode-row">
                    {(['paint', 'fill', 'picker'] as const).map((mode) => (
                      <button
                        key={mode}
                        className={editMode === mode ? 'active' : ''}
                        disabled={mode === 'fill'}
                        onClick={() => setEditMode(mode)}
                        title={
                          mode === 'fill'
                            ? 'Disabled: full-face paint usually creates an impossible cube.'
                            : undefined
                        }
                      >
                        {mode === 'fill' ? 'Fill disabled' : mode[0].toUpperCase() + mode.slice(1)}
                      </button>
                    ))}
                    <button onClick={handleResetScan}>Clear</button>
                  </div>
                  <HowToPlay className="how-to-inline" />
                </>
              )}
            </>
          )}

          {showStepMode && (
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

        </section>

        {activeTab !== 'steps' && (
        <aside className="inspector-stack">
          {activeTab !== 'solve' && (
          <section className="preview-panel panel">
            <div className="panel-heading compact">
              <span className="step-badge">3</span>
              <div>
                <h2>3D Preview</h2>
                <p>Drag to inspect the cube state.</p>
              </div>
            </div>
            <div className="cube-3d">
              <Cube3D state={displayState} />
            </div>
          </section>
          )}

          <section className={`validation-card ${validationOk ? 'valid' : 'invalid'}`}>
            <strong>Validation</strong>
            <p>{validationMessage}</p>
            {hasRepairSuggestion && (
              <p className="repair-hint">Tap any incorrect sticker on the net to change its color.</p>
            )}
          </section>

          {!moves && (
            <section className="solve-actions">
              <button
                className="primary"
                disabled={!canRequestSolve}
                onClick={handleSolveFast}
                title={
                  !validation.ok
                    ? validation.reason
                    : !reachable
                      ? 'This layout is not reachable on a real 3x3.'
                    : noHintChallengeActive
                      ? 'No Hint challenge hides generated algorithms.'
                      : 'Fast Kociemba solve'
                }
              >
                {solveBusy === 'fast' ? 'Solving...' : 'Solve'}
              </button>
              {userLevel !== 'newcomer' && (
                <>
                  <button
                    className="secondary"
                    disabled={!canRequestSolve}
                    onClick={handleSolveTight}
                    title={
                      !reachable
                          ? 'This layout is not reachable on a real 3x3.'
                        : noHintChallengeActive
                        ? 'No Hint challenge hides generated algorithms.'
                        : `Iterates Kociemba for up to ${TIGHT_DEADLINE_MS / 1000}s.`
                    }
                  >
                    {solveBusy === 'tight' ? 'Tightening...' : 'Solve (Tightest)'}
                  </button>
                  {solveBusy === 'tight' && tightInfo && (
                    <span className="tight-progress">
                      baseline {tightInfo.baseline}, best {tightInfo.current}
                    </span>
                  )}
                  {solveBusy === 'tight' && (
                    <button className="cancel" onClick={handleCancelTight}>
                      Cancel
                    </button>
                  )}
                </>
              )}
            </section>
          )}

          {moves && moves.length > 0 && !noHintChallengeActive && (
            <section className="algorithm-card panel">
              <div className="card-title-row">
                <h2>Current Algorithm</h2>
                <button onClick={handleShare}>Copy</button>
              </div>
              <div className="compact-moves">
                {moves.slice(0, 10).map((move, index) => (
                  <span key={`${move}-${index}`} className={index === stepIndex ? 'current' : ''}>
                    {move}
                  </span>
                ))}
              </div>
              <p>
                Step {Math.min(stepIndex + 1, moves.length)} / {moves.length}
              </p>
            </section>
          )}

          {noHintChallengeActive ? (
            <section className="learn-card panel muted-card">
              <h2>No Hint Mode</h2>
              <p>Formula hints are hidden until the challenge is completed.</p>
            </section>
          ) : (
            <section className="learn-card panel">
              <h2>Learning Notes</h2>
              <ul>
                <li>Keep solved areas steady while applying the current algorithm.</li>
                <li>Watch the highlighted face before moving to the next step.</li>
                <li>Use the tight solve when you want a shorter sequence.</li>
              </ul>
            </section>
          )}
        </aside>
        )}
      </section>
      )}

      <footer className="footer-grid">
        {showNotation && <Notation />}
        <HowToPlay className="how-to-footer" />
        {moves && moves.length === 0 && (
          <p className="already-solved">The cube is already solved. No moves needed.</p>
        )}
        {moves && moves.length > 0 && solveMode === 'tight' && tightInfo && tightInfo.baseline > tightInfo.current && (
          <p className="tight-banner">
            Found a {tightInfo.current}-move solution. Saved {tightInfo.baseline - tightInfo.current} moves.
          </p>
        )}
        {savedTotals.tightCount > 0 && (
          <p className="saved-counter">
            Lifetime: {savedTotals.movesSaved} moves saved across {savedTotals.tightCount} tight solves.
          </p>
        )}
      </footer>
    </main>
  )
}

function HowToPlay({ className = '' }: { className?: string }) {
  return (
    <section className={`how-to panel ${className}`.trim()}>
      <h2>How to Play</h2>
      <ol>
        <li>Use Random Scramble, import a full net, or correct stickers.</li>
        <li>Verify colors on the net and preview.</li>
        <li>Click Solve to generate the solution.</li>
      </ol>
    </section>
  )
}

function OperationManual({
  onSetCube,
  onSolve,
}: {
  onSetCube: () => void
  onSolve: () => void
}) {
  return (
    <div className="guide-content">
      <div className="guide-steps">
      <article className="guide-card primary-guide">
        <h3>1. Create a cube</h3>
        <p>Use Random Scramble for a legal state, or import/capture a full net image.</p>
        <button onClick={onSetCube}>Open Set Cube</button>
      </article>
      <article className="guide-card">
        <h3>2. Correct stickers</h3>
        <p>Pick a color, then tap a sticker. Paint swaps colors and blocks impossible cubes.</p>
      </article>
      <article className="guide-card">
        <h3>3. Use Picker</h3>
        <p>Use Picker to sample a sticker color before editing nearby stickers.</p>
      </article>
      <article className="guide-card primary-guide">
        <h3>4. Solve and replay</h3>
        <p>Click Solve, then use Prev, Next, or Play while following the highlighted move.</p>
        <button onClick={onSolve}>Open Solve</button>
      </article>
      </div>
      <aside className="guide-note">
        <strong>3x3 only</strong>
        <p>This guide covers the complete 3x3 workflow: set the cube, verify it, solve it, then follow moves.</p>
      </aside>
    </div>
  )
}

function ProductPage({
  activeTab,
  challengeMode,
  challengePb,
  challengeRecords,
  challengeStartedAt,
  faceCounts,
  learningStage,
  learningSubTab,
  manualMoves,
  moves,
  practiceMessage,
  productHistory,
  replayIndex,
  replayMoves,
  solvedPercent,
  onChallengeStart,
  onFinishChallenge,
  onLearningStage,
  onLearningSubTab,
  onPracticeCase,
  onReplayStep,
}: {
  activeTab: WorkspaceTab
  challengeMode: ChallengeMode
  challengePb: number
  challengeRecords: string[]
  challengeStartedAt: number | null
  faceCounts: Record<Face, number>
  learningStage: LearningStage
  learningSubTab: LearningSubTab
  manualMoves: string[]
  moves: string[] | null
  practiceMessage: string | null
  productHistory: string[]
  replayIndex: number
  replayMoves: string[]
  solvedPercent: number
  onChallengeStart: (mode: ChallengeMode) => void
  onFinishChallenge: () => void
  onLearningStage: (stage: LearningStage) => void
  onLearningSubTab: (tab: LearningSubTab) => void
  onPracticeCase: (caseId: string) => void
  onReplayStep: (delta: number) => void
}) {
  if (activeTab === 'challenge') {
    return (
      <section className="product-page challenge-page">
        <div className="page-hero panel">
          <div>
            <h2>Challenge</h2>
            <p>Speed runs, no-hint practice, daily scrambles, and random drills.</p>
          </div>
          <div className="metric-ring">
            <strong>{challengePb}s</strong>
            <span>PB</span>
          </div>
        </div>
        <div className="challenge-grid">
          {CHALLENGE_MODES.map((mode) => (
            <button
              key={mode}
              className={`challenge-mode panel ${challengeMode === mode ? 'active' : ''}`}
              onClick={() => onChallengeStart(mode)}
            >
              <strong>{mode}</strong>
              <span>
                {mode === 'Speed'
                  ? 'Timed solve'
                  : mode === 'No Hint'
                    ? 'No formula hints'
                    : mode === 'Daily'
                      ? 'One shared daily scramble'
                      : 'Fresh random scramble'}
              </span>
            </button>
          ))}
        </div>
        <div className="dashboard-grid">
          <section className="panel">
            <h2>Leaderboard</h2>
            <ol className="leaderboard">
              <li>You - {challengePb}s</li>
              <li>Local best - {challengePb + 7}s</li>
              <li>Practice ghost - {challengePb + 13}s</li>
            </ol>
          </section>
          <section className="panel">
            <h2>Records</h2>
            <p>Challenge participation: {challengeStartedAt ? 'running' : 'ready'}</p>
            <p>Manual moves this session: {manualMoves.length}</p>
            <button onClick={onFinishChallenge} disabled={!challengeStartedAt}>
              Finish Challenge
            </button>
            {practiceMessage && <p>{practiceMessage}</p>}
            {challengeRecords.length > 0 && (
              <ul>
                {challengeRecords.map((record) => (
                  <li key={record}>{record}</li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </section>
    )
  }

  if (activeTab === 'replay') {
    return (
      <section className="product-page replay-page">
        <div className="page-hero panel">
          <div>
            <h2>Replay</h2>
            <p>Review solve history, compare with optimal, and locate hard steps.</p>
          </div>
          <strong>{moves?.length ?? 0} optimal moves</strong>
        </div>
        <div className="dashboard-grid">
          <section className="panel">
            <h2>Replay Operations</h2>
            <div className="compact-moves">
              {replayMoves.slice(0, 18).map((move, index) => (
                <span
                  key={`${move}-${index}`}
                  className={index === replayIndex ? 'current' : ''}
                >
                  {move}
                </span>
              ))}
            </div>
            <p>
              Current replay move: {replayMoves[replayIndex] ?? 'None'}.
              Compare with optimal: current path uses {moves?.length ?? manualMoves.length} moves.
            </p>
            <div className="replay-controls">
              <button onClick={() => onReplayStep(-1)} disabled={replayIndex === 0}>
                Previous
              </button>
              <button
                onClick={() => onReplayStep(1)}
                disabled={replayMoves.length === 0 || replayIndex >= replayMoves.length - 1}
              >
                Next
              </button>
            </div>
          </section>
          <section className="panel">
            <h2>Error Locator</h2>
            <p>Most likely friction: F2L transition and current highlighted face.</p>
            <p>Replay status: ready for step-by-step playback.</p>
          </section>
          <section className="panel">
            <h2>History</h2>
            {productHistory.length ? (
              <ul>
                {productHistory.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>No completed solves yet. Finish a solution to create replay history.</p>
            )}
          </section>
        </div>
      </section>
    )
  }

  return (
    <section className="product-page profile-page">
      <div className="page-hero panel">
        <div>
          <h2>Profile</h2>
          <p>Achievements, history, mastery, and training settings.</p>
        </div>
        <strong>{solvedPercent}% mastery</strong>
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <h2>Achievements</h2>
          <div className="achievement-list">
            <span>First valid scan</span>
            <span>F2L learner</span>
            <span>Challenge starter</span>
          </div>
        </section>
        <section className="panel">
          <h2>Mastery</h2>
          {LEARNING_STAGES.map((stage, index) => (
            <p key={stage}>
              {stage}: {Math.min(95, solvedPercent + index * 9)}%
            </p>
          ))}
        </section>
        <section className="panel">
          <h2>Settings</h2>
          <p>Auto-play speed, notation hints, and theme controls are available in-session.</p>
          <p>Color counts: {FACES.map((face) => `${face}:${faceCounts[face]}`).join(' ')}</p>
        </section>
      </div>
      <section className="panel learning-panel">
        <h2>Learning System</h2>
        <div className="segmented-row">
          {LEARNING_STAGES.map((stage) => (
            <button
              key={stage}
              className={learningStage === stage ? 'active' : ''}
              onClick={() => onLearningStage(stage)}
            >
              {stage}
            </button>
          ))}
        </div>
        <div className="segmented-row">
          {LEARNING_SUBTABS.map((tab) => (
            <button
              key={tab}
              className={learningSubTab === tab ? 'active' : ''}
              onClick={() => onLearningSubTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <LearningContent
          learningStage={learningStage}
          learningSubTab={learningSubTab}
          onPracticeCase={onPracticeCase}
        />
      </section>
    </section>
  )
}

function LearningContent({
  learningStage,
  learningSubTab,
  onPracticeCase,
}: {
  learningStage: LearningStage
  learningSubTab: LearningSubTab
  onPracticeCase: (caseId: string) => void
}) {
  const cases = LEARNING_CASES.filter((item) => item.stage === learningStage)
  if (learningSubTab === 'Cases') {
    return (
      <div className="case-grid">
        {(cases.length ? cases : LEARNING_CASES).map((item) => (
          <article key={item.case_id} className="case-card">
            <div className="case-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{item.case_id}</strong>
              <span className="alias" style={{ color: 'var(--blue)', fontWeight: 600 }}>{item.alias}</span>
            </div>
            <p>{item.pattern}</p>
            <p>Difficulty {item.difficulty}/5</p>
            <div className="compact-moves">
              {item.moves.map((move) => (
                <span key={move}>{move}</span>
              ))}
            </div>
            <button onClick={() => onPracticeCase(item.case_id)}>Practice Case</button>
          </article>
        ))}
      </div>
    )
  }

  if (learningSubTab === 'Moves') {
    return (
      <div className="compact-moves learning-moves">
        {['U', 'D', 'L', 'R', 'F', 'B', "R'", 'F2'].map((move) => (
          <span key={move}>{move}</span>
        ))}
      </div>
    )
  }

  if (learningSubTab === 'Tips') {
    return (
      <ul>
        <li>Keep solved pieces stable while rotating the active layer.</li>
        <li>Watch color pairs before executing the algorithm.</li>
        <li>Practice cases separately before speed challenges.</li>
      </ul>
    )
  }

  return (
    <p>
      {learningStage} focuses on recognizing the current cube pattern, choosing a short
      algorithm, and confirming the result in 3D before moving forward.
    </p>
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
