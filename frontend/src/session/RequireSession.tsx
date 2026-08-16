import { Navigate, Outlet } from 'react-router-dom'
import { useSession } from './SessionContext'

// every route but the sign-in screen sits behind this
export function RequireSession() {
  const { status } = useSession()

  if (status === 'loading') {
    return <p className="notice">Restoring your session...</p>
  }
  if (status === 'signedOut') {
    return <Navigate to="/sign-in" replace />
  }
  return <Outlet />
}
