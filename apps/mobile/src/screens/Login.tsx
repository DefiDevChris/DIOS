import { useState } from 'react'
import { GoogleAuthProvider, signInWithPopup, User } from 'firebase/auth'
import { auth } from '../firebase'

interface LoginProps {
  onLogin: (user: User) => void
}

export default function Login({ onLogin }: LoginProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      const result = await signInWithPopup(auth, provider)
      onLogin(result.user)
    } catch (err) {
      setError('Sign-in failed. Please try again.')
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
        <p className="mt-4 text-red-500 text-sm">{error}</p>
      )}
    </div>
  )
}
