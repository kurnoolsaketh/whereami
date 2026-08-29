import type { Pipeline, Stage, Status } from '../api/types'
import { enumLabel, labelStages, nodeKey, stageKey } from './stages'
import { isActive, statusLabel } from './status'

// the merged pipeline for one role: every stage ordering anyone recorded, laid over each other,
// with a head count on each node. pure - no React, no network - so the interesting part is
// testable without rendering anything.
//
// the result is a directed graph and may well contain cycles: a role that sends someone back for
// a second behavioral round after a technical one is a real shape, not an error by the applicant
// who wrote it down. only the column ranking needs a DAG, and it makes its own by holding one
// edge of each cycle aside - see backEdge

export interface GraphNode {
  // a stage node's id is `${stage}#${occurrence}`, which is exactly what stageKey() returns for
  // a pipeline standing there. an outcome node's id is the raw status
  id: string
  kind: 'stage' | 'outcome'
  label: string
  count: number
  column: number
  row: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  // how many applicants have made this move: walked from the source to the target, or ended at
  // the source with this outcome. an applicant who was told about the step but has not got there
  // yet is not counted - an edge records what happened, not what was announced
  weight: number
  // weight over the applicants who reached the source node, 0..1
  share: number
  // layout metadata, not a verdict. ranking needs a DAG, so one edge of every cycle is left out
  // of it and this says which - the renderer draws it as a loop rather than along the chain. it
  // is an ordering someone really recorded, drawn exactly like any other
  backEdge: boolean
  // where this edge has to travel to stay visible, and which lane of its band it travels in
  route: EdgeRoute
  lane: number
}

// 'chain' runs to the next column and is drawn straight; 'hop' reaches past it and arcs over the
// nodes in between; 'loop' closes a cycle and arcs under them. decided here rather than in the
// renderer because lane packing needs it - and because two places deriving the same thing from
// the columns is exactly how they drift apart
export type EdgeRoute = 'chain' | 'hop' | 'loop'

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  columns: number
}

// a node plus the key its column sorts on, which is dropped before the graph is returned
interface Ranked extends GraphNode {
  sortKey: [number, number]
}

// the three derived fields are missing here on purpose: none can be computed until every edge
// exists, outcome edges included. share would otherwise put stage edges and outcome edges on two
// different denominators, and a lane cannot be chosen without seeing every arc it might overlap
type Edge = Omit<GraphEdge, 'share' | 'route' | 'lane'>

// `order` is GET /api/stages and `statusOrder` is GET /api/statuses. both are only used to make
// the layout deterministic - which node sits above which - never to decide what exists
export function buildGraph(
  pipelines: Pipeline[],
  order: Stage[],
  statusOrder: Status[] = [],
): Graph {
  // 1. stage nodes. every pipeline contributes whatever its status: a rejected applicant's
  // recorded rounds are still real shape data about how this role runs
  const stageNodes = new Map<string, { stage: Stage; occurrence: number }>()
  for (const pipeline of pipelines) {
    for (const { stage, occurrence } of labelStages(pipeline.stages)) {
      stageNodes.set(nodeKey(stage, occurrence), { stage, occurrence })
    }
  }

  // 2. two edge sets, because layout and display want different things.
  //
  // `announced` is every consecutive pair anyone was told about, walked or not. it exists only to
  // rank the columns: a round nobody has reached yet still belongs to the right of the one before
  // it, and ranking on it is what keeps the layout still while applicants advance rather than
  // reshuffling under them.
  //
  // `drawn` is what the graph actually shows: only transitions somebody has *made*. an edge is a
  // record of a move, so an applicant sitting at Applied with five rounds ahead is on none of them
  const announced = new Map<string, Edge>()
  const drawn = new Map<string, Edge>()
  for (const pipeline of pipelines) {
    const labelled = labelStages(pipeline.stages)
    const here = standingAt(pipeline, labelled.length)
    for (let i = 0; i + 1 < labelled.length; i += 1) {
      const source = nodeKey(labelled[i].stage, labelled[i].occurrence)
      const target = nodeKey(labelled[i + 1].stage, labelled[i + 1].occurrence)
      bump(announced, source, target)
      if (i < here) {
        bump(drawn, source, target)
      }
    }
  }

  // how many applicants ever stood on each node, which is the denominator every edge leaving it
  // is measured against. reaching a node means having walked to it, not having been told about it
  const reached = new Map<string, number>()
  for (const pipeline of pipelines) {
    const labelled = labelStages(pipeline.stages)
    for (let i = 0; i <= standingAt(pipeline, labelled.length); i += 1) {
      const id = nodeKey(labelled[i].stage, labelled[i].occurrence)
      reached.set(id, (reached.get(id) ?? 0) + 1)
    }
  }

  // 3. labels. a stage is numbered iff it has more than one occurrence across the whole node
  // set - the rule labelStages applies inside one pipeline, lifted to the role. so someone
  // whose own pipeline reads plain "Technical Round" appears here under "Technical Round 1"
  const occurrences = new Map<Stage, number>()
  for (const { stage } of stageNodes.values()) {
    occurrences.set(stage, (occurrences.get(stage) ?? 0) + 1)
  }
  const stageNodeLabel = (stage: Stage, occurrence: number): string =>
    occurrences.get(stage) === 1 ? enumLabel(stage) : `${enumLabel(stage)} ${occurrence}`

  // 4. columns for stage nodes: the longest path from the root, with cycles broken first. over
  // the announced edges, so the shape of the role decides the layout rather than how far along it
  // people happen to be today
  const columns = rankStages([...stageNodes.keys()], announced, order, stageNodes)
  const maxStageColumn = Math.max(-1, ...columns.values())

  // 5. outcome nodes, synthesized only now. ranking first is what makes "always last" true:
  // ranked together, one pipeline rejected after the recruiter screen would drag REJECTED into
  // column 2, in the middle of the graph. a status nobody holds produces no node at all
  const held = new Set<Status>()
  for (const pipeline of pipelines) {
    if (!isActive(pipeline)) {
      held.add(pipeline.status)
    }
  }
  for (const pipeline of pipelines) {
    if (!isActive(pipeline)) {
      // ending somewhere IS a move out of it, so an outcome edge is drawn like any other
      bump(drawn, stageKey(pipeline), pipeline.status)
    }
  }

  // 6. counts. an active pipeline counts at the stage it stands on; a terminated one counts at
  // its outcome node and never at its stage. so a badge on a stage reads "active here", and
  // every pipeline is counted exactly once
  const counts = new Map<string, number>()
  for (const pipeline of pipelines) {
    const at = isActive(pipeline) ? stageKey(pipeline) : pipeline.status
    counts.set(at, (counts.get(at) ?? 0) + 1)
  }

  // 7. rows, assigned per column so the layout is reproducible run to run
  const nodes: Ranked[] = [
    ...[...stageNodes.entries()].map(([id, { stage, occurrence }]) => ({
      id,
      kind: 'stage' as const,
      label: stageNodeLabel(stage, occurrence),
      count: counts.get(id) ?? 0,
      column: columns.get(id) ?? 0,
      row: 0,
      sortKey: [rankOf(stage, order), occurrence] as [number, number],
    })),
    ...[...held].map((status) => ({
      id: status,
      kind: 'outcome' as const,
      label: statusLabel(status),
      count: counts.get(status) ?? 0,
      column: maxStageColumn + 1,
      row: 0,
      sortKey: [rankOf(status, statusOrder), 0] as [number, number],
    })),
  ]

  const perColumn = new Map<number, Ranked[]>()
  for (const node of nodes) {
    const bucket = perColumn.get(node.column)
    if (bucket === undefined) {
      perColumn.set(node.column, [node])
    } else {
      bucket.push(node)
    }
  }
  for (const bucket of perColumn.values()) {
    bucket.sort(
      (a, b) => a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1] || compare(a.id, b.id),
    )
    bucket.forEach((node, index) => {
      node.row = index
    })
  }

  // 8. routes and lanes, which need every node's column and every edge at once.
  //
  // ranking marked its cycle-breaks on the announced edges, so carry that across to the drawn
  // ones by id: a drawn edge is always one of the announced pairs, and the two must agree or an
  // edge would be routed along the chain it actually runs backwards against
  for (const edge of drawn.values()) {
    edge.backEdge = announced.get(edge.id)?.backEdge ?? false
  }

  const columnOf = new Map<string, number>(nodes.map((node) => [node.id, node.column]))
  const routeOf = new Map<string, EdgeRoute>()
  for (const edge of drawn.values()) {
    const reach = (columnOf.get(edge.target) ?? 0) - (columnOf.get(edge.source) ?? 0)
    routeOf.set(edge.id, edge.backEdge ? 'loop' : reach > 1 ? 'hop' : 'chain')
  }
  const laneOf = packLanes([...drawn.values()], routeOf, columnOf)

  // 9. shares. an edge is measured against the applicants who reached the node it leaves, so it
  // reads "of the people who got this far, this fraction went that way" rather than "this
  // fraction of everybody".
  //
  // that makes the outgoing edges of a node a real partition, which the global denominator never
  // was: every applicant who reached a node either moved on (one walked edge), ended there (one
  // outcome edge), or is standing on it now (the badge, and no edge). so for every node,
  // sum of outgoing weights + badge = reached. graph.test.ts asserts exactly that
  const share = (weight: number, source: string): number => {
    const total = reached.get(source) ?? 0
    return total === 0 ? 0 : weight / total
  }

  return {
    nodes: nodes.map(({ sortKey: _sortKey, ...node }) => node),
    edges: [...drawn.values()].map((edge) => ({
      ...edge,
      share: share(edge.weight, edge.source),
      route: routeOf.get(edge.id) ?? 'chain',
      lane: laneOf.get(edge.id) ?? 0,
    })),
    columns: nodes.length === 0 ? 0 : Math.max(...nodes.map((node) => node.column)) + 1,
  }
}

// the share as a whole number. the floor stops a drawn edge from rounding to 0, which would
// claim a line nobody walked - one applicant in three hundred is a real applicant
export function sharePercent(edge: GraphEdge): number {
  return Math.max(1, Math.round(edge.share * 100))
}

// what an edge says on the graph. both halves, because neither alone is a claim: 100% of two
// applicants and 100% of two hundred are different statements
export function edgeLabel(edge: GraphEdge): string {
  return `${edge.weight} \u00b7 ${sharePercent(edge)}%`
}

// which pipelines a node's badge is counting. clicking a node filters the roster through this,
// so the filtered list always has exactly as many rows as the badge claims - the same rule
// step 6 counts by, written once so the two cannot drift apart
export function nodeHolds(pipeline: Pipeline, node: GraphNode): boolean {
  return node.kind === 'outcome'
    ? !isActive(pipeline) && pipeline.status === node.id
    : isActive(pipeline) && stageKey(pipeline) === node.id
}

// the index a pipeline is standing on, clamped to its own stage list. the API validates the
// position against the list it is saved with, so this is defensive only
function standingAt(pipeline: Pipeline, length: number): number {
  return Math.max(0, Math.min(pipeline.currentStagePosition, length - 1))
}

function bump(edges: Map<string, Edge>, source: string, target: string): void {
  const id = `${source}->${target}`
  const existing = edges.get(id)
  if (existing === undefined) {
    edges.set(id, { id, source, target, weight: 1, backEdge: false })
  } else {
    existing.weight += 1
  }
}

// arcs are packed by interval-graph colouring. an arc occupies the whole span of columns between
// its endpoints, so two arcs in the same band whose spans overlap must not share a lane or they
// are drawn one on top of the other. sorting by left edge and taking the lowest free lane is the
// standard greedy partition, and it needs every arc at once - which is why lanes are settled here,
// beside the columns they are derived from, rather than in the renderer.
//
// keying a lane on the span's *length* instead is the obvious shortcut and it cannot work: two
// arcs of equal length get the same lane by definition, so a staircase of equal-length hops - and
// that is exactly what consecutive stages produce - collapses onto one line however the constants
// are tuned. hops and loops are packed separately because they are drawn in different bands
function packLanes(
  all: Edge[],
  routeOf: Map<string, EdgeRoute>,
  columnOf: Map<string, number>,
): Map<string, number> {
  const spans = all
    .filter((edge) => routeOf.get(edge.id) !== 'chain')
    .map((edge) => {
      const source = columnOf.get(edge.source) ?? 0
      const target = columnOf.get(edge.target) ?? 0
      return {
        id: edge.id,
        band: routeOf.get(edge.id) as EdgeRoute,
        left: Math.min(source, target),
        right: Math.max(source, target),
      }
    })
    // by left edge, then widest first: the greedy partition's order. the id only breaks the
    // remaining ties, so that the packing is the same however the applicants were sorted
    .sort((a, b) => a.left - b.left || b.right - a.right || compare(a.id, b.id))

  const placed: (typeof spans[number] & { lane: number })[] = []
  const lane = new Map<string, number>()
  for (const span of spans) {
    let chosen = 0
    while (
      placed.some(
        (other) =>
          other.band === span.band &&
          other.lane === chosen &&
          // touching at a single column is not a clash: the two arcs meet that node at opposite
          // handles, so one run ends before the other begins
          Math.min(other.right, span.right) > Math.max(other.left, span.left),
      )
    ) {
      chosen += 1
    }
    placed.push({ ...span, lane: chosen })
    lane.set(span.id, chosen)
  }
  return lane
}

// a stage the enum no longer lists sorts to the end rather than to the front, which is where
// indexOf's -1 would put it
function rankOf(value: string, order: string[]): number {
  const index = order.indexOf(value)
  return index === -1 ? order.length : index
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// depth-first from APPLIED#1 - the backend guarantees every stage list starts with APPLIED, so
// there is exactly one root - marking any edge that reaches a node still on the stack, then a
// longest-path pass over what is left. the graph itself may well be cyclic; it is only the
// ranking that needs a DAG, which is the whole job of the marking
function rankStages(
  ids: string[],
  edges: Map<string, Edge>,
  order: Stage[],
  stageNodes: Map<string, { stage: Stage; occurrence: number }>,
): Map<string, number> {
  const outgoing = new Map<string, Edge[]>()
  for (const edge of edges.values()) {
    const list = outgoing.get(edge.source)
    if (list === undefined) {
      outgoing.set(edge.source, [edge])
    } else {
      list.push(edge)
    }
  }

  // THE TIE-BREAK, and it is load-bearing. without it, which edge of a cycle gets left out of
  // ranking depends on traversal order, which follows the applicants list sorted by userId - so
  // one outlier could outrank a transition eight people recorded, and the whole layout would
  // mirror if somebody renamed themselves. exploring the heaviest edge first means the consensus
  // ordering lays the graph out, every run. both edges are still drawn, and drawn the same
  for (const list of outgoing.values()) {
    list.sort((a, b) => {
      if (a.weight !== b.weight) {
        return b.weight - a.weight
      }
      const nodeA = stageNodes.get(a.target)
      const nodeB = stageNodes.get(b.target)
      if (nodeA === undefined || nodeB === undefined) {
        return compare(a.target, b.target)
      }
      return (
        rankOf(nodeA.stage, order) - rankOf(nodeB.stage, order) ||
        nodeA.occurrence - nodeB.occurrence
      )
    })
  }

  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const colour = new Map<string, number>()

  // iterative, so a long pipeline cannot blow the stack
  const visit = (root: string): void => {
    const stack: { id: string; next: number }[] = [{ id: root, next: 0 }]
    colour.set(root, GRAY)
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]
      const list = outgoing.get(frame.id) ?? []
      if (frame.next >= list.length) {
        colour.set(frame.id, BLACK)
        stack.pop()
        continue
      }
      const edge = list[frame.next]
      frame.next += 1
      const seen = colour.get(edge.target) ?? WHITE
      if (seen === GRAY) {
        // reaches a node still on the stack, so it closes a cycle: hold it out of ranking
        edge.backEdge = true
      } else if (seen === WHITE) {
        colour.set(edge.target, GRAY)
        stack.push({ id: edge.target, next: 0 })
      }
    }
  }

  const root = ids.find((id) => stageNodes.get(id)?.stage === 'APPLIED' && stageNodes.get(id)?.occurrence === 1)
  if (root !== undefined) {
    visit(root)
  }
  // anything the root could not reach still has to be laid out rather than dropped
  for (const id of ids) {
    if ((colour.get(id) ?? WHITE) === WHITE) {
      visit(id)
    }
  }

  // longest path over the acyclic remainder, in topological order
  const ranked = [...edges.values()].filter(
    (edge) => !edge.backEdge && stageNodes.has(edge.source) && stageNodes.has(edge.target),
  )
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]))
  for (const edge of ranked) {
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
  }
  const column = new Map<string, number>(ids.map((id) => [id, 0]))
  const queue = ids.filter((id) => indegree.get(id) === 0)
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const edge of ranked.filter((candidate) => candidate.source === id)) {
      column.set(edge.target, Math.max(column.get(edge.target) ?? 0, (column.get(id) ?? 0) + 1))
      const remaining = (indegree.get(edge.target) ?? 0) - 1
      indegree.set(edge.target, remaining)
      if (remaining === 0) {
        queue.push(edge.target)
      }
    }
  }

  return column
}
