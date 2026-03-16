import { render, screen, fireEvent } from '@testing-library/react'
import { renderHook } from '@testing-library/react'

vi.mock('@dios/shared', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}))

vi.mock('lucide-react', () => ({
  RefreshCw: (props: any) => <svg data-testid="refresh-icon" {...props} />,
}))

import ErrorBoundary, { useGlobalErrorHandler } from './ErrorBoundary'
import { logger } from '@dios/shared'

function ProblemChild({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) throw new Error('Test error')
  return <div>Child rendered</div>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Suppress console.error from React error boundary logging
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Hello World</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  it('renders default fallback when a child throws', () => {
    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('Test error')).toBeInTheDocument()
  })

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ProblemChild />
      </ErrorBoundary>
    )
    expect(screen.getByText('Custom fallback')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })

  it('renders "Try again" button in default fallback', () => {
    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    )
    expect(screen.getByText('Try again')).toBeInTheDocument()
    expect(screen.getByTestId('refresh-icon')).toBeInTheDocument()
  })

  it('logs error via logger.error when an error is caught', () => {
    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    )
    expect(logger.error).toHaveBeenCalledWith(
      'React error boundary caught:',
      expect.any(Error),
      expect.any(String)
    )
  })

  it('resets error state when "Try again" is clicked', () => {
    // Use a controllable component that can stop throwing
    let shouldThrow = true
    function ConditionalChild() {
      if (shouldThrow) throw new Error('Test error')
      return <div>Recovered</div>
    }

    render(
      <ErrorBoundary>
        <ConditionalChild />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    // Stop the child from throwing before clicking retry
    shouldThrow = false
    fireEvent.click(screen.getByText('Try again'))

    expect(screen.getByText('Recovered')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })

  it('shows generic message when error has no message', () => {
    function NullMessageChild() {
      throw { message: undefined }
    }

    render(
      <ErrorBoundary>
        <NullMessageChild />
      </ErrorBoundary>
    )
    expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument()
  })
})

describe('useGlobalErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers and removes unhandledrejection listener', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useGlobalErrorHandler())

    expect(addSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function))

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function))

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('logs unhandled promise rejections and prevents default', () => {
    renderHook(() => useGlobalErrorHandler())

    const event = new Event('unhandledrejection') as any
    event.reason = 'async failure'
    event.preventDefault = vi.fn()

    window.dispatchEvent(event)

    expect(logger.error).toHaveBeenCalledWith('Unhandled promise rejection:', 'async failure')
    expect(event.preventDefault).toHaveBeenCalled()
  })
})
