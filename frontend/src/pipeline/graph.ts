import type { Pipeline, Stage, Status } from '../api/types'
import { enumLabel, labelStages, nodeKey, stageKey } from './stages'
import { isActive, statusLabel } from './status'

// the merged pipeline for one role: every stage ordering anyone recorded, laid over each other,
// with a head count on each node. this file is about what the graph *means* - who moved where,
// how many of them, and which pipelines a badge or a line is counting. it holds no pixels and no
// sides; where any of it is drawn is layout.ts's job.
//
// the result is a directed graph and may well contain cycles: a role that sends someone back for
// a second behavioral round after a technical one is a real shape, not an error by the applicant
// who wrote it down. only the depth ranking needs a DAG, and it makes its own by holding one edge
// of each cycle aside - see backEdge

export interface GraphNode {
  // a stage node's id is `${stage}#${occurrence}`, which is exactly what stageKey() returns for
  // a pipeline standing there. an outcome node's id is the raw status
  id: string
  kind: 'stage' | 'outcome'
  label: string
  count: number
  // where this node sorts when nothing else decides: the stages endpoint's order and then the
  // occurrence, or the statuses endpoint's order for an outcome. it means nothing on its own -
  // layout uses it only to break ties, so that the picture cannot depend on how the applicants
  // came back
  sortKey: [number, number]
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
  // this edge closes a cycle: following it reaches a node already on the traversal stack. it is
  // a fact about the shape, not a verdict on the edge - ranking needs a DAG and holds these out
  // of it, and the edge is still drawn exactly like every other one
  backEdge: boolean
}

// what the role view is filtered to: a node's badge, or a line's count
export type Selection = { kind: 'node' | 'edge'; id: string }

export interface Graph {
  nodes: GraphNode[]
  // what the graph shows: only transitions somebody has actually made
  edges: GraphEdge[]
  // every consecutive pair anyone was told about, walked or not, with weight 0 shares. this
  // exists only so layout can rank on it: a round nobody has reached yet still belongs below the
  // one before it, and ranking on what applicants were *told* is what keeps the picture still
  // while they advance rather than reshuffling under them
  announced: GraphEdge[]
}

// the derived fields are missing here on purpose: share cannot be computed until every edge
// exists, outcome edges included, or stage edges and outcome edges would sit on two different
// denominators
type Edge = Omit<GraphEdge, 'share'>

// `order` is GET /api/stages and `statusOrder` is GET /api/statuses. both are only used to make
// the layout deterministic - which node sits beside which - never to decide what exists
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
  // `announced` is every consecutive pair anyone was told about, walked or not. `drawn` is what
  // the graph actually shows: only transitions somebody has *made*, so an applicant sitting at
  // Applied with five rounds ahead is on none of them
  const announced = new Map<string, Edge>()
  for (const pipeline of pipelines) {
    const labelled = labelStages(pipeline.stages)
    for (let i = 0; i + 1 < labelled.length; i += 1) {
      bump(
        announced,
        nodeKey(labelled[i].stage, labelled[i].occurrence),
        nodeKey(labelled[i + 1].stage, labelled[i + 1].occurrence),
      )
    }
  }

  const drawn = new Map<string, Edge>()
  for (const pipeline of pipelines) {
    for (const move of movesOf(pipeline)) {
      bump(drawn, move.source, move.target)
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

  // 4. cycle breaking, over the announced edges. which edge of a cycle is held aside is a fact
  // about the role's shape, so it is settled here rather than during layout - and settled by
  // exploring the heaviest edge first, so that the consensus ordering decides it every run
  markBackEdges([...stageNodes.keys()], announced, order, stageNodes)
  for (const edge of drawn.values()) {
    edge.backEdge = announced.get(edge.id)?.backEdge ?? false
  }

  // 5. outcome nodes. a status nobody holds produces no node at all
  const held = new Set<Status>()
  for (const pipeline of pipelines) {
    if (!isActive(pipeline)) {
      held.add(pipeline.status)
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

  const nodes: GraphNode[] = [
    ...[...stageNodes.entries()].map(([id, { stage, occurrence }]) => ({
      id,
      kind: 'stage' as const,
      label: stageNodeLabel(stage, occurrence),
      count: counts.get(id) ?? 0,
      sortKey: [rankOf(stage, order), occurrence] as [number, number],
    })),
    ...[...held].map((status) => ({
      id: status,
      kind: 'outcome' as const,
      label: statusLabel(status),
      count: counts.get(status) ?? 0,
      sortKey: [rankOf(status, statusOrder), 0] as [number, number],
    })),
  ]

  // 7. shares. an edge is measured against the applicants who reached the node it leaves, so it
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
    nodes,
    edges: [...drawn.values()].map((edge) => ({
      ...edge,
      share: share(edge.weight, edge.source),
    })),
    // an announced pair nobody has walked has no share to speak of; layout only reads the
    // endpoints and the weight, so 0 is honest rather than a placeholder
    announced: [...announced.values()].map((edge) => ({ ...edge, share: 0 })),
  }
}

// the share as a whole number. the floor stops a drawn edge from rounding to 0, which would
// claim a line nobody walked - one applicant in three hundred is a real applicant
export function sharePercent(edge: GraphEdge): number {
  return Math.max(1, Math.round(edge.share * 100))
}

// what an edge says on the graph: the number of applicants who made the move, and nothing else.
// the share is still what sets the line's thickness, and the legend still spells it out in words
// when a line is clicked - but a bare count is a glyph wide instead of nine, which is what lets a
// chip sit on the line it belongs to rather than beside it
export function edgeLabel(edge: GraphEdge): string {
  return `${edge.weight}`
}

// which pipelines a node's badge is counting. clicking a node filters the roster through this,
// so the filtered list always has exactly as many rows as the badge claims - the same rule
// step 6 counts by, written once so the two cannot drift apart
export function nodeHolds(pipeline: Pipeline, node: GraphNode): boolean {
  return node.kind === 'outcome'
    ? !isActive(pipeline) && pipeline.status === node.id
    : isActive(pipeline) && stageKey(pipeline) === node.id
}

// which applicants a line is counting. clicking an edge filters the roster through this, so the
// filtered list always has exactly as many rows as the label claims - the same rule the weights
// are counted by, written once
export function edgeHolds(pipeline: Pipeline, edge: GraphEdge): boolean {
  return movesOf(pipeline).some((move) => edgeId(move.source, move.target) === edge.id)
}

// the index a pipeline is standing on, clamped to its own stage list. the API validates the
// position against the list it is saved with, so this is defensive only
function standingAt(pipeline: Pipeline, length: number): number {
  return Math.max(0, Math.min(pipeline.currentStagePosition, length - 1))
}

// every move one applicant has made: each round they walked out of, and - if their application
// ended - the outcome they left their last round for. counting these is what builds the edges,
// and edgeHolds asks the same question of one pipeline, so a filtered roster cannot disagree
// with the number on the line the way two separate rules eventually would
function movesOf(pipeline: Pipeline): { source: string; target: string }[] {
  const labelled = labelStages(pipeline.stages)
  const here = standingAt(pipeline, labelled.length)
  const moves = labelled.slice(0, here).map((at, i) => ({
    source: nodeKey(at.stage, at.occurrence),
    target: nodeKey(labelled[i + 1].stage, labelled[i + 1].occurrence),
  }))

  return isActive(pipeline)
    ? moves
    : [...moves, { source: stageKey(pipeline), target: pipeline.status }]
}

// the id format for an edge, defined once so bump and edgeHolds cannot format it differently -
// the same reason nodeKey exists for nodes
function edgeId(source: string, target: string): string {
  return `${source}->${target}`
}

function bump(edges: Map<string, Edge>, source: string, target: string): void {
  const id = edgeId(source, target)
  const existing = edges.get(id)
  if (existing === undefined) {
    edges.set(id, { id, source, target, weight: 1, backEdge: false })
  } else {
    existing.weight += 1
  }
}

// a stage the enum no longer lists sorts to the end rather than to the front, which is where
// indexOf's -1 would put it
export function rankOf(value: string, order: string[]): number {
  const index = order.indexOf(value)
  return index === -1 ? order.length : index
}

export function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// depth-first from APPLIED#1 - the backend guarantees every stage list starts with APPLIED, so
// there is exactly one root - marking any edge that reaches a node still on the stack. the graph
// itself may well be cyclic; it is only the ranking that needs a DAG, which is the whole job of
// this marking
function markBackEdges(
  ids: string[],
  edges: Map<string, Edge>,
  order: Stage[],
  stageNodes: Map<string, { stage: Stage; occurrence: number }>,
): void {
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
  // flip if somebody renamed themselves. exploring the heaviest edge first means the consensus
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
        edge.backEdge = true
      } else if (seen === WHITE) {
        colour.set(edge.target, GRAY)
        stack.push({ id: edge.target, next: 0 })
      }
    }
  }

  const root = ids.find(
    (id) => stageNodes.get(id)?.stage === 'APPLIED' && stageNodes.get(id)?.occurrence === 1,
  )
  if (root !== undefined) {
    visit(root)
  }
  // anything the root could not reach still has to be laid out rather than dropped
  for (const id of ids) {
    if ((colour.get(id) ?? WHITE) === WHITE) {
      visit(id)
    }
  }
}
