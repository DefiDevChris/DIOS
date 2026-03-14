import { WifiOff } from 'lucide-react'

interface OfflinePlaceholderProps {
  feature: string
  message?: string
}

export default function OfflinePlaceholder({ feature, message }: OfflinePlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center h-64 bg-stone-100 rounded-2xl border-2 border-dashed border-stone-300">
      <WifiOff className="w-12 h-12 text-stone-400 mb-3" />
      <p className="text-stone-600 font-medium">{feature} requires an internet connection</p>
      {message && <p className="text-stone-400 text-sm mt-1">{message}</p>}
    </div>
  )
}
