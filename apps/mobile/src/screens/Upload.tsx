import { useState, useEffect } from 'react'
import { Camera, Upload as UploadIcon, X, Check } from 'lucide-react'
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../firebase'
import type { User } from 'firebase/auth'

interface Operation {
  id: string
  name: string
  address: string
  status: string
}

interface UploadScreenProps {
  user: User
  onSuccess: () => void
}

type Phase = 'landing' | 'preview' | 'select-operation' | 'uploading' | 'success'

export default function UploadScreen({ user }: UploadScreenProps) {
  const [phase, setPhase] = useState<Phase>('landing')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [operations, setOperations] = useState<Operation[]>([])
  const [selectedOp, setSelectedOp] = useState<Operation | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!db || !user) return
    getDocs(collection(db, `users/${user.uid}/operations`)).then((snap) => {
      const ops = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Operation)
      setOperations(ops.filter((o) => o.status === 'active'))
    })
  }, [user])

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    setFile(selected)
    setPreview(URL.createObjectURL(selected))
    setPhase('preview')
  }

  const handleUpload = async () => {
    if (!file || !db || !storage || !user) return
    setPhase('uploading')
    setError(null)

    try {
      const fileName = `${Date.now()}_${file.name}`
      const storagePath = `users/${user.uid}/uploads/${fileName}`
      const storageRef = ref(storage, storagePath)
      await uploadBytes(storageRef, file)
      const downloadUrl = await getDownloadURL(storageRef)

      await addDoc(collection(db, `users/${user.uid}/unassigned_uploads`), {
        fileName: file.name,
        fileType: file.type,
        fileUrl: downloadUrl,
        uploadedAt: serverTimestamp(),
        source: 'mobile',
        operationId: selectedOp?.id ?? null,
      })

      setPhase('success')

      setTimeout(() => {
        setFile(null)
        setPreview(null)
        setSelectedOp(null)
        setPhase('landing')
      }, 3000)
    } catch (err) {
      setError('Upload failed. Please try again.')
      setPhase('preview')
    }
  }

  const reset = () => {
    setFile(null)
    setPreview(null)
    setSelectedOp(null)
    setError(null)
    setPhase('landing')
  }

  if (phase === 'landing') {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex flex-col items-center justify-center p-6 gap-4">
        <h2 className="text-xl font-bold text-stone-800 mb-4">Upload to DIOS Studio</h2>

        <label className="w-full max-w-sm flex items-center justify-center gap-3 px-6 py-5 bg-[#D49A6A] text-white rounded-2xl font-medium text-lg cursor-pointer hover:bg-[#c28a5c] transition-colors">
          <Camera className="w-6 h-6" />
          Take Photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCapture}
            className="hidden"
          />
        </label>

        <label className="w-full max-w-sm flex items-center justify-center gap-3 px-6 py-5 bg-stone-200 text-stone-800 rounded-2xl font-medium text-lg cursor-pointer hover:bg-stone-300 transition-colors">
          <UploadIcon className="w-6 h-6" />
          Upload File
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={handleCapture}
            className="hidden"
          />
        </label>
      </div>
    )
  }

  if (phase === 'preview') {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex flex-col p-4">
        <div className="flex justify-between items-center mb-4">
          <button onClick={reset} className="text-stone-500">
            <X className="w-6 h-6" />
          </button>
          <span className="text-sm text-stone-500">{file?.name}</span>
        </div>

        {preview && (
          <img
            src={preview}
            alt="Preview"
            className="w-full max-h-[50vh] object-contain rounded-xl mb-4"
          />
        )}

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <button
          onClick={() => setPhase('select-operation')}
          className="w-full px-6 py-4 bg-stone-800 text-white rounded-2xl font-medium text-lg mt-auto"
        >
          Select Operation
        </button>
      </div>
    )
  }

  if (phase === 'select-operation') {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex flex-col p-4">
        <div className="flex justify-between items-center mb-4">
          <button onClick={() => setPhase('preview')} className="text-stone-500">
            <X className="w-6 h-6" />
          </button>
          <span className="text-sm font-medium text-stone-700">Select Operation</span>
          <div className="w-6" />
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto flex-1 mb-4">
          <button
            onClick={() => {
              setSelectedOp(null)
              handleUpload()
            }}
            className="w-full text-left px-4 py-3 bg-stone-100 rounded-xl text-stone-600 text-sm"
          >
            No operation (unassigned)
          </button>
          {operations.map((op) => (
            <button
              key={op.id}
              onClick={() => {
                setSelectedOp(op)
                handleUpload()
              }}
              className="w-full text-left px-4 py-3 bg-white rounded-xl border border-stone-200 hover:border-[#D49A6A] transition-colors"
            >
              <span className="font-medium text-stone-800">{op.name}</span>
              <span className="text-xs text-stone-500 block mt-0.5">{op.address}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (phase === 'uploading') {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 border-4 border-stone-300 border-t-[#D49A6A] rounded-full animate-spin mb-4" />
        <p className="text-stone-600 font-medium">Uploading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F9F8F6] flex flex-col items-center justify-center p-6">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
        <Check className="w-10 h-10 text-green-600" />
      </div>
      <p className="text-stone-800 font-bold text-xl">Upload Complete</p>
      <p className="text-stone-500 text-sm mt-1">
        {selectedOp ? `Linked to ${selectedOp.name}` : 'Saved as unassigned'}
      </p>
    </div>
  )
}
