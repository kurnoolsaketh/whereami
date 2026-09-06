import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  Background,
  BaseEdge,
  Controls,
  EdgeText,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type FitViewOptions,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  edgeLabel,
  sharePercent,
  type GraphEdge,
  type GraphNode,
  type Selection,
} from './graph'
import {
  ARC_LANE,
  BAND_START,
  SIDE_PORT_SPACING,
  CHAIN_TRACK,
  CHAIN_TRACK_START,
  pathFrom,
  portPoint,
  PORT_SPACING,
  trackOf,
  waypoints,
  type Layout,
  type Point,
} from './edgePath'
import { endingVerb } from './status'
import { nodeKey } from './stages'

// graph.ts already assigned every node a depth and a slot, and every edge a lane and two ports,
// so there is no layout engine here - React Flow is only asked to draw. depth reads down the
// screen and slots spread across it, and the sideways room is generous because an edge that skips
// a row travels in a gutter beside its slot rather than through the boxes in between.
//
// how far into a slot a node may reach before it meets that gutter. a node's width comes from its
// label and nothing has been measured at the moment positions are handed over, so this is an
// allowance for the longest stage name, not a measurement
const SLOT_BAND = 230

// one colour for the line and its arrowhead. the line takes it from the stylesheet and the
// marker has to be told, because an SVG marker is filled by attribute, so both name the same var
const EDGE_COLOUR = 'var(--edge)'

// the colour a line takes when it is pointed at or picked. the app's accent, not a new colour of
// its own: it already rings a selected node and badges every count, so it reads as "this one"
// rather than as a warning - which is what red would say here, and what red still says everywhere
// else in the app
const EDGE_PICKED_COLOUR = 'var(--accent)'

// a thin line always means few people and a thick one always means many, on the same scale
// whatever role you are looking at: 0% is 1px and 100% is 6px, never rescaled to fit
const MIN_WIDTH = 1
const MAX_WIDTH = 6

// the arrowhead is drawn here rather than with React Flow's markerEnd, because a marker is pinned
// to the path's end by a refX the EdgeMarker type does not expose - which puts the head's *tip*
// exactly where the line stops. the head's edges slope at 0.8, so a line of half-width h escapes
// the triangle for the last h/0.8 px: invisible at 1px, a blunt rectangular stub poking out of
// the point at 6px. drawing it ourselves lets the line stop at the head's base instead, which is
// the only way the two meet cleanly at every thickness.
//
// the head also has to outgrow the line, or a thick edge swallows it and reads as a blunt end
const ARROW_LENGTH = 9
const ARROW_HALF_WIDTH = 3.6
const ARROW_PER_STROKE = 0.75

// a node is as tall as this unless its ports need more, and every node takes the same height so
// that a row is a row
const NODE_HEIGHT = 34

// roughly how wide a label chip is - "12 · 100%" at the edge font. estimated from the glyph count
// rather than measured through another render, the same way the legend estimates its own: the
// exact width carries no meaning, it only has to be close enough to leave the gutters room
const CHIP_WIDTH = 56
const CHIP_HEIGHT = 19

// roughly the narrowest a node with a label gets - "Onsite" and "Offer" are about this wide. only
// the fit uses it, to guess how much of the last slot its nodes leave to the gutter beside them
const NARROW_NODE = 80

// the air a border leaves either side of its ports, and the room below the deepest track in a
// channel - enough for the arrowhead that drops into the next row
const PORT_PADDING = 14
const SIDE_PORT_PADDING = 5
const CHANNEL_GAP = 16

// how much border a node needs to space out this many ports. one port sits at the middle and asks
// for nothing, which is the common case and why most nodes are exactly as big as they always were
function acrossBorder(ports: number): number {
  return ports <= 1 ? 0 : (ports - 1) * PORT_SPACING + 2 * PORT_PADDING
}

function downBorder(ports: number): number {
  return ports <= 1 ? 0 : (ports - 1) * SIDE_PORT_SPACING + 2 * SIDE_PORT_PADDING
}

// everything the drawing needs that depends on the graph as a whole: how wide a slot has to be to
// hold the gutters beside it, how tall a row has to be to hold the tracks in the channel below
// it, and how tall a node has to be to hold the ports on its sides. a role whose applicants all
// walked the same order needs none of it and stays as compact as it ever was
function measure(nodes: GraphNode[], edges: GraphEdge[]): Layout {
  const arcs = { hop: 0, loop: 0 }
  // one depth per channel: a row is only as tall as the jogs that travel underneath it, so a
  // spine of straight chain edges costs nothing however crowded one other row happens to be
  const jogs = new Map<number, number>()
  const depthOf = new Map(nodes.map((node) => [node.id, node.depth]))
  for (const edge of edges) {
    if (edge.route === 'chain') {
      const channel = depthOf.get(edge.source) ?? 0
      jogs.set(channel, Math.max(jogs.get(channel) ?? 0, edge.lane + 1))
    } else {
      arcs[edge.route] = Math.max(arcs[edge.route], edge.lane + 1)
    }
  }

  const nodeHeight = Math.max(NODE_HEIGHT, downBorder(Math.max(0, ...nodes.map((n) => n.downPorts))))
  const gutter = (deep: number): number =>
    deep === 0 ? 0 : BAND_START + deep * ARC_LANE + CHIP_WIDTH / 2
  const gutters = { left: gutter(arcs.loop), right: gutter(arcs.hop) }

  const rows = Math.max(0, ...nodes.map((node) => node.depth)) + 1
  const rowTop: number[] = []
  let y = 0
  for (let depth = 0; depth < rows; depth += 1) {
    rowTop.push(y)
    // the channel below this row: its tracks, the chip a label parks on one of them, and room for
    // the arrowhead that drops into the next row
    y += nodeHeight + CHAIN_TRACK_START + (jogs.get(depth) ?? 0) * CHAIN_TRACK + CHANNEL_GAP
  }

  return {
    slotPitch: SLOT_BAND + gutters.left + gutters.right,
    nodeHeight,
    slotBand: SLOT_BAND,
    rowTop,
    gutters,
  }
}

// how round an edge's corners are. enough that a short jog between two nodes of different widths
// reads as a curve rather than as two turns
const CORNER = 8

// where along its longest leg each lane parks its label. cycling through these by lane means two
// arcs running a gutter apart put their chips at different heights, so neither covers the other -
// which matters more than it used to, because a lane is now narrower than a chip is wide
const LABEL_STOPS = [0.5, 0.32, 0.68, 0.41, 0.59]

// the point a label sits at: along the edge's longest leg, which is the one with room for it.
// for the common straight chain edge that is the whole line, and the chip lands in the channel
function labelPoint(points: Point[], at: number): Point {
  let best = { length: -1, from: points[0], to: points[0] }
  for (let i = 0; i + 1 < points.length; i += 1) {
    const [from, to] = [points[i], points[i + 1]]
    const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y)
    if (length > best.length) {
      best = { length, from, to }
    }
  }
  return {
    x: best.from.x + (best.to.x - best.from.x) * at,
    y: best.from.y + (best.to.y - best.from.y) * at,
  }
}

// which pair of handles each route leaves and arrives by. everything else about an edge - colour,
// dash, label format - is identical, because a cycle is a shape a role really has and not a
// mistake anyone made. only the path differs, so that an edge which does not run straight down is
// visible at all rather than splined flat along the chain and lost under it
// which way an edge is heading as it arrives, per handle it arrives at
const APPROACH: Record<Position, [number, number]> = {
  [Position.Left]: [1, 0],
  [Position.Right]: [-1, 0],
  [Position.Top]: [0, 1],
  [Position.Bottom]: [0, -1],
}

// chain runs Bottom -> Top, hop arcs down the right, loop arcs back up the left
const ROUTES = {
  chain: { sourceHandle: 'out', targetHandle: 'in' },
  hop: { sourceHandle: 'hop-out', targetHandle: 'hop-in' },
  loop: { sourceHandle: 'loop-out', targetHandle: 'loop-in' },
} as const

interface EdgeData extends Record<string, unknown> {
  label: string
  // everything the path is built from. the route decides its shape, the two ports decide where it
  // leaves and arrives along the borders it meets, and the track is the one line it does its
  // sideways travel on - the line graph.ts reserved for it, which nothing else is using
  route: GraphEdge['route']
  sourcePort: number
  targetPort: number
  track: number
  // where along its longest leg the label sits, 0..1
  labelAt: number
  // pointed at or picked. one flag, because both mean the same thing to a reader - this is the
  // line you are asking about - and only their persistence differs
  lit: boolean
}

interface NodeData extends Record<string, unknown> {
  label: string
  count: number
  // the border length this node's ports need, and the height every node in the graph takes
  minWidth: number
  height: number
  dimmed: boolean
  picked: boolean
}

interface PipelineGraphProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  // how many rows deep the graph is, which is what the panel is sized from. taken from graph.ts
  // rather than recounted here, so the height and the layout cannot disagree
  depths: number
  selected: Selection | null
  onSelect: (selection: Selection | null) => void
}

// the provider is here only so FitOnMeasure can reach the instance; everything else is inside
export function PipelineGraph(props: PipelineGraphProps) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  )
}

// a node's width comes from its label, so React Flow has not measured one at the moment its own
// `fitView` prop fires - it fits an empty box and clamps to maxZoom, which showed a corner of the
// graph blown up to 2x instead of the whole thing. refitting once measurement lands is the fix,
// and re-running it when the shape changes means Refresh reframes rather than stranding new nodes
// off-screen
function FitOnMeasure({ shape, options }: { shape: string; options: FitViewOptions }) {
  const measured = useNodesInitialized()
  const { fitView } = useReactFlow()

  useEffect(() => {
    if (!measured) {
      return
    }
    // measured means every node has *a* size, not that layout has settled - fitting on that tick
    // still framed the graph too tight. two frames puts it after the paint that settles them
    let frame = 0
    const first = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        void fitView(options)
      })
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(frame)
    }
  }, [measured, shape, options, fitView])

  return null
}

function Flow({ nodes, edges, depths, selected, onSelect }: PipelineGraphProps) {
  // the picked edge and the two nodes it names, which is everything the legend needs
  const picked =
    selected?.kind === 'edge' ? edges.find((edge) => edge.id === selected.id) : undefined
  const pickedSource = nodes.find((node) => node.id === picked?.source)
  const pickedTarget = nodes.find((node) => node.id === picked?.target)

  // the rows, the slots and the nodes are all sized from the same measurement, taken once
  const layout = useMemo(() => measure(nodes, edges), [nodes, edges])

  // the panel grows with the graph instead of scaling it into a fixed box: a role with three
  // rounds looks exactly as it did, and one with ten gets the room rather than being shrunk to
  // fit. past the cap it pans and zooms, as it always has
  const drawnHeight = (layout.rowTop[depths - 1] ?? 0) + layout.nodeHeight
  const height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, drawnHeight + 2 * FIT_PADDING))

  // both fits take these - the prop's and FitOnMeasure's - so the object has to keep its identity
  // between renders, and it reserves the arc bands beside the outermost slots on top of the plain
  // breathing room
  const fitOptions = useMemo<FitViewOptions>(
    () => ({
      padding: {
        top: px(FIT_PADDING),
        bottom: px(FIT_PADDING),
        // fitView frames the nodes, and the outermost gutters hang outside that box, so without
        // this the arcs running down them are cut off at the panel's edge. only what actually
        // hangs over is reserved: on the left that is the loop gutter, which starts at the first
        // slot's edge; on the right it is the hop gutter plus however much of the slot its nodes
        // leave empty, which is the slot's allowance less the narrowest a labelled node gets
        left: px(FIT_PADDING + layout.gutters.left),
        right: px(
          FIT_PADDING + Math.max(layout.gutters.right, layout.slotBand + layout.gutters.right - NARROW_NODE),
        ),
      },
    }),
    [layout.gutters, layout.slotBand],
  )

  const flowNodes = useMemo<Node<NodeData>[]>(
    () =>
      nodes.map((node) => ({
        id: node.id,
        type: node.kind,
        position: { x: node.slot * layout.slotPitch, y: layout.rowTop[node.depth] ?? 0 },
        data: {
          label: node.label,
          count: node.count,
          // a border has to be long enough to space its ports out, and every node takes the same
          // height so that a row reads as a row
          minWidth: acrossBorder(node.acrossPorts),
          height: layout.nodeHeight,
          // only a node selection dims the others; picking a line lights the line and leaves the
          // rounds alone, since every round it touches is still part of what you are looking at
          dimmed: selected?.kind === 'node' && selected.id !== node.id,
          picked: selected?.kind === 'node' && selected.id === node.id,
        },
        draggable: false,
        connectable: false,
      })),
    [nodes, selected, layout],
  )

  // which line the pointer is on. this is React state rather than a CSS :hover rule because a lit
  // line also has to come to the front, and SVG has no z-index - the only way to raise one is to
  // give it a higher zIndex and let React Flow reorder it
  const [hovered, setHovered] = useState<string | null>(null)

  const flowEdges = useMemo<Edge[]>(() => {
    const at = new Map(nodes.map((node) => [node.id, node]))
    return edges.map((edge) => {
      const strokeWidth = MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * edge.share
      const lit = hovered === edge.id || (selected?.kind === 'edge' && selected.id === edge.id)
      const source = at.get(edge.source)
      const target = at.get(edge.target)

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'pipeline',
        ...ROUTES[edge.route],
        data: {
          label: edgeLabel(edge),
          route: edge.route,
          sourcePort: edge.sourcePort,
          targetPort: edge.targetPort,
          // the line this edge travels sideways on. laid out from the model rather than from the
          // measured boxes, so it is the same line graph.ts packed the tracks against
          track:
            source === undefined || target === undefined
              ? 0
              : trackOf(edge, source, target, layout),
          labelAt: LABEL_STOPS[edge.lane % LABEL_STOPS.length],
          lit,
        } satisfies EdgeData,
        style: { strokeWidth, ...(lit ? { stroke: EDGE_PICKED_COLOUR } : {}) },
        // above every other line, so a lit one is never left under an arc that crosses it
        zIndex: lit ? 1 : 0,
        ariaLabel: `${edge.weight} of the applicants on this role, ${sharePercent(edge)} percent, have this step in their pipeline`,
      }
    })
  }, [nodes, edges, hovered, selected, layout])

  return (
    <div className="graph" style={{ '--graph-height': px(height) } as CSSProperties}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        // both fits take the same options. the prop's fit runs first and too early - before the
        // nodes are measured - and FitOnMeasure corrects it; but the prop cannot simply be dropped
        // (without it no fit is queued at all) and if it is left to its own defaults its fit lands
        // last and silently discards the padding that keeps the graph clear of the legend
        fitView
        fitViewOptions={fitOptions}
        proOptions={{ hideAttribution: false }}
        onNodeClick={(_event, node) =>
          onSelect(
            selected?.kind === 'node' && selected.id === node.id
              ? null
              : { kind: 'node', id: node.id },
          )
        }
        onEdgeClick={(_event, edge) =>
          onSelect(
            selected?.kind === 'edge' && selected.id === edge.id
              ? null
              : { kind: 'edge', id: edge.id },
          )
        }
        onEdgeMouseEnter={(_event, edge) => setHovered(edge.id)}
        onEdgeMouseLeave={() => setHovered(null)}
        onPaneClick={() => onSelect(null)}
      >
        <FitOnMeasure shape={nodes.map((node) => node.id).join()} options={fitOptions} />
        {picked !== undefined && pickedSource !== undefined && pickedTarget !== undefined && (
          <Legend edge={picked} source={pickedSource.label} target={pickedTarget} />
        )}
        {/* the graph can be taller than the panel on a role with a long pipeline, so it pans
            and zooms, and the controls say so. they sit top-right because the corner they used to
            hold is now the bottom of the graph: the outcomes are the last row, and the leftmost of
            them landed behind the buttons */}
        <Background gap={20} size={1} />
        <Controls showInteractive={false} position="top-right" />
      </ReactFlow>
    </div>
  )
}

// the panel's floor and ceiling. the floor is the height the panel always had, so a short role
// is framed exactly as it was; the ceiling is where growing stops and panning takes over
const MIN_HEIGHT = 416
const MAX_HEIGHT = 640

// breathing room between the fitted graph and the canvas edges. the legend is deliberately NOT
// fitted around: it appears only on a click, so reserving the corner permanently would waste it on
// every role, and re-fitting when it appears would move the very line that was just clicked
const FIT_PADDING = 16

// React Flow reads a bare number as a fraction of the viewport, so padding in pixels has to carry
// its unit - and the annotation is what keeps the template literal's type
const px = (value: number): `${number}px` => `${value}px`

// the sample line's weight. middling on the 1..6 scale, so "thicker means a larger share" has
// somewhere to go in both directions rather than sitting at one end of it
const LEGEND_STROKE = 3.5
const LEGEND_WIDTH = 176
const LEGEND_MID = 13

// the chip has to fit whatever the clicked edge says - "1 · 14%" and "12 · 100%" are not the same
// width - and its exact width carries no meaning, so it is estimated from the glyph count rather
// than measured through another render
const LEGEND_CHIP_PAD = 12
const LEGEND_GLYPH = 6.2

// everyone reaches the first node by applying, so it is the one origin that does not read as a
// round somebody got to. the same pair rankStages calls the root
const ROOT = nodeKey('APPLIED', 1)

// what one line means, shown when it is clicked. the sample is that line in miniature - the same
// colour, the same chip, an arrowhead from the same geometry, and the clicked edge's own numbers -
// so the panel and the line it explains are matched by sight before a word is read
function Legend({ edge, source, target }: { edge: GraphEdge; source: string; target: GraphNode }) {
  const label = edgeLabel(edge)
  const chip = label.length * LEGEND_GLYPH + LEGEND_CHIP_PAD
  const length = ARROW_LENGTH + ARROW_PER_STROKE * LEGEND_STROKE
  const halfWidth = ARROW_HALF_WIDTH + ARROW_PER_STROKE * LEGEND_STROKE
  const base = LEGEND_WIDTH - length

  // "advanced" is only true of a move between rounds; an ending needs the verb of its own status
  const verb =
    target.kind === 'outcome'
      ? endingVerb(target.id as Parameters<typeof endingVerb>[0], edge.weight)
      : 'advanced'
  const origin = edge.source === ROOT ? 'applied' : `reached ${source}`

  return (
    <Panel position="top-left" className="graph-legend">
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
    </Panel>
  )
}

// a round somebody walks through, with the number of people standing there now.
//
// the handles sit at the middle of their borders and every edge that meets one slides along to
// its own port from there, so a pair on the same border is no longer two nudged anchors trying to
// keep two families of arc apart - the ports do that, and they do it for every edge rather than
// for two groups of them.
//
// the box takes its size from those ports: a border has to be long enough to hold them, and every
// node takes the same height so that a row of them lines up
function StageNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className={nodeClass('graph-stage', data)} style={sizeOf(data)}>
      <Handle type="target" position={Position.Top} id="in" isConnectable={false} />
      <Handle type="target" position={Position.Right} id="hop-in" isConnectable={false} />
      <Handle type="source" position={Position.Right} id="hop-out" isConnectable={false} />
      <span className="graph-label">{data.label}</span>
      {data.count > 0 && <span className="graph-count">{data.count}</span>}
      <Handle type="source" position={Position.Bottom} id="out" isConnectable={false} />
      <Handle type="source" position={Position.Left} id="loop-out" isConnectable={false} />
      <Handle type="target" position={Position.Left} id="loop-in" isConnectable={false} />
    </div>
  )
}

// how an application ended. visually distinct from a stage because it is a result, not a round
// to walk through - the last row should read as an ending at a glance
function OutcomeNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className={nodeClass('graph-outcome', data)} style={sizeOf(data)}>
      {/* an outcome has no outgoing edges, so it can never be an ancestor and never a loop's
          target; and it sits below every stage, so an edge into it is a chain step or a hop
          and never a loop. two inbound handles is all it needs */}
      <Handle type="target" position={Position.Top} id="in" isConnectable={false} />
      <Handle type="target" position={Position.Right} id="hop-in" isConnectable={false} />
      <span className="graph-label">{data.label}</span>
      {data.count > 0 && <span className="graph-count">{data.count}</span>}
    </div>
  )
}

// a node is as wide as its label unless its ports need more, and always the height the row was
// measured at. React Flow reads the box back out of the DOM, so the handles follow
function sizeOf(data: NodeData): CSSProperties {
  return { minWidth: data.minWidth, height: data.height }
}

// the whole reason this is a custom edge rather than a built-in 'smoothstep': a built-in bends
// where it likes. every edge leaving a node used to share the same run for as long as they all
// happened to agree, which is where every overlapping line in the picture came from - and the
// built-ins draw their label at the middle of the line and expose no way to move it off.
//
// so the path is built here from the corners edgePath works out: out of this edge's own port,
// along the one track reserved for it, and in to its own port at the other end
function PipelineEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  targetPosition,
  style,
  data,
}: EdgeProps<Edge<EdgeData>>) {
  const stroke = Number(style?.strokeWidth ?? MIN_WIDTH)
  const length = ARROW_LENGTH + ARROW_PER_STROKE * stroke
  const halfWidth = ARROW_HALF_WIDTH + ARROW_PER_STROKE * stroke
  // the direction the edge is travelling as it arrives, which is fixed by the border it arrives
  // at: a chain edge comes in from above, a hop arrives at the right, a loop at the left
  const [dx, dy] = APPROACH[targetPosition]
  const route = data?.route ?? 'chain'

  // React Flow hands over the middle of each border; the port slides it along to this edge's own
  // place on it
  const from = portPoint({ x: sourceX, y: sourceY }, route, data?.sourcePort ?? 0)
  const to = portPoint({ x: targetX, y: targetY }, route, data?.targetPort ?? 0)
  const corners = waypoints({ route }, from, to, data?.track ?? 0)

  // the line stops where the arrowhead begins, so the two meet instead of overlapping - but never
  // short of the corner before it, which would leave the last leg pointing backwards
  const last = corners[corners.length - 1]
  const before = corners[corners.length - 2] ?? last
  const room = Math.min(length, (Math.abs(last.x - before.x) + Math.abs(last.y - before.y)) * 0.9)
  const drawn = [...corners.slice(0, -1), { x: last.x - dx * room, y: last.y - dy * room }]

  const head = [
    [to.x, to.y],
    [to.x - dx * length - dy * halfWidth, to.y - dy * length + dx * halfWidth],
    [to.x - dx * length + dy * halfWidth, to.y - dy * length - dx * halfWidth],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(' ')

  const label = labelPoint(corners, data?.labelAt ?? 0.5)

  return (
    <>
      <BaseEdge path={pathFrom(drawn, CORNER)} style={style} />
      <polygon points={head} fill={data?.lit ? EDGE_PICKED_COLOUR : EDGE_COLOUR} />
      <EdgeText
        x={label.x}
        y={label.y}
        label={data?.label ?? ''}
        labelShowBg
        labelBgPadding={[6, 3]}
        labelBgBorderRadius={4}
        {...(data?.lit
          ? {
              // the chip recolours with its line, which is what says the two belong together -
              // worth having where several arcs run close and a label could belong to any of them
              labelStyle: { fill: EDGE_PICKED_COLOUR },
              labelBgStyle: { stroke: EDGE_PICKED_COLOUR },
            }
          : {})}
      />
    </>
  )
}

function nodeClass(kind: string, data: NodeData): string {
  return ['graph-node', kind, data.picked ? 'picked' : '', data.dimmed ? 'dimmed' : '']
    .filter((part) => part !== '')
    .join(' ')
}

// defined outside the component: React Flow warns and re-creates its internals if either object
// changes identity between renders
const nodeTypes = { stage: StageNode, outcome: OutcomeNode }
const edgeTypes = { pipeline: PipelineEdge }
