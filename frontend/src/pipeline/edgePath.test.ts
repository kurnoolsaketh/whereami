import { expect, it } from 'vitest'
import type { Pipeline, Stage, Status } from '../api/types'
import { buildGraph, type GraphEdge, type GraphNode } from './graph'
import {
  pathFrom,
  portPoint,
  segmentsOf,
  trackOf,
  waypoints,
  type Layout,
  type Point,
  type Segment,
} from './edgePath'

// the property this file exists for: no two edges are ever drawn along the same line. they may
// cross - a merged pipeline really does have branches that pass over each other, and a crossing
// reads as one - but two lines lying on top of each other read as one line, and the count on it
// belongs to nobody.
//
// it is asserted over the real geometry rather than over lanes and ports, because those are only
// a promise about the geometry: the whole failure this catches is the two drifting apart

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

// the same numbers the renderer lays out with. `slotBand` is past the widest node a slot holds,
// which is what keeps a gutter clear of the boxes beside it
const LAYOUT: Layout = {
  slotPitch: 340,
  nodeHeight: 34,
  slotBand: 240,
  gutters: { left: 60, right: 60 },
  rowTop: Array.from({ length: 12 }, (_row, depth) => depth * 96),
}

// nodes are as wide as their labels, which is what makes this worth testing: a chain edge between
// two nodes of different widths does not run straight down, it jogs, and a jog needs a track like
// anything else
function boxOf(node: GraphNode) {
  return {
    x: node.slot * LAYOUT.slotPitch,
    y: LAYOUT.rowTop[node.depth] ?? 0,
    width: Math.min(LAYOUT.slotBand - 20, 40 + node.label.length * 8),
    height: LAYOUT.nodeHeight,
  }
}

// where React Flow puts the handle an edge of this route leaves or arrives by: the middle of the
// border it meets. the port then slides it along that border
function handleOf(node: GraphNode, route: GraphEdge['route'], end: 'source' | 'target'): Point {
  const box = boxOf(node)
  if (route === 'chain') {
    return { x: box.x + box.width / 2, y: end === 'source' ? box.y + box.height : box.y }
  }
  const x = route === 'hop' ? box.x + box.width : box.x
  return { x, y: box.y + box.height / 2 }
}

interface Leg extends Segment {
  edge: string
}

function legsOf(graph: ReturnType<typeof buildGraph>): Leg[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  return graph.edges.flatMap((edge) => {
    const source = nodes.get(edge.source)
    const target = nodes.get(edge.target)
    expect(source, `no node ${edge.source}`).toBeDefined()
    expect(target, `no node ${edge.target}`).toBeDefined()

    const from = portPoint(handleOf(source!, edge.route, 'source'), edge.route, edge.sourcePort)
    const to = portPoint(handleOf(target!, edge.route, 'target'), edge.route, edge.targetPort)
    const track = trackOf(edge, source!, target!, LAYOUT)
    return segmentsOf(waypoints(edge, from, to, track)).map((leg) => ({ ...leg, edge: edge.id }))
  })
}

// two legs on the same axis within this many pixels of each other are one line to a reader, so
// the property is asserted with room to spare rather than on exact equality
const TOO_CLOSE = 3

function sharedLines(graph: ReturnType<typeof buildGraph>): string[] {
  const legs = legsOf(graph)
  const clashes: string[] = []
  for (let i = 0; i < legs.length; i += 1) {
    for (let j = i + 1; j < legs.length; j += 1) {
      const [a, b] = [legs[i], legs[j]]
      if (a.edge === b.edge || a.axis !== b.axis || Math.abs(a.at - b.at) >= TOO_CLOSE) {
        continue
      }
      // meeting at a point is not sharing a line: one run ends where the other begins
      const overlap = Math.min(a.to, b.to) - Math.max(a.from, b.from)
      if (overlap > 0) {
        clashes.push(
          `${a.edge} and ${b.edge} share ${Math.round(overlap)}px of ${a.axis} line ${Math.round(a.at)}`,
        )
      }
    }
  }
  return clashes
}

// every shape the role view can produce, and the ones that used to fail: a node with several
// edges leaving it, several arriving, arcs reaching past rows, and cycles
const ROLES: { name: string; pipelines: Pipeline[] }[] = [
  {
    name: 'one node with three edges leaving it',
    pipelines: [
      pipeline([A, T, O], 1),
      pipeline([A, T, B], 1),
      pipeline([A, T, O], 1, 'REJECTED'),
      pipeline([A, T, O], 2),
    ],
  },
  {
    name: 'several outcomes converging on one row',
    pipelines: [
      pipeline([A, R, T, O], 1, 'REJECTED'),
      pipeline([A, R, T, O], 2, 'REJECTED'),
      pipeline([A, R, T, O], 3, 'OFFER'),
      pipeline([A, R, T, O], 0, 'USER_WITHDREW'),
      pipeline([A, R, T, O], 2, 'USER_WITHDREW'),
    ],
  },
  {
    name: 'a cycle, so an edge runs back up the left',
    pipelines: [
      pipeline([A, H, T, B, O], 4),
      pipeline([A, B, T, O], 3),
      pipeline([A, H, T, B, O], 2),
    ],
  },
  {
    name: 'a staircase of equal-length hops',
    pipelines: [
      pipeline([A, R, O], 2),
      pipeline([A, R, H, O], 3),
      pipeline([A, R, H, T, O], 4),
      pipeline([A, R, H, T, B, O], 5),
    ],
  },
  {
    name: 'forks that would cross if a node did not sit under its parent',
    pipelines: [pipeline([A, R, O], 2), pipeline([A, T, B], 2), pipeline([A, H, B], 2)],
  },
  {
    name: 'the busy one: twelve orderings, three of them contradicting each other',
    pipelines: [
      pipeline([A, R, H, T, O], 3),
      pipeline([A, R, H, T, O], 4, 'OFFER'),
      pipeline([A, R, T, T, O], 2),
      pipeline([A, T, B, O], 2),
      pipeline([A, B, T, O], 2),
      pipeline([A, H, R, T, O], 3),
      pipeline([A, R, H, T, B, O], 4),
      pipeline([A, T, T, T, O], 3, 'REJECTED'),
      pipeline([A, R, O], 1, 'REJECTED'),
      pipeline([A, R, H, B, T, O], 5),
      pipeline([A, T, R, H, O], 1),
      pipeline([A, B, O], 1, 'USER_WITHDREW'),
      pipeline([A, R, T, B, T, O], 4),
      pipeline([A, R, H, T, O], 0),
    ],
  },
]

for (const role of ROLES) {
  it(`draws no two edges along one line: ${role.name}`, () => {
    const graph = buildGraph(role.pipelines, STAGES, STATUSES)
    expect(graph.edges.length).toBeGreaterThan(0)
    expect(sharedLines(graph)).toEqual([])
  })
}

it('is the same however the applicants are ordered', () => {
  const { pipelines } = ROLES[ROLES.length - 1]
  // the legs are sorted first: `buildGraph` returns its edges in the order the applicants
  // happened to record them, which is what every other determinism test in the project allows
  // for too. what has to be identical is where the lines are, not which one was built first
  const drawn = (list: Pipeline[]) =>
    [...legsOf(buildGraph(list, STAGES, STATUSES))].sort((a, b) =>
      a.edge < b.edge ? -1 : a.edge > b.edge ? 1 : a.at - b.at || a.from - b.from,
    )

  expect(drawn([...pipelines].reverse())).toEqual(drawn(pipelines))
})

it('gives every edge on one border its own port', () => {
  const graph = buildGraph(ROLES[ROLES.length - 1].pipelines, STAGES, STATUSES)

  const taken = new Set<string>()
  for (const edge of graph.edges) {
    // a border is identified by the node and the route, which is what decides the side
    for (const [node, port, end] of [
      [edge.source, edge.sourcePort, 'source'],
      [edge.target, edge.targetPort, 'target'],
    ] as const) {
      const border = `${node}|${edge.route}|${edge.route === 'chain' ? end : 'side'}`
      const key = `${border}|${port}`
      expect(taken.has(key), `${key} taken twice`).toBe(false)
      taken.add(key)
    }
  }
})

it('runs an edge straight down when its two ports line up', () => {
  // one applicant, so every node has exactly one edge and every port sits at the border's middle.
  // the two nodes are different widths, so the ports are not above each other and it does jog
  const graph = buildGraph([pipeline([A, R, O], 2)], STAGES, STATUSES)
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  const edge = graph.edges[0]
  const from = portPoint(handleOf(nodes.get(edge.source)!, edge.route, 'source'), edge.route, 0)

  expect(waypoints(edge, from, from, 0)).toEqual([from, from])
  expect(pathFrom([from, from], 6)).toBe(`M ${from.x},${from.y} L ${from.x},${from.y}`)
})
