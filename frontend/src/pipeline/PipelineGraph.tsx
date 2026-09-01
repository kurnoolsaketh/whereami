import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  Background,
  BaseEdge,
  Controls,
  EdgeText,
  getSmoothStepPath,
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
import { endingVerb } from './status'
import { nodeKey } from './stages'

// graph.ts already assigned every node a depth and a slot, so there is no layout engine here -
// React Flow is only asked to draw. depth reads down the screen and slots spread across it. the
// spacing is generous because React Flow routes an edge as a spline between two handles rather
// than around whatever sits in between, so a transition that skips several depths needs room to
// arc clear of the nodes it passes.
//
// how wide one slot is before its arc bands are added. a node's width comes from its label and
// nothing has been measured at the moment positions are handed over, so this is an allowance for
// the longest stage name plus the air beside it, not a measurement
const SLOT_WIDTH = 220

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

// the pitch between two depths, and unlike the one between two slots it is a plain constant:
// nothing arcs between two rows, so a row needs room for a node and for the chip a chain edge
// parks in the gap below it, and nothing else
const NODE_HEIGHT = 34
const CHIP_HEIGHT = 19
const DEPTH_GAP = 30
const DEPTH_PITCH = NODE_HEIGHT + CHIP_HEIGHT + DEPTH_GAP

// graph.ts hands every arc a lane index, packed so that no two overlapping arcs share one. all
// that is left here is turning an index into a distance from the node's side, which is the one
// part that has to know about pixels.
//
// lanes are spaced to fit a label, and the label an arc has to clear now sits beside it rather
// than above it - a chip is about three times wider than it is tall, so a lane is wider than it
// used to be deep. that room is the cheap one on this layout: fitView scales the graph on its
// height now, and a role whose applicants all walked the same order takes none of these bands at
// all and stays as narrow as it ever was
const ARC_LANE = 34

// roughly how wide a chip is - "12 · 100%" at the edge font. estimated from the glyph count
// rather than measured through another render, the same way the legend estimates its own: the
// exact width carries no meaning, it only has to be close enough to leave the arcs room
const CHIP_WIDTH = 56

// how far a label sits off its own line, across the line rather than along it.
//
// a chain edge needs none: it runs straight down through open space, and the gap below a node is
// sized to hold its chip, so the chip sits on the line and interrupts it, the way an arc's always
// has. this is the one thing the turn made simpler - laid out left to right, a chain label had to
// clear the whole node row, because the chip was wider than the gap a name like "Hiring Manager
// Screen" left beside it and it covered the line and the arrowhead both.
//
// an arc's does lift, outward from the node, because lane 0 hugs the node's side closely enough
// that a chip centred on it would lie over the box
const ARC_LABEL_LIFT = 18

// where each band starts, measured out from the node's side. nothing is parked out here for the
// first lane to clear any more - a chain edge's chip is below the node, not beside it - so an arc
// only has to leave the node's own border
const HOP_BAND_START = 14
const LOOP_BAND_START = 14

// where along its run each lane parks its label. cycling through these by lane means two arcs
// stacked a few pixels apart put their chips at different points, so neither covers the other
const LABEL_STOPS = [0.5, 0.32, 0.68, 0.41, 0.59]

function laneOffset(route: GraphEdge['route'], lane: number): number {
  return (route === 'loop' ? LOOP_BAND_START : HOP_BAND_START) + lane * ARC_LANE
}

// how much room the arcs actually need either side of a slot, and therefore how far apart the
// slots have to sit. hops run down the right of a node and loops back up its left, so between two
// neighbours the two bands sit end to end.
//
// the two widths are handed out as well as the pitch, because the fit needs them too: fitView
// frames the *nodes*, and the outermost slots' bands hang outside that box - so without them the
// arc running down the right of the last slot is cut off at the panel's edge
function measureBands(edges: GraphEdge[]): { left: number; right: number; slotPitch: number } {
  const lanes = { hop: 0, loop: 0 }
  for (const edge of edges) {
    if (edge.route !== 'chain') {
      lanes[edge.route] = Math.max(lanes[edge.route], edge.lane + 1)
    }
  }
  const right = lanes.hop === 0 ? 0 : laneOffset('hop', lanes.hop - 1) + CHIP_WIDTH / 2
  const left = lanes.loop === 0 ? 0 : laneOffset('loop', lanes.loop - 1) + CHIP_WIDTH / 2
  return { left, right, slotPitch: SLOT_WIDTH + right + left }
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
  // the smoothstep offset for an arc: how far off the node it runs before turning. undefined for
  // a chain edge, which takes the library's default
  lane: number | undefined
  // signed, because a label sits to the right of a hop and to the left of a loop - each on the
  // open side of its own arc
  lift: number
  // where along the edge the label sits, 0..1 from source to target. arcs in neighbouring lanes
  // are only a lane apart across the run, which is less than a chip is wide, so if every one of
  // them centred its label the chips would pile up on each other; sliding them apart down the run
  // keeps each one beside its own line. undefined leaves the label at the path's own midpoint
  labelAt: number | undefined
  // pointed at or picked. one flag, because both mean the same thing to a reader - this is the
  // line you are asking about - and only their persistence differs
  lit: boolean
}

interface NodeData extends Record<string, unknown> {
  label: string
  count: number
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

  // the slots have to know how wide the arc bands are, and the arcs have to know their own lane,
  // so both are measured once from the edges and shared
  const bands = useMemo(() => measureBands(edges), [edges])

  // the panel grows with the graph instead of scaling it into a fixed box: a role with three
  // rounds looks exactly as it did, and one with ten gets the room rather than being shrunk to
  // fit. past the cap it pans and zooms, as it always has
  const height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, depths * DEPTH_PITCH + 2 * FIT_PADDING))

  // both fits take these - the prop's and FitOnMeasure's - so the object has to keep its identity
  // between renders, and it reserves the arc bands beside the outermost slots on top of the plain
  // breathing room
  const fitOptions = useMemo<FitViewOptions>(
    () => ({
      padding: {
        top: px(FIT_PADDING),
        bottom: px(FIT_PADDING),
        left: px(FIT_PADDING + bands.left),
        right: px(FIT_PADDING + bands.right),
      },
    }),
    [bands.left, bands.right],
  )

  const flowNodes = useMemo<Node<NodeData>[]>(
    () =>
      nodes.map((node) => ({
        id: node.id,
        type: node.kind,
        position: { x: node.slot * bands.slotPitch, y: node.depth * DEPTH_PITCH },
        data: {
          label: node.label,
          count: node.count,
          // only a node selection dims the others; picking a line lights the line and leaves the
          // rounds alone, since every round it touches is still part of what you are looking at
          dimmed: selected?.kind === 'node' && selected.id !== node.id,
          picked: selected?.kind === 'node' && selected.id === node.id,
        },
        draggable: false,
        connectable: false,
      })),
    [nodes, selected, bands.slotPitch],
  )

  // which line the pointer is on. this is React state rather than a CSS :hover rule because a lit
  // line also has to come to the front, and SVG has no z-index - the only way to raise one is to
  // give it a higher zIndex and let React Flow reorder it
  const [hovered, setHovered] = useState<string | null>(null)

  const flowEdges = useMemo<Edge[]>(() => {
    return edges.map((edge) => {
        const route = edge.route
        const strokeWidth = MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * edge.share
        const lit = hovered === edge.id || (selected?.kind === 'edge' && selected.id === edge.id)


        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'pipeline',
          ...ROUTES[route],
          data: {
            label: edgeLabel(edge),
            lane:
              route === 'chain' ? undefined : laneOffset(route, edge.lane),
            lift: route === 'chain' ? 0 : route === 'loop' ? -ARC_LABEL_LIFT : ARC_LABEL_LIFT,
            labelAt: route === 'chain' ? undefined : LABEL_STOPS[edge.lane % LABEL_STOPS.length],
            lit,
          } satisfies EdgeData,
          style: { strokeWidth, ...(lit ? { stroke: EDGE_PICKED_COLOUR } : {}) },
          // above every other line, so a lit one is never left under an arc that crosses it
          zIndex: lit ? 1 : 0,
          ariaLabel: `${edge.weight} of the applicants on this role, ${sharePercent(edge)} percent, have this step in their pipeline`,
        }
    })
  }, [edges, hovered, selected])

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
// the two Right handles, and the two Left ones, would otherwise be coincident anchors at the
// middle of their edge, so each is nudged to the end its traffic comes from: hops run downward, so
// they leave low on the right edge and arrive high on it, and loops run back upward, so they do
// the opposite on the left. that keeps both families of arc monotone instead of doubling back on
// themselves at the ends
function StageNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className={nodeClass('graph-stage', data)}>
      <Handle type="target" position={Position.Top} id="in" isConnectable={false} />
      <Handle
        type="target"
        position={Position.Right}
        id="hop-in"
        style={{ top: '30%' }}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="hop-out"
        style={{ top: '70%' }}
        isConnectable={false}
      />
      <span className="graph-label">{data.label}</span>
      {data.count > 0 && <span className="graph-count">{data.count}</span>}
      <Handle type="source" position={Position.Bottom} id="out" isConnectable={false} />
      <Handle
        type="source"
        position={Position.Left}
        id="loop-out"
        style={{ top: '30%' }}
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="loop-in"
        style={{ top: '70%' }}
        isConnectable={false}
      />
    </div>
  )
}

// how an application ended. visually distinct from a stage because it is a result, not a round
// to walk through - the last row should read as an ending at a glance
function OutcomeNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className={nodeClass('graph-outcome', data)}>
      {/* an outcome has no outgoing edges, so it can never be an ancestor and never a loop's
          target; and it sits below every stage, so an edge into it is a chain step or a hop
          and never a loop. two inbound handles is all it needs */}
      <Handle type="target" position={Position.Top} id="in" isConnectable={false} />
      <Handle
        type="target"
        position={Position.Right}
        id="hop-in"
        style={{ top: '30%' }}
        isConnectable={false}
      />
      <span className="graph-label">{data.label}</span>
      {data.count > 0 && <span className="graph-count">{data.count}</span>}
    </div>
  )
}

// the whole reason this is a custom edge rather than a built-in 'smoothstep': the built-ins draw
// their label at the labelX/labelY the path function returns - the middle of the line - and expose
// labelStyle and labelBgPadding but no way to move it off. so the path is computed here and the
// label placed beside it instead of on it
function PipelineEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  style,
  data,
}: EdgeProps<Edge<EdgeData>>) {
  const stroke = Number(style?.strokeWidth ?? MIN_WIDTH)
  const length = ARROW_LENGTH + ARROW_PER_STROKE * stroke
  const halfWidth = ARROW_HALF_WIDTH + ARROW_PER_STROKE * stroke
  // the direction the edge is travelling as it arrives, which is fixed by the handle it arrives
  // at: a chain edge comes in from above, a hop arrives at the right, a loop at the left
  const [dx, dy] = APPROACH[targetPosition]

  // the line stops where the head begins, so the two meet instead of overlapping
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX: targetX - dx * length,
    targetY: targetY - dy * length,
    targetPosition,
    ...(data?.lane === undefined ? {} : { offset: data.lane }),
  })
  const head = [
    [targetX, targetY],
    [targetX - dx * length - dy * halfWidth, targetY - dy * length + dx * halfWidth],
    [targetX - dx * length + dy * halfWidth, targetY - dy * length - dx * halfWidth],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(' ')

  // the path's own midpoint, unless the edge asked for somewhere else along its run - which now
  // means further down it, since every edge on this layout travels mostly downward
  const y =
    data?.labelAt === undefined ? labelY : sourceY + (targetY - sourceY) * data.labelAt

  return (
    <>
      <BaseEdge path={path} style={style} />
      <polygon points={head} fill={data?.lit ? EDGE_PICKED_COLOUR : EDGE_COLOUR} />
      <EdgeText
        x={labelX + (data?.lift ?? 0)}
        y={y}
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
