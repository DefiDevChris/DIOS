import { vi } from 'vitest'

export const db = {}
export const storage = {}
export const auth = {
  currentUser: { uid: 'test-uid', email: 'test@example.com' },
}
export const isInitialized = true

export const collection = vi.fn()
export const doc = vi.fn(() => ({ id: 'mock-id' }))
export const setDoc = vi.fn()
export const getDoc = vi.fn()
export const getDocs = vi.fn(() => ({ docs: [], forEach: vi.fn() }))
export const onSnapshot = vi.fn(() => vi.fn())
export const updateDoc = vi.fn()
export const deleteDoc = vi.fn()
export const query = vi.fn()
export const where = vi.fn()
export const orderBy = vi.fn()
