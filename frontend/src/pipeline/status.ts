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

// how ending in each status reads in a sentence. "advanced" is true of a move between rounds and
// false of every one of these - nobody advances into a rejection - so the verb has to come from
// the status itself.
//
// naming them here does not break the rule above: a status the enum gains later still gets its
// node, its button and its tag with no change, and falls through to phrasing built from its own
// label rather than to anything wrong
const ENDINGS: Partial<Record<Status, { one: string; many: string }>> = {
  REJECTED: { one: 'was rejected', many: 'were rejected' },
  OFFER: { one: 'got an offer', many: 'got an offer' },
  USER_WITHDREW: { one: 'withdrew', many: 'withdrew' },
}

export function endingVerb(status: Status, count: number): string {
  const ending = ENDINGS[status]
  if (ending === undefined) {
    return `ended in ${statusLabel(status)}`
  }
  return count === 1 ? ending.one : ending.many
}
