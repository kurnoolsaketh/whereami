import { expect, it } from 'vitest'
import type { Pipeline, Stage, Status } from '../api/types'
import { buildGraph, edgeHolds, edgeLabel, nodeHolds, sharePercent } from './graph'
import { layoutGraph } from './layout'
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

// the placement of a graph, which lives in layout.ts. the two are asserted together here because
// a depth is only meaningful against the edges that produced it
function laid(pipelines: Pipeline[]) {
  return layoutGraph(graph(pipelines))
}

function placedAt(l: ReturnType<typeof laid>, id: string) {
  const found = l.nodes.find((node) => node.id === id)
  expect(found, `no node ${id}`).toBeDefined()
  return found!
}

function rowOf(l: ReturnType<typeof laid>, id: string): number {
  return placedAt(l, id).depth
}

function slotOf(l: ReturnType<typeof laid>, id: string): number {
  return placedAt(l, id).slot
}

// everything about a role that a redraw must reproduce exactly: the nodes, the edges, and every
// decision the layout made about them - which row, which slot, which gutter, which track. sorted
// by id, so the comparison is about the picture and not about the order the arrays came in
function shapeOf(pipelines: Pipeline[]) {
  const l = layoutGraph(graph(pipelines))
  const by = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : 1)
  return {
    rows: l.rows,
    box: l.box,
    nodes: [...l.nodes].sort(by),
    edges: [...l.edges].sort(by),
  }
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

it('depths are the longest path from Applied', () => {
  const l = laid(WORKED_EXAMPLE)

  expect(rowOf(l, 'APPLIED#1')).toBe(0)
  expect(rowOf(l, 'TECHNICAL_ROUND#1')).toBe(1)
  expect(rowOf(l, 'TECHNICAL_ROUND#2')).toBe(2)
  expect(rowOf(l, 'TECHNICAL_ROUND#3')).toBe(3)
  // Bob reaches Onsite from Technical Round 1, but the longest path wins, so Onsite sits below
  // every round anyone recorded rather than beside Bob's second
  expect(rowOf(l, 'ONSITE#1')).toBe(4)
  expect(l.rows).toBe(5)
})

it('alternatives share a depth, so a fork reads as a fork', () => {
  const l = laid([pipeline([A, R, O], 1), pipeline([A, T, O], 1)])

  expect(rowOf(l, 'RECRUITER_SCREEN#1')).toBe(1)
  expect(rowOf(l, 'TECHNICAL_ROUND#1')).toBe(1)
  // sharing a depth means they need different slots
  expect(slotOf(l, 'RECRUITER_SCREEN#1')).not.toBe(slotOf(l, 'TECHNICAL_ROUND#1'))
  // neither is anyone's parent but Applied, so the canonical stage order decides which is left
  expect(slotOf(l, 'RECRUITER_SCREEN#1')).toBeLessThan(slotOf(l, 'TECHNICAL_ROUND#1'))
})

it('a row of one node is centred, and a row of two straddles the centre', () => {
  // the drawing is a band of boxes with a clear gutter down each side, which is what gives an
  // arc somewhere to run that is not through a box. a row hugging the left edge would leave the
  // whole of that room on one side
  const l = laid([pipeline([A, R, O], 1), pipeline([A, T, O], 1)])

  expect(placedAt(l, 'APPLIED#1').x).toBe(0)
  const fork = [placedAt(l, 'RECRUITER_SCREEN#1').x, placedAt(l, 'TECHNICAL_ROUND#1').x]
  expect(fork[0]).toBeLessThan(0)
  expect(fork[0] + fork[1]).toBeCloseTo(0)
})

it('a node sits under its parent, not where the stages endpoint would put it', () => {
  // the crossing case, and the whole reason slots are not just a sort. Recruiter leads to Onsite
  // and Technical to Behavioral, but the endpoint ranks Behavioral before Onsite - so ordering
  // the row by it would put Behavioral on the left, under the branch it does not belong to, and
  // the two branches would swap over each other on the way down
  const l = laid([pipeline([A, R, O], 2), pipeline([A, T, B], 2)])

  expect(slotOf(l, 'RECRUITER_SCREEN#1')).toBe(0)
  expect(slotOf(l, 'TECHNICAL_ROUND#1')).toBe(1)
  expect(slotOf(l, 'ONSITE#1')).toBe(0)
  expect(slotOf(l, 'BEHAVIORAL_ROUND#1')).toBe(1)
})

it('a node with two parents sits under the heavier one', () => {
  // three applicants reach Behavioral from Technical and one from Recruiter, so Behavioral
  // belongs to the Technical branch. under its lighter parent it would share Onsite's key and
  // the endpoint would break the tie the other way round, putting it at slot 0
  const l = laid([
    pipeline([A, T, B], 2),
    pipeline([A, T, B], 2),
    pipeline([A, T, B], 2),
    pipeline([A, R, B], 2),
    pipeline([A, R, O], 2),
  ])

  expect(slotOf(l, 'RECRUITER_SCREEN#1')).toBe(0)
  expect(slotOf(l, 'TECHNICAL_ROUND#1')).toBe(1)
  expect(slotOf(l, 'ONSITE#1')).toBe(0)
  expect(slotOf(l, 'BEHAVIORAL_ROUND#1')).toBe(1)
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
  expect(rowOf(layoutGraph(g), 'ONSITE#1')).toBe(4)
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
  const l = layoutGraph(g)
  expect(rowOf(l, 'TECHNICAL_ROUND#1')).toBeLessThan(rowOf(l, 'ONSITE#1'))
})

it('is identical however the applicants are ordered', () => {
  expect(shapeOf([...WORKED_EXAMPLE].reverse())).toEqual(shapeOf(WORKED_EXAMPLE))
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

it('a cycle terminates, breaks one edge, and lays out top to bottom around it', () => {
  const g = graph(CYCLIC_EXAMPLE)
  const l = laid(CYCLIC_EXAMPLE)

  const broken = g.edges.filter((edge) => edge.backEdge)
  expect(broken).toHaveLength(1)
  expect(broken[0].source).toBe('BEHAVIORAL_ROUND#1')
  expect(broken[0].target).toBe('TECHNICAL_ROUND#1')

  // Behavioral is pinned below Technical 2 by user2, so user1's Applied -> Behavioral spans
  // four rows. that reach is forced by the data, not by which edge ranking happened to break
  expect(rowOf(l, 'APPLIED#1')).toBe(0)
  expect(rowOf(l, 'HIRING_MANAGER_SCREEN#1')).toBe(1)
  expect(rowOf(l, 'TECHNICAL_ROUND#1')).toBe(2)
  expect(rowOf(l, 'TECHNICAL_ROUND#2')).toBe(3)
  expect(rowOf(l, 'BEHAVIORAL_ROUND#1')).toBe(4)
  expect(rowOf(l, 'ONSITE#1')).toBe(5)
  expect(l.rows).toBe(6)
})

it('the cyclic example is identical however the applicants are ordered', () => {
  expect(shapeOf([...CYCLIC_EXAMPLE].reverse())).toEqual(shapeOf(CYCLIC_EXAMPLE))
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

it('pins an outcome to the last row even when its only edge comes from an early stage', () => {
  // ten people rejected after the recruiter screen, one after the onsite. placement asserts
  // nothing about when people fall out - the weights carry that story
  const early = Array.from({ length: 10 }, () => pipeline([A, R, T, O], 1, 'REJECTED'))
  const late = pipeline([A, R, T, O], 3, 'REJECTED')
  const g = graph([...early, late])
  const l = layoutGraph(g)

  expect(rowOf(l, 'ONSITE#1')).toBe(3)
  expect(rowOf(l, 'REJECTED')).toBe(4)
  expect(edgeBetween(g, 'RECRUITER_SCREEN#1', 'REJECTED').weight).toBe(10)
  expect(edgeBetween(g, 'ONSITE#1', 'REJECTED').weight).toBe(1)
})

it('outcome nodes share the last row and are ordered by the statuses endpoint', () => {
  const l = laid([
    pipeline([A, T, O], 1, 'REJECTED'),
    pipeline([A, T, O], 1, 'OFFER'),
    pipeline([A, T, O], 1, 'USER_WITHDREW'),
  ])

  const outcomes = l.nodes.filter((node) => node.kind === 'outcome')
  expect(outcomes.every((node) => node.depth === l.rows - 1)).toBe(true)
  // USER_WITHDREW, OFFER, REJECTED is the order GET /api/statuses returns them in
  expect([...outcomes].sort((a, b) => a.slot - b.slot).map((node) => node.id)).toEqual([
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
  expect(layoutGraph(g).rows).toBe(0)
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

it('an edge label carries the count and nothing else', () => {
  const g = graph(WORKED_EXAMPLE)

  // the chip is a count, not a sentence: the share is what sets the line's thickness, and the
  // legend spells it out in words when the line is clicked
  expect(edgeLabel(edgeBetween(g, 'APPLIED#1', 'TECHNICAL_ROUND#1'))).toBe('3')
  expect(edgeLabel(edgeBetween(g, 'TECHNICAL_ROUND#1', 'TECHNICAL_ROUND#2'))).toBe('2')
  expect(edgeLabel(edgeBetween(g, 'TECHNICAL_ROUND#2', 'TECHNICAL_ROUND#3'))).toBe('1')
})

it('a drawn edge never rounds down to nobody', () => {
  // one applicant in three hundred and one is 0.33%, which Math.round renders "0%" - a line
  // that is drawn, and labelled as though no one walked it
  const crowd = Array.from({ length: 300 }, () => pipeline([A, T, O], 1))
  const g = graph([...crowd, pipeline([A, R, O], 1)])

  // one applicant in three hundred is a real applicant, so the share the legend quotes is
  // floored at 1% rather than rounded away to nothing
  expect(sharePercent(edgeBetween(g, 'APPLIED#1', 'RECRUITER_SCREEN#1'))).toBe(1)
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
