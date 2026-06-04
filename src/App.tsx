import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import { Cube3D } from './Cube3D'
import { FACE_COLORS, FACES, SOLVED_STATE, validateState } from './cube'
import type { Face } from './cube'
import { LANGUAGE_OPTIONS, useI18n } from './i18n'
import { loadImageToBuffer } from './imageLoader'
import { parseMove, stickerIndicesForFace } from './moves'
import type { ParsedMove } from './moves'
import { parseNet } from './parser'
import { useSeoMetadata } from './seo'
import type { SeoPage } from './seo'
import { decodeStateFromHash, shareUrl } from './share'
import { MiniCubeSolverPage } from './MiniCubeSolverPage'
import { Cube444SolverPage } from './Cube444SolverPage'
import { Cube555SolverPage } from './Cube555SolverPage'
import { PatternPuzzleSolverPage } from './PatternPuzzleSolverPage'
import { getPuzzleDefinition, LIVE_PUZZLE_IDS } from './puzzles/catalog'
import { pyraminxAdapter } from './puzzles/pyraminx'
import { skewbAdapter } from './puzzles/skewb'
import type { PuzzleId } from './puzzles/types'
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
type WorkspaceTab =
  | 'scan'
  | 'mini2x2'
  | 'revenge4x4'
  | 'professor5x5'
  | 'pyraminx'
  | 'skewb'
  | 'solve'
  | 'steps'
  | 'about'
  | 'challenge'
  | 'replay'
  | 'profile'
  | 'how2x2'
  | 'how4x4'
  | 'cubeStats'
type SolveSurface = 'setup' | 'manual' | 'ai'
type LearningStage = 'Cross' | 'F2L' | 'OLL' | 'PLL'
type LearningSubTab = 'Overview' | 'Cases' | 'Moves' | 'Tips'
type ChallengeMode = 'Speed' | 'No Hint' | 'Daily' | 'Random'
type UtilityPanel = 'help' | 'settings' | null
type ThemePreference = 'light' | 'focus'
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

type SolverWorkspaceTab = 'scan' | 'mini2x2' | 'revenge4x4' | 'professor5x5' | 'pyraminx' | 'skewb'
type SeoArticleTab = 'how2x2' | 'how4x4' | 'cubeStats'

const PUZZLE_ID_BY_SOLVER_TAB: Record<SolverWorkspaceTab, PuzzleId> = {
  scan: '333',
  mini2x2: '222',
  revenge4x4: '444',
  professor5x5: '555',
  pyraminx: 'pyraminx',
  skewb: 'skewb',
}

const SOLVER_TAB_BY_PUZZLE_ID: Record<PuzzleId, SolverWorkspaceTab> = {
  '222': 'mini2x2',
  '333': 'scan',
  '444': 'revenge4x4',
  '555': 'professor5x5',
  pyraminx: 'pyraminx',
  skewb: 'skewb',
}

const SEO_ARTICLE_ROUTES: Record<SeoArticleTab, string> = {
  how2x2: '/how-to-solve-a-2x2-rubiks-cube',
  how4x4: '/how-to-solve-a-4x4-rubiks-cube',
  cubeStats: '/how-many-people-can-solve-a-rubiks-cube',
}

const SEO_PAGE_BY_ARTICLE_TAB: Record<SeoArticleTab, SeoPage> = {
  how2x2: 'how2x2',
  how4x4: 'how4x4',
  cubeStats: 'cubeStats',
}

const PRIMARY_TABS: readonly { id: WorkspaceTab; labelKey: string }[] = [
  { id: 'scan', labelKey: 'tabs.scan' },
  { id: 'steps', labelKey: 'tabs.steps' },
  { id: 'about', labelKey: 'tabs.about' },
]

const SOLVER_NAV_ITEMS: readonly {
  id: SolverWorkspaceTab
  labelKey: string
  group: 'cube' | 'wca'
}[] = [
  { id: 'mini2x2', labelKey: 'tabs.2x2', group: 'cube' },
  { id: 'revenge4x4', labelKey: 'tabs.4x4', group: 'cube' },
  { id: 'professor5x5', labelKey: 'tabs.5x5', group: 'cube' },
  { id: 'pyraminx', labelKey: 'tabs.pyraminx', group: 'wca' },
  { id: 'skewb', labelKey: 'tabs.skewb', group: 'wca' },
]

const GUIDE_PUZZLE_IDS = LIVE_PUZZLE_IDS
const GUIDE_STEP_IDS = ['setup', 'entry', 'solve', 'playback'] as const
const GUIDE_FACT_IDS = ['scope', 'entry', 'notation'] as const
const ABOUT_PUZZLE_FACT_IDS = ['entry', 'solve', 'playback'] as const

type SeoArticle = {
  kicker: string
  title: string
  intro: string
  primaryCta: {
    label: string
    href: string
    target: WorkspaceTab
  }
  highlights: string[]
  sections: {
    title: string
    body: string
    items?: string[]
  }[]
  related: {
    label: string
    href: string
    target: WorkspaceTab
  }[]
}

const SEO_ARTICLES: Record<SeoArticleTab, SeoArticle> = {
  how2x2: {
    kicker: '2x2 beginner guide',
    title: "How to Solve a 2x2 Rubik's Cube",
    intro:
      'The 2x2 cube is a corner-only puzzle: there are no edge pieces and no fixed center stickers, so the solve is about placing and twisting eight corners.',
    primaryCta: {
      label: 'Open the 2x2 solver',
      href: '/2x2x2-solver',
      target: 'mini2x2',
    },
    highlights: [
      'A 2x2 solve is shorter than a 3x3 solve, but corner tracking matters more.',
      'Use legal random scrambles before practicing algorithms.',
      'Follow playback to connect each move to a corner change.',
    ],
    sections: [
      {
        title: '2x2 method at a glance',
        body:
          'A simple beginner path is to solve one layer, orient the last-layer corners, then permute those corners until every side matches.',
        items: [
          'Choose one face color and build the first layer with all four corners aligned.',
          'Keep the solved layer on the bottom while you turn the top corners.',
          'Use short right-hand or left-hand triggers to twist corners without losing the first layer.',
          'Finish by cycling the last-layer corners into the correct positions.',
        ],
      },
      {
        title: 'Common 2x2 mistakes',
        body:
          'Most failed 2x2 solves come from treating it like a tiny 3x3. Instead, track corner orientation and corner position separately.',
        items: [
          'Do not look for edge pieces; the puzzle only has corners.',
          'Do not assume colors have fixed centers, because the 2x2 has no visible centers.',
          'If one corner looks twisted by itself, recheck the full state before blaming the algorithm.',
        ],
      },
      {
        title: 'Practice with playback',
        body:
          'Use the online 2x2 solver to generate legal scrambles, run the browser solver, and step through the route while watching the preview.',
      },
    ],
    related: [
      { label: 'Read the 4x4 guide', href: '/how-to-solve-a-4x4-rubiks-cube', target: 'how4x4' },
      { label: 'Try the 3x3 solver', href: '/', target: 'scan' },
    ],
  },
  how4x4: {
    kicker: '4x4 beginner guide',
    title: "How to Solve a 4x4 Rubik's Cube",
    intro:
      'The beginner 4x4 route is reduction: solve the centers, pair the edges, then finish it like a 3x3 while watching for parity.',
    primaryCta: {
      label: 'Open the 4x4 practice solver',
      href: '/4x4x4-solver',
      target: 'revenge4x4',
    },
    highlights: [
      'A 4x4 solve becomes easier once you reduce it into a 3x3-like state.',
      '4x4 centers are movable, so color scheme matters early.',
      'Parity can appear on 4x4 even when your 3x3 method is correct.',
    ],
    sections: [
      {
        title: '4x4 method at a glance',
        body:
          'Start by making six solid centers, pair all twelve edge pairs, then solve the reduced cube with the 3x3 method you already know.',
        items: [
          'Build opposite centers first so the color scheme stays consistent.',
          'Pair matching edge pieces before treating the cube as a 3x3.',
          'Keep wide moves like Uw and Rw in your notation so your practice history remains reversible.',
        ],
      },
      {
        title: 'Parity cases to expect',
        body:
          'A 4x4 has no fixed centers and can reach states that look impossible on a 3x3. The two common beginner surprises are OLL parity and PLL parity.',
        items: [
          'OLL parity usually looks like one flipped last-layer edge pair.',
          'PLL parity usually looks like two pieces need to swap after the 3x3 solve is nearly done.',
          'Parity is not a broken cube; it is part of even-layer cube solving.',
        ],
      },
      {
        title: 'Use RubikSolver honestly',
        body:
          'The 4x4 page is a known-history practice solver. It can replay generated scrambles and tracked manual histories, but it does not claim arbitrary 4x4 state solving.',
      },
    ],
    related: [
      { label: 'Open the 2x2 guide', href: '/how-to-solve-a-2x2-rubiks-cube', target: 'how2x2' },
      { label: 'Try the 3x3 solver', href: '/', target: 'scan' },
    ],
  },
  cubeStats: {
    kicker: 'Cube solving statistics',
    title: "How Many People Can Solve a Rubik's Cube?",
    intro:
      'There is no single official live count of how many people can solve a Rubik\'s Cube, so published numbers should be treated as estimates rather than precise measurements.',
    primaryCta: {
      label: 'Try the 3x3 solver',
      href: '/',
      target: 'scan',
    },
    highlights: [
      'Solving once, solving from memory, and speedcubing are separate milestones.',
      'Common estimates vary because they measure different levels of ability.',
      'Online tutorials make the group larger over time, but not easy to count precisely.',
    ],
    sections: [
      {
        title: 'Why the number is hard to measure',
        body:
          'Cube solving ability is rarely tracked in a standardized global survey, and people define success differently.',
        items: [
          'Some counts include anyone who solved once with instructions.',
          'Some people can solve a cube from memory but do not compete.',
          'Online tutorials and solver apps keep changing how many people can learn.',
        ],
      },
      {
        title: 'What counts as being able to solve it',
        body:
          'A practical definition is solving a scrambled 3x3 to completion without needing the cube to be reset by someone else.',
        items: [
          'Beginner solvers may use a printed method or app guidance.',
          'Independent solvers can finish from memory, even if slowly.',
          'Speedcubers optimize inspection, recognition, algorithms, and turning speed.',
        ],
      },
      {
        title: 'How to join that group',
        body:
          'Start with a simple method, practice on legal scrambles, and use visual playback when you want to understand what a move changed.',
      },
    ],
    related: [
      { label: 'Learn with the 2x2 guide', href: '/how-to-solve-a-2x2-rubiks-cube', target: 'how2x2' },
      { label: 'Read the 4x4 guide', href: '/how-to-solve-a-4x4-rubiks-cube', target: 'how4x4' },
    ],
  },
}

function isSolverWorkspaceTab(tab: WorkspaceTab): tab is SolverWorkspaceTab {
  return Object.prototype.hasOwnProperty.call(PUZZLE_ID_BY_SOLVER_TAB, tab)
}

function isSeoArticleTab(tab: WorkspaceTab): tab is SeoArticleTab {
  return Object.prototype.hasOwnProperty.call(SEO_ARTICLE_ROUTES, tab)
}

function puzzleIdForTab(tab: WorkspaceTab): PuzzleId | null {
  return isSolverWorkspaceTab(tab) ? PUZZLE_ID_BY_SOLVER_TAB[tab] : null
}

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

const BEGINNER_TUTORIAL = [
  {
    id: 'cross',
    titleKey: 'tutorial.cross.title',
    bodyKey: 'tutorial.cross.body',
    formula: "F R U R' U' F'",
    colors: ['D', 'D', 'D', 'D'] as Face[],
  },
  {
    id: 'f2l',
    titleKey: 'tutorial.f2l.title',
    bodyKey: 'tutorial.f2l.body',
    formula: "U R U' R'",
    colors: ['F', 'R', 'F', 'R'] as Face[],
  },
  {
    id: 'oll',
    titleKey: 'tutorial.oll.title',
    bodyKey: 'tutorial.oll.body',
    formula: "F R U R' U' F'",
    colors: ['U', 'U', 'U', 'U'] as Face[],
  },
  {
    id: 'pll',
    titleKey: 'tutorial.pll.title',
    bodyKey: 'tutorial.pll.body',
    formula: "R U R' F' R U R' U' R' F R2 U' R'",
    colors: ['R', 'B', 'L', 'F'] as Face[],
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

function readInitialTab(): WorkspaceTab {
  if (typeof window === 'undefined') return 'scan'
  const pathname = window.location.pathname.replace(/\/+$/, '')
  if (pathname === '/about') return 'about'
  const matchedArticle = (Object.keys(SEO_ARTICLE_ROUTES) as SeoArticleTab[]).find((id) => {
    return SEO_ARTICLE_ROUTES[id].replace(/\/+$/, '') === pathname
  })
  if (matchedArticle) return matchedArticle
  const matchedPuzzle = (Object.keys(SOLVER_TAB_BY_PUZZLE_ID) as PuzzleId[]).find((id) => {
    const route = getPuzzleDefinition(id).route.replace(/\/+$/, '')
    return route === pathname
  })
  if (matchedPuzzle) return SOLVER_TAB_BY_PUZZLE_ID[matchedPuzzle]
  return 'scan'
}

function pathForTab(tab: WorkspaceTab): string {
  if (tab === 'about') return '/about'
  if (isSeoArticleTab(tab)) return SEO_ARTICLE_ROUTES[tab]
  if (tab in PUZZLE_ID_BY_SOLVER_TAB) {
    return getPuzzleDefinition(PUZZLE_ID_BY_SOLVER_TAB[tab as SolverWorkspaceTab]).route
  }
  return '/'
}

function seoPageForTab(tab: WorkspaceTab, activePuzzleId: PuzzleId): SeoPage {
  if (tab === 'about') return 'about'
  if (isSeoArticleTab(tab)) return SEO_PAGE_BY_ARTICLE_TAB[tab]
  return activePuzzleId
}

function App() {
  const { language, setLanguage, t } = useI18n()
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
  const [shareCard, setShareCard] = useState<{ url: string; copied: boolean } | null>(null)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(readInitialTab)
  const [guidePuzzleId, setGuidePuzzleId] = useState<PuzzleId>(() => puzzleIdForTab(readInitialTab()) ?? '333')
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanel>(null)
  const [solverMenuOpen, setSolverMenuOpen] = useState(false)
  const [themePreference, setThemePreference] = useState<ThemePreference>('light')
  const [editMessage, setEditMessage] = useState<string | null>(null)
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
  const [solveSurface, setSolveSurface] = useState<SolveSurface>('setup')
  const [savedTotals, setSavedTotals] = useState({
    movesSaved: readNumber(LS_MOVES_SAVED),
    tightCount: readNumber(LS_TIGHT_COUNT),
  })
  const [showScanner, setShowScanner] = useState(false)

  const activePuzzleId = puzzleIdForTab(activeTab) ?? guidePuzzleId

  useSeoMetadata(language, seoPageForTab(activeTab, activePuzzleId))

  const describeMoveText = (move: ParsedMove) => {
    const face = t(`face.name.${move.face}`)
    if (move.turns === 1) return t('move.clockwise', { face })
    if (move.turns === -1) return t('move.counter', { face })
    return t('move.double', { face })
  }

  useEffect(() => {
    initSolver().then(() => setSolverStatus('ready'))
  }, [])

  useEffect(() => {
    function handlePopState() {
      const nextTab = readInitialTab()
      setActiveTab(nextTab)
      const nextPuzzleId = puzzleIdForTab(nextTab)
      if (nextPuzzleId) setGuidePuzzleId(nextPuzzleId)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
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
    setSolveSurface('setup')
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

  async function solveFastForState(
    requestState: string,
    options: { stayOnCurrentTab?: boolean } = {},
  ) {
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
      setSolveSurface('ai')
      if (!options.stayOnCurrentTab) setActiveTab('solve')
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
    await solveFastForState(state, { stayOnCurrentTab: activeTab === 'scan' })
  }

  function handleManualSolveStart() {
    setSolveSurface('manual')
    setActiveTab('scan')
    setMoves(null)
    setSolveMode(null)
    setStepIndex(0)
    setAutoPlay(false)
    setEditMessage('Manual solve mode is active. Use the turn buttons to restore the cube.')
    setFeedback('correct')
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
      await solveFastForState(result.state, { stayOnCurrentTab: true })
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

  async function copyShareUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setShareCard({ url, copied: true })
      setShareFeedback(null)
    } catch {
      setShareCard({ url, copied: false })
    }
  }

  async function handleShare() {
    const url = shareUrl(state)
    setShareCard({ url, copied: false })
    await copyShareUrl(url)
    if (activeTab === 'scan') setEditMessage(t('share.editReady'))
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
  const currentMoveText = moves && stepIndex < moves.length ? moves[stepIndex] : null
  const aiRouteVisible = !!moves && moves.length > 0 && !noHintChallengeActive
  const solveElapsedSeconds =
    solveStartedAt === null
      ? 0
      : Math.max(0, Math.round(((solveFinishedAt ?? currentTime) - solveStartedAt) / 1000))
  function handleRandomScramble() {
    const next = randomState()
    setStateAndClearMoves(next)
    setSolveSurface('setup')
    setEditMessage('Random legal scramble loaded. Choose Manual Solve or AI Solve below.')
  }

  function handleResetScan() {
    setStateAndClearMoves(SOLVED_STATE)
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
      setSolveSurface('manual')
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
    setShareFeedback('3D preview is draggable.')
    window.setTimeout(() => setShareFeedback(null), 2500)
  }

  function switchTab(tab: WorkspaceTab) {
    const nextPuzzleId = puzzleIdForTab(tab)
    if (nextPuzzleId) setGuidePuzzleId(nextPuzzleId)
    if (tab === 'steps') setGuidePuzzleId(activePuzzleId)
    setActiveTab(tab)
    setSolverMenuOpen(false)
    if (typeof window !== 'undefined') {
      const nextPath = pathForTab(tab)
      if (window.location.pathname !== nextPath) {
        const hash = tab === 'about' ? '' : window.location.hash
        window.history.pushState(null, '', `${nextPath}${hash}`)
      }
    }
    if (tab === 'solve' && validation.ok && !moves && solverStatus === 'ready') {
      setFeedback('correct')
    }
  }

  function openGuideForPuzzle(puzzleId: PuzzleId) {
    setGuidePuzzleId(puzzleId)
    setActiveTab('steps')
    setSolverMenuOpen(false)
    if (typeof window !== 'undefined') {
      const nextPath = pathForTab('steps')
      if (window.location.pathname !== nextPath) {
        window.history.pushState(null, '', `${nextPath}${window.location.hash}`)
      }
    }
  }

  function handleScannerComplete(nextState: string) {
    setStateAndClearMoves(nextState)
    setShowScanner(false)
    const nextValidation = validateState(nextState)
    if (!nextValidation.ok) {
      setActiveTab('scan')
      setFeedback('repairable')
      setEditMessage(`Six faces captured. Review the net: ${nextValidation.reason}.`)
      return
    }
    if (!isReachableState(nextState)) {
      setActiveTab('scan')
      setFeedback('repairable')
      setEditMessage('Six faces captured. Review the net: this sticker layout is not reachable on a real 3x3.')
      return
    }
    setActiveTab('scan')
    setSolveSurface('setup')
    setEditMessage('Six faces captured and checked. Preview the cube, then choose Manual Solve or AI Solve.')
    setFeedback('correct')
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
            onComplete={handleScannerComplete}
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
          {PRIMARY_TABS.slice(0, 1).map(({ id, labelKey }) => (
            <a
              key={id}
              href={pathForTab(id)}
              className={activeTab === id ? 'active' : ''}
              aria-current={activeTab === id ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault()
                switchTab(id)
              }}
            >
              <span className={`tab-icon tab-icon-${id}`} aria-hidden="true">
                <span />
              </span>
              {t(labelKey)}
            </a>
          ))}
          <div className="solver-menu">
            <button
              type="button"
              className="solver-menu-trigger"
              aria-haspopup="true"
              aria-expanded={solverMenuOpen}
              aria-controls="mobile-solver-tray"
              onClick={() => setSolverMenuOpen((open) => !open)}
            >
              {t('tabs.allSolvers')}
            </button>
            <div className="solver-menu-panel" aria-label="Solver list">
              <span className="solver-menu-group">{t('tabs.group.cubes')}</span>
              {SOLVER_NAV_ITEMS.filter((item) => item.group === 'cube').map(({ id, labelKey }) => (
                <a
                  key={id}
                  href={pathForTab(id)}
                  className={activeTab === id ? 'active' : ''}
                  aria-current={activeTab === id ? 'page' : undefined}
                  onClick={(event) => {
                    event.preventDefault()
                    switchTab(id)
                  }}
                >
                  <span className={`tab-icon tab-icon-${id}`} aria-hidden="true">
                    <span />
                  </span>
                  {t(labelKey)}
                </a>
              ))}
              <span className="solver-menu-group">{t('tabs.group.other')}</span>
              {SOLVER_NAV_ITEMS.filter((item) => item.group === 'wca').map(({ id, labelKey }) => (
                <a
                  key={id}
                  href={pathForTab(id)}
                  className={activeTab === id ? 'active' : ''}
                  aria-current={activeTab === id ? 'page' : undefined}
                  onClick={(event) => {
                    event.preventDefault()
                    switchTab(id)
                  }}
                >
                  <span className={`tab-icon tab-icon-${id}`} aria-hidden="true">
                    <span />
                  </span>
                  {t(labelKey)}
                </a>
              ))}
            </div>
          </div>
          {PRIMARY_TABS.slice(1).map(({ id, labelKey }) => (
            <a
              key={id}
              href={pathForTab(id)}
              className={activeTab === id ? 'active' : ''}
              aria-current={activeTab === id ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault()
                switchTab(id)
              }}
            >
              <span className={`tab-icon tab-icon-${id}`} aria-hidden="true">
                <span />
              </span>
              {t(labelKey)}
            </a>
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

      <section
        id="mobile-solver-tray"
        className="mobile-solver-tray"
        aria-label={t('tabs.allSolvers')}
        hidden={!solverMenuOpen}
      >
        <span className="mobile-solver-tray-group">{t('tabs.group.cubes')}</span>
        {SOLVER_NAV_ITEMS.filter((item) => item.group === 'cube').map(({ id, labelKey }) => (
          <a
            key={id}
            href={pathForTab(id)}
            className={activeTab === id ? 'active' : ''}
            aria-current={activeTab === id ? 'page' : undefined}
            onClick={(event) => {
              event.preventDefault()
              switchTab(id)
            }}
          >
            <span className={`tab-icon tab-icon-${id}`} aria-hidden="true">
              <span />
            </span>
            {t(labelKey)}
          </a>
        ))}
        <span className="mobile-solver-tray-group">{t('tabs.group.other')}</span>
        {SOLVER_NAV_ITEMS.filter((item) => item.group === 'wca').map(({ id, labelKey }) => (
          <a
            key={id}
            href={pathForTab(id)}
            className={activeTab === id ? 'active' : ''}
            aria-current={activeTab === id ? 'page' : undefined}
            onClick={(event) => {
              event.preventDefault()
              switchTab(id)
            }}
          >
            <span className={`tab-icon tab-icon-${id}`} aria-hidden="true">
              <span />
            </span>
            {t(labelKey)}
          </a>
        ))}
      </section>

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

      {(shareCard || shareFeedback || parseError || solveError) && (
        <section className="notice-strip">
          {shareCard && (
            <div className="share-card" aria-label={t('share.cardLabel')}>
              <div className="share-card-copy">
                <strong>{t('share.title')}</strong>
                <span>{shareCard.copied ? t('share.copied') : t('share.ready')}</span>
              </div>
              <a href={shareCard.url}>{shareCard.url}</a>
              <div className="share-card-actions">
                <button onClick={() => copyShareUrl(shareCard.url)}>{t('share.copy')}</button>
                <button onClick={() => setShareCard(null)}>{t('utility.close')}</button>
              </div>
            </div>
          )}
          {shareFeedback && <p className="share-feedback">{shareFeedback}</p>}
          {parseError && <p className="error">{t('notice.imageParseError', { message: parseError })}</p>}
          {solveError && <p className="error">{solveError.message}</p>}
        </section>
      )}

      {isSeoArticleTab(activeTab) ? (
        <SeoArticlePage articleId={activeTab} onNavigate={switchTab} />
      ) : activeTab === 'about' ? (
        <AboutPage
          onOpenGuide={openGuideForPuzzle}
          onOpenPuzzle={(puzzleId) => switchTab(SOLVER_TAB_BY_PUZZLE_ID[puzzleId])}
          onOpenArticle={switchTab}
          onOpenSolver={() => switchTab('scan')}
        />
      ) : activeTab === 'mini2x2' ? (
        <MiniCubeSolverPage />
      ) : activeTab === 'revenge4x4' ? (
        <Cube444SolverPage />
      ) : activeTab === 'professor5x5' ? (
        <Cube555SolverPage />
      ) : activeTab === 'pyraminx' ? (
        <PatternPuzzleSolverPage
          adapter={pyraminxAdapter}
          definition={getPuzzleDefinition('pyraminx')}
          manualMoves={['U', "U'", 'R', "R'", 'L', "L'", 'B', "B'", 'u', "u'", 'r', "r'", 'l', "l'", 'b', "b'"]}
        />
      ) : activeTab === 'skewb' ? (
        <PatternPuzzleSolverPage
          adapter={skewbAdapter}
          definition={getPuzzleDefinition('skewb')}
          manualMoves={['U', "U'", 'R', "R'", 'L', "L'", 'B', "B'"]}
        />
      ) : isProductPage ? (
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
        <section className="stage-panel panel">
          <div className="stage-toolbar">
            <div>
              <div className="panel-heading compact">
                <span className="step-badge">{activeTab === 'solve' || activeTab === 'scan' ? '2' : '1'}</span>
                <div>
                  <h2>
                    {activeTab === 'solve'
                      ? t('stage.solveCoach')
                      : activeTab === 'steps'
                        ? t('stage.operationGuide')
                        : activeTab === 'scan'
                          ? t('main.heading')
                        : showStepMode
                          ? t('stage.followSolution')
                          : t('stage.editNet')}
                  </h2>
                  <p>
                    {activeTab === 'solve'
                      ? t('stage.solveDescription')
                      : activeTab === 'steps'
                        ? t('stage.stepsDescription')
                        : activeTab === 'scan'
                          ? t('main.description')
                        : showStepMode
                      ? t('stage.followDescription')
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
                selectedPuzzleId={guidePuzzleId}
                onSelectPuzzle={setGuidePuzzleId}
                onOpenPuzzle={(puzzleId) => switchTab(SOLVER_TAB_BY_PUZZLE_ID[puzzleId])}
                onPhotoSolve={() => setShowScanner(true)}
                onRandomScramble={() => {
                  handleRandomScramble()
                  switchTab('scan')
                }}
                onSetCube={() => switchTab('scan')}
              />
            </section>
          ) : (
            <div className="main-control-screen">
              <div className="main-cube-frame" aria-label={t('main.preview')}>
                <Cube3D state={displayState} highlights={highlight.length > 0 ? highlight : undefined} />

                <div className="corner-actions top-left">
                  <button className="glass-action" onClick={() => setShowScanner(true)}>
                    <span aria-hidden="true">▣</span>
                    {t('scan.photoSolve')}
                  </button>
                </div>
                <div className="corner-actions top-right">
                  <button className="glass-action" onClick={handleRandomScramble}>
                    <span aria-hidden="true">↻</span>
                    {t('scan.randomScramble')}
                  </button>
                </div>
                <div className="corner-actions bottom-left">
                  <button className="glass-action" onClick={handleResetScan}>
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
                    />
                  </label>
                </div>

                {currentMoveText && (
                  <div className="step-hud">
                    <span>{t('main.nowPlaying')}</span>
                    <strong>{currentMoveText}</strong>
                    <small>{t('solution.moveOf', { current: stepIndex + 1, total: moves?.length ?? 0 })}</small>
                  </div>
                )}

                {aiRouteVisible ? (
                  <div className="floating-playback-dock" aria-label={t('main.playbackDock')}>
                    <button
                      onClick={() => manualSetStep(Math.max(0, stepIndex - 1))}
                      disabled={stepIndex === 0}
                    >
                      ← {t('solution.prev')}
                    </button>
                    <button
                      className="play-toggle primary"
                      onClick={() => setAutoPlay((p) => !p)}
                      disabled={stepIndex >= moves.length}
                      aria-pressed={autoPlay}
                    >
                      {autoPlay ? `⏸ ${t('solution.pause')}` : `▶ ${t('solution.play')}`}
                    </button>
                    <button
                      onClick={() => manualSetStep(Math.min(moves.length, stepIndex + 1))}
                      disabled={stepIndex >= moves.length}
                    >
                      {t('solution.next')} →
                    </button>
                  </div>
                ) : (
                  <section className="solve-choice-dock" aria-label={t('main.solveDock')}>
                    <button
                      className={solveSurface === 'manual' ? 'active' : ''}
                      onClick={handleManualSolveStart}
                      disabled={!validationOk}
                    >
                      {t('main.manualSolve')}
                    </button>
                    <button
                      className="primary"
                      onClick={handleSolveFast}
                      disabled={!canRequestSolve}
                      title={
                        !validation.ok
                          ? validation.reason
                          : !reachable
                            ? t('solve.unreachableTitle')
                          : t('solve.fastTitle')
                      }
                    >
                      {solveBusy === 'fast' ? t('solve.solving') : t('main.aiSolve')}
                    </button>
                  </section>
                )}
              </div>

              {aiRouteVisible && (
                <section className="main-route-panel" aria-label={t('main.route')}>
                  <div className="route-title-row">
                    <strong>{t('main.aiRoute')}</strong>
                    <span>{t('algorithm.step', {
                      current: Math.min(stepIndex + 1, moves?.length ?? 0),
                      total: moves?.length ?? 0,
                    })}</span>
                  </div>
                  <div className="compact-moves">
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
                      >
                        {move}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {solveSurface === 'manual' && (
                <section className="main-manual-panel" aria-label={t('controls.operation')}>
                  <div className="operation-title-row">
                    <h2>{t('main.manualSolve')}</h2>
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
                    <span>{validationMessage}</span>
                  </div>
                </section>
              )}

              <section className="solve-status-strip">
                <div>
                  <strong>{t('solve.solve')}</strong>
                  <span>{aiRouteVisible ? t('main.playbackReady') : editMessage ?? validationMessage}</span>
                </div>
                <div className="status-metrics" aria-label={t('main.solveSummary')}>
                  <span>{validationMessage}</span>
                  <span>{t('coach.progress', { percent: solvedPercent })}</span>
                  <span>{t('coach.manualMoves', { count: manualMoves.length })}</span>
                  <span>{t('coach.timer', { seconds: solveElapsedSeconds })}</span>
                </div>
              </section>
            </div>
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

        {activeTab !== 'steps' && activeTab !== 'scan' && (
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
        {showNotation && <Notation activePuzzleId={activePuzzleId} />}
        <HowToPlay activePuzzleId={activePuzzleId} className="how-to-footer" />
        <Faq activePuzzleId={activePuzzleId} />
        <SeoResourceLinks onNavigate={switchTab} />
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

function HowToPlay({
  activePuzzleId,
  className = '',
}: {
  activePuzzleId: PuzzleId
  className?: string
}) {
  const { t } = useI18n()
  return (
    <section className={`how-to panel ${className}`.trim()}>
      <h2>{t('how.heading', { puzzle: t(`puzzle.${activePuzzleId}.shortName`) })}</h2>
      <ol>
        <li>{t(`how.${activePuzzleId}.step.1`)}</li>
        <li>{t(`how.${activePuzzleId}.step.2`)}</li>
        <li>{t(`how.${activePuzzleId}.step.3`)}</li>
      </ol>
    </section>
  )
}

function SeoArticlePage({
  articleId,
  onNavigate,
}: {
  articleId: SeoArticleTab
  onNavigate: (tab: WorkspaceTab) => void
}) {
  const article = SEO_ARTICLES[articleId]
  return (
    <article className="seo-article-page">
      <section className="seo-article-hero panel">
        <div>
          <span className="about-kicker">{article.kicker}</span>
          <h2>{article.title}</h2>
          <p>{article.intro}</p>
        </div>
        <a
          className="seo-article-cta"
          href={article.primaryCta.href}
          onClick={(event) => {
            event.preventDefault()
            onNavigate(article.primaryCta.target)
          }}
        >
          {article.primaryCta.label}
        </a>
      </section>

      <section className="seo-article-layout">
        <div className="seo-article-main">
          {article.sections.map((section) => (
            <section key={section.title} className="seo-article-section panel">
              <h2>{section.title}</h2>
              <p>{section.body}</p>
              {section.items && (
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <aside className="seo-article-sidebar">
          <section className="seo-article-card panel">
            <h2>Quick notes</h2>
            <ul>
              {article.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          </section>
          <section className="seo-article-card panel">
            <h2>Related pages</h2>
            <div className="seo-link-list">
              {article.related.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(event) => {
                    event.preventDefault()
                    onNavigate(link.target)
                  }}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </article>
  )
}

function SeoResourceLinks({ onNavigate }: { onNavigate: (tab: WorkspaceTab) => void }) {
  const resourceIds: SeoArticleTab[] = ['how2x2', 'how4x4', 'cubeStats']
  return (
    <section className="seo-resources panel">
      <h2>Learning pages</h2>
      <div className="seo-link-list">
        {resourceIds.map((id) => {
          const article = SEO_ARTICLES[id]
          return (
            <a
              key={id}
              href={SEO_ARTICLE_ROUTES[id]}
              onClick={(event) => {
                event.preventDefault()
                onNavigate(id)
              }}
            >
              {article.title}
            </a>
          )
        })}
      </div>
    </section>
  )
}

function AboutPage({
  onOpenGuide,
  onOpenPuzzle,
  onOpenArticle,
  onOpenSolver,
}: {
  onOpenGuide: (puzzleId: PuzzleId) => void
  onOpenPuzzle: (puzzleId: PuzzleId) => void
  onOpenArticle: (tab: WorkspaceTab) => void
  onOpenSolver: () => void
}) {
  const { t } = useI18n()
  const featureKeys = ['scan', 'validate', 'solve', 'playback'] as const
  const audienceKeys = ['beginner', 'learner', 'player'] as const
  const articleIds: SeoArticleTab[] = ['how2x2', 'how4x4', 'cubeStats']
  return (
    <section className="about-page">
      <section className="about-hero panel">
        <div>
          <span className="about-kicker">{t('about.kicker')}</span>
          <h2>{t('about.heading')}</h2>
          <p>{t('about.description')}</p>
        </div>
        <button className="primary" onClick={onOpenSolver}>
          {t('about.openSolver')}
        </button>
      </section>

      <section className="about-section">
        <div className="about-section-heading">
          <h2>{t('about.features.heading')}</h2>
          <p>{t('about.features.description')}</p>
        </div>
        <div className="about-feature-grid">
          {featureKeys.map((key) => (
            <article key={key} className="about-feature panel">
              <span className={`about-feature-icon about-feature-${key}`} aria-hidden="true" />
              <h3>{t(`about.feature.${key}.title`)}</h3>
              <p>{t(`about.feature.${key}.body`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-section">
        <div className="about-section-heading">
          <h2>{t('about.puzzles.heading')}</h2>
          <p>{t('about.puzzles.description')}</p>
        </div>
        <div className="about-puzzle-grid">
          {GUIDE_PUZZLE_IDS.map((puzzleId) => (
            <article key={puzzleId} className="about-puzzle-card">
              <span className="about-puzzle-meta">{t(`about.puzzle.${puzzleId}.meta`)}</span>
              <h3>{t(`puzzle.${puzzleId}.name`)}</h3>
              <p>{t(`about.puzzle.${puzzleId}.body`)}</p>
              <ul>
                {ABOUT_PUZZLE_FACT_IDS.map((factId) => (
                  <li key={factId}>{t(`about.puzzle.${puzzleId}.${factId}`)}</li>
                ))}
              </ul>
              <div className="about-puzzle-actions">
                <button className="primary" onClick={() => onOpenPuzzle(puzzleId)}>
                  {t('about.puzzle.solverCta')}
                </button>
                <button onClick={() => onOpenGuide(puzzleId)}>{t('about.puzzle.guideCta')}</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="about-help-band panel">
        <div>
          <h2>{t('about.help.heading')}</h2>
          <p>{t('about.help.body')}</p>
        </div>
        <ol>
          <li>{t('about.help.step.1')}</li>
          <li>{t('about.help.step.2')}</li>
          <li>{t('about.help.step.3')}</li>
        </ol>
      </section>

      <section className="about-section">
        <div className="about-section-heading">
          <h2>Learning pages</h2>
          <p>Focused guides for common cube questions, with links back to the matching solver tools.</p>
        </div>
        <div className="seo-resource-grid">
          {articleIds.map((id) => {
            const article = SEO_ARTICLES[id]
            return (
              <a
                key={id}
                href={SEO_ARTICLE_ROUTES[id]}
                onClick={(event) => {
                  event.preventDefault()
                  onOpenArticle(id)
                }}
              >
                <span>{article.kicker}</span>
                <strong>{article.title}</strong>
              </a>
            )
          })}
        </div>
      </section>

      <section className="about-section">
        <div className="about-section-heading">
          <h2>{t('about.audience.heading')}</h2>
          <p>{t('about.audience.description')}</p>
        </div>
        <div className="about-audience-grid">
          {audienceKeys.map((key) => (
            <article key={key} className="about-audience-item">
              <h3>{t(`about.audience.${key}.title`)}</h3>
              <p>{t(`about.audience.${key}.body`)}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}

function OperationManual({
  onPhotoSolve,
  onOpenPuzzle,
  onRandomScramble,
  onSelectPuzzle,
  onSetCube,
  selectedPuzzleId,
}: {
  onPhotoSolve: () => void
  onOpenPuzzle: (puzzleId: PuzzleId) => void
  onRandomScramble: () => void
  onSelectPuzzle: (puzzleId: PuzzleId) => void
  onSetCube: () => void
  selectedPuzzleId: PuzzleId
}) {
  const { t } = useI18n()
  const showBeginnerTutorial = selectedPuzzleId === '333'
  return (
    <div className="guide-content">
      <section className="tutorial-hero">
        <div>
          <span className="tutorial-kicker">{t('guide.kicker')}</span>
          <h2>{t(`guide.${selectedPuzzleId}.heading`)}</h2>
          <p>{t(`guide.${selectedPuzzleId}.description`)}</p>
        </div>
        <div className="tutorial-actions">
          <button className="primary" onClick={() => onOpenPuzzle(selectedPuzzleId)}>
            {t('guide.openSelectedSolver', { puzzle: t(`puzzle.${selectedPuzzleId}.shortName`) })}
          </button>
          {showBeginnerTutorial && (
            <>
              <button onClick={onPhotoSolve}>{t('scan.photoSolve')}</button>
              <button onClick={onRandomScramble}>{t('scan.randomScramble')}</button>
              <button onClick={onSetCube}>{t('guide.openSolver')}</button>
            </>
          )}
        </div>
      </section>

      <div className="guide-selector" aria-label={t('guide.selectorLabel')}>
        {GUIDE_PUZZLE_IDS.map((puzzleId) => (
          <button
            key={puzzleId}
            className={puzzleId === selectedPuzzleId ? 'active' : ''}
            onClick={() => onSelectPuzzle(puzzleId)}
            aria-pressed={puzzleId === selectedPuzzleId}
          >
            <span>{t(`puzzle.${puzzleId}.shortName`)}</span>
            <small>{t(`guide.${puzzleId}.selectorNote`)}</small>
          </button>
        ))}
      </div>

      <section className="guide-layout">
        <ol className="guide-step-list">
          {GUIDE_STEP_IDS.map((stepId, index) => (
            <li key={stepId} className="guide-card">
              <span className="tutorial-step">{index + 1}</span>
              <h3>{t(`guide.${selectedPuzzleId}.step.${stepId}.title`)}</h3>
              <p>{t(`guide.${selectedPuzzleId}.step.${stepId}.body`)}</p>
            </li>
          ))}
        </ol>

        <aside className="guide-note guide-fact-panel">
          <strong>{t('guide.puzzleFacts')}</strong>
          <ul>
            {GUIDE_FACT_IDS.map((factId) => (
              <li key={factId}>{t(`guide.${selectedPuzzleId}.fact.${factId}`)}</li>
            ))}
          </ul>
          <button onClick={() => onOpenPuzzle(selectedPuzzleId)}>
            {t('guide.openSelectedSolver', { puzzle: t(`puzzle.${selectedPuzzleId}.shortName`) })}
          </button>
        </aside>
      </section>

      {showBeginnerTutorial && (
        <section className="tutorial-section">
          <div className="about-section-heading">
            <h2>{t('tutorial.heading')}</h2>
            <p>{t('tutorial.description')}</p>
          </div>
          <div className="tutorial-grid">
            {BEGINNER_TUTORIAL.map((item, index) => (
              <article key={item.id} className="guide-card tutorial-card">
                <MiniFaceDiagram colors={item.colors} />
                <span className="tutorial-step">{index + 1}</span>
                <h3>{t(item.titleKey)}</h3>
                <p>{t(item.bodyKey)}</p>
                <div className="formula-row">
                  <strong>{t('tutorial.formula')}</strong>
                  <code>{item.formula}</code>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function MiniFaceDiagram({ colors }: { colors: readonly Face[] }) {
  const cells = [
    colors[0], 'U', colors[1],
    'L', 'U', 'R',
    colors[2], 'D', colors[3],
  ] as const
  return (
    <div className="mini-face" aria-hidden="true">
      {cells.map((face, index) => (
        <span
          key={`${face}-${index}`}
          style={{ '--face-color': FACE_COLORS[face] } as CSSProperties}
        />
      ))}
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

function Notation({ activePuzzleId }: { activePuzzleId: PuzzleId }) {
  const { t } = useI18n()
  const notationMoves =
    activePuzzleId === 'pyraminx'
      ? ['U', 'R', 'L', 'B', 'u', 'r', 'l', 'b']
      : activePuzzleId === 'skewb'
        ? ['U', 'R', 'L', 'B']
        : ['U', 'D', 'L', 'R', 'F', 'B']
  return (
    <details className="notation">
      <summary>{t('notation.summary', { puzzle: t(`puzzle.${activePuzzleId}.shortName`) })}</summary>
      <ul>
        <li>
          {notationMoves.map((move, index) => (
            <span key={move}>
              {index > 0 ? ', ' : ''}
              <code>{move}</code>
            </span>
          ))}{' '}
          - {t(`notation.${activePuzzleId}.faces`)}
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

function Faq({ activePuzzleId }: { activePuzzleId: PuzzleId }) {
  const { t } = useI18n()
  return (
    <details className="seo-faq panel">
      <summary>{t('faq.summary')}</summary>
      <div className="faq-list">
        <article>
          <h2>{t(`faq.${activePuzzleId}.solve.question`)}</h2>
          <p>{t(`faq.${activePuzzleId}.solve.answer`)}</p>
        </article>
        <article>
          <h2>{t(`faq.${activePuzzleId}.limits.question`)}</h2>
          <p>{t(`faq.${activePuzzleId}.limits.answer`)}</p>
        </article>
        <article>
          <h2>{t('faq.install.question')}</h2>
          <p>{t('faq.install.answer')}</p>
        </article>
      </div>
    </details>
  )
}

export default App
