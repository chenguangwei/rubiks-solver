import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import { Cube3D } from './Cube3D'
import { CubeNet } from './CubeNet'
import { CENTER_INDICES, FACE_COLORS, FACES, SOLVED_STATE, validateState } from './cube'
import type { Face } from './cube'
import { LANGUAGE_OPTIONS, useI18n } from './i18n'
import { loadImageToBuffer } from './imageLoader'
import { parseMove, stickerIndicesForFace } from './moves'
import type { ParsedMove } from './moves'
import { parseNet } from './parser'
import { useSeoMetadata } from './seo'
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

const CENTER_INDEX_SET = new Set<number>(Object.values(CENTER_INDICES))

const PRODUCT_TABS: readonly { id: WorkspaceTab; labelKey: string }[] = [
  { id: 'scan', labelKey: 'tabs.scan' },
  { id: 'solve', labelKey: 'tabs.solve' },
  { id: 'steps', labelKey: 'tabs.steps' },
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

const USER_LEVELS: readonly { id: UserLevel; labelKey: string; descriptionKey: string }[] = [
  { id: 'newcomer', labelKey: 'user.newcomer', descriptionKey: 'user.newcomer.desc' },
  { id: 'learner', labelKey: 'user.learner', descriptionKey: 'user.learner.desc' },
  { id: 'advanced', labelKey: 'user.advanced', descriptionKey: 'user.advanced.desc' },
  { id: 'player', labelKey: 'user.player', descriptionKey: 'user.player.desc' },
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

function nowMs(): number {
  return Date.now()
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString()
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString()
}

function countFaces(input: string): Record<Face, number> {
  const counts = Object.fromEntries(FACES.map((face) => [face, 0])) as Record<Face, number>
  for (const ch of input) {
    if (FACES.includes(ch as Face)) counts[ch as Face]++
  }
  return counts
}

function readInitialState(): string {
  if (typeof window === 'undefined') return SOLVED_STATE
  return decodeStateFromHash(window.location.hash) ?? SOLVED_STATE
}

function App() {
  const { language, setLanguage, t } = useI18n()
  useSeoMetadata(language)
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
  const [currentTime, setCurrentTime] = useState(0)
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

  const faceLabel = (face: Face) => t(`face.color.${face}`)
  const userLevelCopy = USER_LEVELS.find((level) => level.id === userLevel)
  const describeMoveText = (move: ParsedMove) => {
    const face = t(`face.name.${move.face}`)
    if (move.turns === 1) return t('move.clockwise', { face })
    if (move.turns === -1) return t('move.counter', { face })
    return t('move.double', { face })
  }

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

  const timerActive =
    (solveStartedAt !== null && solveFinishedAt === null) || challengeStartedAt !== null
  useEffect(() => {
    if (!timerActive) return
    const id = window.setInterval(() => setCurrentTime(nowMs()), 1000)
    return () => window.clearInterval(id)
  }, [timerActive])

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
    setParseError(null)
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
      setEditMessage(`Picked ${state[index]} (${faceLabel(state[index] as Face)}).`)
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
      const startedAt = nowMs()
      setCurrentTime(startedAt)
      setSolveStartedAt(startedAt)
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

  async function handleImageImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return

    setParseError(null)
    try {
      const image = await loadImageToBuffer(file)
      const result = parseNet(image)
      if (!result.ok) {
        setParseError(result.reason)
        setFeedback('error')
        setEditMessage(`Image import failed: ${result.reason}.`)
        return
      }

      const nextValidation = validateState(result.state)
      if (!nextValidation.ok) {
        setParseError(nextValidation.reason)
        setFeedback('error')
        setEditMessage(`Image import failed: ${nextValidation.reason}.`)
        return
      }
      if (!isReachableState(result.state)) {
        const reason = 'Imported stickers do not form a physically reachable 3x3 cube.'
        setParseError(reason)
        setFeedback('error')
        setEditMessage(`Image import failed: ${reason}`)
        return
      }

      setStateAndClearMoves(result.state)
      setFeedback('correct')
      setEditMessage('Image imported. Solving automatically.')
      await solveFastForState(result.state)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setParseError(message)
      setFeedback('error')
      setEditMessage(`Image import failed: ${message}.`)
    }
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
      const startedAt = nowMs()
      setCurrentTime(startedAt)
      setSolveStartedAt(startedAt)
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
      const finishedAt = nowMs()
      setCurrentTime(finishedAt)
      setSolveFinishedAt(finishedAt)
      const entry = `${formatDate(finishedAt)}: solved in ${moves.length} moves`
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
    ? t('validation.invalid', { reason: validation.reason })
    : !reachable
      ? t('validation.unreachable')
      : activeTab === 'scan'
        ? t('validation.readyToSolve')
        : t('validation.valid')
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
      : Math.max(0, Math.round(((solveFinishedAt ?? currentTime) - solveStartedAt) / 1000))
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
    const startedAt = nowMs()
    setCurrentTime(startedAt)
    setSolveStartedAt(startedAt)
    setChallengeStartedAt(startedAt)
    const record = `${mode}: started ${formatTime(startedAt)}`
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
      ? Math.max(1, Math.round((nowMs() - challengeStartedAt) / 1000))
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
            {t('app.solverStatus', {
              status: solverStatus === 'ready' ? t('app.status.ready') : t('app.status.initializing'),
            })}
          </span>
        </div>

        <nav className="workspace-tabs" aria-label={t('app.workspace')}>
          {PRODUCT_TABS.map(({ id, labelKey }) => (
            <button
              key={id}
              className={activeTab === id ? 'active' : ''}
              onClick={() => switchTab(id)}
            >
              <span className={`tab-icon tab-icon-${id}`} aria-hidden="true">
                <span />
              </span>
              {t(labelKey)}
            </button>
          ))}
        </nav>

        <div className="header-actions" aria-label={t('app.utilities')}>
          <button onClick={() => setUtilityPanel('help')} title={t('settings.help')}>?</button>
          <button onClick={() => setUtilityPanel('settings')} title={t('settings.settings')}>⚙</button>
          <button
            onClick={() => setThemePreference((theme) => (theme === 'light' ? 'focus' : 'light'))}
            title={t('settings.theme')}
          >
            {themePreference === 'light' ? '◐' : '☀'}
          </button>
        </div>
      </header>

      {utilityPanel && (
        <section className="utility-popover panel" role="dialog" aria-label={utilityPanel}>
          <div className="card-title-row">
            <h2>{utilityPanel === 'help' ? t('utility.helpTitle') : t('utility.settingsTitle')}</h2>
            <button onClick={() => setUtilityPanel(null)}>{t('utility.close')}</button>
          </div>
          {utilityPanel === 'help' ? (
            <div className="help-grid">
              <p>{t('utility.help.1')}</p>
              <p>{t('utility.help.2')}</p>
              <p>{t('utility.help.3')}</p>
              <p>{t('utility.help.4')}</p>
              <button onClick={handleShare}>{t('utility.copyShareLink')}</button>
            </div>
          ) : (
            <div className="settings-grid">
              <label>
                {t('settings.language')}
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as typeof language)}
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.nativeName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showNotation}
                  onChange={(event) => setShowNotation(event.target.checked)}
                />
                {t('settings.showNotation')}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={(event) => setReducedMotion(event.target.checked)}
                />
                {t('settings.reduceMotion')}
              </label>
              <div className="segmented-row">
                {USER_LEVELS.map((level) => (
                  <button
                    key={level.id}
                    className={userLevel === level.id ? 'active' : ''}
                    onClick={() => setUserLevel(level.id)}
                    title={t(level.descriptionKey)}
                  >
                    {t(level.labelKey)}
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
          {parseError && <p className="error">{t('notice.imageParseError', { message: parseError })}</p>}
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
                <h2>{t('scan.heading')}</h2>
                <p>{t('scan.description')}</p>
              </div>
            </div>
            <div className="setup-actions">
              <button className="primary" onClick={handleRandomScramble}>{t('scan.randomScramble')}</button>
              <label className="file-button">
                {t('scan.importImage')}
                <input
                  className="visually-hidden"
                  type="file"
                  accept="image/*"
                  onChange={handleImageImport}
                />
              </label>
              <button onClick={() => setShowScanner(true)}>{t('scan.useCamera')}</button>
              <button onClick={handleResetScan}>{t('scan.reset')}</button>
            </div>
            <div className="capture-progress">
              <strong>{t('scan.paintColor')}</strong>
              <span>{selectedFace} · {faceLabel(selectedFace)}</span>
              <span>{validationMessage}</span>
            </div>
            <div className="tips-card compact">
              <strong>{t('scan.path', { level: userLevelCopy ? t(userLevelCopy.labelKey) : '' })}</strong>
              <p>{userLevelCopy ? t(userLevelCopy.descriptionKey) : ''}</p>
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
                      ? t('stage.solveCoach')
                      : activeTab === 'steps'
                        ? t('stage.operationGuide')
                        : showStepMode
                          ? t('stage.followSolution')
                          : t('stage.editNet')}
                  </h2>
                  <p>
                    {activeTab === 'solve'
                      ? t('stage.solveDescription')
                      : activeTab === 'steps'
                        ? t('stage.stepsDescription')
                        : showStepMode
                      ? t('stage.followDescription')
                      : editMode === 'picker'
                        ? t('stage.pickerDescription')
                        : t('stage.paintDescription')}
                  </p>
                </div>
              </div>
            </div>
            {activeTab !== 'steps' && (
              <div className="tool-buttons">
                <button onClick={handleRotateView}>{t('stage.rotateView')}</button>
                <button onClick={handleShare}>{t('stage.share')}</button>
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
                <strong>
                  {currentReplayMove ? t('coach.nextMove', { move: currentReplayMove }) : t('coach.ready')}
                </strong>
                <p className="status-message">
                  {solveMode === 'tight'
                    ? t('coach.tight', { count: moves?.length ?? 0 })
                    : noHintChallengeActive
                    ? t('coach.noHintActive')
                    : upcomingMove
                    ? describeMoveText(upcomingMove)
                    : moves?.length
                      ? t('coach.allApplied')
                      : t('coach.useSolve')}
                </p>
                <div className="coach-stats">
                  <span>{t('coach.progress', { percent: solvedPercent })}</span>
                  <span>{t('coach.manualMoves', { count: manualMoves.length })}</span>
                  <span>{t('coach.timer', { seconds: solveElapsedSeconds })}</span>
                </div>
                <section className="operation-controls-panel" aria-label={t('controls.operation')}>
                  <div className="operation-title-row">
                    <h2>{t('controls.operation')}</h2>
                    <span>{t('controls.moves', { count: manualMoves.length })}</span>
                  </div>
                  <div className="manual-controls">
                    {FACES.map((face) => (
                      <button key={face} onClick={() => handleManualMove(face)}>
                        {face}
                      </button>
                    ))}
                  </div>
                <div className="operation-meta">
                  <span>{t('controls.timer', { seconds: solveElapsedSeconds })}</span>
                  <span>{t('controls.progress', { percent: solvedPercent })}</span>
                  {challengeStartedAt && (
                    <span>
                      {challengeMode}
                      {noHintChallengeActive ? ` ${t('controls.noHints')}` : ''}
                    </span>
                  )}
                </div>
                {practiceMessage && <p className="practice-hint" style={{ color: 'var(--blue-deep)', fontWeight: 'bold' }}>{practiceMessage}</p>}
                {feedback && <p className={`feedback ${feedback}`}>{t('controls.status', { status: feedback })}</p>}
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
                        title={faceLabel(face)}
                        aria-label={`Select ${face} ${faceLabel(face)}`}
                      />
                    ))}
                  </div>
                  <p className="edit-status">
                    {t('edit.modeStatus', {
                      mode: t(`mode.${editMode}`),
                      face: selectedFace,
                      label: faceLabel(selectedFace),
                      message: editMessage ? ` ${editMessage}` : '',
                    })}
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
                            ? t('edit.fillTitle')
                            : undefined
                        }
                      >
                        {mode === 'fill' ? t('edit.fillDisabled') : t(`mode.${mode}`)}
                      </button>
                    ))}
                    <button onClick={handleResetScan}>{t('edit.clear')}</button>
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
                <h2>{t('preview.heading')}</h2>
                <p>{t('preview.description')}</p>
              </div>
            </div>
            <div className="cube-3d">
              <Cube3D state={displayState} />
            </div>
          </section>
          )}

          <section className={`validation-card ${validationOk ? 'valid' : 'invalid'}`}>
            <strong>{t('validation.heading')}</strong>
            <p>{validationMessage}</p>
            {hasRepairSuggestion && (
              <p className="repair-hint">{t('validation.repairHint')}</p>
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
                      ? t('solve.unreachableTitle')
                    : noHintChallengeActive
                      ? t('solve.noHintTitle')
                      : t('solve.fastTitle')
                }
              >
                {solveBusy === 'fast' ? t('solve.solving') : t('solve.solve')}
              </button>
              {userLevel !== 'newcomer' && (
                <>
                  <button
                    className="secondary"
                    disabled={!canRequestSolve}
                    onClick={handleSolveTight}
                    title={
                      !reachable
                          ? t('solve.unreachableTitle')
                        : noHintChallengeActive
                        ? t('solve.noHintTitle')
                        : t('solve.tightTitle', { seconds: TIGHT_DEADLINE_MS / 1000 })
                    }
                  >
                    {solveBusy === 'tight' ? t('solve.tightening') : t('solve.tightest')}
                  </button>
                  {solveBusy === 'tight' && tightInfo && (
                    <span className="tight-progress">
                      {t('solve.tightProgress', {
                        baseline: tightInfo.baseline,
                        current: tightInfo.current,
                      })}
                    </span>
                  )}
                  {solveBusy === 'tight' && (
                    <button className="cancel" onClick={handleCancelTight}>
                      {t('solve.cancel')}
                    </button>
                  )}
                </>
              )}
            </section>
          )}

          {moves && moves.length > 0 && !noHintChallengeActive && (
            <section className="algorithm-card panel">
              <div className="card-title-row">
                <h2>{t('algorithm.heading')}</h2>
                <button onClick={handleShare}>{t('algorithm.copy')}</button>
              </div>
              <div className="compact-moves">
                {moves.slice(0, 10).map((move, index) => (
                  <span key={`${move}-${index}`} className={index === stepIndex ? 'current' : ''}>
                    {move}
                  </span>
                ))}
              </div>
              <p>
                {t('algorithm.step', {
                  current: Math.min(stepIndex + 1, moves.length),
                  total: moves.length,
                })}
              </p>
            </section>
          )}

          {noHintChallengeActive ? (
            <section className="learn-card panel muted-card">
              <h2>{t('learn.noHintMode')}</h2>
              <p>{t('learn.noHintDescription')}</p>
            </section>
          ) : (
            <section className="learn-card panel">
              <h2>{t('learn.notes')}</h2>
              <ul>
                <li>{t('learn.note.1')}</li>
                <li>{t('learn.note.2')}</li>
                <li>{t('learn.note.3')}</li>
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
          <p className="already-solved">{t('footer.alreadySolved')}</p>
        )}
        {moves && moves.length > 0 && solveMode === 'tight' && tightInfo && tightInfo.baseline > tightInfo.current && (
          <p className="tight-banner">
            {t('footer.tightBanner', {
              current: tightInfo.current,
              saved: tightInfo.baseline - tightInfo.current,
            })}
          </p>
        )}
        {savedTotals.tightCount > 0 && (
          <p className="saved-counter">
            {t('footer.savedCounter', {
              saved: savedTotals.movesSaved,
              count: savedTotals.tightCount,
            })}
          </p>
        )}
      </footer>
    </main>
  )
}

function HowToPlay({ className = '' }: { className?: string }) {
  const { t } = useI18n()
  return (
    <section className={`how-to panel ${className}`.trim()}>
      <h2>{t('how.heading')}</h2>
      <ol>
        <li>{t('how.step.1')}</li>
        <li>{t('how.step.2')}</li>
        <li>{t('how.step.3')}</li>
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
  const { t } = useI18n()
  return (
    <div className="guide-content">
      <div className="guide-steps">
      <article className="guide-card primary-guide">
        <h3>{t('guide.createTitle')}</h3>
        <p>{t('guide.createBody')}</p>
        <button onClick={onSetCube}>{t('guide.openSetCube')}</button>
      </article>
      <article className="guide-card">
        <h3>{t('guide.correctTitle')}</h3>
        <p>{t('guide.correctBody')}</p>
      </article>
      <article className="guide-card">
        <h3>{t('guide.pickerTitle')}</h3>
        <p>{t('guide.pickerBody')}</p>
      </article>
      <article className="guide-card primary-guide">
        <h3>{t('guide.solveTitle')}</h3>
        <p>{t('guide.solveBody')}</p>
        <button onClick={onSolve}>{t('guide.openSolve')}</button>
      </article>
      </div>
      <aside className="guide-note">
        <strong>{t('guide.only3x3')}</strong>
        <p>{t('guide.only3x3Body')}</p>
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
  const { t } = useI18n()
  const completed = stepIndex >= moves.length
  const upcoming = !completed ? parseMove(moves[stepIndex]) : null
  const speeds: PlaySpeed[] = ['slow', 'normal', 'fast']
  const describeMoveText = (move: ParsedMove) => {
    const face = t(`face.name.${move.face}`)
    if (move.turns === 1) return t('move.clockwise', { face })
    if (move.turns === -1) return t('move.counter', { face })
    return t('move.double', { face })
  }
  return (
    <section className="solution">
      <h2>
        {t('solution.heading', {
          count: moves.length,
          movesLabel: moves.length === 1 ? t('solution.moveSingular') : t('solution.movePlural'),
        })}
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
          ← {t('solution.prev')}
        </button>
        <button
          className="play-toggle"
          onClick={() => setAutoPlay((p) => !p)}
          disabled={completed}
          aria-pressed={autoPlay}
        >
          {autoPlay ? `⏸ ${t('solution.pause')}` : `▶ ${t('solution.play')}`}
        </button>
        <span className="step-status">
          {completed ? (
            <>{t('solution.solved', { count: moves.length })}</>
          ) : (
            <>
              {t('solution.moveOf', { current: stepIndex + 1, total: moves.length })}
              {upcoming && <span className="step-detail"> — {describeMoveText(upcoming)}</span>}
            </>
          )}
        </span>
        <button
          onClick={() => setStepIndex(Math.min(moves.length, stepIndex + 1))}
          disabled={stepIndex >= moves.length}
        >
          {t('solution.next')} →
        </button>
      </div>
      <div className="speed-controls">
        <span className="speed-label">{t('solution.speed')}</span>
        {speeds.map((s) => (
          <button
            key={s}
            className={`speed ${s === playSpeed ? 'active' : ''}`}
            onClick={() => setPlaySpeed(s)}
          >
            {t(`solution.speed.${s}`)}
          </button>
        ))}
      </div>
      <p className="step-hint">{t('solution.tip')}</p>
    </section>
  )
}

function Notation() {
  const { t } = useI18n()
  return (
    <details className="notation">
      <summary>{t('notation.summary')}</summary>
      <ul>
        <li>
          <code>U</code>, <code>D</code>, <code>L</code>, <code>R</code>, <code>F</code>,
          <code>B</code> — {t('notation.faces')}
        </li>
        <li>{t('notation.clockwise')}</li>
        <li>
          <code>'</code> {t('notation.counter').replace("' ", '')}
        </li>
        <li>
          <code>2</code> {t('notation.double').replace('2 ', '')}
        </li>
      </ul>
    </details>
  )
}

export default App
