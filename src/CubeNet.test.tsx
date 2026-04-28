import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CubeNet } from './CubeNet'
import { FACE_COLORS, SOLVED_STATE, setSticker } from './cube'

describe('<CubeNet />', () => {
  it('renders 54 stickers for a valid state', () => {
    const { container } = render(<CubeNet state={SOLVED_STATE} />)
    expect(container.querySelectorAll('rect')).toHaveLength(54)
  })

  it('uses the correct fill colors per face', () => {
    const { container } = render(<CubeNet state={SOLVED_STATE} />)
    const rects = container.querySelectorAll('rect')
    rects.forEach((rect) => {
      const face = rect.getAttribute('data-face') as keyof typeof FACE_COLORS
      expect(rect.getAttribute('fill')).toBe(FACE_COLORS[face])
    })
  })

  it('reflects sticker overrides', () => {
    const modified = setSticker(SOLVED_STATE, 0, 'R')
    const { container } = render(<CubeNet state={modified} />)
    const sticker0 = container.querySelector('rect[data-index="0"]')!
    expect(sticker0.getAttribute('fill')).toBe(FACE_COLORS.R)
  })

  it('does not call onChange when not editable', () => {
    const onChange = vi.fn()
    const { container } = render(<CubeNet state={SOLVED_STATE} onChange={onChange} />)
    fireEvent.click(container.querySelector('rect[data-index="0"]')!)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('cycles to the next face when clicked in editable mode', () => {
    const onChange = vi.fn()
    const { container } = render(<CubeNet state={SOLVED_STATE} editable onChange={onChange} />)
    fireEvent.click(container.querySelector('rect[data-index="0"]')!)
    expect(onChange).toHaveBeenCalledWith(0, 'R') // U → R is the next in FACES order
  })

  it('lets keyboard users change editable stickers', () => {
    const onChange = vi.fn()
    render(<CubeNet state={SOLVED_STATE} editable onChange={onChange} />)
    const firstSticker = screen.getByRole('button', { name: 'U1: U' })
    firstSticker.focus()
    fireEvent.keyDown(firstSticker, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(0, 'R')
  })
})
