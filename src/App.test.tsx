import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// jsdom has no WebGL, so swap the 3D component for a stub. The 3D rendering
// itself is exercised via the dev preview, not in unit tests.
vi.mock('./Cube3D', () => ({
  Cube3D: () => null,
}))

import App from './App'

describe('App', () => {
  it('renders the title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /RubikSolver/i })).toBeInTheDocument()
  })
})
