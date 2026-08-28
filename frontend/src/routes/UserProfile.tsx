import { Link, useParams } from 'react-router-dom'

// a stub. the roster on the role view links every applicant's name here, so the route has to
// resolve to something - without it those links fall through App's catch-all and bounce the
// user home, which reads as a bug rather than as unfinished work
export function UserProfile() {
  const { userId = '' } = useParams<{ userId: string }>()

  return (
    <section>
      <h2>{userId}</h2>
      <p className="notice">
        Profiles are not built yet. For now this page only confirms which applicant a name on a
        role belongs to.
      </p>
      <p>
        <Link to="/browse">Browse roles</Link>
      </p>
    </section>
  )
}
