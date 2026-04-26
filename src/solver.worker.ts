/// <reference lib="webworker" />
import {
  UnsolvableCubeError,
  initSolverCore,
  solveFastSync,
  solveTightSync,
} from './solver-core'

export type WorkerInbound =
  | { id: string; type: 'init' }
  | { id: string; type: 'solve-fast'; state: string }
  | {
      id: string
      type: 'solve-tight'
      state: string
      deadlineMs: number
      minDepth: number
    }

export type WorkerOutbound =
  | { id: string; type: 'init-done' }
  | {
      id: string
      type: 'progress'
      moves: string[]
      phase: 'baseline' | 'tightening' | 'done'
    }
  | { id: string; type: 'result'; moves: string[] }
  | { id: string; type: 'error'; message: string; unsolvable: boolean }

self.onmessage = async (e: MessageEvent<WorkerInbound>) => {
  const msg = e.data
  try {
    switch (msg.type) {
      case 'init':
        await initSolverCore()
        post({ id: msg.id, type: 'init-done' })
        break
      case 'solve-fast': {
        const moves = solveFastSync(msg.state)
        post({ id: msg.id, type: 'result', moves })
        break
      }
      case 'solve-tight': {
        const moves = solveTightSync(msg.state, {
          deadlineMs: msg.deadlineMs,
          minDepth: msg.minDepth,
          onProgress: (p) =>
            post({ id: msg.id, type: 'progress', moves: p.moves, phase: p.phase }),
        })
        post({ id: msg.id, type: 'result', moves })
        break
      }
    }
  } catch (err) {
    const unsolvable = err instanceof UnsolvableCubeError
    const message = err instanceof Error ? err.message : String(err)
    post({ id: msg.id, type: 'error', message, unsolvable })
  }
}

function post(msg: WorkerOutbound) {
  self.postMessage(msg)
}
