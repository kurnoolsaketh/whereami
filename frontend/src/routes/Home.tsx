import { useSession } from '../session/SessionContext'

export function Home() {
  const { user } = useSession()

  return (
    <section className="card">
      <h2>Signed in as {user?.firstName}</h2>
      <p>
        Your applications, the job list and everyone else's pipelines land here in the stages
        that follow.
      </p>
    </section>
  )
}
