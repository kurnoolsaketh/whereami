import { expect, it } from 'vitest'
import type { Pipeline, Stage, Status } from '../api/types'
import { buildGraph, nodeHolds } from './graph'

const STAGES: Stage[] = [
  'APPLIED',
  'RECRUITER_SCREEN',
  'HIRING_MANAGER_SCREEN',
  'TECHNICAL_ROUND',
  'BEHAVIORAL_ROUND',
  'ONSITE',
]
const STATUSES: Status[] = ['ACTIVE', 'USER_WITHDREW', 'OFFER', 'REJECTED']

const A = 'APPLIED'
const R = 'RECRUITER_SCREEN'
const T = 'TECHNICAL_ROUND'
const O = 'ONSITE'

function pipeline(stages: Stage[], position: number, status: Status = 'ACTIVE'): Pipeline {
  return { jobId: 'job', stages, currentStagePosition: position, level: 'Mid', status }
}

function graph(pipelines: Pipeline[]) {
  return buildGraph(pipelines, STAGES, STATUSES)
}

function nodeAt(g: ReturnType<typeof graph>, id: string) {
  const found = g.nodes.find((node) => node.id === id)
  expect(found, `no node ${id}`).toBeDefined()
  return found!
}

function edgeBetween(g: ReturnType<typeof graph>, source: string, target: string) {
  const found = g.edges.find((edge) => edge.source === source && edge.target === target)
  expect(found, `no edge ${source} -> ${target}`).toBeDefined()
  return found!
}

// Ann: Applied -> Tech -> Tech -> Onsite   (at her second technical round)
// Bob: Applied -> Tech -> Onsite           (at his first)
// Cat: Applied -> Tech -> Tech -> Tech -> Onsite (at her third)
const WORKED_EXAMPLE = [
  pipeline([A, T, T, O], 2),
  pipeline([A, T, O], 1),
  pipeline([A, T, T, T, O], 3),
]

it('a repeated stage becomes one node per occurrence', () => {
  const g = graph(WORKED_EXAMPLE)

  expect(g.nodes.map((node) => node.id).sort()).toEqual([
    'APPLIED#1',
    'ONSITE#1',
    'TECHNICAL_ROUND#1',
    'TECHNICAL_ROUND#2',
    'TECHNICAL_ROUND#3',
  ])
})

it('numbers a stage across the whole role, not within one pipeline', () => {
  const g = graph(WORKED_EXAMPLE)

  // Bob's own pipeline has a single technical round, which labelStages would leave unnumbered.
  // across the role there are three, so his round reads "Technical Round 1"
  expect(nodeAt(g, 'TECHNICAL_ROUND#1').label).toBe('Technical Round 1')
  expect(nodeAt(g, 'TECHNICAL_ROUND#3').label).toBe('Technical Round 3')
  // a stage with one occurrence stays unnumbered
  expect(nodeAt(g, 'APPLIED#1').label).toBe('Applied')
  expect(nodeAt(g, 'ONSITE#1').label).toBe('Onsite')
})

it('columns are the longest path from Applied', () => {
  const g = graph(WORKED_EXAMPLE)

  expect(nodeAt(g, 'APPLIED#1').column).toBe(0)
  expect(nodeAt(g, 'TECHNICAL_ROUND#1').column).toBe(1)
  expect(nodeAt(g, 'TECHNICAL_ROUND#2').column).toBe(2)
  expect(nodeAt(g, 'TECHNICAL_ROUND#3').column).toBe(3)
  // Bob reaches Onsite from Technical Round 1, but the longest path wins, so Onsite sits right
  // of every round anyone recorded rather than beside Bob's second column
  expect(nodeAt(g, 'ONSITE#1').column).toBe(4)
  expect(g.columns).toBe(5)
})

it('alternatives share a column, so a fork reads as a fork', () => {
  const g = graph([pipeline([A, R, O], 1), pipeline([A, T, O], 1)])

  expect(nodeAt(g, 'RECRUITER_SCREEN#1').column).toBe(1)
  expect(nodeAt(g, 'TECHNICAL_ROUND#1').column).toBe(1)
  // sharing a column means they need different rows
  expect(nodeAt(g, 'RECRUITER_SCREEN#1').row).not.toBe(nodeAt(g, 'TECHNICAL_ROUND#1').row)
  // and the canonical stage order decides which is on top
  expect(nodeAt(g, 'RECRUITER_SCREEN#1').row).toBeLessThan(nodeAt(g, 'TECHNICAL_ROUND#1').row)
})

it('edge weights count the pipelines that recorded each transition', () => {
  const g = graph(WORKED_EXAMPLE)

  expect(edgeBetween(g, 'APPLIED#1', 'TECHNICAL_ROUND#1').weight).toBe(3)
  expect(edgeBetween(g, 'TECHNICAL_ROUND#1', 'TECHNICAL_ROUND#2').weight).toBe(2)
  expect(edgeBetween(g, 'TECHNICAL_ROUND#1', 'ONSITE#1').weight).toBe(1)
})

it('counts land on the node each pipeline stands at, and an empty stage node survives', () => {
  const g = graph(WORKED_EXAMPLE)

  expect(nodeAt(g, 'TECHNICAL_ROUND#1').count).toBe(1)
  expect(nodeAt(g, 'TECHNICAL_ROUND#2').count).toBe(1)
  expect(nodeAt(g, 'TECHNICAL_ROUND#3').count).toBe(1)
  // nobody is standing at Applied or Onsite, but both are real parts of the shape
  expect(nodeAt(g, 'APPLIED#1').count).toBe(0)
  expect(nodeAt(g, 'ONSITE#1').count).toBe(0)
})

it('terminates on a cycle and flags exactly one edge', () => {
  const g = graph([pipeline([A, T, O], 1), pipeline([A, O, T], 1)])

  expect(g.edges.filter((edge) => edge.outOfOrder)).toHaveLength(1)
})

it('flags the low-weight edge of a cycle, not whichever came first', () => {
  const consensus = [
    pipeline([A, T, O], 1),
    pipeline([A, T, O], 1),
    pipeline([A, T, O], 1),
    pipeline([A, T, O], 1),
  ]
  const outlier = pipeline([A, O, T], 1)
  const g = graph([...consensus, outlier])

  const flagged = g.edges.filter((edge) => edge.outOfOrder)
  expect(flagged).toHaveLength(1)
  // four people walked Technical -> Onsite and one walked Onsite -> Technical, so the single
  // outlier is what gets marked and the consensus ordering lays out the graph
  expect(flagged[0].source).toBe('ONSITE#1')
  expect(flagged[0].target).toBe('TECHNICAL_ROUND#1')
  expect(nodeAt(g, 'TECHNICAL_ROUND#1').column).toBeLessThan(nodeAt(g, 'ONSITE#1').column)
})

it('is identical however the applicants are ordered', () => {
  const forwards = graph(WORKED_EXAMPLE)
  const backwards = graph([...WORKED_EXAMPLE].reverse())

  const shape = (g: ReturnType<typeof graph>) => ({
    nodes: [...g.nodes].sort((a, b) => (a.id < b.id ? -1 : 1)),
    edges: [...g.edges].sort((a, b) => (a.id < b.id ? -1 : 1)),
    columns: g.columns,
  })
  expect(shape(backwards)).toEqual(shape(forwards))
})

it('the cycle tie-break survives a reversed input too', () => {
  const pipelines = [
    pipeline([A, T, O], 1),
    pipeline([A, T, O], 1),
    pipeline([A, T, O], 1),
    pipeline([A, O, T], 1),
  ]
  const forwards = graph(pipelines)
  const backwards = graph([...pipelines].reverse())

  const flagged = (g: ReturnType<typeof graph>) =>
    g.edges.filter((edge) => edge.outOfOrder).map((edge) => edge.id)
  expect(flagged(backwards)).toEqual(flagged(forwards))
})

it('a status nobody holds produces no node, and recording it adds exactly one', () => {
  const active = graph([pipeline([A, T, O], 1)])
  expect(active.nodes.filter((node) => node.kind === 'outcome')).toHaveLength(0)

  const rejected = graph([pipeline([A, T, O], 1, 'REJECTED')])
  const outcomes = rejected.nodes.filter((node) => node.kind === 'outcome')
  expect(outcomes).toHaveLength(1)
  expect(outcomes[0].id).toBe('REJECTED')
  expect(outcomes[0].label).toBe('Rejected')
})

it('pins an outcome to the final column even when its only edge comes from an early stage', () => {
  // ten people rejected after the recruiter screen, one after the onsite. placement asserts
  // nothing about when people fall out - the weights carry that story
  const early = Array.from({ length: 10 }, () => pipeline([A, R, T, O], 1, 'REJECTED'))
  const late = pipeline([A, R, T, O], 3, 'REJECTED')
  const g = graph([...early, late])

  expect(nodeAt(g, 'ONSITE#1').column).toBe(3)
  expect(nodeAt(g, 'REJECTED').column).toBe(4)
  expect(edgeBetween(g, 'RECRUITER_SCREEN#1', 'REJECTED').weight).toBe(10)
  expect(edgeBetween(g, 'ONSITE#1', 'REJECTED').weight).toBe(1)
})

it('outcome nodes share the final column and are ordered by the statuses endpoint', () => {
  const g = graph([
    pipeline([A, T, O], 1, 'REJECTED'),
    pipeline([A, T, O], 1, 'OFFER'),
    pipeline([A, T, O], 1, 'USER_WITHDREW'),
  ])

  const outcomes = g.nodes.filter((node) => node.kind === 'outcome')
  expect(outcomes.every((node) => node.column === g.columns - 1)).toBe(true)
  // USER_WITHDREW, OFFER, REJECTED is the order GET /api/statuses returns them in
  expect([...outcomes].sort((a, b) => a.row - b.row).map((node) => node.id)).toEqual([
    'USER_WITHDREW',
    'OFFER',
    'REJECTED',
  ])
})

// the strongest assertion in the file: it catches double-counting and dropped pipelines at once
it('the badges sum to the number of pipelines, counting each exactly once', () => {
  const pipelines = [
    pipeline([A, T, T, O], 2),
    pipeline([A, T, O], 1),
    pipeline([A, T, T, T, O], 3, 'REJECTED'),
    pipeline([A, R, O], 1, 'OFFER'),
    pipeline([A], 0),
    pipeline([A, T, O], 2, 'USER_WITHDREW'),
  ]
  const g = graph(pipelines)

  expect(g.nodes.reduce((total, node) => total + node.count, 0)).toBe(pipelines.length)
})

it('a terminated pipeline counts at its outcome and never at its stage', () => {
  const g = graph([pipeline([A, T, O], 1), pipeline([A, T, O], 1, 'REJECTED')])

  expect(nodeAt(g, 'TECHNICAL_ROUND#1').count).toBe(1)
  expect(nodeAt(g, 'REJECTED').count).toBe(1)
})

it('a rejected applicant still contributes their recorded rounds to the shape', () => {
  const g = graph([pipeline([A, R, T, O], 1, 'REJECTED')])

  // nobody is active anywhere, but every round they were told about is still a node
  expect(g.nodes.filter((node) => node.kind === 'stage').map((node) => node.id).sort()).toEqual([
    'APPLIED#1',
    'ONSITE#1',
    'RECRUITER_SCREEN#1',
    'TECHNICAL_ROUND#1',
  ])
})

it('handles no pipelines at all', () => {
  const g = graph([])

  expect(g.nodes).toEqual([])
  expect(g.edges).toEqual([])
  expect(g.columns).toBe(0)
})

// nodeHolds is what the roster filters by, so it has to agree with the badge exactly
it('nodeHolds selects exactly the pipelines a badge is counting', () => {
  const pipelines = [
    pipeline([A, T, T, O], 2),
    pipeline([A, T, O], 1),
    pipeline([A, T, T, T, O], 3, 'REJECTED'),
    pipeline([A, R, O], 1, 'OFFER'),
  ]
  const g = graph(pipelines)

  for (const node of g.nodes) {
    expect(
      pipelines.filter((candidate) => nodeHolds(candidate, node)),
      `node ${node.id}`,
    ).toHaveLength(node.count)
  }
})

it('nodeHolds keeps a terminated pipeline off the stage it stopped at', () => {
  const stopped = pipeline([A, T, O], 1, 'REJECTED')
  const g = graph([pipeline([A, T, O], 1), stopped])

  expect(nodeHolds(stopped, nodeAt(g, 'TECHNICAL_ROUND#1'))).toBe(false)
  expect(nodeHolds(stopped, nodeAt(g, 'REJECTED'))).toBe(true)
})
