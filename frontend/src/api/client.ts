import type { Applicant, Application, Job, Stage, User } from './types'

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

export function getUser(userId: string): Promise<User> {
  return request(`/users/${encodeURIComponent(userId)}`, 'GET')
}

export function createUser(firstName: string, lastName: string, userId: string): Promise<User> {
  return request('/users', 'POST', { firstName, lastName, userId })
}

// the stages a pipeline can be built from, so the stage picker never hardcodes the enum
export function listStages(): Promise<Stage[]> {
  return request('/stages', 'GET')
}

export function listJobs(): Promise<Job[]> {
  return request('/jobs', 'GET')
}

export function getJob(jobId: string): Promise<Job> {
  return request(`/jobs/${encodeURIComponent(jobId)}`, 'GET')
}

export function createJob(
  title: string,
  company: string,
  description: string,
  reqId: string,
): Promise<Job> {
  return request('/jobs', 'POST', { title, company, description, reqId })
}

// everyone who applied to this job and where each of them stands, which is what the app exists
// for. the requesting user is one of the rows
export function listApplicants(jobId: string): Promise<Applicant[]> {
  return request(`/jobs/${encodeURIComponent(jobId)}/applicants`, 'GET')
}

export function listApplications(userId: string): Promise<Application[]> {
  return request(`/users/${encodeURIComponent(userId)}/applications`, 'GET')
}

export function applyToJob(userId: string, jobId: string): Promise<Application> {
  return request(`/users/${encodeURIComponent(userId)}/applications`, 'POST', { jobId })
}

export function withdrawFromJob(userId: string, jobId: string): Promise<void> {
  return request(applicationPath(userId, jobId), 'DELETE')
}

// the list and the position go together: updateStages validates the position against the
// incoming list, so a rejected save changes neither of them
export function updateStages(
  userId: string,
  jobId: string,
  stages: Stage[],
  currentStagePosition: number,
): Promise<Application> {
  return request(`${applicationPath(userId, jobId)}/stages`, 'PUT', { stages, currentStagePosition })
}

export function moveToStage(
  userId: string,
  jobId: string,
  currentStagePosition: number,
): Promise<Application> {
  return request(`${applicationPath(userId, jobId)}/position`, 'PUT', { currentStagePosition })
}

export function moveToNextStage(userId: string, jobId: string): Promise<Application> {
  return request(`${applicationPath(userId, jobId)}/next`, 'POST')
}

function applicationPath(userId: string, jobId: string): string {
  return `/users/${encodeURIComponent(userId)}/applications/${encodeURIComponent(jobId)}`
}
