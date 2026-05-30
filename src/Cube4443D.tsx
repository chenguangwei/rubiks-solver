import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Group } from 'three'
import { FACE_COLORS } from './cube'
import type { Face } from './cube'
import {
  CUBE_444_STICKER_REFS,
  isCoordIn444MoveLayer,
  parse444Move,
  visible444Stickers,
} from './puzzles/444'
import type { Cube444State, Parsed444Move } from './puzzles/444'

type Vec3 = readonly [number, number, number]

const INTERIOR_COLOR = '#111827'
const MATERIAL_FACES: readonly Face[] = ['R', 'L', 'U', 'D', 'F', 'B']
const CUBIE_SIZE = 0.46
const POSITION_SCALE = 0.24

type Cube444Cubie = {
  key: string
  coord: Vec3
  colors: Partial<Record<Face, Face>>
}

function normalToFace([x, y, z]: Vec3): Face | null {
  if (x === 1) return 'R'
  if (x === -1) return 'L'
  if (y === 1) return 'U'
  if (y === -1) return 'D'
  if (z === 1) return 'F'
  if (z === -1) return 'B'
  return null
}

function buildCubies(state: Cube444State): Cube444Cubie[] {
  const cubies = new Map<string, Cube444Cubie>()
  CUBE_444_STICKER_REFS.forEach((sticker) => {
    const color = state[sticker.index] as Face
    const cubieKey = sticker.coord.join(',')
    const face = normalToFace(sticker.normal)
    if (!face) return
    const cubie = cubies.get(cubieKey) ?? {
      key: cubieKey,
      coord: sticker.coord,
      colors: {},
    }
    cubie.colors[face] = color
    cubies.set(cubieKey, cubie)
  })
  return [...cubies.values()]
}

function stateFingerprint(state: Cube444State | null): string {
  if (!state) return 'loading'
  let hash = 0
  for (let i = 0; i < state.length; i++) {
    hash = (hash * 31 + state.charCodeAt(i)) >>> 0
  }
  return hash.toString(36).toUpperCase().padStart(7, '0')
}

function turnAxis(face: Face): 'x' | 'y' | 'z' {
  switch (face) {
    case 'U':
    case 'D':
      return 'y'
    case 'L':
    case 'R':
      return 'x'
    case 'F':
    case 'B':
      return 'z'
  }
}

function turnAngleRad(move: Parsed444Move): number {
  const sign = move.face === 'U' || move.face === 'R' || move.face === 'F' ? -1 : 1
  return sign * move.turns * (Math.PI / 2)
}

function CubieMesh({ cubie }: { cubie: Cube444Cubie }) {
  const [x, y, z] = cubie.coord
  return (
    <mesh position={[x * POSITION_SCALE, y * POSITION_SCALE, z * POSITION_SCALE]}>
      <boxGeometry args={[CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE]} />
      {MATERIAL_FACES.map((face, index) => {
        const colorFace = cubie.colors[face]
        return (
          <meshStandardMaterial
            key={face}
            attach={`material-${index}`}
            color={colorFace ? FACE_COLORS[colorFace] : INTERIOR_COLOR}
            roughness={0.5}
            metalness={0.04}
          />
        )
      })}
    </mesh>
  )
}

type Turn = {
  move: Parsed444Move
  axis: 'x' | 'y' | 'z'
  angle: number
  startState: Cube444State
  endState: Cube444State
  durationMs: number
}

function RotatingLayer({ turn, onDone }: { turn: Turn; onDone: () => void }) {
  const groupRef = useRef<Group>(null)
  const startedAt = useRef<number | null>(null)
  const doneRef = useRef(false)

  useFrame(() => {
    const group = groupRef.current
    if (!group) return
    const now = performance.now()
    startedAt.current ??= now
    const t = Math.min(1, (now - startedAt.current) / turn.durationMs)
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    const angle = eased * turn.angle
    group.rotation.x = turn.axis === 'x' ? angle : 0
    group.rotation.y = turn.axis === 'y' ? angle : 0
    group.rotation.z = turn.axis === 'z' ? angle : 0
    if (t >= 1 && !doneRef.current) {
      doneRef.current = true
      onDone()
    }
  })

  const cubies = buildCubies(turn.startState).filter((cubie) =>
    isCoordIn444MoveLayer(turn.move, cubie.coord),
  )

  return (
    <group ref={groupRef}>
      {cubies.map((cubie) => (
        <CubieMesh key={cubie.key} cubie={cubie} />
      ))}
    </group>
  )
}

function Cube444Scene({
  state,
  turnMove,
}: {
  state: Cube444State
  turnMove: string | null
}) {
  const [renderedState, setRenderedState] = useState<Cube444State>(state)
  const [turn, setTurn] = useState<Turn | null>(null)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (stateFingerprint(state) === stateFingerprint(renderedState)) return
      if (turn) {
        if (stateFingerprint(state) === stateFingerprint(turn.endState)) return
        setRenderedState(state)
        setTurn(null)
        return
      }

      const parsed = turnMove ? parse444Move(turnMove) : null
      if (!parsed) {
        setRenderedState(state)
        return
      }

      setTurn({
        move: parsed,
        axis: turnAxis(parsed.face),
        angle: turnAngleRad(parsed),
        startState: renderedState,
        endState: state,
        durationMs: parsed.turns === 2 ? 560 : 380,
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [state, renderedState, turn, turnMove])

  function handleTurnDone() {
    if (!turn) return
    setRenderedState(turn.endState)
    setTurn(null)
  }

  const staticState = turn ? turn.startState : renderedState
  const cubies = useMemo(() => buildCubies(staticState), [staticState])
  const staticCubies = turn
    ? cubies.filter((cubie) => !isCoordIn444MoveLayer(turn.move, cubie.coord))
    : cubies

  return (
    <>
      <ambientLight intensity={0.72} />
      <directionalLight position={[5, 8, 5]} intensity={0.82} />
      <directionalLight position={[-4, -3, -5]} intensity={0.25} />
      {staticCubies.map((cubie) => (
        <CubieMesh key={cubie.key} cubie={cubie} />
      ))}
      {turn && (
        <RotatingLayer
          key={`${turn.move.raw}-${stateFingerprint(turn.endState)}`}
          turn={turn}
          onDone={handleTurnDone}
        />
      )}
      <OrbitControls enablePan={false} minDistance={3.8} maxDistance={8} />
    </>
  )
}

export function Cube4443D({
  state,
  turnMove,
}: {
  state: Cube444State
  turnMove: string | null
}) {
  const visibleStickers = useMemo(() => visible444Stickers(state), [state])

  return (
    <div className="mini-cube-3d-stage cube-444-3d-stage" aria-label="4x4 3D cube preview">
      <Canvas
        camera={{ position: [3.8, 3.2, 4.8], fov: 34 }}
        dpr={[1, 2]}
        style={{ width: '100%', height: '100%' }}
      >
        <Cube444Scene state={state} turnMove={turnMove} />
      </Canvas>
      <div className="mini-cube-3d-a11y">
        {visibleStickers.map((face, index) => (
          <span key={`${index}-${face}`} aria-label={`4x4 3D sticker ${index + 1} ${face}`} />
        ))}
      </div>
    </div>
  )
}
