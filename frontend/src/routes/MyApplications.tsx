import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { listApplications } from '../api/client'
import { useLoad } from '../api/useLoad'
import { currentStageLabel } from '../pipeline/stages'
import { useSession } from '../session/SessionContext'

// every job you applied to and the stage you are on
export function MyApplications() {
  const { user } = useSession()
  const userId = user!.userId

  const load = useCallback(() => listApplications(userId), [userId])
  const { data: applications, error, loading } = useLoad(load)

  return (
    <section>
      <h2>My applications</h2>

      {error !== null && <p className="error">{error}</p>}
      {loading && applications === null && <p className="notice">Loading your applications...</p>}

      {applications !== null && applications.length === 0 && (
        <p className="notice">
          You have not applied to anything yet. <Link to="/jobs">Browse jobs</Link> to get started.
        </p>
      )}

      {applications?.map(({ job, pipeline }) => (
        <article className="card" key={job.jobId}>
          <h3>
            <Link to={`/jobs/${job.jobId}`}>{job.title}</Link>
          </h3>
          <p className="subtitle">
            {job.company} <code>{job.reqId}</code>
          </p>
          <p className="stage">{currentStageLabel(pipeline)}</p>
        </article>
      ))}
    </section>
  )
}
