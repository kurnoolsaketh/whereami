import { BOX_HEIGHT, BOW, type Point, type RoutedEdge } from './layout'

// where an edge actually runs, in pixels. layout.ts has already decided everything that needs
// deciding - which shape, which gutter, which track, and the two points on the borders - so this
// file has exactly one job: turn that into a path.
//
// a straight edge is a line. a curve is two cubic bends, each leaving its border along the
// border's own outward normal and arriving on the track running vertically, joined by a straight
// run on the track itself. because the middle of a long arc genuinely sits ON its track, two arcs
// a track apart stay a track apart for the whole run - the picture's central promise is a
// property of the construction rather than something to go looking for afterwards. on a short arc
// the run has zero length and the two bends meet, which is one smooth bow and needs no special
// case

// the least a bow reaches before it turns, so a two-way pair between neighbouring rounds still
// reads as two curves rather than as two kinked lines
const BOW_REACH = 16

export type Seg =
  | { kind: 'line'; a: Point; b: Point }
  | { kind: 'cubic'; a: Point; c1: Point; c2: Point; b: Point }

// the arrowhead is drawn as a polygon rather than with an SVG marker, because a marker is pinned
// to the path's end by a refX that puts the head's *tip* where the line stops. the head's edges
// slope, so a line of half-width h escapes the triangle for the last h/0.8 px: invisible at 1px,
// a blunt stub poking out of the point at 6px. drawing it ourselves lets the line stop at the
// head's base instead, which is the only way the two meet cleanly at every thickness.
//
// the head also has to outgrow the line, or a thick edge swallows it and reads as a blunt end
export const ARROW_LENGTH = 9
export const ARROW_HALF_WIDTH = 3.6
export const ARROW_PER_STROKE = 0.75

export function arrowLength(stroke: number): number {
  return ARROW_LENGTH + ARROW_PER_STROKE * stroke
}

export function arrowHalfWidth(stroke: number): number {
  return ARROW_HALF_WIDTH + ARROW_PER_STROKE * stroke
}

// the segments an edge is built from, in order
export function segmentsOf(edge: RoutedEdge): Seg[] {
  if (edge.shape === 'straight') {
    return [{ kind: 'line', a: edge.from, b: edge.to }]
  }

  if (edge.shape === 'bow') {
    // one cubic leaning to this half's own side, so the pair encloses a lens rather than sharing
    // the line they would both otherwise take
    const reach = Math.max(BOW_REACH, Math.abs(edge.to.y - edge.from.y) * 0.4)
    const dir = Math.sign(edge.to.y - edge.from.y) || 1
    return [
      {
        kind: 'cubic',
        a: edge.from,
        c1: { x: edge.from.x + edge.bowDir * BOW, y: edge.from.y + dir * reach },
        c2: { x: edge.to.x + edge.bowDir * BOW, y: edge.to.y - dir * reach },
        b: edge.to,
      },
    ]
  }

  // a curve: one cubic that leaves its border heading straight out, bulges to its track, and comes
  // back in square at the other end. each handle points along its own border's outward normal,
  // which is what makes the shape a C rather than an S and what stops it kinking where it meets a
  // box.
  //
  // a Bezier never escapes the box drawn around its endpoints and its handles, so how far out the
  // handles reach is what the apex is worth: for a symmetric cubic the midpoint sits a quarter of
  // the way from the endpoints to the handles, which is where the 4/3 comes from. put the handles
  // there and the widest point of the curve lands exactly on the track.
  //
  // an end that had to leave through its underside instead reaches downward rather than sideways,
  // and is held to the vertical room it actually has, or it would shoot past its own target
  const middle = (edge.from.x + edge.to.x) / 2
  const reach = (Math.abs(edge.trackX - middle) * 4) / 3
  const drop = Math.min(reach, Math.abs(edge.to.y - edge.from.y) * 0.6)
  const handle = (end: Point, out: Point): Point => ({
    x: end.x + out.x * reach,
    y: end.y + out.y * drop,
  })
  return [
    {
      kind: 'cubic',
      a: edge.from,
      c1: handle(edge.from, edge.fromOut),
      c2: handle(edge.to, edge.toOut),
      b: edge.to,
    },
  ]
}

// the path as SVG
export function pathOf(segments: Seg[]): string {
  const drawn = segments
  if (drawn.length === 0) {
    return ''
  }
  let d = `M ${round(drawn[0].a.x)},${round(drawn[0].a.y)}`
  for (const segment of drawn) {
    d +=
      segment.kind === 'line'
        ? ` L ${round(segment.b.x)},${round(segment.b.y)}`
        : ` C ${round(segment.c1.x)},${round(segment.c1.y)} ${round(segment.c2.x)},${round(segment.c2.y)} ${round(segment.b.x)},${round(segment.b.y)}`
  }
  return d
}

// the same path with its last `by` px cut off, which is where the arrowhead takes over. the
// caller draws the head from the point this ends at rather than from a point of its own: walking
// back along the arrival tangent instead lands somewhere else entirely on a bend, and the two
// disagreeing is what leaves a line short of its own arrowhead
export function shortenBy(segments: Seg[], by: number): Seg[] {
  return by <= 0 ? segments : shorten(segments, by)
}

// where a path stops, which is where its arrowhead begins
export function endOf(segments: Seg[]): Point | undefined {
  return segments[segments.length - 1]?.b
}

// which way the edge is travelling as it arrives. only a fallback now, for a path so short that
// the trim consumed all of it and left no chord to take the direction from
export function approachOf(segments: Seg[]): Point {
  const last = segments[segments.length - 1]
  if (last === undefined) {
    return { x: 0, y: 1 }
  }
  const before =
    last.kind === 'line'
      ? last.a
      : apart(last.c2, last.b)
        ? last.c2
        : apart(last.c1, last.b)
          ? last.c1
          : last.a
  return unit({ x: last.b.x - before.x, y: last.b.y - before.y })
}

// the polyline an edge follows, sampled evenly enough that a curve reads as a curve. used for
// placing labels and for nothing the reader sees, so the sampling only has to be fine enough to
// measure distances against
export function polylineOf(segments: Seg[], step = 6): Point[] {
  const points: Point[] = []
  for (const segment of segments) {
    if (segment.kind === 'line') {
      const count = Math.max(1, Math.ceil(distance(segment.a, segment.b) / step))
      for (let i = 0; i <= count; i += 1) {
        points.push(lerp(segment.a, segment.b, i / count))
      }
      continue
    }
    const rough =
      distance(segment.a, segment.c1) +
      distance(segment.c1, segment.c2) +
      distance(segment.c2, segment.b)
    const count = Math.max(4, Math.ceil(rough / step))
    for (let i = 0; i <= count; i += 1) {
      points.push(cubicAt(segment, i / count))
    }
  }
  return points
}

// where each edge parks its count. the chip sits ON the path, masking the line behind it, so it
// can never be read as belonging to a neighbour - and its place along the path is chosen to be
// the point furthest from every other line and every label already placed, so two chips never
// crowd each other either.
//
// edges are considered heaviest first and then by id, both properties of the role's shape, so the
// same graph puts the same number in the same place every run
export function labelPoints(
  edges: RoutedEdge[],
  polylines: Map<string, Point[]>,
): Map<string, Point> {
  const order = [...edges].sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : 1))
  const placed: Point[] = []
  const chosen = new Map<string, Point>()

  for (const edge of order) {
    const mine = polylines.get(edge.id) ?? []
    if (mine.length === 0) {
      continue
    }
    const others = edges
      .filter((other) => other.id !== edge.id)
      .map((other) => polylines.get(other.id) ?? [])

    let best: { point: Point; score: number } | null = null
    // never right at an end: a chip on top of an arrowhead, or half inside a box, reads as
    // belonging to the node rather than to the line. the clearance is in pixels rather than in
    // fractions, because a fifth of a long edge is plenty of room and a fifth of a short one is
    // still sitting on the arrowhead
    const length = lengthOf(mine)
    const margin = Math.min(0.4, length === 0 ? 0 : END_CLEARANCE / length)
    for (let step = 0; step <= 24; step += 1) {
      const at = margin + (step / 24) * (1 - 2 * margin)
      const point = along(mine, at)
      let score = Infinity
      for (const other of others) {
        score = Math.min(score, nearest(point, other))
      }
      for (const label of placed) {
        score = Math.min(score, distance(point, label))
      }
      // a nudge towards the middle, so an edge with room everywhere puts its chip where a reader
      // looks for it rather than at whichever end rounded higher
      score -= Math.abs(at - 0.5) * 6
      if (best === null || score > best.score) {
        best = { point, score }
      }
    }
    if (best !== null) {
      chosen.set(edge.id, best.point)
      placed.push(best.point)
    }
  }
  return chosen
}

// how far from either end of a line a chip has to stay: past the arrowhead, and clear of the
// border the line leaves from
const END_CLEARANCE = 26

function lengthOf(points: Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    total += distance(points[i - 1], points[i])
  }
  return total
}

// how tall a graph of this many rows draws, which is what the panel is sized from
export function heightOf(rows: number, rowPitch: number): number {
  return rows <= 0 ? 0 : (rows - 1) * rowPitch + BOX_HEIGHT
}

// ---------------------------------------------------------------------------

function shorten(segments: Seg[], by: number): Seg[] {
  const last = segments[segments.length - 1]
  if (last === undefined) {
    return segments
  }
  const rest = segments.slice(0, -1)
  if (last.kind === 'line') {
    const length = distance(last.a, last.b)
    // never shorter than the segment itself, or the last leg would point backwards
    const cut = Math.min(by, length * 0.9)
    return [...rest, { ...last, b: lerp(last.b, last.a, length === 0 ? 0 : cut / length) }]
  }
  const t = cubicTrim(last, by)
  return [...rest, cubicUpTo(last, t)]
}

// the parameter that leaves `by` px of the curve unwalked, found by stepping back along it.
//
// the step it lands *between* has to be interpolated rather than rounded to: a cubic's speed at
// its end is three times the reach of the handle there, so on a long arc a single step of the
// parameter covers tens of pixels. stopping at whichever sample first passed `by` left the line
// short of the arrowhead by most of a step - up to 18px on the reference role, which is what made
// some arrows look detached from their line while every straight one sat flush
const TRIM_STEPS = 64

function cubicTrim(segment: Seg & { kind: 'cubic' }, by: number): number {
  let walked = 0
  let previous = segment.b
  let previousT = 1
  for (let step = 1; step <= TRIM_STEPS; step += 1) {
    const t = 1 - step / TRIM_STEPS
    const point = cubicAt(segment, t)
    const leg = distance(previous, point)
    if (walked + leg >= by) {
      return previousT + (t - previousT) * (leg === 0 ? 0 : (by - walked) / leg)
    }
    walked += leg
    previous = point
    previousT = t
  }
  // the whole curve is shorter than the arrowhead: keep a tenth of it, so the line still points
  // the way it arrived rather than inverting
  return 0.1
}

// de Casteljau, keeping the first part
function cubicUpTo(segment: Seg & { kind: 'cubic' }, t: number): Seg {
  const p01 = lerp(segment.a, segment.c1, t)
  const p12 = lerp(segment.c1, segment.c2, t)
  const p23 = lerp(segment.c2, segment.b, t)
  const p012 = lerp(p01, p12, t)
  const p123 = lerp(p12, p23, t)
  return { kind: 'cubic', a: segment.a, c1: p01, c2: p012, b: lerp(p012, p123, t) }
}

function cubicAt(segment: Seg & { kind: 'cubic' }, t: number): Point {
  const u = 1 - t
  return {
    x:
      u * u * u * segment.a.x +
      3 * u * u * t * segment.c1.x +
      3 * u * t * t * segment.c2.x +
      t * t * t * segment.b.x,
    y:
      u * u * u * segment.a.y +
      3 * u * u * t * segment.c1.y +
      3 * u * t * t * segment.c2.y +
      t * t * t * segment.b.y,
  }
}

function along(points: Point[], at: number): Point {
  const total = points.reduce(
    (sum, point, i) => (i === 0 ? 0 : sum + distance(points[i - 1], point)),
    0,
  )
  let want = total * at
  for (let i = 1; i < points.length; i += 1) {
    const leg = distance(points[i - 1], points[i])
    if (want <= leg) {
      return lerp(points[i - 1], points[i], leg === 0 ? 0 : want / leg)
    }
    want -= leg
  }
  return points[points.length - 1]
}

function nearest(point: Point, polyline: Point[]): number {
  let best = Infinity
  for (let i = 1; i < polyline.length; i += 1) {
    best = Math.min(best, toSegment(point, polyline[i - 1], polyline[i]))
  }
  return polyline.length === 1 ? distance(point, polyline[0]) : best
}

function toSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const square = dx * dx + dy * dy
  const t = square === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / square))
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy })
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function unit(point: Point): Point {
  const length = Math.hypot(point.x, point.y)
  return length === 0 ? { x: 0, y: 1 } : { x: point.x / length, y: point.y / length }
}

function apart(a: Point, b: Point): boolean {
  return distance(a, b) > 0.5
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
