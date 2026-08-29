import { expect, it } from 'vitest'
import type { Pipeline, Stage, Status } from '../api/types'
import { buildGraph, edgeHolds, edgeLabel, nodeHolds } from './graph'
import { labelStages, nodeKey } from './stages'

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
const H = 'HIRING_MANAGER_SCREEN'
const T = 'TECHNICAL_ROUND'
const B = 'BEHAVIORAL_ROUND'
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
// none of them has reached an onsite, so no edge into Onsite exists yet - an edge is a move
// somebody made, and being told about a round is not making it
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

it('edge weights count the applicants who made each move', () => {
  const g = graph(WORKED_EXAMPLE)

  expect(edgeBetween(g, 'APPLIED#1', 'TECHNICAL_ROUND#1').weight).toBe(3)
  expect(edgeBetween(g, 'TECHNICAL_ROUND#1', 'TECHNICAL_ROUND#2').weight).toBe(2)
  expect(edgeBetween(g, 'TECHNICAL_ROUND#2', 'TECHNICAL_ROUND#3').weight).toBe(1)
})

it('a step nobody has taken yet is not an edge, though its rounds are still nodes', () => {
  const g = graph(WORKED_EXAMPLE)

  // Bob was told about an onsite after his technical round and has not got there, and neither
  // has anyone else, so nothing is drawn into Onsite
  expect(g.edges.some((edge) => edge.target === 'ONSITE#1')).toBe(false)
  // the round itself is still part of the role's shape, and still laid out to the right
  expect(nodeAt(g, 'ONSITE#1').column).toBe(4)
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

it('terminates on a cycle and breaks exactly one edge for ranking', () => {
  const g = graph([pipeline([A, T, O], 2), pipeline([A, O, T], 2)])

  expect(g.edges.filter((edge) => edge.backEdge)).toHaveLength(1)
})

it('breaks the low-weight edge of a cycle, not whichever came first', () => {
  const consensus = [
    pipeline([A, T, O], 2),
    pipeline([A, T, O], 2),
    pipeline([A, T, O], 2),
    pipeline([A, T, O], 2),
  ]
  const outlier = pipeline([A, O, T], 2)
  const g = graph([...consensus, outlier])

  const broken = g.edges.filter((edge) => edge.backEdge)
  expect(broken).toHaveLength(1)
  // four people walked Technical -> Onsite and one walked Onsite -> Technical. both orderings
  // are real and both are drawn the same; the choice is only about which one gets to lay the
  // graph out, and the consensus wins it
  expect(broken[0].source).toBe('ONSITE#1')
  expect(broken[0].target).toBe('TECHNICAL_ROUND#1')
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
    pipeline([A, T, O], 2),
    pipeline([A, T, O], 2),
    pipeline([A, T, O], 2),
    pipeline([A, O, T], 2),
  ]
  const forwards = graph(pipelines)
  const backwards = graph([...pipelines].reverse())

  const broken = (g: ReturnType<typeof graph>) =>
    g.edges.filter((edge) => edge.backEdge).map((edge) => edge.id)
  expect(broken(backwards)).toEqual(broken(forwards))
})

// user1: Applied -> Behavioral -> Technical -> Onsite
// user2: Applied -> HM Screen -> Technical -> Technical -> Behavioral -> Onsite
// user1's single technical round merges with user2's *first* one, and both behavioral rounds are
// one node. that merge is what closes the cycle Behavioral -> Technical 1 -> Technical 2 ->
// Behavioral, which is a real thing a role can do and not an error by either applicant
const CYCLIC_EXAMPLE = [pipeline([A, B, T, O], 2), pipeline([A, H, T, T, B, O], 3)]

it('a cycle terminates, breaks one edge, and lays out left to right around it', () => {
  const g = graph(CYCLIC_EXAMPLE)

  const broken = g.edges.filter((edge) => edge.backEdge)
  expect(broken).toHaveLength(1)
  expect(broken[0].source).toBe('BEHAVIORAL_ROUND#1')
  expect(broken[0].target).toBe('TECHNICAL_ROUND#1')

  // Behavioral is pinned right of Technical 2 by user2, so user1's Applied -> Behavioral spans
  // four columns. that hop is forced by the data, not by which edge ranking happened to break
  expect(nodeAt(g, 'APPLIED#1').column).toBe(0)
  expect(nodeAt(g, 'HIRING_MANAGER_SCREEN#1').column).toBe(1)
  expect(nodeAt(g, 'TECHNICAL_ROUND#1').column).toBe(2)
  expect(nodeAt(g, 'TECHNICAL_ROUND#2').column).toBe(3)
  expect(nodeAt(g, 'BEHAVIORAL_ROUND#1').column).toBe(4)
  expect(nodeAt(g, 'ONSITE#1').column).toBe(5)
  expect(g.columns).toBe(6)
})

it('the cyclic example is identical however the applicants are ordered', () => {
  const shape = (pipelines: Pipeline[]) => {
    const g = graph(pipelines)
    return {
      nodes: [...g.nodes].sort((a, b) => (a.id < b.id ? -1 : 1)),
      edges: [...g.edges].sort((a, b) => (a.id < b.id ? -1 : 1)),
      columns: g.columns,
    }
  }

  expect(shape([...CYCLIC_EXAMPLE].reverse())).toEqual(shape(CYCLIC_EXAMPLE))
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

// how many applicants ever stood on a node - the denominator every edge leaving it is measured
// against. computed here from the pipelines so the assertions below are checking graph.ts rather
// than agreeing with it
function reachedCount(pipelines: Pipeline[], id: string): number {
  return pipelines.filter((pipeline) => {
    const labelled = labelStages(pipeline.stages)
    return labelled
      .slice(0, pipeline.currentStagePosition + 1)
      .some((at) => nodeKey(at.stage, at.occurrence) === id)
  }).length
}

it('a share is measured against the applicants who reached the node it leaves', () => {
  // three applied; two went on to a technical round and one to a recruiter screen. of the two at
  // the technical round, one was rejected there
  const g = graph([
    pipeline([A, T, O], 1),
    pipeline([A, T, O], 1, 'REJECTED'),
    pipeline([A, R, O], 1),
  ])

  // everybody reached Applied, so its edges are shares of all three
  expect(edgeBetween(g, 'APPLIED#1', 'TECHNICAL_ROUND#1').weight).toBe(2)
  expect(edgeBetween(g, 'APPLIED#1', 'TECHNICAL_ROUND#1').share).toBeCloseTo(2 / 3)
  expect(edgeBetween(g, 'APPLIED#1', 'RECRUITER_SCREEN#1').share).toBeCloseTo(1 / 3)
  // but only two reached the technical round, so being rejected there is half of them - not the
  // third of the role it would be on a global denominator
  expect(edgeBetween(g, 'TECHNICAL_ROUND#1', 'REJECTED').share).toBeCloseTo(1 / 2)
})

it('every share is its weight over the applicants who reached its source', () => {
  const pipelines = [
    pipeline([A, T, T, O], 2),
    pipeline([A, T, O], 1),
    pipeline([A, T, T, T, O], 3, 'REJECTED'),
    pipeline([A, R, O], 1, 'OFFER'),
    pipeline([A], 0),
  ]
  const g = graph(pipelines)

  expect(g.edges.length).toBeGreaterThan(0)
  for (const edge of g.edges) {
    const reached = reachedCount(pipelines, edge.source)
    expect(edge.weight, edge.id).toBeLessThanOrEqual(reached)
    expect(edge.share, edge.id).toBeCloseTo(edge.weight / reached)
    expect(edge.share, edge.id).toBeGreaterThan(0)
    expect(edge.share, edge.id).toBeLessThanOrEqual(1)
  }
})

// the strongest assertion about the new semantics, and the one that makes them worth having:
// everyone who reached a node either moved on, ended there, or is standing on it. so the edges
// leaving a node and its badge account for every applicant who ever got there, exactly once
it('outgoing weights plus the badge account for everyone who reached a node', () => {
  const pipelines = [
    pipeline([A, T, T, O], 2),
    pipeline([A, T, O], 1),
    pipeline([A, T, T, T, O], 3, 'REJECTED'),
    pipeline([A, R, O], 1, 'OFFER'),
    pipeline([A], 0),
    pipeline([A, T, O], 2, 'USER_WITHDREW'),
  ]
  const g = graph(pipelines)

  for (const node of g.nodes.filter((candidate) => candidate.kind === 'stage')) {
    const out = g.edges
      .filter((edge) => edge.source === node.id)
      .reduce((total, edge) => total + edge.weight, 0)
    expect(out + node.count, `node ${node.id}`).toBe(reachedCount(pipelines, node.id))
  }
})

it('an edge label carries both the count and the share', () => {
  const g = graph(WORKED_EXAMPLE)

  // all three reached Applied and all three moved on to a technical round
  expect(edgeLabel(edgeBetween(g, 'APPLIED#1', 'TECHNICAL_ROUND#1'))).toBe('3 \u00b7 100%')
  // three reached the first technical round and two of them went on to a second
  expect(edgeLabel(edgeBetween(g, 'TECHNICAL_ROUND#1', 'TECHNICAL_ROUND#2'))).toBe('2 \u00b7 67%')
  // two reached the second and one of them went on to a third
  expect(edgeLabel(edgeBetween(g, 'TECHNICAL_ROUND#2', 'TECHNICAL_ROUND#3'))).toBe('1 \u00b7 50%')
})

it('a drawn edge never rounds down to nobody', () => {
  // one applicant in three hundred and one is 0.33%, which Math.round renders "0%" - a line
  // that is drawn, and labelled as though no one walked it
  const crowd = Array.from({ length: 300 }, () => pipeline([A, T, O], 1))
  const g = graph([...crowd, pipeline([A, R, O], 1)])

  expect(edgeLabel(edgeBetween(g, 'APPLIED#1', 'RECRUITER_SCREEN#1'))).toBe('1 \u00b7 1%')
})

// arcs are laid out by interval-graph colouring, and this is the property that has to hold: two
// arcs in the same band whose column spans overlap must never share a lane, or they are drawn one
// on top of the other. asserted as an invariant rather than on fixed numbers, because the numbers
// are exactly what a future layout change is allowed to move
function arcsOverlapInALane(g: ReturnType<typeof graph>): string[] {
  const columnOf = new Map(g.nodes.map((node) => [node.id, node.column]))
  const arcs = g.edges
    .filter((edge) => edge.route !== 'chain')
    .map((edge) => {
      const a = columnOf.get(edge.source) ?? 0
      const b = columnOf.get(edge.target) ?? 0
      return { edge, left: Math.min(a, b), right: Math.max(a, b) }
    })

  const clashes: string[] = []
  for (let i = 0; i < arcs.length; i += 1) {
    for (let j = i + 1; j < arcs.length; j += 1) {
      const [a, b] = [arcs[i], arcs[j]]
      const overlaps = Math.min(a.right, b.right) > Math.max(a.left, b.left)
      if (a.edge.route === b.edge.route && a.edge.lane === b.edge.lane && overlaps) {
        clashes.push(`${a.edge.id} and ${b.edge.id} share lane ${a.edge.lane}`)
      }
    }
  }
  return clashes
}

it('a chain edge takes no lane, a cycle edge loops, a long reach hops', () => {
  const g = graph(CYCLIC_EXAMPLE)

  expect(edgeBetween(g, 'APPLIED#1', 'HIRING_MANAGER_SCREEN#1').route).toBe('chain')
  // Behavioral sits four columns right of Applied, so user1's second step has to reach over
  expect(edgeBetween(g, 'APPLIED#1', 'BEHAVIORAL_ROUND#1').route).toBe('hop')
  expect(edgeBetween(g, 'BEHAVIORAL_ROUND#1', 'TECHNICAL_ROUND#1').route).toBe('loop')
  for (const edge of g.edges.filter((candidate) => candidate.route === 'chain')) {
    expect(edge.lane, edge.id).toBe(0)
  }
})

it('two arcs of the SAME length that overlap get different lanes', () => {
  // the case a length-keyed lane cannot express: Technical 1 -> Onsite and Technical 2 -> Rejected
  // both reach three columns, so keying on the reach puts them on one line even though they
  // overlap for most of it. staggered, not nested - which is what consecutive stages produce
  const g = graph([
    // walked all the way to the onsite, so Technical 1 -> Onsite is a move somebody made
    pipeline([A, B, T, O], 3),
    pipeline([A, H, T, T, B, O], 3),
    pipeline([A, H, T, T, B, O], 3, 'REJECTED'),
  ])

  const first = edgeBetween(g, 'TECHNICAL_ROUND#1', 'ONSITE#1')
  const second = edgeBetween(g, 'TECHNICAL_ROUND#2', 'REJECTED')
  expect(first.route).toBe('hop')
  expect(second.route).toBe('hop')
  expect(first.lane).not.toBe(second.lane)
  expect(arcsOverlapInALane(g)).toEqual([])
})

it('no two overlapping arcs ever share a lane, across a spread of roles', () => {
  const roles = [
    CYCLIC_EXAMPLE,
    WORKED_EXAMPLE,
    // a fan of outcomes leaving different rounds for the same final column
    [
      pipeline([A, R, T, O], 1, 'REJECTED'),
      pipeline([A, R, T, O], 2, 'REJECTED'),
      pipeline([A, R, T, O], 3, 'OFFER'),
      pipeline([A, R, T, O], 0, 'USER_WITHDREW'),
    ],
    // a staircase of equal-length hops, the shape that defeats a length-keyed lane. everyone is
    // walked to the end of their own list, so every announced step is also a move made
    [
      pipeline([A, R, O], 2),
      pipeline([A, R, H, T, B, O], 5),
      pipeline([A, H, O], 2),
      pipeline([A, R, H, T, O], 4),
    ],
  ]

  let hops = 0
  for (const pipelines of roles) {
    const g = graph(pipelines)
    hops += g.edges.filter((edge) => edge.route === 'hop').length
    expect(arcsOverlapInALane(g), JSON.stringify(pipelines)).toEqual([])
  }

  // not every role has an arc - a role everyone walked in the same order is all chain - but the
  // spread has to contain some, or this asserts nothing at all
  expect(hops).toBeGreaterThan(0)
})

it('lanes are packed from the inside out, so a lone arc hugs the chain', () => {
  const g = graph([pipeline([A, R, T, O], 3), pipeline([A, O, R, T], 3)])
  const hops = g.edges.filter((edge) => edge.route === 'hop')

  expect(hops.length).toBeGreaterThan(0)
  expect(Math.min(...hops.map((edge) => edge.lane))).toBe(0)
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

// edgeHolds is what the roster filters by when a line is clicked, so like nodeHolds it has to
// agree with the number on that line exactly
it('edgeHolds selects exactly the applicants a line is counting', () => {
  const pipelines = [
    pipeline([A, T, T, O], 2),
    pipeline([A, T, O], 1),
    pipeline([A, T, T, T, O], 3, 'REJECTED'),
    pipeline([A, R, O], 1, 'OFFER'),
    pipeline([A], 0),
    pipeline([A, T, O], 2, 'USER_WITHDREW'),
  ]
  const g = graph(pipelines)

  expect(g.edges.length).toBeGreaterThan(0)
  for (const edge of g.edges) {
    expect(
      pipelines.filter((candidate) => edgeHolds(candidate, edge)),
      `edge ${edge.id}`,
    ).toHaveLength(edge.weight)
  }
})

it('edgeHolds keeps out an applicant who was told about the step but has not taken it', () => {
  // both were told about an onsite after the technical round; only the second has walked it
  const waiting = pipeline([A, T, O], 1)
  const walked = pipeline([A, T, O], 2)
  const g = graph([waiting, walked])

  const step = edgeBetween(g, 'TECHNICAL_ROUND#1', 'ONSITE#1')
  expect(edgeHolds(walked, step)).toBe(true)
  expect(edgeHolds(waiting, step)).toBe(false)
  expect(step.weight).toBe(1)
})

it('edgeHolds puts a terminated applicant on its outcome edge, not on the step ahead', () => {
  const stopped = pipeline([A, T, O], 1, 'REJECTED')
  const g = graph([pipeline([A, T, O], 2), stopped])

  expect(edgeHolds(stopped, edgeBetween(g, 'TECHNICAL_ROUND#1', 'REJECTED'))).toBe(true)
  expect(edgeHolds(stopped, edgeBetween(g, 'TECHNICAL_ROUND#1', 'ONSITE#1'))).toBe(false)
})

it('nodeHolds keeps a terminated pipeline off the stage it stopped at', () => {
  const stopped = pipeline([A, T, O], 1, 'REJECTED')
  const g = graph([pipeline([A, T, O], 1), stopped])

  expect(nodeHolds(stopped, nodeAt(g, 'TECHNICAL_ROUND#1'))).toBe(false)
  expect(nodeHolds(stopped, nodeAt(g, 'REJECTED'))).toBe(true)
})
