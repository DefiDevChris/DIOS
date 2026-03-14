import { useCallback } from 'react'
import { isElectron } from '../utils/isElectron'

export function useFileStorage() {
  const saveFile = useCallback(async (
    pathSegments: string[],
    fileName: string,
    data: ArrayBuffer,
  ): Promise<string | null> => {
    if (!isElectron) return null
    return window.electronAPI!.fs!.saveFile(pathSegments, fileName, data)
  }, [])

  const readFile = useCallback(async (filePath: string): Promise<ArrayBuffer | null> => {
    if (!isElectron) return null
    return window.electronAPI!.fs!.readFile(filePath)
  }, [])

  const deleteFile = useCallback(async (filePath: string): Promise<boolean> => {
    if (!isElectron) return false
    return window.electronAPI!.fs!.deleteFile(filePath)
  }, [])

  const listFiles = useCallback(async (
    pathSegments: string[],
  ): Promise<string[]> => {
    if (!isElectron) return []
    return window.electronAPI!.fs!.listFiles(pathSegments)
  }, [])

  return { saveFile, readFile, deleteFile, listFiles, isAvailable: isElectron }
}
