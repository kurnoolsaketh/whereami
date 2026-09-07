#!/usr/bin/env node
// Posts the graph fixtures through the real API, so the role view has something in it.
//
// The backend is entirely in memory, so it clears every time the process restarts and there is
// no sample data to fall back on. Building a role with a dozen applicants through the UI is a
// lot of clicking to do twice, let alone after every restart - so this reconstructs the same
// role shapes the fixture page draws, but as real users, postings and pipelines. The fixture
// page tells you whether the drawing is right; this tells you whether the app is.
//
//   cd mvp && ./mvnw spring-boot:run          # in one terminal
//   node scripts/seed.mjs                     # in another
//
// Re-running it is safe: a job's id is a digest of its fields, so recording the same posting
// twice overwrites it in place, and a user id that already exists is reused rather than failing.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const API = process.env.WHEREAMI_API ?? 'http://localhost:8080/api'
// one company per shape, so each one gets its own role screen rather than all of them merging
// into a single graph - the role view pools every posting under a (company, role) pair, which is
// the whole point of the app and exactly the wrong thing here. company names are free text and
// registered on first use; Role is an enum, so that is the axis that cannot vary
const ROLE = 'Software Engineer'
const LEVELS = ['Junior', 'Mid', 'Senior']

const here = dirname(fileURLToPath(import.meta.url))

// the fixtures are TypeScript, and this script is plain node, so the shapes are read out of the
// source rather than imported. one definition, no build step, and the two cannot drift
function fixtures() {
  const source = readFileSync(join(here, '..', 'frontend', 'src', 'pipeline', 'fixtures.ts'), 'utf8')
  const stage = { A: 'APPLIED', R: 'RECRUITER_SCREEN', H: 'HIRING_MANAGER_SCREEN', T: 'TECHNICAL_ROUND', B: 'BEHAVIORAL_ROUND', O: 'ONSITE' }
  const shapes = []
  for (const block of source.split(/\n  \{\n/).slice(1)) {
    const name = block.match(/name: '([^']+)'/)?.[1]
    if (name === undefined) continue
    const pipelines = []
    for (const call of block.matchAll(/at\(\[([^\]]+)\],\s*(\d+)(?:,\s*'([A-Z_]+)')?\)/g)) {
      pipelines.push({
        stages: call[1].split(',').map((token) => stage[token.trim()]),
        currentStagePosition: Number(call[2]),
        status: call[3] ?? 'ACTIVE',
      })
    }
    if (pipelines.length > 0) shapes.push({ name, pipelines })
  }
  return shapes
}

async function call(path, method, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${method} ${path} -> ${response.status} ${text}`)
  }
  return response.status === 204 ? null : response.json().catch(() => null)
}

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function seedShape(shape, index) {
  // one posting per shape, under a company of its own
  const company = `Fixture ${index + 1} - ${shape.name}`
  const title = `${shape.name}, ${ROLE}`
  const job = await call(`/jobs/${encodeURIComponent(company)}/new`, 'POST', {
    title,
    url: `https://example.com/${slug(shape.name)}`,
    role: ROLE,
  })

  for (const [i, pipeline] of shape.pipelines.entries()) {
    const userId = `${slug(shape.name)}-${i + 1}`
    // a user id that already exists comes back rather than erroring, so a re-run is a no-op
    await call('/users', 'POST', {
      userId,
      firstName: shape.name.split(' ').slice(-1)[0],
      lastName: `${i + 1}`,
    }).catch(() => {})

    await call(`/users/${encodeURIComponent(userId)}/apply`, 'POST', {
      jobId: job.jobId,
      level: LEVELS[i % LEVELS.length],
    })
    const applied = `/users/${encodeURIComponent(userId)}/applied/${encodeURIComponent(job.jobId)}`
    // the rounds first, then where they stand in them, then how it ended: a terminated pipeline
    // refuses stage changes, so the outcome has to be recorded last
    await call(`${applied}/updateStages`, 'PUT', {
      stages: pipeline.stages,
      currentStagePosition: pipeline.currentStagePosition,
    })
    if (pipeline.status !== 'ACTIVE') {
      await call(`${applied}/updateStatus`, 'PUT', { newStatus: pipeline.status })
    }
  }

  return { count: shape.pipelines.length, company }
}

const shapes = fixtures()
let total = 0
for (const [index, shape] of shapes.entries()) {
  const { count, company } = await seedShape(shape, index)
  total += count
  // the company name comes back from the API normalised to lower case, so link it the way the
  // backend stores it rather than the way it went in
  console.log(
    `  ${count} applicants  http://localhost:5173/roles/` +
      `${encodeURIComponent(company.toLowerCase())}/${encodeURIComponent(ROLE)}`,
  )
}

console.log(`\nSeeded ${shapes.length} roles and ${total} applicants.`)
