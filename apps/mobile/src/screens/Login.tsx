import { useState, useEffect } from 'react'
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  User,
} from 'firebase/auth'
import { auth } from '../firebase'

interface LoginProps {
  onLogin: (user: User, accessToken: string) => void
}

function isMobileDevice(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function Login({ onLogin }: LoginProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Handle redirect result on page load (for mobile flow)
  useEffect(() => {
    if (!auth) return
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          const credential = GoogleAuthProvider.credentialFromResult(result)
          const accessToken = credential?.accessToken
          if (accessToken) {
            onLogin(result.user, accessToken)
          }
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Sign-in failed.'
        setError(message)
      })
  }, [onLogin])

  const handleLogin = async () => {
    if (!auth) {
      setError('Firebase not configured')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const provider = new GoogleAuthProvider()
      provider.addScope('https://www.googleapis.com/auth/drive.file')

      if (isMobileDevice()) {
        // Use redirect flow on mobile — popups are blocked on iOS Safari / Android WebView
        await signInWithRedirect(auth, provider)
        return // page will reload after redirect
      }

      const result = await signInWithPopup(auth, provider)
      const credential = GoogleAuthProvider.credentialFromResult(result)
      const accessToken = credential?.accessToken

      if (!accessToken) {
        setError('Could not get Google Drive access. Please try again.')
        return
      }

      onLogin(result.user, accessToken)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F9F8F6] flex flex-col items-center justify-center p-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-stone-800">DIOS Studio</h1>
        <p className="text-stone-500 mt-2">Mobile Upload Companion</p>
      </div>

      <button
        onClick={handleLogin}
        disabled={loading}
        className="w-full max-w-sm px-6 py-4 bg-stone-800 text-white rounded-2xl font-medium text-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
      >
        {loading ? 'Signing in...' : 'Sign in with Google'}
      </button>

      {error && (
        <p className="mt-4 text-red-500 text-sm text-center max-w-sm">{error}</p>
      )}
    </div>
  )
}
