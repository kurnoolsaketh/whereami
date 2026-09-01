import { useCallback, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  applyToJob,
  listApplicantsForCompanyAndRole,
  listApplications,
  listJobsForCompanyAndRole,
  listLevels,
  listStages,
  listStatuses,
} from '../api/client'
import type { Applicant, Job, Level, Pipeline } from '../api/types'
import { useLoad } from '../api/useLoad'
import { buildGraph, edgeHolds, nodeHolds, type Selection } from '../pipeline/graph'
import { PipelineGraph } from '../pipeline/PipelineGraph'
import { currentStageLabel, stageKey } from '../pipeline/stages'
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
    const [applicants, jobs, allStages, allLevels, allStatuses, applications] = await Promise.all([
      listApplicantsForCompanyAndRole(company, role),
      listJobsForCompanyAndRole(company, role),
      listStages(),
      listLevels(),
      listStatuses(),
      listApplications(userId),
    ])
    return {
      applicants,
      jobs,
      allStages,
      allLevels,
      allStatuses,
      mine: new Set(applications.map((application) => application.job.jobId)),
    }
  }, [company, role, userId])

  const { data, error, loading, reload } = useLoad(load)

  const [applying, setApplying] = useState<string | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  // the graph node or edge the roster is filtered to, or null for everyone
  const [selected, setSelected] = useState<Selection | null>(null)

  const graph = useMemo(
    () =>
      data === null
        ? null
        : buildGraph(
            data.applicants.map((applicant) => applicant.pipeline),
            data.allStages,
            data.allStatuses,
          ),
    [data],
  )

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

  const labels = new Map((graph?.nodes ?? []).map((node) => [node.id, node.label]))
  const pickedNode =
    selected?.kind === 'node' ? (graph?.nodes.find((node) => node.id === selected.id) ?? null) : null
  const pickedEdge =
    selected?.kind === 'edge' ? (graph?.edges.find((edge) => edge.id === selected.id) ?? null) : null

  // whichever is picked, the rule that filters the roster is the one that produced the number on
  // it, so the list always has exactly as many rows as the badge or the label claims
  const holds = (pipeline: Pipeline): boolean =>
    pickedNode !== null
      ? nodeHolds(pipeline, pickedNode)
      : pickedEdge !== null && edgeHolds(pipeline, pickedEdge)

  // the filtered panel is the same roster with a filtered array - not a second component, or
  // the two lists would drift and the filtered one would quietly lose its profile links
  const shown =
    data === null || selected === null
      ? (data?.applicants ?? [])
      : data.applicants.filter((applicant) => holds(applicant.pipeline))

  // a line is named by the rounds it joins, taken from the graph's own node labels so a heading
  // and the nodes it names always read the same words
  const pickedLabel =
    pickedNode?.label ??
    (pickedEdge === null
      ? null
      : `${labels.get(pickedEdge.source) ?? pickedEdge.source} → ${labels.get(pickedEdge.target) ?? pickedEdge.target}`)

  return (
    <section className="role-view">
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

          {graph !== null && graph.nodes.length > 0 && (
            <div className="card">
              <h3>The pipeline for this role</h3>
              <PipelineGraph
                nodes={graph.nodes}
                edges={graph.edges}
                depths={graph.depths}
                selected={selected}
                onSelect={setSelected}
              />
            </div>
          )}

          <div className="card">
            <div className="section-header">
              <h3>{pickedLabel ?? 'Where everyone is'}</h3>
              {selected !== null && (
                <button type="button" className="secondary" onClick={() => setSelected(null)}>
                  Show all ({data.applicants.length})
                </button>
              )}
            </div>
            <Roster
              applicants={shown}
              jobsById={new Map(data.jobs.map((job) => [job.jobId, job]))}
              labels={labels}
              youId={userId}
              empty={
                selected === null
                  ? 'No one has recorded an application to this role yet.'
                  : selected.kind === 'node'
                    ? 'Nobody is at this round.'
                    : 'Nobody has made this move.'
              }
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
  // node id -> label, taken from the graph so a row and its node always read the same words.
  // it must be built from every applicant, never from a filtered subset: derived from the
  // people at one node, "Technical Round 1" would collapse back to "Technical Round"
  labels: Map<string, string>
  youId: string
  empty: string
}

// everyone on this role and the round each of them is at
export function Roster({ applicants, jobsById, labels, youId, empty }: RosterProps) {
  if (applicants.length === 0) {
    return <p>{empty}</p>
  }

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
