import SolverWorker from './solver.worker?worker'
import {
  UnsolvableCubeError,
  applyMoves,
  isReachableState,
  isSolved,
  randomState,
  solvedState,
} from './solver-core'
import type { Move, TightSolveProgress } from './solver-core'
import { get, set } from 'idb-keyval'
import type { WorkerInbound, WorkerOutbound } from './solver.worker'

// Re-export sync utilities so consumers can keep importing from './solver'.
export { UnsolvableCubeError, applyMoves, isReachableState, isSolved, randomState, solvedState }
export type { Move, TightSolveProgress }

let worker: Worker | null = null
let initialized = false
let initPromise: Promise<void> | null = null

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (e: unknown) => void
  onProgress?: (p: TightSolveProgress) => void
}
const pending = new Map<string, PendingRequest>()
let nextId = 0

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new SolverWorker() as Worker
  worker.onmessage = (e: MessageEvent<WorkerOutbound>) => {
    const msg = e.data
    const handler = pending.get(msg.id)
    if (!handler) return
    if (msg.type === 'progress') {
      handler.onProgress?.({ moves: msg.moves, phase: msg.phase })
      return // don't resolve yet — wait for 'result'
    }
    if (msg.type === 'init-done') {
      initialized = true
      handler.resolve(undefined)
    } else if (msg.type === 'result') {
      handler.resolve(msg.moves)
    } else if (msg.type === 'error') {
      handler.reject(msg.unsolvable ? new UnsolvableCubeError() : new Error(msg.message))
    }
    pending.delete(msg.id)
  }
  return worker
}

function send(msg: WorkerInbound, onProgress?: (p: TightSolveProgress) => void): Promise<unknown> {
  ensureWorker()
  return new Promise((resolve, reject) => {
    pending.set(msg.id, { resolve, reject, onProgress })
    worker!.postMessage(msg)
  })
}

function newId(): string {
  return String(++nextId)
}

export function initSolver(): Promise<void> {
  if (initialized) return Promise.resolve()
  if (initPromise) return initPromise
  initPromise = send({ id: newId(), type: 'init' }) as Promise<void>
  return initPromise
}

export function isSolverReady(): boolean {
  return initialized
}

export function solve(state: string): Promise<Move[]> {
  return send({ id: newId(), type: 'solve-fast', state }) as Promise<Move[]>
}

export type SolveTightOptions = {
  deadlineMs?: number
  minDepth?: number
  onProgress?: (p: TightSolveProgress) => void
}

export async function solveTight(state: string, options: SolveTightOptions = {}): Promise<Move[]> {
  const cacheKey = `tight-solve:${state}`
  const cached = await get<Move[]>(cacheKey)
  if (cached && cached.length > 0) {
    if (options.onProgress) options.onProgress({ moves: cached, phase: 'done' })
    return cached
  }

  const result = await send(
    {
      id: newId(),
      type: 'solve-tight',
      state,
      deadlineMs: options.deadlineMs ?? 6000,
      minDepth: options.minDepth ?? 18,
    },
    options.onProgress,
  ) as Move[]

  await set(cacheKey, result)
  return result
}

export function cancelPendingSolves(): void {
  for (const [, h] of pending) h.reject(new Error('Solver cancelled'))
  pending.clear()
}

/**
 * Hard-cancel any in-flight solver work by terminating the worker. The next
 * solve() call will spawn a fresh worker and pay the ~3s init cost again.
 * Use sparingly — only when the user explicitly asks to cancel a tight solve
 * or a hard timeout is reached.
 */
export function terminateSolver(): void {
  if (!worker) return
  worker.terminate()
  worker = null
  initialized = false
  initPromise = null
  cancelPendingSolves()
}
