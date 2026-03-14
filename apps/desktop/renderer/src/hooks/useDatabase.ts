import { useCallback } from 'react'
import { collection, doc, setDoc, deleteDoc, getDocs, getDoc } from 'firebase/firestore'
import { db as firestoreDb } from '@dios/shared/firebase'
import { useAuth } from '../contexts/AuthContext'
import { isElectron } from '../utils/isElectron'

interface UseDatabaseOptions {
  table: string
}

export function useDatabase<T extends { id: string }>({ table }: UseDatabaseOptions) {
  const { user } = useAuth()
  const userId = user?.uid

  const findAll = useCallback(async (filters?: Record<string, unknown>): Promise<T[]> => {
    if (isElectron) {
      return window.electronAPI!.db!.findAll(table, filters) as Promise<T[]>
    }
    if (!firestoreDb || !userId) return []
    const colRef = collection(firestoreDb, `users/${userId}/${table}`)
    const snapshot = await getDocs(colRef)
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as T)
  }, [table, userId])

  const findById = useCallback(async (id: string): Promise<T | null> => {
    if (isElectron) {
      const result = await window.electronAPI!.db!.findById(table, id)
      return (result as T) ?? null
    }
    if (!firestoreDb || !userId) return null
    const docRef = doc(firestoreDb, `users/${userId}/${table}`, id)
    const snapshot = await getDoc(docRef)
    return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as T) : null
  }, [table, userId])

  const save = useCallback(async (record: T): Promise<void> => {
    if (isElectron) {
      await window.electronAPI!.db!.upsert(table, record as Record<string, unknown>)
      return
    }
    if (!firestoreDb || !userId) return
    const docRef = doc(firestoreDb, `users/${userId}/${table}`, record.id)
    await setDoc(docRef, record)
  }, [table, userId])

  const remove = useCallback(async (id: string): Promise<void> => {
    if (isElectron) {
      await window.electronAPI!.db!.remove(table, id)
      return
    }
    if (!firestoreDb || !userId) return
    const docRef = doc(firestoreDb, `users/${userId}/${table}`, id)
    await deleteDoc(docRef)
  }, [table, userId])

  return { findAll, findById, save, remove }
}
