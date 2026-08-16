import { Outlet } from 'react-router-dom'
import { useSession } from '../session/SessionContext'

// the frame every signed-in screen renders inside
export function AppLayout() {
  const { user, signOut } = useSession()

  return (
    <>
      <header className="app-header">
        <h1>whereami</h1>
        <div className="who">
          <span>
            {user?.firstName} {user?.lastName} <code>{user?.userId}</code>
          </span>
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  )
}
