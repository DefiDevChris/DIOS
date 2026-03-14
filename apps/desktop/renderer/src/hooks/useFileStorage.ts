import { useCallback } from 'react'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.fs

export function useFileStorage() {
  const saveFile = useCallback(async (
    operationName: string,
    year: string,
    fileName: string,
    data: ArrayBuffer,
  ): Promise<string | null> => {
    if (!isElectron) return null
    return window.electronAPI!.fs!.saveFile(operationName, year, fileName, data)
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
    operationName: string,
    year?: string,
  ): Promise<string[]> => {
    if (!isElectron) return []
    return window.electronAPI!.fs!.listFiles(operationName, year)
  }, [])

  return { saveFile, readFile, deleteFile, listFiles, isAvailable: isElectron }
}
