import type { Pipeline, Status } from '../api/types'
import { enumLabel } from './stages'

// ACTIVE is the one status value the frontend has to know by name: it is the difference
// between an application still running and one that has ended, and that decides what every
// screen offers. every other status stays opaque - the outcome controls are generated from
// GET /api/statuses, so a status added to the enum later gets its own button, its own tag and
// its own node in the graph with no change here. this is the only file that names one.
export const ACTIVE: Status = 'ACTIVE'

export function isActive(pipeline: Pipeline): boolean {
  return pipeline.status === ACTIVE
}

// the statuses that record an ending, in the order the endpoint returned them
export function outcomes(statuses: Status[]): Status[] {
  return statuses.filter((status) => status !== ACTIVE)
}

// Status has no toString override on the backend, so it arrives as a constant name and is
// titled exactly the way a stage is
export function statusLabel(status: Status): string {
  return enumLabel(status)
}
