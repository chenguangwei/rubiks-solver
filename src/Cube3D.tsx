import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Group } from 'three'
import { FACE_COLORS } from './cube'
import type { Face } from './cube'
import {
  STICKERS_BY_CUBIE,
  cubieKey,
  cubieOnFace,
  rotationAngle,
  rotationAxis,
} from './cubies'
import type { Vec3 } from './cubies'
import { parseMove } from './moves'
import { applyMoves } from './solver'

const INTERIOR_COLOR = '#161616'
const CUBIE_SIZE = 0.94

const ALL_CUBIES: readonly Vec3[] = (() => {
  const out: Vec3[] = []
  for (const x of [-1, 0, 1] as const) {
    for (const y of [-1, 0, 1] as const) {
      for (const z of [-1, 0, 1] as const) {
        if (x === 0 && y === 0 && z === 0) continue // skip the unseen core
        out.push([x, y, z])
      }
    }
  }
  return out
})()

/**
 * Map a state string to a per-cubie array of 6 face colors. Materials are
 * indexed in three.js BoxGeometry order: +x, -x, +y, -y, +z, -z.
 */
function colorsForState(state: string): Map<string, (string | null)[]> {
  const out = new Map<string, (string | null)[]>()
  for (const [x, y, z] of ALL_CUBIES) {
    const key = cubieKey(x, y, z)
    const stickers = STICKERS_BY_CUBIE[key] ?? []
    const faces: (string | null)[] = [null, null, null, null, null, null]
    for (const s of stickers) {
      const letter = state[s.index] as Face
      const color = FACE_COLORS[letter] ?? '#888'
      const slot =
        s.normal[0] === 1
          ? 0
          : s.normal[0] === -1
            ? 1
            : s.normal[1] === 1
              ? 2
              : s.normal[1] === -1
                ? 3
                : s.normal[2] === 1
                  ? 4
                  : 5
      faces[slot] = color
    }
    out.set(key, faces)
  }
  return out
}

type Cubie = { key: string; position: Vec3; colors: (string | null)[] }

function buildCubies(state: string): Cubie[] {
  const colors = colorsForState(state)
  return ALL_CUBIES.map(([x, y, z]) => ({
    key: cubieKey(x, y, z),
    position: [x, y, z],
    colors: colors.get(cubieKey(x, y, z)) ?? [],
  }))
}

function CubieMesh({ position, colors }: { position: Vec3; colors: (string | null)[] }) {
  return (
    <mesh position={position}>
      <boxGeometry args={[CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE]} />
      {colors.map((c, i) => (
        <meshStandardMaterial
          key={i}
          attach={`material-${i}`}
          color={c ?? INTERIOR_COLOR}
          roughness={0.55}
          metalness={0.05}
        />
      ))}
    </mesh>
  )
}

/**
 * If there's a single move M (or its inverse) such that applyMoves(prev, M) === next,
 * return it. Otherwise null. Used to detect "this state change was one user step
 * forward/backward" so the 3D cube can animate the corresponding face turn.
 */
const ALL_MOVE_STRINGS: string[] = (() => {
  const out: string[] = []
  for (const f of ['U', 'R', 'F', 'D', 'L', 'B']) {
    out.push(f, `${f}'`, `${f}2`)
  }
  return out
})()

function detectSingleMove(prev: string, next: string): string | null {
  if (prev === next) return null
  for (const move of ALL_MOVE_STRINGS) {
    if (applyMoves(prev, move) === next) return move
  }
  return null
}

type AnimatingTurn = {
  face: Face
  turns: 1 | -1 | 2
  /** State *after* the turn finishes — committed at end of animation. */
  endState: string
  /** State *before* the turn — still rendered for non-rotating cubies. */
  startState: string
  /** Animation duration in ms. */
  durationMs: number
}

function RotatingLayer({
  turn,
  startedAt,
  onDone,
}: {
  turn: AnimatingTurn
  startedAt: number
  onDone: () => void
}) {
  const groupRef = useRef<Group>(null)
  const axis = rotationAxis(turn.face)
  const targetAngle = rotationAngle(turn.face, turn.turns)

  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    const t = Math.min(1, (performance.now() - startedAt) / turn.durationMs)
    // Ease in/out for less mechanical feel.
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    const angle = eased * targetAngle
    g.rotation.x = axis === 'x' ? angle : 0
    g.rotation.y = axis === 'y' ? angle : 0
    g.rotation.z = axis === 'z' ? angle : 0
    if (t >= 1) onDone()
  })

  // While rotating, the layer cubies show the *start* state (not yet turned)
  // and the group's rotation visually performs the turn.
  const cubies = buildCubies(turn.startState).filter((c) =>
    cubieOnFace(turn.face, c.position),
  )

  return (
    <group ref={groupRef}>
      {cubies.map((c) => (
        <CubieMesh key={c.key} position={c.position} colors={c.colors} />
      ))}
    </group>
  )
}

function Scene({ state }: { state: string }) {
  // Internal rendered state — diverges from `state` during a turn animation
  // so we can render the start state on the moving layer.
  const [rendered, setRendered] = useState(state)
  const [turn, setTurn] = useState<AnimatingTurn | null>(null)
  const [startedAt, setStartedAt] = useState(0)

  useEffect(() => {
    if (state === rendered) return
    if (turn) return // an animation is already in flight; will sync on completion
    const move = detectSingleMove(rendered, state)
    const parsed = move ? parseMove(move) : null
    if (parsed) {
      setTurn({
        face: parsed.face,
        turns: parsed.turns,
        startState: rendered,
        endState: state,
        durationMs: parsed.turns === 2 ? 380 : 240,
      })
      setStartedAt(performance.now())
    } else {
      // Multi-move jump (paste, scramble, reset, etc.) — snap.
      setRendered(state)
    }
  }, [state, rendered, turn])

  function handleAnimationDone() {
    if (!turn) return
    setRendered(turn.endState)
    setTurn(null)
  }

  // Static cubies = cubies NOT being animated this frame.
  const staticState = turn ? turn.startState : rendered
  const allStatic = useMemo(() => buildCubies(staticState), [staticState])
  const filteredStatic = turn
    ? allStatic.filter((c) => !cubieOnFace(turn.face, c.position))
    : allStatic

  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} />
      <directionalLight position={[-3, -2, -4]} intensity={0.25} />
      {filteredStatic.map((c) => (
        <CubieMesh key={c.key} position={c.position} colors={c.colors} />
      ))}
      {turn && (
        <RotatingLayer
          turn={turn}
          startedAt={startedAt}
          onDone={handleAnimationDone}
        />
      )}
      <OrbitControls enablePan={false} minDistance={5} maxDistance={14} />
    </>
  )
}

export function Cube3D({ state }: { state: string }) {
  return (
    <Canvas camera={{ position: [5.5, 5, 7], fov: 35 }} dpr={[1, 2]}>
      <Scene state={state} />
    </Canvas>
  )
}
