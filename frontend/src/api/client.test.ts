import { afterEach, expect, it, vi } from 'vitest'
import {
  ApiError,
  applyToJob,
  createJob,
  createUser,
  deleteApplication,
  getJob,
  getUser,
  listApplicantsForCompanyAndRole,
  listApplications,
  listCompanies,
  listJobsForCompanyAndRole,
  listLevels,
  listRoles,
  listRolesAtCompany,
  listStages,
  listStatuses,
  moveToNextStage,
  moveToStage,
  updateStages,
  updateStatus,
} from './client'

// the frontend drifted a whole release away from the backend without anything noticing,
// because fetch responses are cast rather than validated and every path is a template
// string. this file is the only thing in the toolchain that can see a wrong URL: it pins the
// exact path, method and body of every wrapped endpoint against the controllers in
// where.am.i.mvp.api. a rename on either side has to break a line here.

interface Call {
  url: string
  method: string
  body: unknown
}

const calls: Call[] = []

function respondWith(status: number, payload: unknown): void {
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(payload),
    } as Response)
  })
}

// the common case: the call succeeds and the test only cares what went out
async function sent(call: () => Promise<unknown>): Promise<Call> {
  respondWith(200, {})
  await call()
  return calls[calls.length - 1]
}

afterEach(() => {
  calls.length = 0
  vi.unstubAllGlobals()
})

// UserController

it('getUser', async () => {
  expect(await sent(() => getUser('ann-lee'))).toEqual({
    url: '/api/users/ann-lee',
    method: 'GET',
    body: undefined,
  })
})

it('createUser', async () => {
  expect(await sent(() => createUser('Ann', 'Lee', 'ann-lee'))).toEqual({
    url: '/api/users',
    method: 'POST',
    body: { firstName: 'Ann', lastName: 'Lee', userId: 'ann-lee' },
  })
})

// StageController, LevelController, StatusController

it('listStages', async () => {
  expect((await sent(listStages)).url).toBe('/api/stages')
})

it('listLevels', async () => {
  expect((await sent(listLevels)).url).toBe('/api/levels')
})

it('listStatuses', async () => {
  expect((await sent(listStatuses)).url).toBe('/api/statuses')
})

// RolesController

it('listRoles', async () => {
  expect((await sent(listRoles)).url).toBe('/api/roles')
})

it('listRolesAtCompany', async () => {
  expect((await sent(() => listRolesAtCompany('acme'))).url).toBe('/api/roles/acme')
})

it('listApplicantsForCompanyAndRole', async () => {
  expect((await sent(() => listApplicantsForCompanyAndRole('acme', 'Product Manager'))).url).toBe(
    '/api/roles/acme/Product%20Manager/applicants',
  )
})

// JobController

it('listCompanies', async () => {
  expect((await sent(listCompanies)).url).toBe('/api/jobs/companies')
})

it('listJobsForCompanyAndRole', async () => {
  expect((await sent(() => listJobsForCompanyAndRole('acme', 'Software Engineer'))).url).toBe(
    '/api/jobs/acme/Software%20Engineer/list',
  )
})

it('createJob', async () => {
  const job = { title: 'Backend Engineer', url: 'https://acme.example/1', role: 'Software Engineer' }
  expect(await sent(() => createJob('acme', job))).toEqual({
    url: '/api/jobs/acme/new',
    method: 'POST',
    // the company is a path segment, not a field; description and reqId no longer exist
    body: job,
  })
})

it('getJob', async () => {
  expect((await sent(() => getJob('a'.repeat(64)))).url).toBe(`/api/jobs/${'a'.repeat(64)}`)
})

// ApplicantController

it('listApplications', async () => {
  expect((await sent(() => listApplications('ann-lee'))).url).toBe('/api/users/ann-lee/applied')
})

it('applyToJob', async () => {
  expect(await sent(() => applyToJob('ann-lee', 'job-1', 'Senior'))).toEqual({
    url: '/api/users/ann-lee/apply',
    method: 'POST',
    body: { jobId: 'job-1', level: 'Senior' },
  })
})

it('updateStages', async () => {
  expect(await sent(() => updateStages('ann-lee', 'job-1', ['APPLIED', 'ONSITE'], 1))).toEqual({
    url: '/api/users/ann-lee/applied/job-1/updateStages',
    method: 'PUT',
    body: { stages: ['APPLIED', 'ONSITE'], currentStagePosition: 1 },
  })
})

it('moveToStage', async () => {
  expect(await sent(() => moveToStage('ann-lee', 'job-1', 2))).toEqual({
    url: '/api/users/ann-lee/applied/job-1/moveToStage',
    method: 'PUT',
    body: { currentStagePosition: 2 },
  })
})

it('moveToNextStage', async () => {
  expect(await sent(() => moveToNextStage('ann-lee', 'job-1'))).toEqual({
    url: '/api/users/ann-lee/applied/job-1/moveToNextStage',
    method: 'POST',
    // no request body - the endpoint takes the position from the pipeline
    body: undefined,
  })
})

it('updateStatus', async () => {
  expect(await sent(() => updateStatus('ann-lee', 'job-1', 'REJECTED'))).toEqual({
    url: '/api/users/ann-lee/applied/job-1/updateStatus',
    method: 'PUT',
    // the field is newStatus, matching UpdateStatusRequest
    body: { newStatus: 'REJECTED' },
  })
})

it('deleteApplication', async () => {
  respondWith(204, null)
  await expect(deleteApplication('ann-lee', 'job-1')).resolves.toBeUndefined()
  expect(calls[0]).toEqual({
    url: '/api/users/ann-lee/applied/job-1',
    method: 'DELETE',
    body: undefined,
  })
})

// encoding, which is the failure this whole family of paths invites: company names are
// free text and roles are display names, so both routinely contain a space

it('percent-encodes every company, role and user segment', async () => {
  expect((await sent(() => listRolesAtCompany('bum co'))).url).toBe('/api/roles/bum%20co')
  expect((await sent(() => listJobsForCompanyAndRole('bum co', 'Engineering Manager'))).url).toBe(
    '/api/jobs/bum%20co/Engineering%20Manager/list',
  )
  expect((await sent(() => createJob('bum co', { title: 't', url: 'u', role: 'r' }))).url).toBe(
    '/api/jobs/bum%20co/new',
  )
  expect((await sent(() => getUser('ann lee'))).url).toBe('/api/users/ann%20lee')
})

// error handling, which is shared by every call above

it('surfaces the message from an ErrorResponse body', async () => {
  respondWith(400, { message: 'Company [ghost] is not registered' })
  await expect(listRolesAtCompany('ghost')).rejects.toThrow('Company [ghost] is not registered')
})

it('falls back to the status when the body carries no message', async () => {
  respondWith(400, {})
  await expect(listRolesAtCompany('ghost')).rejects.toThrow('Request failed with status 400')
})

it('reports a request that never reached the backend as status 0', async () => {
  vi.stubGlobal('fetch', () => Promise.reject(new Error('connection refused')))
  await expect(listStages()).rejects.toMatchObject({ status: 0 })
  await expect(listStages()).rejects.toBeInstanceOf(ApiError)
})
