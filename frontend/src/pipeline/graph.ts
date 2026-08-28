import type { Pipeline, Stage, Status } from '../api/types'
import { enumLabel, labelStages, nodeKey, stageKey } from './stages'
import { isActive, statusLabel } from './status'

// the merged pipeline for one role: every stage ordering anyone recorded, laid over each other,
// with a head count on each node. pure - no React, no network - so the interesting part is
// testable without rendering anything

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
  // how many pipelines recorded this transition
  weight: number
  // this edge closed a cycle, so it was excluded from ranking and is drawn marked
  outOfOrder: boolean
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  columns: number
}

// a node plus the key its column sorts on, which is dropped before the graph is returned
interface Ranked extends GraphNode {
  sortKey: [number, number]
}

interface Edge {
  id: string
  source: string
  target: string
  weight: number
  outOfOrder: boolean
}

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

  // 2. stage edges, deduped by source->target with the weight counted
  const edges = new Map<string, Edge>()
  for (const pipeline of pipelines) {
    const labelled = labelStages(pipeline.stages)
    for (let i = 0; i + 1 < labelled.length; i += 1) {
      const source = nodeKey(labelled[i].stage, labelled[i].occurrence)
      const target = nodeKey(labelled[i + 1].stage, labelled[i + 1].occurrence)
      bump(edges, source, target)
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

  // 4. columns for stage nodes: the longest path from the root, with cycles broken first
  const columns = rankStages([...stageNodes.keys()], edges, order, stageNodes)
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
      bump(edges, stageKey(pipeline), pipeline.status)
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

  return {
    nodes: nodes.map(({ sortKey: _sortKey, ...node }) => node),
    edges: [...edges.values()],
    columns: nodes.length === 0 ? 0 : Math.max(...nodes.map((node) => node.column)) + 1,
  }
}

// which pipelines a node's badge is counting. clicking a node filters the roster through this,
// so the filtered list always has exactly as many rows as the badge claims - the same rule
// step 6 counts by, written once so the two cannot drift apart
export function nodeHolds(pipeline: Pipeline, node: GraphNode): boolean {
  return node.kind === 'outcome'
    ? !isActive(pipeline) && pipeline.status === node.id
    : isActive(pipeline) && stageKey(pipeline) === node.id
}

function bump(edges: Map<string, Edge>, source: string, target: string): void {
  const id = `${source}->${target}`
  const existing = edges.get(id)
  if (existing === undefined) {
    edges.set(id, { id, source, target, weight: 1, outOfOrder: false })
  } else {
    existing.weight += 1
  }
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
// there is exactly one root - flagging any edge that reaches a node still on the stack, then a
// longest-path pass over what is left
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

  // THE TIE-BREAK, and it is load-bearing. without it, which edge gets blamed for a cycle
  // depends on traversal order, which follows the applicants list sorted by userId - so one
  // outlier could outrank a transition eight people recorded, and the whole layout would
  // mirror if somebody renamed themselves. exploring the heaviest edge first means the
  // consensus ordering lays out the graph and the outlier is the edge marked, every run
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
        // reaches a node still on the stack, so it closes a cycle
        edge.outOfOrder = true
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
    (edge) => !edge.outOfOrder && stageNodes.has(edge.source) && stageNodes.has(edge.target),
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
