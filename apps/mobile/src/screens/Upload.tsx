import { useState } from 'react'
import { Camera, Upload as UploadIcon, X, Check, RotateCcw } from 'lucide-react'

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const MASTER_FOLDER_NAME = 'DIOS Master Inspections Database'
const UPLOADS_FOLDER_NAME = 'Unassigned Uploads'

interface UploadScreenProps {
  accessToken: string
}

type Phase = 'landing' | 'preview' | 'uploading' | 'success' | 'error'

async function findOrCreateFolder(
  name: string,
  accessToken: string,
  parentId?: string,
): Promise<string> {
  const escaped = name.replace(/'/g, "\\'")
  const parentClause = parentId ? `'${parentId}' in parents` : `'root' in parents`
  const q = `mimeType='${FOLDER_MIME}' and name='${escaped}' and ${parentClause} and trashed=false`

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!searchRes.ok) throw new Error(`Drive search failed: ${searchRes.status}`)
  const searchData = await searchRes.json()
  if (searchData.files?.length > 0) return searchData.files[0].id

  const meta: Record<string, unknown> = { name, mimeType: FOLDER_MIME }
  if (parentId) meta.parents = [parentId]

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(meta),
  })
  if (!createRes.ok) throw new Error(`Drive folder creation failed: ${createRes.status}`)
  const createData = await createRes.json()
  return createData.id
}

async function uploadFileToDrive(
  file: File,
  folderId: string,
  accessToken: string,
): Promise<void> {
  const metadata = JSON.stringify({
    name: `${Date.now()}_${file.name}`,
    parents: [folderId],
  })

  const form = new FormData()
  form.append('metadata', new Blob([metadata], { type: 'application/json' }))
  form.append('file', file)

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    },
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Upload failed (${res.status}): ${text}`)
  }
}

export default function UploadScreen({ accessToken }: UploadScreenProps) {
  const [phase, setPhase] = useState<Phase>('landing')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    setFile(selected)
    setPreview(URL.createObjectURL(selected))
    setPhase('preview')
    setError(null)
  }

  const handleUpload = async () => {
    if (!file) return
    setPhase('uploading')
    setError(null)

    try {
      const masterId = await findOrCreateFolder(MASTER_FOLDER_NAME, accessToken)
      const uploadsFolderId = await findOrCreateFolder(UPLOADS_FOLDER_NAME, accessToken, masterId)
      await uploadFileToDrive(file, uploadsFolderId, accessToken)
      setPhase('success')
      setTimeout(reset, 3000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.'
      setError(message)
      setPhase('error')
    }
  }

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
    setError(null)
    setPhase('landing')
  }

  if (phase === 'landing') {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex flex-col items-center justify-center p-6 gap-4">
        <h2 className="text-xl font-bold text-stone-800 mb-4">Upload to DIOS Studio</h2>

        <label className="w-full max-w-sm flex items-center justify-center gap-3 px-6 py-5 bg-[#D49A6A] text-white rounded-2xl font-medium text-lg cursor-pointer hover:bg-[#c28a5c] transition-colors active:scale-[0.98]">
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

        <label className="w-full max-w-sm flex items-center justify-center gap-3 px-6 py-5 bg-stone-200 text-stone-800 rounded-2xl font-medium text-lg cursor-pointer hover:bg-stone-300 transition-colors active:scale-[0.98]">
          <UploadIcon className="w-6 h-6" />
          Choose from Gallery
          <input
            type="file"
            accept="image/*"
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
          <button onClick={reset} className="text-stone-500 p-2">
            <X className="w-6 h-6" />
          </button>
          <span className="text-sm text-stone-500 truncate max-w-[200px]">{file?.name}</span>
          <div className="w-10" />
        </div>

        {preview && (
          <img
            src={preview}
            alt="Preview"
            className="w-full max-h-[60vh] object-contain rounded-xl mb-4"
          />
        )}

        <button
          onClick={handleUpload}
          className="w-full px-6 py-4 bg-[#D49A6A] text-white rounded-2xl font-medium text-lg mt-auto hover:bg-[#c28a5c] transition-colors active:scale-[0.98]"
        >
          Upload to Drive
        </button>
      </div>
    )
  }

  if (phase === 'uploading') {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 border-4 border-stone-300 border-t-[#D49A6A] rounded-full animate-spin mb-4" />
        <p className="text-stone-600 font-medium">Uploading to Google Drive...</p>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <X className="w-10 h-10 text-red-600" />
        </div>
        <p className="text-stone-800 font-bold text-xl mb-2">Upload Failed</p>
        <p className="text-stone-500 text-sm text-center max-w-sm mb-6">{error}</p>
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="px-6 py-3 bg-stone-200 text-stone-700 rounded-xl font-medium"
          >
            Start Over
          </button>
          <button
            onClick={handleUpload}
            className="px-6 py-3 bg-[#D49A6A] text-white rounded-xl font-medium flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  // success phase
  return (
    <div className="min-h-screen bg-[#F9F8F6] flex flex-col items-center justify-center p-6">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
        <Check className="w-10 h-10 text-green-600" />
      </div>
      <p className="text-stone-800 font-bold text-xl">Upload Complete</p>
      <p className="text-stone-500 text-sm mt-1">Saved to Google Drive</p>
    </div>
  )
}
