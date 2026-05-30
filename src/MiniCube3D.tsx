import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Group } from 'three'
import { FACE_COLORS } from './cube'
import type { Face } from './cube'
import { parseMove } from './moves'
import type { CubingPatternState } from './puzzles/cubingPattern'

type MiniVec3 = readonly [number, number, number]
type VisibleFace = 'top' | 'front' | 'right'

const INTERIOR_COLOR = '#111827'
const CUBIE_SIZE = 0.98

const CORNER_FACES: readonly (readonly Face[])[] = [
  // Must match cubing.js kpuzzle CORNERS orbit ordering:
  // 0 URF, 1 UBR, 2 UBL, 3 UFL, 4 DFR, 5 DLF, 6 DBL, 7 DRB.
  // Each entry is in axis order: [U/D, R/L, F/B].
  ['U', 'R', 'F'],
  ['U', 'R', 'B'],
  ['U', 'L', 'B'],
  ['U', 'L', 'F'],
  ['D', 'R', 'F'],
  ['D', 'L', 'F'],
  ['D', 'L', 'B'],
  ['D', 'R', 'B'],
]

const CORNER_POSITIONS: readonly MiniVec3[] = [
  [1, 1, 1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, 1, 1],
  [1, -1, 1],
  [-1, -1, 1],
  [-1, -1, -1],
  [1, -1, -1],
]

const MATERIAL_FACES: readonly Face[] = ['R', 'L', 'U', 'D', 'F', 'B']

function rotateFaces(faces: readonly Face[], turns: number): Face[] {
  const normalized = ((turns % faces.length) + faces.length) % faces.length
  return faces.map((_, index) => faces[(index + normalized) % faces.length])
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

function cornerColorsByPosition(state: CubingPatternState | null): Partial<Record<Face, Face>>[] {
  const corners = state?.patternData.CORNERS
  return CORNER_FACES.map((positionFaces, position) => {
    const piece = corners?.pieces[position] ?? position
    const orientation = corners?.orientation[position] ?? 0
    const pieceFaces = CORNER_FACES[piece] ?? positionFaces
    const colors = rotateFaces(pieceFaces, orientation)
    return Object.fromEntries(positionFaces.map((face, index) => [face, colors[index]])) as Partial<
      Record<Face, Face>
    >
  })
}

function visibleFaceStickers(state: CubingPatternState | null): Record<VisibleFace, Face[]> {
  const colors = cornerColorsByPosition(state)
  const facelet = (position: number, face: Face) => colors[position][face] ?? face

  return {
    top: [facelet(2, 'U'), facelet(1, 'U'), facelet(3, 'U'), facelet(0, 'U')],
    front: [facelet(3, 'F'), facelet(0, 'F'), facelet(7, 'F'), facelet(4, 'F')],
    right: [facelet(0, 'R'), facelet(1, 'R'), facelet(4, 'R'), facelet(5, 'R')],
  }
}

type MiniCubie = {
  key: string
  position: MiniVec3
  colors: Partial<Record<Face, Face>>
}

function buildCubies(state: CubingPatternState | null): MiniCubie[] {
  const colors = cornerColorsByPosition(state)
  return CORNER_POSITIONS.map((position, index) => ({
    key: `${position.join(',')}-${index}`,
    position,
    colors: colors[index] ?? {},
  }))
}

function cubieOnMoveFace(face: Face, [x, y, z]: MiniVec3): boolean {
  switch (face) {
    case 'U':
      return y === 1
    case 'D':
      return y === -1
    case 'F':
      return z === 1
    case 'B':
      return z === -1
    case 'L':
      return x === -1
    case 'R':
      return x === 1
  }
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

function turnAngleRad(face: Face, turns: 1 | -1 | 2): number {
  const sign = face === 'U' || face === 'R' || face === 'F' ? -1 : 1
  return sign * turns * (Math.PI / 2)
}

function CubieMesh({ cubie }: { cubie: MiniCubie }) {
  const [x, y, z] = cubie.position
  return (
    <mesh position={[x * 0.53, y * 0.53, z * 0.53]}>
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

type MiniTurn = {
  face: Face
  axis: 'x' | 'y' | 'z'
  angle: number
  startState: CubingPatternState
  endState: CubingPatternState
  durationMs: number
}

function RotatingLayer({
  turn,
  onDone,
}: {
  turn: MiniTurn
  onDone: () => void
}) {
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
    cubieOnMoveFace(turn.face, cubie.position),
  )

  return (
    <group ref={groupRef}>
      {cubies.map((cubie) => (
        <CubieMesh key={cubie.key} cubie={cubie} />
      ))}
    </group>
  )
}

function MiniCubeScene({
  state,
  turnMove,
}: {
  state: CubingPatternState | null
  turnMove: string | null
}) {
  const [renderedState, setRenderedState] = useState<CubingPatternState | null>(state)
  const [turn, setTurn] = useState<MiniTurn | null>(null)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!state) {
        setRenderedState(null)
        setTurn(null)
        return
      }
      if (!renderedState) {
        setRenderedState(state)
        return
      }
      if (stateFingerprint(state) === stateFingerprint(renderedState)) return
      if (turn) {
        if (stateFingerprint(state) === stateFingerprint(turn.endState)) return
        setRenderedState(state)
        setTurn(null)
        return
      }

      const parsed = turnMove ? parseMove(turnMove) : null
      if (!parsed) {
        setRenderedState(state)
        return
      }

      setTurn({
        face: parsed.face,
        axis: turnAxis(parsed.face),
        angle: turnAngleRad(parsed.face, parsed.turns),
        startState: renderedState,
        endState: state,
        durationMs: parsed.turns === 2 ? 520 : 360,
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
    ? cubies.filter((cubie) => !cubieOnMoveFace(turn.face, cubie.position))
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
          key={`${turn.face}-${stateFingerprint(turn.endState)}`}
          turn={turn}
          onDone={handleTurnDone}
        />
      )}
      <OrbitControls enablePan={false} minDistance={3.5} maxDistance={8} />
    </>
  )
}

export function MiniCube3D({
  state,
  turnMove,
}: {
  state: CubingPatternState | null
  turnMove: string | null
}) {
  const visibleFaces = useMemo(() => visibleFaceStickers(state), [state])

  return (
    <div className="mini-cube-3d-stage" aria-label="2x2 3D cube preview">
      <Canvas
        camera={{ position: [3.7, 3.1, 4.7], fov: 34 }}
        dpr={[1, 2]}
        style={{ width: '100%', height: '100%' }}
      >
        <MiniCubeScene state={state} turnMove={turnMove} />
      </Canvas>
      <div className="mini-cube-3d-a11y">
        {(['front', 'right', 'top'] as const).flatMap((faceName) =>
          visibleFaces[faceName].map((face, index) => (
            <span key={`${faceName}-label-${index}`} aria-label={`2x2 3D sticker ${faceName} ${index + 1} ${face}`} />
          )),
        )}
      </div>
    </div>
  )
}
