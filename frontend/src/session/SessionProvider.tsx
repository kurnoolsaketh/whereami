import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { createUser, getUser } from '../api/client'
import type { User } from '../api/types'
import { SessionContext } from './SessionContext'
import type { Session, SessionStatus } from './SessionContext'
import { clearUserId, readUserId, writeUserId } from './storage'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<SessionStatus>('loading')

  // the registries hold everything in memory, so a stored id outlives the user it names every
  // time the backend restarts. restore by asking for the user instead of trusting the store
  useEffect(() => {
    const storedUserId = readUserId()
    if (storedUserId === null) {
      setStatus('signedOut')
      return
    }

    let cancelled = false
    getUser(storedUserId)
      .then((restored) => {
        if (cancelled) return
        setUser(restored)
        setStatus('signedIn')
      })
      .catch(() => {
        if (cancelled) return
        clearUserId()
        setUser(null)
        setStatus('signedOut')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const start = useCallback((signedIn: User) => {
    writeUserId(signedIn.userId)
    setUser(signedIn)
    setStatus('signedIn')
  }, [])

  const signIn = useCallback(
    async (userId: string) => {
      start(await getUser(userId))
    },
    [start],
  )

  const signUp = useCallback(
    async (firstName: string, lastName: string, userId: string) => {
      start(await createUser(firstName, lastName, userId))
    },
    [start],
  )

  const signOut = useCallback(() => {
    clearUserId()
    setUser(null)
    setStatus('signedOut')
  }, [])

  const session = useMemo<Session>(
    () => ({ status, user, signIn, signUp, signOut }),
    [status, user, signIn, signUp, signOut],
  )

  return <SessionContext value={session}>{children}</SessionContext>
}
