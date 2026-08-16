import { createContext, useContext } from 'react'
import type { User } from '../api/types'

// 'loading' is the moment before the stored user id has been checked against the backend.
// routes wait it out rather than bouncing a signed-in user to the sign-in screen on reload
export type SessionStatus = 'loading' | 'signedIn' | 'signedOut'

export interface Session {
  status: SessionStatus
  user: User | null
  signIn: (userId: string) => Promise<void>
  signUp: (firstName: string, lastName: string, userId: string) => Promise<void>
  signOut: () => void
}

export const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (session === null) {
    throw new Error('useSession must be called inside a SessionProvider')
  }
  return session
}
