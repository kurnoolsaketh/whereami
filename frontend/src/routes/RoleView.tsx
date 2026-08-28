import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  applyToJob,
  listApplicantsForCompanyAndRole,
  listApplications,
  listJobsForCompanyAndRole,
  listLevels,
  listStages,
} from '../api/client'
import type { Applicant, Job, Level, Stage } from '../api/types'
import { useLoad } from '../api/useLoad'
import { currentStageLabel, stageKey, tallyStages } from '../pipeline/stages'
import { isActive, statusLabel } from '../pipeline/status'
import { useSession } from '../session/SessionContext'
import { appliedUrl, profileUrl } from './links'

// everyone on one role at one company. this is the thing the app exists for: the postings
// recorded for the role, and where every applicant on them stands
export function RoleView() {
  // react-router decodes path params, so these are the names the backend uses
  const { company = '', role = '' } = useParams<{ company: string; role: string }>()
  const { user } = useSession()
  const userId = user!.userId

  const load = useCallback(async () => {
    const [applicants, jobs, allStages, allLevels, applications] = await Promise.all([
      listApplicantsForCompanyAndRole(company, role),
      listJobsForCompanyAndRole(company, role),
      listStages(),
      listLevels(),
      listApplications(userId),
    ])
    return {
      applicants,
      jobs,
      allStages,
      allLevels,
      mine: new Set(applications.map((application) => application.job.jobId)),
    }
  }, [company, role, userId])

  const { data, error, loading, reload } = useLoad(load)

  const [applying, setApplying] = useState<string | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)

  async function apply(jobId: string, level: Level) {
    setApplyError(null)
    setApplying(jobId)
    try {
      await applyToJob(userId, jobId, level)
      reload()
    } catch (failure) {
      setApplyError(failure instanceof Error ? failure.message : 'Could not record that')
    } finally {
      setApplying(null)
    }
  }

  return (
    <section>
      <div className="section-header">
        <div>
          <h2>{role}</h2>
          <p className="subtitle">{company}</p>
        </div>
        {/* nothing pushes another tab's move to this one, so the way to see it is to ask */}
        <button type="button" className="secondary" disabled={loading} onClick={reload}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error !== null && <p className="error">{error}</p>}
      {applyError !== null && <p className="error">{applyError}</p>}
      {loading && data === null && <p className="notice">Loading this role...</p>}

      {data !== null && (
        <>
          <div className="card">
            <h3>Postings</h3>
            {data.jobs.length === 0 ? (
              <p>No one has recorded a posting for this role yet.</p>
            ) : (
              <ul className="postings">
                {data.jobs.map((job) => (
                  <Posting
                    key={job.jobId}
                    job={job}
                    applied={data.mine.has(job.jobId)}
                    levels={data.allLevels}
                    busy={applying !== null}
                    saving={applying === job.jobId}
                    onApply={(level) => void apply(job.jobId, level)}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3>Where everyone is</h3>
            <Roster
              applicants={data.applicants}
              jobsById={new Map(data.jobs.map((job) => [job.jobId, job]))}
              allStages={data.allStages}
              youId={userId}
            />
          </div>
        </>
      )}
    </section>
  )
}

interface PostingProps {
  job: Job
  applied: boolean
  levels: Level[]
  busy: boolean
  saving: boolean
  onApply: (level: Level) => void
}

// one posting for this role. recording an application against a posting someone else submitted
// is what puts two applicants on the same role, so the control is the point of the row
function Posting({ job, applied, levels, busy, saving, onApply }: PostingProps) {
  const [open, setOpen] = useState(false)
  const [level, setLevel] = useState('')

  return (
    <li>
      <div className="posting">
        <span className="posting-title">{job.title}</span>
        {/* a plain anchor, not a react-router Link - the posting is on someone else's site */}
        <a href={job.url} target="_blank" rel="noreferrer">
          View the posting
        </a>
      </div>

      {applied ? (
        <p className="applied">
          You applied — <Link to={appliedUrl(job.jobId)}>open your pipeline</Link>
        </p>
      ) : open ? (
        <div className="actions">
          <label>
            Your level
            <select value={level} onChange={(event) => setLevel(event.target.value)}>
              <option value="">Pick a level</option>
              {levels.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={busy || level === ''} onClick={() => onApply(level)}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => setOpen(true)}>
            I applied to this job
          </button>
        </div>
      )}
    </li>
  )
}

interface RosterProps {
  applicants: Applicant[]
  jobsById: Map<string, Job>
  allStages: Stage[]
  youId: string
}

// everyone on this role and the round each of them is at. the labels come from tallyStages, so
// a row reads the round the way the whole role agrees to read it: someone with one technical
// round and someone with two are both at their first, however their own pipelines label it
export function Roster({ applicants, jobsById, allStages, youId }: RosterProps) {
  if (applicants.length === 0) {
    return <p>No one has recorded an application to this role yet.</p>
  }

  const labels = new Map(
    tallyStages(
      applicants.map((applicant) => applicant.pipeline),
      allStages,
    ).map((tally) => [tally.key, tally.label]),
  )

  return (
    <ul className="applicants">
      {applicants.map(({ user, pipeline }) => (
        // one user can legitimately appear twice - two postings for the same role at this
        // company - so the key is the pair, never the user id alone
        <li key={`${user.userId}@${pipeline.jobId}`}>
          <span className="applicant">
            <Link to={profileUrl(user.userId)}>
              {user.firstName} {user.lastName}
            </Link>
            {user.userId === youId && <span className="badge">you</span>}
          </span>
          <span className="stage">
            {labels.get(stageKey(pipeline)) ?? currentStageLabel(pipeline)}
            {!isActive(pipeline) && <span className="tag">{statusLabel(pipeline.status)}</span>}
          </span>
          <span className="hint">{pipeline.level}</span>
          {/* which posting this row is about, which is how the same person twice tells apart.
              the lookup is over the job list already in hand, and the two requests are scoped
              to the same (company, role) - but Promise.all is concurrent, not atomic, so a
              posting submitted between the two responses would miss. degrade, do not crash */}
          <span className="hint">
            {jobsById.get(pipeline.jobId)?.title ?? pipeline.jobId.slice(0, 8)}
          </span>
        </li>
      ))}
    </ul>
  )
}
