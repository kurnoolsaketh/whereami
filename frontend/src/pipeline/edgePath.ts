import type { EdgeRoute } from './graph'

// where an edge actually runs, in pixels. pure - no React, no measurement - so the property that
// matters can be asserted directly: no two edges are ever drawn along the same line.
//
// that property is not something a spline can promise. React Flow's own smoothstep bends where it
// likes, which is why every edge leaving a node used to share the same run for as far as they all
// happened to agree; here an edge is a polyline whose every leg is placed on purpose - it leaves
// by its own port, travels in a track nothing else is using, and arrives at its own port. two
// edges may cross, which is unavoidable and readable, but they never lie on top of each other

export interface Point {
  x: number
  y: number
}

// how far apart two ports on one border sit, which is what a node's minimum size is derived from.
// a horizontal border spaces them for two arrowheads to read as two side by side; a vertical one
// can afford to be tighter, because the arcs on it turn away from the node immediately and are
// told apart by where they go rather than by where they leave
export const PORT_SPACING = 13
export const SIDE_PORT_SPACING = 9

// the gap between two arcs sharing a gutter, and how far the innermost one runs from the slot it
// belongs to. the chips are kept apart by sliding them along their runs rather than by the gap,
// which is why this can be narrower than a chip is wide
export const ARC_LANE = 26
export const BAND_START = 14

// the same pair for the horizontal channel between two rows, where a chain edge does its sideways
// jog. a track is a chip's height apart from the next, so two labels in one channel clear each
// other even before they are slid along
export const CHAIN_TRACK = 16
export const CHAIN_TRACK_START = 14

// the geometry a route needs, all of it derived from the model rather than from measurement, so
// the renderer and the tests compute the same numbers
export interface Layout {
  slotPitch: number
  nodeHeight: number
  // how far into a slot the arc band sits - past the widest node the slot can hold, so a band is
  // a straight gutter down the graph rather than a line that wanders with the labels
  slotBand: number
  // how wide the gutters either side of a slot are, which is what hangs outside the box the fit
  // frames
  gutters: { left: number; right: number }
  // the y each row of nodes starts at. rows are not all the same height: one is as tall as its
  // own node plus the channel below it, and a channel is only as deep as the jogs it carries, so
  // a row whose chain edges run straight down costs nothing. a single pitch for all of them made
  // every row as tall as the busiest channel in the graph, which doubled the height of a role
  // that had one crowded row
  rowTop: number[]
}

export interface Attachment {
  route: EdgeRoute
  lane: number
  sourcePort: number
  targetPort: number
}

export interface Ends {
  slot: number
  depth: number
}

// which slot's gutter an arc travels in: the outer of the two it joins, so that it is always on
// the far side of both nodes and arrives at a border from the side that border faces. the packing
// in graph.ts keys its bands on the same slot, or two arcs could be given the same lane in one
// gutter
export function bandSlot(route: EdgeRoute, source: number, target: number): number {
  return route === 'loop' ? Math.min(source, target) : Math.max(source, target)
}

// the line an edge does its sideways travel on: a y in the channel below the source's row for a
// chain edge, an x in a slot's gutter for an arc. both are laid out from the model, so nothing
// here depends on how wide a label happens to be
export function trackOf(
  edge: Attachment,
  source: Ends,
  target: Ends,
  layout: Layout,
): number {
  if (edge.route === 'chain') {
    return (
      channelTop(layout, source.depth) + CHAIN_TRACK_START + edge.lane * CHAIN_TRACK
    )
  }

  const slot = bandSlot(edge.route, source.slot, target.slot) * layout.slotPitch
  const offset = BAND_START + edge.lane * ARC_LANE
  return edge.route === 'loop' ? slot - offset : slot + layout.slotBand + offset
}

// the top of the channel below a row, which is where its jogs travel
export function channelTop(layout: Layout, depth: number): number {
  return (layout.rowTop[depth] ?? 0) + layout.nodeHeight
}

// a port's own point, from the border's centre - which is where React Flow puts the handle - and
// the offset graph.ts gave this edge. a chain edge meets a horizontal border and so slides
// sideways along it; an arc meets a vertical one and slides down it
export function portPoint(handle: Point, route: EdgeRoute, port: number): Point {
  return route === 'chain'
    ? { x: handle.x + port * PORT_SPACING, y: handle.y }
    : { x: handle.x, y: handle.y + port * SIDE_PORT_SPACING }
}

// the corners an edge turns, in order. three shapes, one per route, and each is the shortest
// path that leaves and arrives square to the border it meets:
//
//   chain: down out of the port, across the channel, down into the next port. an edge whose two
//          ports happen to line up needs no jog at all and runs straight, which is the common
//          case and looks exactly as it always did.
//   hop:   out to the gutter, down it, back in to the port.
//   loop:  the same on the other side, travelling up.
export function waypoints(edge: { route: EdgeRoute }, source: Point, target: Point, track: number): Point[] {
  if (edge.route === 'chain') {
    return source.x === target.x
      ? [source, target]
      : [source, { x: source.x, y: track }, { x: target.x, y: track }, target]
  }
  return [source, { x: track, y: source.y }, { x: track, y: target.y }, target]
}

// the polyline as an svg path, with the corners rounded off. a corner is cut back by the radius,
// or by half the shorter leg where a leg is too short to give it up - which is what keeps a tight
// jog from turning into a loop that overshoots its own corner
export function pathFrom(points: Point[], radius: number): string {
  if (points.length < 2) {
    return ''
  }

  let d = `M ${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const [before, corner, after] = [points[i - 1], points[i], points[i + 1]]
    const into = Math.min(radius, distance(before, corner) / 2)
    const outOf = Math.min(radius, distance(corner, after) / 2)
    const start = towards(corner, before, into)
    const end = towards(corner, after, outOf)
    d += ` L ${start.x},${start.y} Q ${corner.x},${corner.y} ${end.x},${end.y}`
  }
  const last = points[points.length - 1]
  return `${d} L ${last.x},${last.y}`
}

// the straight legs of a polyline, which is what "no two edges share a line" is asserted over.
// a corner's rounding is ignored: it is a couple of pixels either side of a point two legs meet
// at, and two edges cannot be told apart there whatever the geometry says
export interface Segment {
  axis: 'horizontal' | 'vertical'
  // the coordinate the leg is fixed at, and the span it covers on the other axis
  at: number
  from: number
  to: number
}

export function segmentsOf(points: Point[]): Segment[] {
  const legs: Segment[] = []
  for (let i = 0; i + 1 < points.length; i += 1) {
    const [a, b] = [points[i], points[i + 1]]
    if (a.x === b.x && a.y !== b.y) {
      legs.push({ axis: 'vertical', at: a.x, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y) })
    } else if (a.y === b.y && a.x !== b.x) {
      legs.push({ axis: 'horizontal', at: a.y, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) })
    }
  }
  return legs
}

function distance(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function towards(from: Point, to: Point, by: number): Point {
  const span = distance(from, to)
  if (span === 0) {
    return from
  }
  return {
    x: from.x + ((to.x - from.x) * by) / span,
    y: from.y + ((to.y - from.y) * by) / span,
  }
}
