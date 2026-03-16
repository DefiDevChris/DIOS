import { Component, ErrorInfo, ReactNode, useEffect } from 'react'
import { logger } from '@dios/shared'
import { RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error('React error boundary caught:', error, errorInfo.componentStack)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center h-64 text-center p-6">
          <p className="text-stone-700 font-medium mb-2">Something went wrong</p>
          <p className="text-stone-400 text-sm mb-4">
            {this.state.error?.message ?? 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-2 px-4 py-2 bg-stone-200 text-stone-700 rounded-xl text-sm hover:bg-stone-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Hook that registers a global unhandledrejection listener so async errors
 * that escape React's render cycle are at least logged.
 */
export function useGlobalErrorHandler() {
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      logger.error('Unhandled promise rejection:', event.reason)
      // Prevent the browser from logging a redundant console error
      event.preventDefault()
    }
    window.addEventListener('unhandledrejection', handler)
    return () => window.removeEventListener('unhandledrejection', handler)
  }, [])
}
