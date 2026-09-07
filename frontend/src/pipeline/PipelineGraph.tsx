import { useMemo, useState, type CSSProperties } from 'react'
import { edgeLabel, sharePercent, type Graph, type GraphEdge, type Selection } from './graph'
import {
  approachOf,
  arrowHalfWidth,
  arrowLength,
  labelPoints,
  pathOf,
  polylineOf,
  segmentsOf,
  type Seg,
} from './edgePath'
import { layoutGraph, type Layout, type PlacedNode, type Point, type RoutedEdge } from './layout'
import { endingVerb } from './status'
import { usePanZoom } from './usePanZoom'
import { nodeKey } from './stages'

// the graph, drawn. layout.ts decided every position and edgePath.ts turned them into paths, so
// there is no layout here at all - this file supplies markup, colour and events.
//
// it is plain SVG rather than a graph library: every coordinate already comes from the model, so
// a library would only be asked to draw, and the price of asking was six handles per node, a fit
// that raced the node measurement, and edges that could only attach where a handle had been
// declared. one element tree in one coordinate space has none of those

// a thin line always means few people and a thick one always means many, on the same scale
// whatever role you are looking at: 0% is 1px and 100% is 6px, never rescaled to fit
const MIN_WIDTH = 1
const MAX_WIDTH = 6

// the panel's floor and ceiling. the floor is the height the panel always had, so a short role is
// framed exactly as it was; the ceiling is where growing stops and panning takes over
const MIN_HEIGHT = 416
const MAX_HEIGHT = 640

// breathing room between the drawing and the panel's edges
const PADDING = 18

// how round a stage box is, and the radius that turns an outcome into a pill
const STAGE_RADIUS = 6
const OUTCOME_RADIUS = 999

// the gap between a label and its count badge, and the padding inside the badge
const BADGE_GAP = 8
const BADGE_PAD = 12
const GLYPH = 7.2
const BADGE_HEIGHT = 18

interface PipelineGraphProps {
  graph: Graph
  selected: Selection | null
  onSelect: (selection: Selection | null) => void
}

// everything one edge needs to be drawn, worked out once for the whole graph because the label
// placement has to see every path at once
interface Drawn {
  edge: RoutedEdge
  stroke: number
  // the visible line, stopped at the arrowhead's base, and the full one underneath it that
  // catches the pointer. a 1px line is impossible to hit, so every edge has a fat invisible twin
  d: string
  hit: string
  head: string
  label: Point | undefined
}

export function PipelineGraph({ graph, selected, onSelect }: PipelineGraphProps) {
  const layout = useMemo(() => layoutGraph(graph), [graph])
  const drawn = useMemo(() => draw(layout), [layout])

  // which line the pointer is on. state rather than a :hover rule because a lit line also has to
  // come to the front, and the only way to raise one in SVG is to render it last
  const [hovered, setHovered] = useState<string | null>(null)
  const lit = (id: string): boolean =>
    hovered === id || (selected?.kind === 'edge' && selected.id === id)

  // the panel grows with the graph instead of scaling it into a fixed box: a role with three
  // rounds looks exactly as it did, and one with ten gets the room rather than being shrunk to
  // fit. past the cap it pans and zooms
  const height = Math.min(
    MAX_HEIGHT,
    Math.max(MIN_HEIGHT, layout.bounds.maxY - layout.bounds.minY + 2 * PADDING),
  )
  const shape = layout.nodes.map((node) => node.id).join()
  const view = usePanZoom(layout.bounds, PADDING, shape)

  const picked =
    selected?.kind === 'edge' ? layout.edges.find((edge) => edge.id === selected.id) : undefined
  const pickedSource = layout.nodes.find((node) => node.id === picked?.source)
  const pickedTarget = layout.nodes.find((node) => node.id === picked?.target)

  // lit last, so a highlighted line is never left underneath one that crosses it
  const ordered = [...drawn].sort((a, b) => Number(lit(a.edge.id)) - Number(lit(b.edge.id)))

  return (
    <div className="graph" style={{ '--graph-height': `${height}px` } as CSSProperties}>
      <div
        className={`graph-canvas${view.dragging ? ' dragging' : ''}`}
        ref={view.ref}
        onWheel={view.onWheel}
        onPointerDown={view.onPointerDown}
        onPointerMove={view.onPointerMove}
        onPointerUp={view.onPointerUp}
        onPointerCancel={view.onPointerUp}
      >
        <svg className="graph-svg" role="presentation">
          <g
            transform={`translate(${view.transform.x},${view.transform.y}) scale(${view.transform.k})`}
            // drawn but not shown until the container has been measured: the first paint would
            // otherwise land untransformed, and the fit that follows it reads as a jump
            opacity={view.ready ? 1 : 0}
          >
            {ordered.map((item) => (
              <Line
                key={item.edge.id}
                item={item}
                lit={lit(item.edge.id)}
                onHover={setHovered}
                onPick={() =>
                  onSelect(
                    selected?.kind === 'edge' && selected.id === item.edge.id
                      ? null
                      : { kind: 'edge', id: item.edge.id },
                  )
                }
              />
            ))}

            {layout.nodes.map((node) => (
              <Box
                key={node.id}
                node={node}
                layout={layout}
                dimmed={selected?.kind === 'node' && selected.id !== node.id}
                picked={selected?.kind === 'node' && selected.id === node.id}
                onPick={() =>
                  onSelect(
                    selected?.kind === 'node' && selected.id === node.id
                      ? null
                      : { kind: 'node', id: node.id },
                  )
                }
              />
            ))}

            {/* the chips go on last so a count always sits on top of the line it belongs to and
                of anything that line crosses */}
            {ordered.map((item) =>
              item.label === undefined ? null : (
                <Chip
                  key={item.edge.id}
                  at={item.label}
                  text={edgeLabel(item.edge)}
                  lit={lit(item.edge.id)}
                />
              ),
            )}
          </g>
        </svg>
      </div>

      {/* the graph can be taller than the panel on a role with a long pipeline, so it pans and
          zooms, and the buttons say so */}
      <div className="graph-controls">
        <button type="button" onClick={() => view.zoomBy(1.25)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => view.zoomBy(0.8)} aria-label="Zoom out">
          &minus;
        </button>
        <button type="button" onClick={view.fit} aria-label="Fit the whole graph">
          ⤢
        </button>
      </div>

      {picked !== undefined && pickedSource !== undefined && pickedTarget !== undefined && (
        <Legend edge={picked} source={pickedSource.label} target={pickedTarget} />
      )}
    </div>
  )
}

// every path, arrowhead and chip position for the graph, computed together because the labels
// cannot be placed until every path exists to be measured against
function draw(layout: Layout): Drawn[] {
  const segments = new Map<string, Seg[]>(
    layout.edges.map((edge) => [edge.id, segmentsOf(edge, layout)]),
  )
  const polylines = new Map<string, Point[]>(
    [...segments].map(([id, list]) => [id, polylineOf(list)]),
  )
  const labels = labelPoints(layout.edges, polylines)

  return layout.edges.map((edge) => {
    const list = segments.get(edge.id) ?? []
    const stroke = MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * edge.share
    const length = arrowLength(stroke)
    const half = arrowHalfWidth(stroke)
    const heading = approachOf(list)
    const base = { x: edge.to.x - heading.x * length, y: edge.to.y - heading.y * length }

    return {
      edge,
      stroke,
      d: pathOf(list, length),
      hit: pathOf(list, 0),
      head: [
        [edge.to.x, edge.to.y],
        [base.x - heading.y * half, base.y + heading.x * half],
        [base.x + heading.y * half, base.y - heading.x * half],
      ]
        .map(([x, y]) => `${x},${y}`)
        .join(' '),
      label: labels.get(edge.id),
    }
  })
}

function Line({
  item,
  lit,
  onHover,
  onPick,
}: {
  item: Drawn
  lit: boolean
  onHover: (id: string | null) => void
  onPick: () => void
}) {
  return (
    <g
      className={`graph-edge${lit ? ' lit' : ''}`}
      data-pickable=""
      onMouseEnter={() => onHover(item.edge.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onPick}
      aria-label={`${item.edge.weight} of the applicants on this role, ${sharePercent(item.edge)} percent, made this move`}
    >
      {/* the line itself is as thin as 1px; this catches the pointer for it */}
      <path className="graph-edge-hit" d={item.hit} />
      <path className="graph-edge-line" d={item.d} strokeWidth={item.stroke} />
      {/* the arrowhead is a polygon rather than a marker, so the line can stop at its base and
          the two meet cleanly at every thickness - see edgePath.ts */}
      <polygon className="graph-edge-head" points={item.head} />
    </g>
  )
}

function Box({
  node,
  layout,
  dimmed,
  picked,
  onPick,
}: {
  node: PlacedNode
  layout: Layout
  dimmed: boolean
  picked: boolean
  onPick: () => void
}) {
  const { w, h } = layout.box
  const badge = node.count > 0 ? `${node.count}`.length * GLYPH + BADGE_PAD : 0
  // the label and its badge are centred as a pair, so a box with a count does not read as one
  // with its label pushed off to the left
  const labelWidth = node.label.length * GLYPH
  const content = labelWidth + (node.count > 0 ? BADGE_GAP + badge : 0)
  const labelX = node.x - content / 2 + labelWidth / 2
  const badgeX = node.x - content / 2 + labelWidth + BADGE_GAP + badge / 2

  const classes = [
    'graph-node',
    node.kind === 'outcome' ? 'graph-outcome' : 'graph-stage',
    picked ? 'picked' : '',
    dimmed ? 'dimmed' : '',
  ].filter((part) => part !== '')

  return (
    <g className={classes.join(' ')} data-pickable="" onClick={onPick}>
      <rect
        className="graph-node-box"
        x={node.x - w / 2}
        y={node.y - h / 2}
        width={w}
        height={h}
        rx={node.kind === 'outcome' ? OUTCOME_RADIUS : STAGE_RADIUS}
      />
      <text className="graph-label" x={labelX} y={node.y}>
        {node.label}
      </text>
      {node.count > 0 && (
        <>
          <rect
            className="graph-count-pill"
            x={badgeX - badge / 2}
            y={node.y - BADGE_HEIGHT / 2}
            width={badge}
            height={BADGE_HEIGHT}
            rx={OUTCOME_RADIUS}
          />
          <text className="graph-count" x={badgeX} y={node.y}>
            {node.count}
          </text>
        </>
      )}
    </g>
  )
}

// a count, sitting on its own line with the line masked behind it, so it can never be read as
// belonging to a neighbouring one
function Chip({ at, text, lit }: { at: Point; text: string; lit: boolean }) {
  const width = text.length * GLYPH + BADGE_PAD
  return (
    <g className={`graph-chip${lit ? ' lit' : ''}`}>
      <rect x={at.x - width / 2} y={at.y - CHIP_HEIGHT / 2} width={width} height={CHIP_HEIGHT} rx={4} />
      <text x={at.x} y={at.y}>
        {text}
      </text>
    </g>
  )
}

const CHIP_HEIGHT = 19

// the sample line's weight. middling on the 1..6 scale, so "thicker means a larger share" has
// somewhere to go in both directions rather than sitting at one end of it
const LEGEND_STROKE = 3.5
const LEGEND_WIDTH = 176
const LEGEND_MID = 13

// everyone reaches the first node by applying, so it is the one origin that does not read as a
// round somebody got to
const ROOT = nodeKey('APPLIED', 1)

// what one line means, shown when it is clicked. the sample is that line in miniature - the same
// colour, the same chip, an arrowhead from the same geometry, and the clicked edge's own count -
// so the panel and the line it explains are matched by sight before a word is read. the share
// lives here now rather than on the chip, spelled out rather than abbreviated
function Legend({
  edge,
  source,
  target,
}: {
  edge: GraphEdge
  source: string
  target: PlacedNode
}) {
  const label = edgeLabel(edge)
  const chip = label.length * GLYPH + BADGE_PAD
  const length = arrowLength(LEGEND_STROKE)
  const halfWidth = arrowHalfWidth(LEGEND_STROKE)
  const base = LEGEND_WIDTH - length

  // "advanced" is only true of a move between rounds; an ending needs the verb of its own status
  const verb =
    target.kind === 'outcome'
      ? endingVerb(target.id as Parameters<typeof endingVerb>[0], edge.weight)
      : 'advanced'
  const origin = edge.source === ROOT ? 'applied' : `reached ${source}`

  return (
    <div className="graph-legend">
      <svg width={LEGEND_WIDTH} height={LEGEND_MID * 2} aria-hidden="true">
        <line x1={2} y1={LEGEND_MID} x2={base} y2={LEGEND_MID} strokeWidth={LEGEND_STROKE} />
        <polygon
          points={`${LEGEND_WIDTH},${LEGEND_MID} ${base},${LEGEND_MID - halfWidth} ${base},${LEGEND_MID + halfWidth}`}
        />
        <rect
          x={(LEGEND_WIDTH - chip) / 2}
          y={LEGEND_MID - CHIP_HEIGHT / 2}
          width={chip}
          height={CHIP_HEIGHT}
          rx={4}
        />
        <text x={LEGEND_WIDTH / 2} y={LEGEND_MID}>
          {label}
        </text>
      </svg>
      <p>
        <strong>{edge.weight}</strong> applicant{edge.weight === 1 ? '' : 's'} {verb} — this is{' '}
        <strong>{sharePercent(edge)}%</strong> of everyone who {origin}. A thicker line means a
        larger share of applicants advanced.
      </p>
    </div>
  )
}
