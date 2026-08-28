import type { Company, Role } from '../api/types'

// a company name is free text and a role is a display name, so both segments routinely carry
// a space. every link into the role view goes through here rather than being interpolated by
// hand at each call site
export function roleUrl(company: Company, role: Role): string {
  return `/roles/${encodeURIComponent(company)}/${encodeURIComponent(role)}`
}

export function appliedUrl(jobId: string): string {
  return `/applied/${encodeURIComponent(jobId)}`
}

export function profileUrl(userId: string): string {
  return `/users/${encodeURIComponent(userId)}`
}
