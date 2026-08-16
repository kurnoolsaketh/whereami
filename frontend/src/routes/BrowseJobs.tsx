import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { applyToJob, listApplications, listJobs } from '../api/client'
import { useLoad } from '../api/useLoad'
import { useSession } from '../session/SessionContext'

// the whole job list, with the ones you already applied to marked. applicants find their job
// here and only add a new one when theirs is missing - that is what lands two applicants on
// the same Job
export function BrowseJobs() {
  const { user } = useSession()
  const userId = user!.userId

  const load = useCallback(
    async () => {
      const [jobs, applications] = await Promise.all([listJobs(), listApplications(userId)])
      return { jobs, appliedJobIds: new Set(applications.map(({ job }) => job.jobId)) }
    },
    [userId],
  )
  const { data, error, loading, reload } = useLoad(load)

  // the id of the job whose apply request is in flight, so only its own button goes busy
  const [applying, setApplying] = useState<string | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)

  async function apply(jobId: string) {
    setApplyError(null)
    setApplying(jobId)
    try {
      await applyToJob(userId, jobId)
      reload()
    } catch (failure) {
      setApplyError(failure instanceof Error ? failure.message : 'Could not apply to that job')
    } finally {
      setApplying(null)
    }
  }

  return (
    <section>
      <div className="section-header">
        <h2>Browse jobs</h2>
        <Link className="button-link" to="/jobs/new">
          Add a job
        </Link>
      </div>

      {error !== null && <p className="error">{error}</p>}
      {applyError !== null && <p className="error">{applyError}</p>}
      {loading && data === null && <p className="notice">Loading jobs...</p>}

      {data !== null && data.jobs.length === 0 && (
        <p className="notice">
          No one has recorded a job yet. <Link to="/jobs/new">Add the one you applied to.</Link>
        </p>
      )}

      {data?.jobs.map((job) => {
        const applied = data.appliedJobIds.has(job.jobId)
        return (
          <article className="card" key={job.jobId}>
            <h3>
              <Link to={`/jobs/${job.jobId}`}>{job.title}</Link>
            </h3>
            <p className="subtitle">
              {job.company} <code>{job.reqId}</code>
            </p>
            {/* a plain anchor, not a react-router Link - the posting is on someone else's site */}
            <p className="subtitle">
              <a href={job.url} target="_blank" rel="noreferrer">
                View the posting
              </a>
            </p>
            {job.description !== '' && <p>{job.description}</p>}
            {applied ? (
              <p className="applied">Applied</p>
            ) : (
              <button type="button" onClick={() => apply(job.jobId)} disabled={applying !== null}>
                {applying === job.jobId ? 'Applying...' : 'Apply'}
              </button>
            )}
          </article>
        )
      })}
    </section>
  )
}
