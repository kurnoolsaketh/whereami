import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createJob } from '../api/client'

// only for jobs not already in the list. a job's id is derived from its fields, so recording
// one that already exists comes back from the backend as "Job already exists"
export function AddJob() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [description, setDescription] = useState('')
  const [reqId, setReqId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await createJob(title.trim(), company.trim(), description.trim(), reqId.trim())
      navigate('/jobs')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not add that job')
      setBusy(false)
    }
  }

  return (
    <section>
      <h2>Add a job</h2>
      <p className="notice">
        Check <Link to="/jobs">the job list</Link> first - applying to a job someone else already
        recorded is what puts you both on the same pipeline.
      </p>

      {error !== null && <p className="error">{error}</p>}

      <div className="card">
        <form onSubmit={submit}>
          <label>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label>
            Company
            <input value={company} onChange={(event) => setCompany(event.target.value)} required />
          </label>
          <label>
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              required
            />
          </label>
          <label>
            Req id
            <input value={reqId} onChange={(event) => setReqId(event.target.value)} required />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? 'Adding...' : 'Add job'}
          </button>
        </form>
      </div>
    </section>
  )
}
