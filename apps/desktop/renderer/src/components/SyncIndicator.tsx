import { useState, useEffect } from 'react'
import { Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { isElectron } from '../utils/isElectron'

type SyncVisualState = 'synced' | 'pending' | 'error' | 'offline'

export default function SyncIndicator() {
  const [state, setState] = useState<SyncVisualState>('synced')
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!isElectron()) return

    const check = async () => {
      const online = await window.electronAPI!.isOnline()
      if (!online) {
        setState('offline')
        return
      }

      const syncState = await window.electronAPI!.sync!.getState()
      const pending = await window.electronAPI!.sync!.getPendingCount()
      setPendingCount(pending)

      if (syncState === 'error') setState('error')
      else if (pending > 0) setState('pending')
      else setState('synced')
    }

    check()
    const interval = setInterval(check, 5000)
    return () => clearInterval(interval)
  }, [])

  if (!isElectron()) return null

  const config: Record<SyncVisualState, { color: string; icon: React.ReactNode; label: string }> = {
    synced: { color: 'text-green-500', icon: <Cloud className="w-4 h-4" />, label: 'Synced' },
    pending: { color: 'text-yellow-500', icon: <RefreshCw className="w-4 h-4 animate-spin" />, label: `${pendingCount} pending` },
    error: { color: 'text-red-500', icon: <CloudOff className="w-4 h-4" />, label: 'Sync error' },
    offline: { color: 'text-stone-400', icon: <CloudOff className="w-4 h-4" />, label: 'Offline' },
  }

  const { color, icon, label } = config[state]

  return (
    <div className={`flex items-center gap-1.5 text-xs ${color}`}>
      {icon}
      <span>{label}</span>
    </div>
  )
}
