import { useCallback } from 'react'
import { collection, doc, setDoc, deleteDoc, getDocs, getDoc } from 'firebase/firestore'
import { db as firestoreDb } from '@dios/shared/firebase'
import { logger } from '@dios/shared'
import { useAuth } from '../contexts/AuthContext'
import { isElectron } from '../utils/isElectron'

const BOOLEAN_FIELDS = new Set([
  'isBundled', 'reportCompleted',
  'isFlatRate', 'mileageReimbursed', 'perTypeRatesEnabled',
  'prepChecklistEnabled', 'reportChecklistEnabled',
])

function convertBooleans<T>(record: Record<string, unknown>): T {
  const converted = { ...record } as Record<string, unknown>
  for (const key of Object.keys(converted)) {
    if (BOOLEAN_FIELDS.has(key) && typeof converted[key] === 'number') {
      converted[key] = !!converted[key]
    }
  }
  return converted as T
}

interface UseDatabaseOptions {
  table: string
  parentPath?: string
}

export function useDatabase<T extends { id: string }>({ table, parentPath }: UseDatabaseOptions) {
  const { user } = useAuth()
  const userId = user?.uid

  const findAll = useCallback(async (filters?: Record<string, unknown>): Promise<T[]> => {
    if (isElectron()) {
      try {
        if (!window.electronAPI?.db?.findAll) {
          logger.error('IPC database API not available for findAll')
          return []
        }
        const results = await window.electronAPI.db.findAll(table, filters) as Record<string, unknown>[]
        return results.map(convertBooleans<T>)
      } catch (error) {
        logger.error(`IPC findAll failed for table "${table}":`, error)
        return []
      }
    }
    if (!firestoreDb || !userId) return []
    const colRef = parentPath
      ? collection(firestoreDb, `users/${userId}/${parentPath}/${table}`)
      : collection(firestoreDb, `users/${userId}/${table}`)
    const snapshot = await getDocs(colRef)
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as T)
  }, [table, userId])

  const findById = useCallback(async (id: string): Promise<T | null> => {
    if (isElectron()) {
      try {
        if (!window.electronAPI?.db?.findById) {
          logger.error('IPC database API not available for findById')
          return null
        }
        const result = await window.electronAPI.db.findById(table, id) as Record<string, unknown> | undefined
        return result ? convertBooleans<T>(result) : null
      } catch (error) {
        logger.error(`IPC findById failed for table "${table}", id "${id}":`, error)
        return null
      }
    }
    if (!firestoreDb || !userId) return null
    const docRef = parentPath
      ? doc(firestoreDb, `users/${userId}/${parentPath}/${table}`, id)
      : doc(firestoreDb, `users/${userId}/${table}`, id)
    const snapshot = await getDoc(docRef)
    return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as T) : null
  }, [table, userId])

  const save = useCallback(async (record: T): Promise<void> => {
    if (isElectron()) {
      try {
        if (!window.electronAPI?.db?.upsert) {
          logger.error('IPC database API not available for upsert')
          throw new Error('IPC database API not available')
        }
        await window.electronAPI.db.upsert(table, record as Record<string, unknown>)
        return
      } catch (error) {
        logger.error(`IPC upsert failed for table "${table}":`, error)
        throw error
      }
    }
    if (!firestoreDb || !userId) return
    const docRef = doc(firestoreDb, `users/${userId}/${table}`, record.id)
    await setDoc(docRef, record)
  }, [table, userId])

  const remove = useCallback(async (id: string): Promise<void> => {
    if (isElectron()) {
      try {
        if (!window.electronAPI?.db?.remove) {
          logger.error('IPC database API not available for remove')
          throw new Error('IPC database API not available')
        }
        await window.electronAPI.db.remove(table, id)
        return
      } catch (error) {
        logger.error(`IPC remove failed for table "${table}", id "${id}":`, error)
        throw error
      }
    }
    if (!firestoreDb || !userId) return
    const docRef = parentPath
      ? doc(firestoreDb, `users/${userId}/${parentPath}/${table}`, id)
      : doc(firestoreDb, `users/${userId}/${table}`, id)
    await deleteDoc(docRef)
  }, [table, userId])

  return { findAll, findById, save, remove }
}
