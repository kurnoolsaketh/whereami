import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  getJob,
  listApplicants,
  listApplications,
  listStages,
  moveToNextStage,
  moveToStage,
  updateStages,
  withdrawFromJob,
} from '../api/client'
import type { Applicant, Pipeline, Stage } from '../api/types'
import { useLoad } from '../api/useLoad'
import {
  currentStageLabel,
  labelStages,
  stageKey,
  stageName,
  tallyStages,
  UNKNOWN_STAGE,
} from '../pipeline/stages'
import { useSession } from '../session/SessionContext'

// your pipeline on one job. keyed by job id, so this opens straight from a link in a new tab
export function JobDetail() {
  const { jobId = '' } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const { user } = useSession()
  const userId = user!.userId

  const load = useCallback(async () => {
    const [job, allStages, applications, applicants] = await Promise.all([
      getJob(jobId),
      listStages(),
      listApplications(userId),
      listApplicants(jobId),
    ])
    // there is no endpoint for a single application, so your pipeline comes out of your list
    const mine = applications.find((application) => application.job.jobId === jobId)
    return { job, allStages, applicants, pipeline: mine?.pipeline ?? null }
  }, [jobId, userId])

  const { data, error, loading, reload } = useLoad(load)

  // the name of the action in flight, so every button goes quiet while one is running
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false)

  // a rejected save leaves its message on screen, so opening or abandoning the form clears it -
  // it is about a draft that is no longer there
  function setEditingForm(open: boolean) {
    setActionError(null)
    setEditing(open)
  }

  async function run(action: string, call: () => Promise<unknown>): Promise<boolean> {
    setActionError(null)
    setBusy(action)
    try {
      await call()
      reload()
      return true
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : 'That did not work')
      return false
    } finally {
      setBusy(null)
    }
  }

  // not run(), because there is nothing left on this route to reload afterwards
  async function withdraw() {
    setActionError(null)
    setBusy('withdraw')
    try {
      await withdrawFromJob(userId, jobId)
      navigate('/')
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : 'Could not withdraw')
      setBusy(null)
    }
  }

  async function save(stages: Stage[], currentStagePosition: number) {
    const saved = await run('stages', () =>
      updateStages(userId, jobId, stages, currentStagePosition),
    )
    if (saved) {
      setEditing(false)
    }
  }

  return (
    <section>
      <p>
        <Link to="/">Back to my applications</Link>
      </p>

      {error !== null && <p className="error">{error}</p>}
      {actionError !== null && <p className="error">{actionError}</p>}
      {loading && data === null && <p className="notice">Loading this job...</p>}

      {data !== null && (
        <>
          <h2>{data.job.title}</h2>
          <p className="subtitle">
            {data.job.company} <code>{data.job.reqId}</code>
          </p>
          {data.job.description !== '' && <p>{data.job.description}</p>}

          {data.pipeline === null ? (
            <p className="notice">
              You have not applied to this job. <Link to="/jobs">Browse jobs</Link> to apply.
            </p>
          ) : (
            <>
              <div className="card">
                <h3>Your pipeline</h3>
                <p className="stage">{currentStageLabel(data.pipeline)}</p>

                <StageList
                  pipeline={data.pipeline}
                  busy={busy !== null}
                  onJump={(position) =>
                    void run('position', () => moveToStage(userId, jobId, position))
                  }
                />

                <div className="actions">
                  <button
                    type="button"
                    disabled={busy !== null || atLastStage(data.pipeline)}
                    onClick={() => void run('next', () => moveToNextStage(userId, jobId))}
                  >
                    {busy === 'next' ? 'Moving...' : 'Move to next stage'}
                  </button>
                  {atLastStage(data.pipeline) && (
                    <span className="hint">This is the last stage in your pipeline.</span>
                  )}
                </div>
              </div>

              {editing ? (
                <StageEditor
                  // the draft is seeded from the pipeline, so a jump made while the form is open
                  // has to reseed it rather than leave a stale draft on screen
                  key={`${data.pipeline.currentStagePosition}@${data.pipeline.stages.join(',')}`}
                  pipeline={data.pipeline}
                  allStages={data.allStages}
                  saving={busy === 'stages'}
                  onSave={(stages, position) => void save(stages, position)}
                  onCancel={() => setEditingForm(false)}
                />
              ) : (
                <div className="actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy !== null}
                    onClick={() => setEditingForm(true)}
                  >
                    Edit stages
                  </button>
                </div>
              )}

              <div className="actions">
                {confirmingWithdraw ? (
                  <>
                    <span className="hint">Withdraw from this job? Your pipeline is lost.</span>
                    <button
                      type="button"
                      className="danger"
                      disabled={busy !== null}
                      onClick={() => void withdraw()}
                    >
                      {busy === 'withdraw' ? 'Withdrawing...' : 'Yes, withdraw'}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy !== null}
                      onClick={() => setConfirmingWithdraw(false)}
                    >
                      Keep it
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="danger"
                    disabled={busy !== null}
                    onClick={() => setConfirmingWithdraw(true)}
                  >
                    Withdraw from this job
                  </button>
                )}
              </div>
            </>
          )}

          <div className="card">
            <div className="section-header">
              <h3>Where everyone is</h3>
              {/* nothing pushes another tab's move to this one, so the way to see it is to ask */}
              <button type="button" className="secondary" disabled={loading} onClick={reload}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            <Applicants applicants={data.applicants} allStages={data.allStages} youId={userId} />
          </div>
        </>
      )}
    </section>
  )
}

// moveToNextStage asks for position + 1, which the backend rejects past the end of the list
function atLastStage(pipeline: Pipeline): boolean {
  return pipeline.currentStagePosition >= pipeline.stages.length - 1
}

interface ApplicantsProps {
  applicants: Applicant[]
  allStages: Stage[]
  youId: string
}

// everyone on this job and the round each of them is at, plus a head count per round. the tally
// groups on (stage, occurrence) and the rows read their label back out of it, so a row and the
// count it belongs to always say the same words - someone with one technical round and someone
// with two are both at their first, however their own pipelines happen to label it
function Applicants({ applicants, allStages, youId }: ApplicantsProps) {
  if (applicants.length === 0) {
    return <p>No one has recorded an application to this job yet.</p>
  }

  const tallies = tallyStages(
    applicants.map((applicant) => applicant.pipeline),
    allStages,
  )
  const labels = new Map(tallies.map((tally) => [tally.key, tally.label]))

  return (
    <>
      <ul className="tally">
        {tallies.map((tally) => (
          <li key={tally.key}>
            <span>{tally.label}</span>
            <span className="count">{tally.count}</span>
          </li>
        ))}
      </ul>

      <ul className="applicants">
        {applicants.map(({ user, pipeline }) => (
          <li key={user.userId}>
            <span className="applicant">
              {user.firstName} {user.lastName}
              {user.userId === youId && <span className="badge">you</span>}
            </span>
            <span className="stage">{labels.get(stageKey(pipeline)) ?? UNKNOWN_STAGE}</span>
            {/* two people at the same round can be walking different pipelines, so say how long
                each one's is rather than let the shared label imply they match */}
            <span className="hint">
              {pipeline.currentStagePosition + 1} of {pipeline.stages.length}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

interface StageListProps {
  pipeline: Pipeline
  busy: boolean
  onJump: (position: number) => void
}

// clicking a stage jumps to it. this and "move to next stage" both go through the position
// endpoints, which leave the stage list alone
function StageList({ pipeline, busy, onJump }: StageListProps) {
  return (
    <ol className="pipeline">
      {labelStages(pipeline.stages).map((entry, index) => {
        const here = index === pipeline.currentStagePosition
        return (
          <li key={index} className={here ? 'current' : undefined}>
            <button type="button" disabled={here || busy} onClick={() => onJump(index)}>
              {entry.label}
            </button>
            {here && <span className="hint">You are here</span>}
          </li>
        )
      })}
    </ol>
  )
}

interface StageEditorProps {
  pipeline: Pipeline
  allStages: Stage[]
  saving: boolean
  onSave: (stages: Stage[], currentStagePosition: number) => void
  onCancel: () => void
}

// the stages the company told you about, in order, and where in them you stand. one form for
// both, because updateStages takes the list and the position together and validates the
// position against the incoming list - so a rejected save leaves everything as it was
function StageEditor({ pipeline, allStages, saving, onSave, onCancel }: StageEditorProps) {
  const [draft, setDraft] = useState<Stage[]>(pipeline.stages)
  const [position, setPosition] = useState(pipeline.currentStagePosition)

  function setStage(index: number, stage: Stage) {
    setDraft(draft.map((entry, i) => (i === index ? stage : entry)))
  }

  // whatever comes after the draft's last stage in the enum's order, so building a pipeline is
  // mostly pressing Add and correcting the odd row
  function addStage() {
    const after = allStages.indexOf(draft[draft.length - 1]) + 1
    setDraft([...draft, allStages[Math.min(after, allStages.length - 1)]])
  }

  // dropping a row has to leave "you are here" on a row that still exists. that is form
  // mechanics only - nothing is saved until you press Save, and the radio shows you where the
  // save will put you, so shortening the list never relocates you behind your back
  function removeStage(index: number) {
    const remaining = draft.filter((_, i) => i !== index)
    setDraft(remaining)
    setPosition(Math.min(position > index ? position - 1 : position, remaining.length - 1))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    onSave(draft, position)
  }

  return (
    <div className="card">
      <h3>Edit stages</h3>
      <p>
        List the rounds the company told you about, in order, then say which one you are on. The
        first stage has to be Applied.
      </p>

      <form onSubmit={submit}>
        <ol className="stage-editor">
          {labelStages(draft).map((entry, index) => (
            <li key={index}>
              <select
                value={entry.stage}
                aria-label={`Stage ${index + 1}`}
                onChange={(event) => setStage(index, event.target.value)}
              >
                {allStages.map((option) => (
                  <option key={option} value={option}>
                    {stageName(option)}
                  </option>
                ))}
              </select>
              <label>
                <input
                  type="radio"
                  name="current-stage"
                  checked={position === index}
                  onChange={() => setPosition(index)}
                />
                I am here
              </label>
              <button
                type="button"
                className="remove"
                disabled={draft.length === 1}
                onClick={() => removeStage(index)}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>

        <div className="actions">
          <button type="button" className="secondary" onClick={addStage}>
            Add stage
          </button>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button type="button" className="secondary" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
