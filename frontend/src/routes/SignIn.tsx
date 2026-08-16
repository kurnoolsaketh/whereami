import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useSession } from '../session/SessionContext'

// there are no passwords: a user id is the whole of signing in. the id is whatever the
// applicant typed when they created the account, since UserRegistry keys on it directly
export function SignIn() {
  const { status, signIn, signUp } = useSession()
  const [existingUserId, setExistingUserId] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [newUserId, setNewUserId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (status === 'loading') {
    return <p className="notice">Restoring your session...</p>
  }
  if (status === 'signedIn') {
    return <Navigate to="/" replace />
  }

  async function submit(event: FormEvent, action: () => Promise<void>) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <main className="sign-in">
      <h1>whereami</h1>
      <p className="lede">See where you and everyone else stand on the jobs you applied to.</p>

      {error !== null && <p className="error">{error}</p>}

      <section className="card">
        <h2>Sign in</h2>
        <form onSubmit={(event) => submit(event, () => signIn(existingUserId.trim()))}>
          <label>
            User id
            <input
              value={existingUserId}
              onChange={(event) => setExistingUserId(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <button type="submit" disabled={busy}>
            Sign in
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Create an account</h2>
        <form
          onSubmit={(event) =>
            submit(event, () => signUp(firstName.trim(), lastName.trim(), newUserId.trim()))
          }
        >
          <label>
            First name
            <input value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
          </label>
          <label>
            Last name
            <input value={lastName} onChange={(event) => setLastName(event.target.value)} required />
          </label>
          <label>
            Pick a user id
            <input value={newUserId} onChange={(event) => setNewUserId(event.target.value)} required />
          </label>
          <button type="submit" disabled={busy}>
            Create account
          </button>
        </form>
      </section>
    </main>
  )
}
