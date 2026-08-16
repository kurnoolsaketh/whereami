import type { User } from './types'

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
