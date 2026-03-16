import { render, screen } from '@testing-library/react'

import LeafLogo from './LeafLogo'

describe('LeafLogo', () => {
  it('renders an SVG element', () => {
    const { container } = render(<LeafLogo />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('applies default size of 32', () => {
    const { container } = render(<LeafLogo />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '32')
    expect(svg).toHaveAttribute('height', '32')
  })

  it('applies custom size', () => {
    const { container } = render(<LeafLogo size={64} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '64')
    expect(svg).toHaveAttribute('height', '64')
  })

  it('applies default fill color', () => {
    const { container } = render(<LeafLogo />)
    const path = container.querySelector('path')
    expect(path).toHaveAttribute('fill', '#1f9c46')
  })

  it('applies custom fill color', () => {
    const { container } = render(<LeafLogo fill="#d4a574" />)
    const path = container.querySelector('path')
    expect(path).toHaveAttribute('fill', '#d4a574')
  })

  it('applies custom className', () => {
    const { container } = render(<LeafLogo className="my-custom-class" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveClass('my-custom-class')
  })

  it('has correct viewBox', () => {
    const { container } = render(<LeafLogo />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('viewBox', '0 0 364 390')
  })

  it('renders with empty className by default', () => {
    const { container } = render(<LeafLogo />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('class', '')
  })
})
