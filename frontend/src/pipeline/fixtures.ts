import type { Applicant, Pipeline, Stage, Status } from '../api/types'

// the role shapes the graph has to survive, written out by hand so the layout can be looked at
// without a backend. the dev route renders every one of them down a single page, which is what
// makes tuning a constant a one-save loop rather than a reseed-and-reload one.
//
// these are also what the seed script posts through the real API, so the fixture page and the
// real role view are looking at the same roles

export const STAGES: Stage[] = [
  'APPLIED',
  'RECRUITER_SCREEN',
  'HIRING_MANAGER_SCREEN',
  'TECHNICAL_ROUND',
  'BEHAVIORAL_ROUND',
  'ONSITE',
]

export const STATUSES: Status[] = ['ACTIVE', 'USER_WITHDREW', 'OFFER', 'REJECTED']

const A = 'APPLIED'
const R = 'RECRUITER_SCREEN'
const H = 'HIRING_MANAGER_SCREEN'
const T = 'TECHNICAL_ROUND'
const B = 'BEHAVIORAL_ROUND'
const O = 'ONSITE'

// one applicant: the rounds they were told about, which one they are standing on, and how it
// ended if it has
function at(stages: Stage[], position: number, status: Status = 'ACTIVE'): Pipeline {
  return { jobId: 'fixture', stages, currentStagePosition: position, level: 'Senior', status }
}

export interface Shape {
  name: string
  // what the shape is for, shown beside it on the dev page
  note: string
  pipelines: Pipeline[]
}

export const SHAPES: Shape[] = [
  {
    name: 'The reference',
    note: 'the hand-drawn shape this layout was rebuilt for: three skips, a round with a back edge into it, and all three outcomes',
    pipelines: [
      // the spine everyone agrees on
      at([A, R, H, T, T, O], 5),
      at([A, R, H, T, T, O], 4),
      at([A, R, H, T, T, O], 5, 'OFFER'),
      at([A, R, H, T, T, O], 5, 'OFFER'),
      at([A, R, H, T, T, O], 5, 'REJECTED'),
      // skipped the recruiter screen
      at([A, H, T, T, O], 3),
      // skipped both screens
      at([A, T, T, O], 2),
      at([A, T, T, O], 1, 'USER_WITHDREW'),
      // told the technical round came first, so this one closes a cycle back into the screen
      at([A, T, H, T, O], 3),
      at([A, T, H, T, O], 2),
      // ended early, from two different rounds
      at([A, R, H, T, T, O], 1, 'REJECTED'),
      at([A, R, H, T, T, O], 1, 'REJECTED'),
      at([A, R, H, T, T, O], 3, 'REJECTED'),
      at([A, R, H, T, T, O], 3, 'REJECTED'),
    ],
  },
  {
    name: 'A plain chain',
    note: 'everyone walked the same order: every step should be dead straight down the middle',
    pipelines: [
      at([A, R, H, T, O], 4),
      at([A, R, H, T, O], 3),
      at([A, R, H, T, O], 2),
      at([A, R, H, T, O], 4, 'OFFER'),
      at([A, R, H, T, O], 3, 'REJECTED'),
    ],
  },
  {
    name: 'A fork',
    note: 'two rounds share a row, so the band is two boxes wide and every other row re-centres around it',
    pipelines: [
      at([A, R, H, O], 3),
      at([A, R, H, O], 3, 'OFFER'),
      at([A, R, B, O], 3),
      at([A, R, B, O], 2, 'REJECTED'),
      at([A, R, B, O], 3, 'REJECTED'),
    ],
  },
  {
    name: 'A long cycle',
    note: 'three applicants who disagree about the order, so the rounds close a loop between them',
    pipelines: [
      at([A, H, T, O], 3),
      at([A, H, T, O], 2),
      at([A, T, B, O], 3),
      at([A, T, B, O], 2),
      at([A, B, H, O], 3),
      at([A, B, H, O], 2, 'REJECTED'),
    ],
  },
  {
    name: 'A two-way pair',
    note: 'some were sent screen-then-technical and some technical-then-screen: the one case where neither edge is straight',
    pipelines: [
      at([A, H, T, O], 3),
      at([A, H, T, O], 3, 'OFFER'),
      at([A, H, T, O], 2),
      at([A, T, H, O], 3),
      at([A, T, H, O], 2),
      at([A, T, H, O], 1, 'REJECTED'),
    ],
  },
  {
    name: 'Everyone has ended',
    note: 'no active applicants at all, so every stage badge is empty and every edge lands on an outcome',
    pipelines: [
      at([A, R, H, O], 3, 'OFFER'),
      at([A, R, H, O], 2, 'REJECTED'),
      at([A, R, H, O], 1, 'REJECTED'),
      at([A, R, H, O], 0, 'USER_WITHDREW'),
      at([A, R, H, O], 3, 'REJECTED'),
    ],
  },
  {
    name: 'One applicant',
    note: 'the smallest graph there is: one walked step, nothing to balance',
    pipelines: [at([A, R, H, T, O], 1)],
  },
]

// the same fixtures dressed as applicants, for the roster beside the graph on the dev page
export function applicantsOf(shape: Shape): Applicant[] {
  return shape.pipelines.map((pipeline, index) => ({
    user: {
      userId: `fixture-${index + 1}`,
      firstName: 'Applicant',
      lastName: `${index + 1}`,
    },
    pipeline: { ...pipeline, jobId: `${shape.name}-${index + 1}` },
  }))
}
