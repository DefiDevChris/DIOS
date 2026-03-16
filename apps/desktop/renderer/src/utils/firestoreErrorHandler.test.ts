vi.mock('@dios/shared', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@dios/shared/firebase', () => ({
  auth: {
    currentUser: {
      uid: 'test-uid',
      email: 'test@example.com',
      emailVerified: true,
      isAnonymous: false,
      tenantId: null,
      providerData: [
        {
          providerId: 'password',
          displayName: 'Test User',
          email: 'test@example.com',
          photoURL: null,
        },
      ],
    },
  },
}))

import { auth } from '@dios/shared/firebase'
import { logger } from '@dios/shared'
import { handleFirestoreError, OperationType } from './firestoreErrorHandler'
import type { FirestoreErrorInfo } from './firestoreErrorHandler'

describe('handleFirestoreError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws an error with serialized FirestoreErrorInfo', () => {
    const error = new Error('permission-denied')

    expect(() =>
      handleFirestoreError(error, OperationType.GET, 'users/abc/operations')
    ).toThrow()
  })

  it('logs the error via logger.error', () => {
    const error = new Error('not-found')

    try {
      handleFirestoreError(error, OperationType.GET, 'users/abc')
    } catch {
      // expected
    }

    expect(logger.error).toHaveBeenCalledWith(
      'Firestore Error: ',
      expect.any(String)
    )
  })

  it('includes operation type and path in the thrown error', () => {
    const error = new Error('unavailable')

    try {
      handleFirestoreError(error, OperationType.CREATE, 'users/abc/inspections')
      expect.unreachable('should have thrown')
    } catch (thrown: any) {
      const info: FirestoreErrorInfo = JSON.parse(thrown.message)
      expect(info.operationType).toBe('create')
      expect(info.path).toBe('users/abc/inspections')
      expect(info.error).toBe('unavailable')
    }
  })

  it('extracts auth info from auth.currentUser', () => {
    const error = new Error('permission-denied')

    try {
      handleFirestoreError(error, OperationType.UPDATE, 'users/abc')
      expect.unreachable('should have thrown')
    } catch (thrown: any) {
      const info: FirestoreErrorInfo = JSON.parse(thrown.message)
      expect(info.authInfo.userId).toBe('test-uid')
      expect(info.authInfo.email).toBe('test@example.com')
      expect(info.authInfo.emailVerified).toBe(true)
      expect(info.authInfo.isAnonymous).toBe(false)
    }
  })

  it('includes provider data in auth info', () => {
    try {
      handleFirestoreError(new Error('test'), OperationType.GET, 'path')
      expect.unreachable('should have thrown')
    } catch (thrown: any) {
      const info: FirestoreErrorInfo = JSON.parse(thrown.message)
      expect(info.authInfo.providerInfo).toEqual([
        {
          providerId: 'password',
          displayName: 'Test User',
          email: 'test@example.com',
          photoUrl: null,
        },
      ])
    }
  })

  it('handles non-Error objects by converting to string', () => {
    try {
      handleFirestoreError('raw string error', OperationType.DELETE, null)
      expect.unreachable('should have thrown')
    } catch (thrown: any) {
      const info: FirestoreErrorInfo = JSON.parse(thrown.message)
      expect(info.error).toBe('raw string error')
    }
  })

  it('handles null path', () => {
    try {
      handleFirestoreError(new Error('test'), OperationType.LIST, null)
      expect.unreachable('should have thrown')
    } catch (thrown: any) {
      const info: FirestoreErrorInfo = JSON.parse(thrown.message)
      expect(info.path).toBeNull()
    }
  })

  it('handles numeric error values', () => {
    try {
      handleFirestoreError(42, OperationType.WRITE, 'some/path')
      expect.unreachable('should have thrown')
    } catch (thrown: any) {
      const info: FirestoreErrorInfo = JSON.parse(thrown.message)
      expect(info.error).toBe('42')
    }
  })

  it('covers all OperationType values', () => {
    const types = [
      OperationType.CREATE,
      OperationType.UPDATE,
      OperationType.DELETE,
      OperationType.LIST,
      OperationType.GET,
      OperationType.WRITE,
    ]

    for (const opType of types) {
      try {
        handleFirestoreError(new Error('test'), opType, 'path')
      } catch (thrown: any) {
        const info: FirestoreErrorInfo = JSON.parse(thrown.message)
        expect(info.operationType).toBe(opType)
      }
    }
  })

  it('handles when currentUser is null', () => {
    const originalCurrentUser = auth.currentUser
    ;(auth as any).currentUser = null

    try {
      handleFirestoreError(new Error('no auth'), OperationType.GET, 'path')
      expect.unreachable('should have thrown')
    } catch (thrown: any) {
      const info: FirestoreErrorInfo = JSON.parse(thrown.message)
      expect(info.authInfo.userId).toBeUndefined()
      expect(info.authInfo.email).toBeUndefined()
    } finally {
      ;(auth as any).currentUser = originalCurrentUser
    }
  })
})
