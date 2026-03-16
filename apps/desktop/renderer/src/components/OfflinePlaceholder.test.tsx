import { render, screen } from '@testing-library/react'

vi.mock('lucide-react', () => ({
  WifiOff: (props: any) => <svg data-testid="wifi-off-icon" {...props} />,
}))

import OfflinePlaceholder from './OfflinePlaceholder'

describe('OfflinePlaceholder', () => {
  it('renders the feature name with connectivity message', () => {
    render(<OfflinePlaceholder feature="Sync" />)
    expect(screen.getByText('Sync requires an internet connection')).toBeInTheDocument()
  })

  it('renders the WifiOff icon', () => {
    render(<OfflinePlaceholder feature="Dashboard" />)
    expect(screen.getByTestId('wifi-off-icon')).toBeInTheDocument()
  })

  it('does not render optional message when not provided', () => {
    render(<OfflinePlaceholder feature="Reports" />)
    // Only the feature message should exist, no additional paragraph
    const paragraphs = screen.getAllByText(/Reports/)
    expect(paragraphs).toHaveLength(1)
  })

  it('renders optional message when provided', () => {
    render(<OfflinePlaceholder feature="Email" message="Check your connection" />)
    expect(screen.getByText('Email requires an internet connection')).toBeInTheDocument()
    expect(screen.getByText('Check your connection')).toBeInTheDocument()
  })

  it('renders different feature names correctly', () => {
    const { rerender } = render(<OfflinePlaceholder feature="Invoices" />)
    expect(screen.getByText('Invoices requires an internet connection')).toBeInTheDocument()

    rerender(<OfflinePlaceholder feature="Maps" />)
    expect(screen.getByText('Maps requires an internet connection')).toBeInTheDocument()
  })
})
