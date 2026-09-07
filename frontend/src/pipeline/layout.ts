import { compare, type Graph, type GraphEdge, type GraphNode } from './graph'

// where the graph goes. pure - no React, no DOM, no measurement - so the renderer and anything
// else that wants the same picture compute identical numbers.
//
// the drawing is a central band of node boxes with a clear gutter down each side. an edge is
// straight whenever a straight line between its two nodes would miss every other box; when it
// would not, it leaves the band entirely, runs down a track in one of the gutters, and comes
// back. a curve never threads between two boxes on a row.
//
// this file owns the metrics as well as the decisions, which is a deliberate departure from
// "layout is indices, edgePath is pixels": deciding where an edge attaches means asking which
// way it is about to travel, and that is a question about points. so rows, slots, gutters and
// tracks are decided here and handed over already in pixels, and edgePath.ts is left with the
// one job of turning them into a path

export interface Point {
  x: number
  y: number
}

// every box is the same size, sized to the longest label in this graph. that is what lets the
// whole layout be arithmetic: nothing is measured, so nothing races a render
export interface Box {
  w: number
  h: number
}

export interface PlacedNode extends GraphNode {
  // distance from Applied, read downward, and this node's place across the row of nodes at that
  // distance. the pair is the whole of the placement; x and y follow from it
  depth: number
  slot: number
  // the centre of the box
  x: number
  y: number
}

// 'straight' is the default and the preferred one: a line from one border to the other. 'curve'
// is what an edge falls back to when that line would cut through a box - out of the band, down a
// track, back in. 'bow' is the single exception to preferring straight: where two neighbouring
// rounds have an edge each way, both would want the same line, so both bend a little to opposite
// sides and enclose a thin lens between them
export type EdgeShape = 'straight' | 'curve' | 'bow'

export interface RoutedEdge extends GraphEdge {
  shape: EdgeShape
  // curve only: -1 for the left gutter, +1 for the right, and which track of it. track 0 is
  // nearest the band. `trackX` is the x its straight run travels on
  side: -1 | 0 | 1
  track: number
  trackX: number
  // bow only: which way this half of the pair bends
  bowDir: -1 | 0 | 1
  // where it leaves and where it arrives, on the two borders
  from: Point
  to: Point
  // curve only: where the two S-bends meet the straight run. equal when the arc is short enough
  // that the run vanishes and the bends merge into a single smooth bow
  runFrom: Point
  runTo: Point
}

export interface Layout {
  nodes: PlacedNode[]
  edges: RoutedEdge[]
  box: Box
  rows: number
  // everything the picture occupies, gutters included, before any padding
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

// ---------------------------------------------------------------------------
// metrics. every one of these is a starting value meant to be tuned against the fixture page
// ---------------------------------------------------------------------------

// how wide a character is at the node font, and the padding either side of a label. estimated
// from the glyph count rather than measured, because a measurement would have to come back from
// the DOM and the layout would then race the render
const GLYPH = 7.2
const LABEL_PAD = 28
// the room a count badge and its gap take on the right of a label
const COUNT_ROOM = 30
const BOX_MIN = 104
const BOX_MAX = 232
export const BOX_HEIGHT = 38

// the air between one row of boxes and the next, and between two boxes on one row
const ROW_GAP = 56
const SLOT_GAP = 32

// the first track's distance from the edge of the band, and the distance between two tracks
const TRACK_START = 30
const TRACK_PITCH = 24

// how far a straight edge has to miss a box by before it counts as clear
const CLEARANCE = 10

// how far each half of a two-way pair bends away from the line they would share. edgePath
// builds the curve from the same number, so the ports and the bend agree about which side it
// opens on
export const BOW = 16

// how much of an arc's vertical travel each S-bend takes before the straight run begins. it
// scales with how far out the track is, because a bend that drops 36px while reaching 160px
// sideways is not a bend at all - it is a right angle with the corner rounded off
const BEND_MIN = 22
const BEND_REACH = 0.7

// the least distance between two attachments on one node's perimeter: an arrowhead's width at
// the thickest stroke, so two lines arriving side by side never share a point
const PORT_GAP = 17

// ---------------------------------------------------------------------------

export function layoutGraph(graph: Graph): Layout {
  const box = boxOf(graph.nodes)
  const depthOf = rankRows(graph)
  const placed = place(graph.nodes, graph.edges, graph.announced, depthOf, box)
  const at = new Map(placed.map((node) => [node.id, node]))

  // 1. shape. the test is the centre-to-centre line, not the port-to-port one: the two lie along
  // each other, and using the centres means the answer does not depend on the ports, which are
  // decided from the answer
  const straightish = new Map<string, boolean>()
  for (const edge of graph.edges) {
    straightish.set(edge.id, clearLine(edge, at, box))
  }

  const drawnIds = new Set(graph.edges.map((edge) => edge.id))
  const shapeOf = new Map<string, EdgeShape>()
  const bowOf = new Map<string, -1 | 0 | 1>()
  for (const edge of graph.edges) {
    const reverse = `${edge.target}->${edge.source}`
    if (
      straightish.get(edge.id) === true &&
      drawnIds.has(reverse) &&
      straightish.get(reverse) === true
    ) {
      // both directions between one pair, and both want the same line. bend them apart: the one
      // running down takes the right, the one running back takes the left, so the pair always
      // opens the same way whichever of them is heavier
      shapeOf.set(edge.id, 'bow')
      const down = (at.get(edge.source)?.depth ?? 0) - (at.get(edge.target)?.depth ?? 0)
      bowOf.set(edge.id, down < 0 || (down === 0 && compare(edge.source, edge.target) < 0) ? 1 : -1)
      continue
    }
    shapeOf.set(edge.id, straightish.get(edge.id) === true ? 'straight' : 'curve')
  }

  // 2. gutters and tracks for the curves
  const arcs = graph.edges.filter((edge) => shapeOf.get(edge.id) === 'curve')
  const gutter = assignGutters(arcs, at)

  const band = bandOf(placed, box)
  const trackX = (side: -1 | 0 | 1, track: number): number => {
    const out = TRACK_START + track * TRACK_PITCH
    return side < 0 ? band.left - out : band.right + out
  }

  // 3. ports. an edge attaches where a ray from the node's centre crosses the box, and the ray
  // points at where the edge is actually going first - the other node for a straight one, the
  // place it joins its track for a curve. so a curve leaves already heading the way it will
  // travel and nothing kinks at the border
  const attachments: { node: string; edge: string; end: 'from' | 'to'; point: Point }[] = []
  const geometry = new Map<string, { from: Point; to: Point; runFrom: Point; runTo: Point }>()

  for (const edge of graph.edges) {
    const source = at.get(edge.source)
    const target = at.get(edge.target)
    if (source === undefined || target === undefined) {
      continue
    }
    const shape = shapeOf.get(edge.id) ?? 'straight'
    const place = gutter.get(edge.id)
    const x = place === undefined ? 0 : trackX(place.side, place.track)

    let aimFrom: Point
    let aimTo: Point
    let runFrom: Point = source
    let runTo: Point = target

    if (shape === 'curve') {
      // down for a forward arc, up for one closing a cycle. a same-row arc has no vertical
      // travel at all and simply reaches sideways
      const dir = Math.sign(target.y - source.y) || 1
      const out = Math.max(Math.abs(x - source.x), Math.abs(x - target.x))
      // never more than half the vertical travel, or the two bends would cross over each other
      const bend = Math.min(
        Math.abs(target.y - source.y) / 2,
        Math.max(BEND_MIN, out * BEND_REACH),
      )
      runFrom = { x, y: source.y + dir * bend }
      runTo = { x, y: target.y - dir * bend }
      aimFrom = runFrom
      aimTo = runTo
    } else if (shape === 'bow') {
      // both ends aim at one point pushed off the shared line, so the two ports sit on the same
      // side of it and the curve opens rather than crossing itself
      const dir = bowOf.get(edge.id) ?? 1
      const mid = { x: (source.x + target.x) / 2 + dir * BOW * 2, y: (source.y + target.y) / 2 }
      aimFrom = mid
      aimTo = mid
    } else {
      aimFrom = target
      aimTo = source
    }

    const from = border(source, aimFrom, box)
    const to = border(target, aimTo, box)
    geometry.set(edge.id, { from, to, runFrom, runTo })
    attachments.push({ node: edge.source, edge: edge.id, end: 'from', point: from })
    attachments.push({ node: edge.target, edge: edge.id, end: 'to', point: to })
  }

  spreadPorts(attachments, at, box, geometry)

  const edges: RoutedEdge[] = graph.edges.map((edge) => {
    const shape = shapeOf.get(edge.id) ?? 'straight'
    const place = gutter.get(edge.id)
    const shot = geometry.get(edge.id)
    return {
      ...edge,
      shape,
      side: place?.side ?? 0,
      track: place?.track ?? 0,
      trackX: place === undefined ? 0 : trackX(place.side, place.track),
      bowDir: bowOf.get(edge.id) ?? 0,
      from: shot?.from ?? { x: 0, y: 0 },
      to: shot?.to ?? { x: 0, y: 0 },
      runFrom: shot?.runFrom ?? { x: 0, y: 0 },
      runTo: shot?.runTo ?? { x: 0, y: 0 },
    }
  })

  const rows = placed.length === 0 ? 0 : Math.max(...placed.map((node) => node.depth)) + 1
  return { nodes: placed, edges, box, rows, bounds: boundsOf(placed, edges, box) }
}

// one width for every box, from the longest label in this graph. clamped so that a role with one
// very long round name does not stretch every other box with it
function boxOf(nodes: GraphNode[]): Box {
  const widest = Math.max(
    0,
    ...nodes.map(
      (node) => node.label.length * GLYPH + LABEL_PAD + (node.count > 0 ? COUNT_ROOM : 0),
    ),
  )
  return { w: Math.min(BOX_MAX, Math.max(BOX_MIN, Math.round(widest))), h: BOX_HEIGHT }
}

// which row each node sits on: the longest path from the root over the announced edges with the
// cycle-breaks left out, so the shape of the role decides the layout rather than how far along
// people happen to be today. outcomes are ranked afterwards, which is what pins them to the last
// row - ranked together, one pipeline rejected after the recruiter screen would drag REJECTED up
// into the middle of the graph
function rankRows(graph: Graph): Map<string, number> {
  const stages = graph.nodes.filter((node) => node.kind === 'stage').map((node) => node.id)
  const known = new Set(stages)
  const ranked = graph.announced.filter(
    (edge) => !edge.backEdge && known.has(edge.source) && known.has(edge.target),
  )

  const indegree = new Map<string, number>(stages.map((id) => [id, 0]))
  for (const edge of ranked) {
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
  }
  const outgoing = new Map<string, GraphEdge[]>()
  for (const edge of ranked) {
    const list = outgoing.get(edge.source)
    if (list === undefined) {
      outgoing.set(edge.source, [edge])
    } else {
      list.push(edge)
    }
  }

  const depth = new Map<string, number>(stages.map((id) => [id, 0]))
  const queue = stages.filter((id) => indegree.get(id) === 0)
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const edge of outgoing.get(id) ?? []) {
      depth.set(edge.target, Math.max(depth.get(edge.target) ?? 0, (depth.get(id) ?? 0) + 1))
      const remaining = (indegree.get(edge.target) ?? 0) - 1
      indegree.set(edge.target, remaining)
      if (remaining === 0) {
        queue.push(edge.target)
      }
    }
  }

  const last = Math.max(-1, ...depth.values())
  for (const node of graph.nodes) {
    if (node.kind === 'outcome') {
      depth.set(node.id, last + 1)
    }
  }
  return depth
}

interface Parent {
  slot: number
  source: string
  weight: number
}

function beats(candidate: Parent, best: Parent): boolean {
  return (
    candidate.weight - best.weight ||
    best.slot - candidate.slot ||
    compare(candidate.source, best.source)
  ) > 0
}

// a node sits under the parent that feeds it, so a branch stays in one block and its lines do not
// cross the next branch's. that is the whole reason this is not a plain sort: ordering a row by
// the stages endpoint alone puts a child wherever its own stage happens to rank, which has
// nothing to do with who points at it, and two forks then swap over each other on the way down.
//
// then every row is centred on one centreline, which is what leaves a gutter of equal width down
// each side for the arcs to run in
function place(
  nodes: GraphNode[],
  drawn: GraphEdge[],
  announced: GraphEdge[],
  depthOf: Map<string, number>,
  box: Box,
): PlacedNode[] {
  const parents = parentsOf(announced, drawn)
  const byDepth = new Map<number, GraphNode[]>()
  for (const node of nodes) {
    const depth = depthOf.get(node.id) ?? 0
    const bucket = byDepth.get(depth)
    if (bucket === undefined) {
      byDepth.set(depth, [node])
    } else {
      bucket.push(node)
    }
  }

  const slotOf = new Map<string, number>()
  // the slot of the parent a node hangs under, or -1 for one that hangs under nothing. a parent
  // whose own slot is not settled yet is not a candidate: it is at this depth or below, so it is
  // a cycle-break or an edge into a node ranking could not place, and neither can position anyone
  const under = (node: GraphNode): number => {
    let best: Parent | null = null
    for (const edge of parents.get(node.id) ?? []) {
      const slot = slotOf.get(edge.source)
      if (slot === undefined) {
        continue
      }
      // heaviest wins, and the parent's own slot and then its id only settle a tie - so which
      // parent a node hangs under can never depend on the order the applicants came back in
      const candidate = { slot, source: edge.source, weight: edge.weight }
      if (best === null || beats(candidate, best)) {
        best = candidate
      }
    }
    return best?.slot ?? -1
  }

  const placed: PlacedNode[] = []
  const pitch = box.w + SLOT_GAP
  for (const depth of [...byDepth.keys()].sort((a, b) => a - b)) {
    const bucket = byDepth.get(depth) ?? []
    // every key is taken before any slot at this depth is written, so a node can never be
    // positioned by a sibling that happens to have been ordered first
    const key = new Map(bucket.map((node) => [node.id, under(node)]))
    bucket.sort(
      (a, b) =>
        (key.get(a.id) ?? -1) - (key.get(b.id) ?? -1) ||
        a.sortKey[0] - b.sortKey[0] ||
        a.sortKey[1] - b.sortKey[1] ||
        compare(a.id, b.id),
    )
    bucket.forEach((node, index) => {
      slotOf.set(node.id, index)
      placed.push({
        ...node,
        depth,
        slot: index,
        x: (index - (bucket.length - 1) / 2) * pitch,
        y: depth * (box.h + ROW_GAP) + box.h / 2,
      })
    })
  }
  return placed
}

// which edges get a say in where a node sits across its row: the announced edges ranking itself
// used, minus the cycle-breaks. an outcome has no announced pair at all, since announced is built
// from stage lists, so it takes its drawn edges instead
function parentsOf(announced: GraphEdge[], drawn: GraphEdge[]): Map<string, GraphEdge[]> {
  const parents = new Map<string, GraphEdge[]>()
  const add = (edge: GraphEdge): void => {
    const list = parents.get(edge.target)
    if (list === undefined) {
      parents.set(edge.target, [edge])
    } else {
      list.push(edge)
    }
  }

  const known = new Set(announced.map((edge) => edge.id))
  for (const edge of announced) {
    if (!edge.backEdge) {
      add(edge)
    }
  }
  for (const edge of drawn) {
    if (!known.has(edge.id)) {
      add(edge)
    }
  }
  return parents
}

// can this edge be a straight line? only if the line between its two nodes misses every other
// box, with a margin so that it never grazes a corner. the two nodes it joins are exempt, since
// it starts and ends on their borders
function clearLine(edge: GraphEdge, at: Map<string, PlacedNode>, box: Box): boolean {
  const source = at.get(edge.source)
  const target = at.get(edge.target)
  if (source === undefined || target === undefined) {
    return false
  }
  for (const node of at.values()) {
    if (node.id === edge.source || node.id === edge.target) {
      continue
    }
    if (
      hitsRect(
        source,
        target,
        node.x,
        node.y,
        box.w / 2 + CLEARANCE,
        box.h / 2 + CLEARANCE,
      )
    ) {
      return false
    }
  }
  return true
}

// Liang-Barsky: clip the segment against the box's four slabs and see whether anything survives
function hitsRect(
  a: Point,
  b: Point,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  let t0 = 0
  let t1 = 1
  const slabs: [number, number][] = [
    [-dx, a.x - (cx - hw)],
    [dx, cx + hw - a.x],
    [-dy, a.y - (cy - hh)],
    [dy, cy + hh - a.y],
  ]
  for (const [p, q] of slabs) {
    if (p === 0) {
      if (q < 0) {
        return false
      }
      continue
    }
    const r = q / p
    if (p < 0) {
      if (r > t1) {
        return false
      }
      if (r > t0) {
        t0 = r
      }
    } else {
      if (r < t0) {
        return false
      }
      if (r < t1) {
        t1 = r
      }
    }
  }
  return true
}

// THE GUTTER ASSIGNMENT, and it is exactly optimal rather than greedy.
//
// an arc occupies the rows between its endpoints. colouring those intervals so that no two
// overlapping ones share a colour needs exactly as many colours as the most arcs live at any one
// row - interval graphs are perfect, and the greedy pass below, in left-endpoint order, hits that
// number. each colour class is then a set of arcs that never overlap each other, so the whole
// class rides in a single track wherever it goes.
//
// so the question stops being "which side does this arc take" and becomes "which side does this
// track take", and dealing k tracks alternately gives each gutter ceil(k/2) or floor(k/2). since
// at the busiest row those same arcs split over two sides, one side must hold at least half of
// them - so ceil(omega/2) is a lower bound, and the dealing meets it. neither gutter is ever
// wider than it has to be.
//
// within a gutter the longest arc goes furthest out, so an arc nested inside another sits inside
// it on screen too and the pair reads as concentric arches. the other order forces two crossings
// for nothing
function assignGutters(
  arcs: GraphEdge[],
  at: Map<string, PlacedNode>,
): Map<string, { side: -1 | 1; track: number }> {
  const span = (edge: GraphEdge): { left: number; right: number } => {
    const a = at.get(edge.source)?.depth ?? 0
    const b = at.get(edge.target)?.depth ?? 0
    return { left: Math.min(a, b), right: Math.max(a, b) }
  }

  // sorted by the near end, widest first, then by an id that is a property of the role's shape
  // and never of the applicants' arrival order
  const sorted = [...arcs].sort((a, b) => {
    const x = span(a)
    const y = span(b)
    return x.left - y.left || y.right - x.right || compare(a.id, b.id)
  })

  const colour = new Map<string, number>()
  const classes: GraphEdge[][] = []
  for (const arc of sorted) {
    const mine = span(arc)
    let chosen = 0
    while (
      (classes[chosen] ?? []).some((other) => {
        const theirs = span(other)
        // touching at a single row is not a clash: one arc ends on a border where the next begins
        return Math.min(theirs.right, mine.right) > Math.max(theirs.left, mine.left)
      })
    ) {
      chosen += 1
    }
    classes[chosen] = [...(classes[chosen] ?? []), arc]
    colour.set(arc.id, chosen)
  }

  // which way a class's arcs lean: the mean x of their endpoints. an arc between two nodes in the
  // middle of the band leans nowhere and can take either gutter, but one reaching the rightmost
  // outcome leans right, and sending it down the left gutter would make it cross the entire band
  // twice to get there - which is exactly what "a curve never threads between two boxes" is meant
  // to prevent
  const lean = (edge: GraphEdge): number =>
    ((at.get(edge.source)?.x ?? 0) + (at.get(edge.target)?.x ?? 0)) / 2

  const summary = classes.map((members, index) => ({
    index,
    members,
    size: members.length,
    widest: Math.max(0, ...members.map((edge) => span(edge).right - span(edge).left)),
    first: Math.min(Infinity, ...members.map((edge) => span(edge).left)),
    lean: members.reduce((sum, edge) => sum + lean(edge), 0) / members.length,
  }))

  // split the classes by which way they lean, so each gutter gets half of them - the count that
  // makes the dealing optimal - and gets the half that actually wants to be there.
  //
  // the quota depends on the class's own lean, which is what makes an odd split fall the right
  // way: with a single arc reaching the rightmost outcome, a fixed ceil(k/2) quota would send it
  // down the left gutter and make it cross the entire band twice to get where it is going
  const dealt = [...summary].sort(
    (a, b) => a.lean - b.lean || b.size - a.size || a.first - b.first || a.index - b.index,
  )
  const sides = new Map<number, -1 | 1>()
  dealt.forEach((klass, index) => {
    const quota =
      klass.lean <= 0 ? Math.ceil(dealt.length / 2) : Math.floor(dealt.length / 2)
    sides.set(klass.index, index < quota ? -1 : 1)
  })

  const result = new Map<string, { side: -1 | 1; track: number }>()
  for (const side of [-1, 1] as const) {
    const mine = summary
      .filter((klass) => sides.get(klass.index) === side)
      // nearest the band first, so the longest arc ends up furthest out
      .sort((a, b) => a.widest - b.widest || a.first - b.first || a.index - b.index)
    mine.forEach((klass, track) => {
      for (const arc of klass.members) {
        result.set(arc.id, { side, track })
      }
    })
  }
  return result
}

// the outer edges of the band of boxes, which is where the gutters start
function bandOf(nodes: PlacedNode[], box: Box): { left: number; right: number } {
  if (nodes.length === 0) {
    return { left: 0, right: 0 }
  }
  return {
    left: Math.min(...nodes.map((node) => node.x)) - box.w / 2,
    right: Math.max(...nodes.map((node) => node.x)) + box.w / 2,
  }
}

// where a ray from the centre of a box towards `aim` crosses its border
function border(centre: Point, aim: Point, box: Box): Point {
  const dx = aim.x - centre.x
  const dy = aim.y - centre.y
  if (dx === 0 && dy === 0) {
    return { x: centre.x, y: centre.y + box.h / 2 }
  }
  const scale = Math.min(
    dx === 0 ? Infinity : box.w / 2 / Math.abs(dx),
    dy === 0 ? Infinity : box.h / 2 / Math.abs(dy),
  )
  return { x: centre.x + dx * scale, y: centre.y + dy * scale }
}

// a point on a border, as a distance clockwise from the top-left corner. going round the whole
// perimeter rather than treating each border separately is what keeps two edges either side of a
// corner apart, which four independent borders never did
function perimeterOf(point: Point, centre: Point, box: Box): number {
  const left = centre.x - box.w / 2
  const top = centre.y - box.h / 2
  const right = centre.x + box.w / 2
  const bottom = centre.y + box.h / 2
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.001
  if (near(point.y, top)) {
    return point.x - left
  }
  if (near(point.x, right)) {
    return box.w + (point.y - top)
  }
  if (near(point.y, bottom)) {
    return box.w + box.h + (right - point.x)
  }
  return 2 * box.w + box.h + (bottom - point.y)
}

function perimeterAt(t: number, centre: Point, box: Box): Point {
  const perimeter = 2 * (box.w + box.h)
  let along = ((t % perimeter) + perimeter) % perimeter
  const left = centre.x - box.w / 2
  const top = centre.y - box.h / 2
  if (along < box.w) {
    return { x: left + along, y: top }
  }
  along -= box.w
  if (along < box.h) {
    return { x: left + box.w, y: top + along }
  }
  along -= box.h
  if (along < box.w) {
    return { x: left + box.w - along, y: top + box.h }
  }
  along -= box.w
  return { x: left, y: top + box.h - along }
}

// every attachment on a node gets its own point on the perimeter. an edge is left exactly where
// it aimed unless something else landed within an arrowhead of it, and then only the pair moves,
// by the least that separates them - so a straight edge stays straight and a spine edge stays
// dead vertical in every graph that is not crowded
function spreadPorts(
  attachments: { node: string; edge: string; end: 'from' | 'to'; point: Point }[],
  at: Map<string, PlacedNode>,
  box: Box,
  geometry: Map<string, { from: Point; to: Point; runFrom: Point; runTo: Point }>,
): void {
  const perimeter = 2 * (box.w + box.h)
  const byNode = new Map<string, typeof attachments>()
  for (const attachment of attachments) {
    const bucket = byNode.get(attachment.node)
    if (bucket === undefined) {
      byNode.set(attachment.node, [attachment])
    } else {
      bucket.push(attachment)
    }
  }

  for (const [id, bucket] of byNode) {
    const centre = at.get(id)
    if (centre === undefined || bucket.length < 2) {
      continue
    }
    const ordered = bucket
      .map((attachment) => ({
        attachment,
        t: perimeterOf(attachment.point, centre, box),
      }))
      // sorted round the perimeter, and by edge id where two landed on the same point, so the
      // order is the same however the edges were built
      .sort((a, b) => a.t - b.t || compare(a.attachment.edge, b.attachment.edge))

    const t = ordered.map((entry) => entry.t)
    const count = t.length
    if (count * PORT_GAP >= perimeter) {
      // more edges than the border can space out: share it evenly and accept the crowding
      for (let i = 0; i < count; i += 1) {
        t[i] = t[0] + (i * perimeter) / count
      }
    } else {
      // relax: any neighbouring pair closer than an arrowhead pushes apart by half the shortfall
      // each, round and round until nothing moves
      for (let pass = 0; pass < 24; pass += 1) {
        let moved = false
        for (let i = 0; i < count; i += 1) {
          const j = (i + 1) % count
          const gap = j === 0 ? t[j] + perimeter - t[i] : t[j] - t[i]
          if (gap < PORT_GAP - 0.001) {
            const push = (PORT_GAP - gap) / 2
            t[i] -= push
            t[j] += push
            moved = true
          }
        }
        if (!moved) {
          break
        }
      }
    }

    ordered.forEach((entry, index) => {
      const point = perimeterAt(t[index], centre, box)
      const shot = geometry.get(entry.attachment.edge)
      if (shot !== undefined) {
        shot[entry.attachment.end] = point
      }
    })
  }
}

function boundsOf(
  nodes: PlacedNode[],
  edges: RoutedEdge[],
  box: Box,
): { minX: number; minY: number; maxX: number; maxY: number } {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }
  const xs = [
    ...nodes.map((node) => node.x - box.w / 2),
    ...nodes.map((node) => node.x + box.w / 2),
    ...edges.filter((edge) => edge.shape === 'curve').map((edge) => edge.trackX),
  ]
  const ys = [
    ...nodes.map((node) => node.y - box.h / 2),
    ...nodes.map((node) => node.y + box.h / 2),
  ]
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  }
}
