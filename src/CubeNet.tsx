import { FACE_COLORS, FACES, GRID_COLS, GRID_ROWS, PLACEMENTS } from './cube'
import type { Face } from './cube'

const STICKER_SIZE = 40
const STICKER_GAP = 2
const RADIUS = 4

export type CubeNetProps = {
  state: string
  editable?: boolean
  onChange?: (index: number, nextFace: Face) => void
  highlightIndices?: readonly number[]
  className?: string
}

export function CubeNet({
  state,
  editable = false,
  onChange,
  highlightIndices,
  className,
}: CubeNetProps) {
  const width = GRID_COLS * STICKER_SIZE
  const height = GRID_ROWS * STICKER_SIZE
  const highlightSet = new Set(highlightIndices ?? [])

  function handleClick(index: number) {
    if (!editable || !onChange) return
    const current = state[index] as Face
    const next = FACES[(FACES.indexOf(current) + 1) % FACES.length]
    onChange(index, next)
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label="Rubik's cube unfolded net"
      className={className}
      style={{ maxWidth: width, display: 'block' }}
    >
      {PLACEMENTS.map((p) => {
        const face = state[p.index] as Face
        const fill = FACE_COLORS[face] ?? '#888'
        const x = p.col * STICKER_SIZE + STICKER_GAP / 2
        const y = p.row * STICKER_SIZE + STICKER_GAP / 2
        const size = STICKER_SIZE - STICKER_GAP
        const isHighlighted = highlightSet.has(p.index)
        return (
          <rect
            key={p.index}
            x={x}
            y={y}
            width={size}
            height={size}
            rx={RADIUS}
            ry={RADIUS}
            fill={fill}
            stroke={isHighlighted ? '#000' : '#222'}
            strokeWidth={isHighlighted ? 3 : 1}
            data-index={p.index}
            data-face={face}
            style={editable ? { cursor: 'pointer' } : undefined}
            onClick={editable ? () => handleClick(p.index) : undefined}
          >
            <title>{`${p.face}${p.facePos + 1}: ${face}`}</title>
          </rect>
        )
      })}
    </svg>
  )
}
