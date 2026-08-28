import type {
  Applicant,
  Application,
  Company,
  Job,
  Level,
  Role,
  Stage,
  Status,
  User,
} from './types'

// every call to the backend goes through this module, so no component talks to the network
// directly. the vite dev server proxies /api to the spring boot app on port 8080
const API_ROOT = '/api'

// ApiExceptionHandler answers every validation failure with 400 and an ErrorResponse body,
// so the message is worth surfacing to the user rather than swallowing
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface ErrorResponse {
  message?: string
}

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    // status 0: the request never reached the backend, so there is no http status to report
    throw new ApiError(0, 'Could not reach the server. Is the backend running on port 8080?')
  }

  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response))
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

async function errorMessage(response: Response): Promise<string> {
  let message = `Request failed with status ${response.status}`
  try {
    const body = (await response.json()) as ErrorResponse
    if (body.message !== undefined && body.message !== '') {
      message = body.message
    }
  } catch {
    // not a json body - an unhandled exception, so the status is all there is to go on
  }
  return message
}

// companies and roles travel as their display names, so they carry spaces - "Software
// Engineer", "acme corp" - and every one of them is a path segment somewhere. one helper, so
// a caller cannot forget
function segment(value: string): string {
  return encodeURIComponent(value)
}

// users

export function getUser(userId: string): Promise<User> {
  return request(`/users/${segment(userId)}`, 'GET')
}

export function createUser(firstName: string, lastName: string, userId: string): Promise<User> {
  return request('/users', 'POST', { firstName, lastName, userId })
}

// the enums, so no picker in the frontend hardcodes a value the backend owns

export function listStages(): Promise<Stage[]> {
  return request('/stages', 'GET')
}

export function listLevels(): Promise<Level[]> {
  return request('/levels', 'GET')
}

export function listStatuses(): Promise<Status[]> {
  return request('/statuses', 'GET')
}

export function listRoles(): Promise<Role[]> {
  return request('/roles', 'GET')
}

// jobs and roles

export function listCompanies(): Promise<Company[]> {
  return request('/jobs/companies', 'GET')
}

// the roles of the jobs recorded at this company, which is what browse lists. 400s on a
// company nobody has recorded a job at, so only call it with a name listCompanies returned
export function listRolesAtCompany(company: Company): Promise<Role[]> {
  return request(`/roles/${segment(company)}`, 'GET')
}

export function listJobsForCompanyAndRole(company: Company, role: Role): Promise<Job[]> {
  return request(`/jobs/${segment(company)}/${segment(role)}/list`, 'GET')
}

// everyone who applied to this role at this company and where each of them stands, which is
// what the app exists for. the requesting user is one of the rows
export function listApplicantsForCompanyAndRole(
  company: Company,
  role: Role,
): Promise<Applicant[]> {
  return request(`/roles/${segment(company)}/${segment(role)}/applicants`, 'GET')
}

// the company is a path segment, and the backend registers it on first use. a job's id is
// derived from its fields, so recording an identical posting overwrites it in place and
// returns the same id rather than failing
export function createJob(
  company: Company,
  job: { title: string; url: string; role: Role },
): Promise<Job> {
  return request(`/jobs/${segment(company)}/new`, 'POST', job)
}

export function getJob(jobId: string): Promise<Job> {
  return request(`/jobs/${segment(jobId)}`, 'GET')
}

// your applications

export function listApplications(userId: string): Promise<Application[]> {
  return request(`/users/${segment(userId)}/applied`, 'GET')
}

export function applyToJob(userId: string, jobId: string, level: Level): Promise<Application> {
  return request(`/users/${segment(userId)}/apply`, 'POST', { jobId, level })
}

// the list and the position go together: updateStages validates the position against the
// incoming list, so a rejected save changes neither of them
export function updateStages(
  userId: string,
  jobId: string,
  stages: Stage[],
  currentStagePosition: number,
): Promise<Application> {
  return request(`${appliedPath(userId, jobId)}/updateStages`, 'PUT', {
    stages,
    currentStagePosition,
  })
}

export function moveToStage(
  userId: string,
  jobId: string,
  currentStagePosition: number,
): Promise<Application> {
  return request(`${appliedPath(userId, jobId)}/moveToStage`, 'PUT', { currentStagePosition })
}

export function moveToNextStage(userId: string, jobId: string): Promise<Application> {
  return request(`${appliedPath(userId, jobId)}/moveToNextStage`, 'POST')
}

// records how an application ended, and reopens it by passing ACTIVE back. the stage list is
// untouched either way, which is why reopening loses nothing
export function updateStatus(
  userId: string,
  jobId: string,
  newStatus: Status,
): Promise<Application> {
  return request(`${appliedPath(userId, jobId)}/updateStatus`, 'PUT', { newStatus })
}

// erases the record entirely, taking its contribution to the role's graph with it. withdrawing
// is a status now, so this is the destructive one of the two
export function deleteApplication(userId: string, jobId: string): Promise<void> {
  return request(appliedPath(userId, jobId), 'DELETE')
}

function appliedPath(userId: string, jobId: string): string {
  return `/users/${segment(userId)}/applied/${segment(jobId)}`
}
