import { useState, useEffect } from 'react'
import { onAuthStateChanged, User } from 'firebase/auth'
import { auth, hasConfig } from './firebase'
import Login from './screens/Login'
import UploadScreen from './screens/Upload'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  if (!hasConfig) {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex flex-col items-center justify-center p-6">
        <p className="text-stone-600 text-center">
          Firebase not configured. Set VITE_FIREBASE_* environment variables and rebuild.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center">
        <p className="text-stone-400">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return <Login onLogin={setUser} />
  }

  return <UploadScreen user={user} onSuccess={() => {}} />
}
