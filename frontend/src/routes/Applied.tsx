import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  deleteApplication,
  getJob,
  listApplications,
  listStages,
  listStatuses,
  moveToNextStage,
  moveToStage,
  updateStages,
  updateStatus,
} from '../api/client'
import type { Pipeline, Stage } from '../api/types'
import { useLoad } from '../api/useLoad'
import { currentStageLabel, enumLabel, labelStages } from '../pipeline/stages'
import { ACTIVE, isActive, outcomes, statusLabel } from '../pipeline/status'
import { useSession } from '../session/SessionContext'
import { roleUrl } from './links'

// your own pipeline on one posting: the rounds you were told about, where you stand in them,
// and how it ended if it has. everyone *else* on this role lives on the role view, not here
export function Applied() {
  const { jobId = '' } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const { user } = useSession()
  const userId = user!.userId

  const load = useCallback(async () => {
    const [job, allStages, allStatuses, applications] = await Promise.all([
      getJob(jobId),
      listStages(),
      listStatuses(),
      listApplications(userId),
    ])
    // there is no endpoint for a single application, so your pipeline comes out of your list.
    // getJob is fetched separately because the header still has to render when you have not
    // applied, and that case has no application to read the job from
    const mine = applications.find((application) => application.job.jobId === jobId)
    return { job, allStages, allStatuses, pipeline: mine?.pipeline ?? null }
  }, [jobId, userId])

  const { data, error, loading, reload } = useLoad(load)

  // the name of the action in flight, so every button goes quiet while one is running
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

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
  async function erase() {
    setActionError(null)
    setBusy('delete')
    try {
      await deleteApplication(userId, jobId)
      navigate('/')
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : 'Could not delete that record')
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
            <Link to={roleUrl(data.job.company, data.job.role)}>
              {data.job.company} · {data.job.role}
            </Link>{' '}
            — see everyone on this role
          </p>
          {/* a plain anchor, not a react-router Link - the posting is on someone else's site */}
          <p className="subtitle">
            <a href={data.job.url} target="_blank" rel="noreferrer">
              View the posting
            </a>
          </p>

          {data.pipeline === null ? (
            <p className="notice">
              You have not recorded an application to this posting.{' '}
              <Link to={roleUrl(data.job.company, data.job.role)}>Open the role</Link> to add one.
            </p>
          ) : (
            <>
              <div className="card">
                <h3>Your pipeline</h3>
                <p className="stage">
                  {currentStageLabel(data.pipeline)}
                  {!isActive(data.pipeline) && (
                    <span className="tag">{statusLabel(data.pipeline.status)}</span>
                  )}
                </p>

                {isActive(data.pipeline) ? (
                  <>
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
                  </>
                ) : (
                  // moving through stages on an ended application makes no sense, so the
                  // controls go away rather than sitting there disabled. the rounds stay
                  // visible - they are what this application contributes to the role's graph
                  <>
                    <ol className="pipeline">
                      {labelStages(data.pipeline.stages).map((entry, index) => (
                        <li
                          key={index}
                          className={
                            index === data.pipeline!.currentStagePosition ? 'current' : undefined
                          }
                        >
                          <span>{entry.label}</span>
                          {index === data.pipeline!.currentStagePosition && (
                            <span className="hint">Where it ended</span>
                          )}
                        </li>
                      ))}
                    </ol>
                    <div className="actions">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          void run('status', () => updateStatus(userId, jobId, ACTIVE))
                        }
                      >
                        {busy === 'status' ? 'Reopening...' : 'Reopen'}
                      </button>
                      <span className="hint">
                        Reopening loses nothing — your rounds were never changed to record the
                        outcome.
                      </span>
                    </div>
                  </>
                )}
              </div>

              {isActive(data.pipeline) &&
                (editing ? (
                  <StageEditor
                    // the draft is seeded from the pipeline, so a jump made while the form is
                    // open has to reseed it rather than leave a stale draft on screen
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
                ))}

              <div className="card">
                <h3>How did it end?</h3>
                {/* one button per non-ACTIVE value the backend listed, in the order it listed
                    them, labelled from the constant name. a status added to the enum later
                    gets its own button with no change here - which is why none is named */}
                <p>
                  Recording an outcome keeps your rounds exactly as they are, and it can be
                  undone at any time.
                </p>
                <div className="actions">
                  {outcomes(data.allStatuses).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className="secondary"
                      disabled={busy !== null || data.pipeline?.status === status}
                      onClick={() =>
                        void run('status', () => updateStatus(userId, jobId, status))
                      }
                    >
                      {statusLabel(status)}
                    </button>
                  ))}
                </div>
              </div>

              {/* the only irreversible action on the screen, and the only thing wearing
                  .danger. an outcome records what happened and keeps this pipeline shaping the
                  role's graph; deleting erases a record made by mistake and takes its
                  contribution with it */}
              <div className="actions">
                {confirmingDelete ? (
                  <>
                    <span className="hint">
                      Delete this record permanently? It is erased for good — this cannot be
                      reopened, and the role's pipeline loses what it contributed. To record that
                      the application ended, use an outcome above instead.
                    </span>
                    <button
                      type="button"
                      className="danger"
                      disabled={busy !== null}
                      onClick={() => void erase()}
                    >
                      {busy === 'delete' ? 'Deleting...' : 'Yes, delete'}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy !== null}
                      onClick={() => setConfirmingDelete(false)}
                    >
                      Keep it
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="danger"
                    disabled={busy !== null}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete this record
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}

// moveToNextStage asks for position + 1, which the backend rejects past the end of the list
function atLastStage(pipeline: Pipeline): boolean {
  return pipeline.currentStagePosition >= pipeline.stages.length - 1
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
                    {enumLabel(option)}
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
