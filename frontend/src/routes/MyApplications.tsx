import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { listApplications } from '../api/client'
import { useLoad } from '../api/useLoad'
import { currentStageLabel } from '../pipeline/stages'
import { isActive, statusLabel } from '../pipeline/status'
import { useSession } from '../session/SessionContext'
import { appliedUrl, roleUrl } from './links'

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
          You have not applied to anything yet. <Link to="/browse">Browse roles</Link> to get
          started, or <Link to="/jobs/new">add the job you applied to</Link>.
        </p>
      )}

      {applications?.map(({ job, pipeline }) => (
        <article className="card" key={job.jobId}>
          <h3>
            <Link to={appliedUrl(job.jobId)}>{job.title}</Link>
          </h3>
          {/* the company and the role are the row's identity now that req ids are gone, and
              together they are also a link to everyone else on the same role */}
          <p className="subtitle">
            <Link to={roleUrl(job.company, job.role)}>
              {job.company} · {job.role}
            </Link>
          </p>
          {/* an ended application still shows the round it ended at, with the outcome beside
              it - otherwise a closed row is indistinguishable from a live one until opened */}
          <p className="stage">
            {currentStageLabel(pipeline)}
            {!isActive(pipeline) && <span className="tag">{statusLabel(pipeline.status)}</span>}
          </p>
        </article>
      ))}
    </section>
  )
}
