import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Group } from 'three'
import { FACE_COLORS } from './cube'
import type { Face } from './cube'
import {
  MINI_CUBE_CORNER_POSITIONS,
  miniCubeCornerColorsByPosition,
  miniCubeCubieOnMoveFace,
  miniCubeStateFingerprint,
  miniCubeTurnAngleRad,
  miniCubeTurnAxis,
} from './miniCubeMapping'
import type { MiniVec3 } from './miniCubeMapping'
import { parseMove } from './moves'
import type { CubingPatternState } from './puzzles/cubingPattern'

type VisibleFace = 'top' | 'front' | 'right'

const INTERIOR_COLOR = '#111827'
const CUBIE_SIZE = 0.98

const MATERIAL_FACES: readonly Face[] = ['R', 'L', 'U', 'D', 'F', 'B']

function visibleFaceStickers(state: CubingPatternState | null): Record<VisibleFace, Face[]> {
  const colors = miniCubeCornerColorsByPosition(state)
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
  const colors = miniCubeCornerColorsByPosition(state)
  return MINI_CUBE_CORNER_POSITIONS.map((position, index) => ({
    key: `${position.join(',')}-${index}`,
    position,
    colors: colors[index] ?? {},
  }))
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
    miniCubeCubieOnMoveFace(turn.face, cubie.position),
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
      if (miniCubeStateFingerprint(state) === miniCubeStateFingerprint(renderedState)) return
      if (turn) {
        if (miniCubeStateFingerprint(state) === miniCubeStateFingerprint(turn.endState)) return
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
        axis: miniCubeTurnAxis(parsed.face),
        angle: miniCubeTurnAngleRad(parsed.face, parsed.turns),
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
    ? cubies.filter((cubie) => !miniCubeCubieOnMoveFace(turn.face, cubie.position))
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
          key={`${turn.face}-${miniCubeStateFingerprint(turn.endState)}`}
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
