import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { applyToJob, createJob, listLevels, listRoles } from '../api/client'
import type { Job } from '../api/types'
import { useLoad } from '../api/useLoad'
import { useSession } from '../session/SessionContext'
import { appliedUrl, roleUrl } from './links'

// submitting a job records the posting *and* your application to it, then drops you on the
// role view - which is the thing worth looking at, and the only way a role appears in browse
export function AddJob() {
  const navigate = useNavigate()
  const { user } = useSession()
  const userId = user!.userId
  const [searchParams] = useSearchParams()

  // the roles and levels come from the backend enums, so this form never spells one out
  const load = useCallback(async () => {
    const [roles, levels] = await Promise.all([listRoles(), listLevels()])
    return { roles, levels }
  }, [])
  const { data, error, loading } = useLoad(load)

  // prefilled when arriving from the "role missing?" hint on a company in browse
  const [company, setCompany] = useState(searchParams.get('company') ?? '')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [role, setRole] = useState('')
  const [level, setLevel] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  // the job was recorded but the application was not, so the form has somewhere to point
  const [recorded, setRecorded] = useState<Job | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setFailure(null)
    setRecorded(null)
    setBusy(true)

    let job: Job
    try {
      job = await createJob(company.trim(), { title: title.trim(), url: url.trim(), role })
    } catch (problem) {
      setFailure(problem instanceof Error ? problem.message : 'Could not record that job')
      setBusy(false)
      return
    }

    // the two calls are not one transaction. a job id is derived from its fields, so
    // resubmitting an identical posting succeeds here and then fails on apply with "already
    // applied" - that is a finished application, not a broken form, so say so and link to it
    try {
      await applyToJob(userId, job.jobId, level)
    } catch (problem) {
      setFailure(problem instanceof Error ? problem.message : 'Could not record your application')
      setRecorded(job)
      setBusy(false)
      return
    }

    // the backend normalises a company name to lower case, so navigate with what it returned
    // rather than what was typed, or the role view asks for a company that does not exist
    navigate(roleUrl(job.company, job.role))
  }

  return (
    <section>
      <h2>Submit a job</h2>
      <p className="notice">
        Check <Link to="/browse">the roles already recorded</Link> first - recording your
        application against a posting someone else submitted is what puts you both on the same
        role.
      </p>

      {error !== null && <p className="error">{error}</p>}
      {failure !== null && (
        <p className="error">
          {failure}
          {recorded !== null && (
            <>
              {' '}
              <Link to={appliedUrl(recorded.jobId)}>Open your application</Link> or{' '}
              <Link to={roleUrl(recorded.company, recorded.role)}>see everyone on this role</Link>.
            </>
          )}
        </p>
      )}
      {loading && data === null && <p className="notice">Loading roles and levels...</p>}

      {data !== null && (
        <div className="card">
          <form onSubmit={submit}>
            <label>
              Company
              <input value={company} onChange={(event) => setCompany(event.target.value)} required />
            </label>
            <label>
              Title
              <input value={title} onChange={(event) => setTitle(event.target.value)} required />
            </label>
            <label>
              Job posting URL
              {/* type=url so the browser insists on a scheme before the request is sent. the
                  backend rejects a bad one too - this only saves the round trip */}
              <input
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://..."
                required
              />
            </label>
            <label>
              Role
              <select value={role} onChange={(event) => setRole(event.target.value)} required>
                <option value="">Pick a role</option>
                {data.roles.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Your level
              <select value={level} onChange={(event) => setLevel(event.target.value)} required>
                <option value="">Pick a level</option>
                {data.levels.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={busy}>
              {busy ? 'Submitting...' : 'Submit and record my application'}
            </button>
          </form>
        </div>
      )}
    </section>
  )
}
