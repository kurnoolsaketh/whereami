import { useEffect, useMemo } from 'react'
import {
  Background,
  BaseEdge,
  Controls,
  EdgeText,
  getSmoothStepPath,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { edgeLabel, sharePercent, type GraphEdge, type GraphNode } from './graph'

// graph.ts already assigned every node a column and a row, so there is no layout engine here -
// React Flow is only asked to draw. the spacing is generous because React Flow routes an edge
// as a spline between two handles rather than around whatever sits in between, so a transition
// that skips several columns needs room to arc clear of the nodes it passes
const COLUMN_WIDTH = 220

// one colour for the line and its arrowhead. the line takes it from the stylesheet and the
// marker has to be told, because an SVG marker is filled by attribute, so both name the same var
const EDGE_COLOUR = 'var(--edge)'

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

// graph.ts hands every arc a lane index, packed so that no two overlapping arcs share one. all
// that is left here is turning an index into a distance from the node, which is the one part that
// has to know about pixels.
//
// lanes are spaced to fit a label rather than to fit the row: a chip is CHIP_HEIGHT tall and sits
// on its own line, so anything less and two stacked arcs' labels overlap however they are nudged
// along. an earlier version squeezed the lanes to keep the band inside a fixed ROW_HEIGHT and
// that is what crowded the labels - the height was never the binding constraint anyway, since
// fitView scales this graph on its width. so the band takes the room it needs and the row pitch
// follows it, which is ROW_HEIGHT's whole job
const NODE_HEIGHT = 34
const ARC_LANE = 26
const ROW_GAP = 22

// how far a label sits off its own line. it used to sit centred ON the line, which works while a
// label is a single number and stops working the moment it is two: the chip is ~54px wide, and a
// node as wide as "Hiring Manager Screen" leaves only COLUMN_WIDTH - 177 = 43px beside it, so the
// chip covered the line and the arrowhead both. widening the columns until it fits is not the fix
// - the gap is COLUMN_WIDTH minus a node width, and both follow the content, so it would hold
// only for today's longest stage name, and fitView would shrink the whole graph to pay for it.
//
// only a chain edge needs the treatment. it runs through the node row and its chip is wider than
// the gap the nodes leave, so it has to clear the row outright - half a node plus half a chip - or
// it clips the boxes either side instead of the line.
//
// an arc has none of that: it runs across open space with room to spare, so its label sits on its
// own line, interrupting it. lifting an arc's label was worse, not better - lanes pack as close as
// the band allows, so a chip lifted clear of its own arc lands on the one above, and which arc it
// belonged to stopped being obvious
const CHIP_HEIGHT = 19
const CHAIN_LABEL_LIFT = NODE_HEIGHT / 2 + CHIP_HEIGHT / 2 + 2
const ARC_LABEL_LIFT = 0

// clear of the chain label a chain edge has parked above the node, plus a little air
const HOP_BAND_START = CHAIN_LABEL_LIFT + CHIP_HEIGHT / 2 - NODE_HEIGHT / 2 + 6
const LOOP_BAND_START = 16

// where along its run each lane parks its label. cycling through these by lane means two arcs
// stacked a few pixels apart put their chips at different points, so neither covers the other
const LABEL_STOPS = [0.5, 0.32, 0.68, 0.41, 0.59]

function laneOffset(route: GraphEdge['route'], lane: number): number {
  return (route === 'loop' ? LOOP_BAND_START : HOP_BAND_START) + lane * ARC_LANE
}

// how much room the arcs actually need above and below a row, and therefore how far apart the
// rows have to sit. a role whose applicants all walked the same order needs none of it and stays
// as compact as it ever was
function measureBands(edges: GraphEdge[]): { hop: number; loop: number; rowPitch: number } {
  const depth = { hop: 0, loop: 0 }
  for (const edge of edges) {
    if (edge.route !== 'chain') {
      depth[edge.route] = Math.max(depth[edge.route], edge.lane + 1)
    }
  }
  const above = depth.hop === 0 ? 0 : laneOffset('hop', depth.hop - 1) + CHIP_HEIGHT / 2
  const below = depth.loop === 0 ? 0 : laneOffset('loop', depth.loop - 1) + CHIP_HEIGHT / 2
  return { ...depth, rowPitch: NODE_HEIGHT + above + below + ROW_GAP }
}

// which pair of handles each route leaves and arrives by. everything else about an edge - colour,
// dash, label format - is identical, because a cycle is a shape a role really has and not a
// mistake anyone made. only the path differs, so that an edge which does not run left to right is
// visible at all rather than splined flat along the chain and lost under it
// which way an edge is heading as it arrives, per handle it arrives at
const APPROACH: Record<Position, [number, number]> = {
  [Position.Left]: [1, 0],
  [Position.Right]: [-1, 0],
  [Position.Top]: [0, 1],
  [Position.Bottom]: [0, -1],
}

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
  // signed, because a label lifts away from the chain rather than always upwards
  lift: number
  // where along the edge the label sits, 0..1 from source to target. arcs in neighbouring lanes
  // are only a few pixels apart vertically, so if every one of them centred its label the chips
  // would pile up in the middle of the graph; sliding them apart by lane keeps each one over its
  // own line and clear of the next. undefined leaves the label at the path's own midpoint
  labelAt: number | undefined
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
  selected: string | null
  onSelect: (id: string | null) => void
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
function FitOnMeasure({ shape }: { shape: string }) {
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
      frame = requestAnimationFrame(() => void fitView())
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(frame)
    }
  }, [measured, shape, fitView])

  return null
}

function Flow({ nodes, edges, selected, onSelect }: PipelineGraphProps) {
  // the rows have to know how tall the arc bands are, and the arcs have to know their own lane,
  // so both are measured once from the edges and shared
  const bands = useMemo(() => measureBands(edges), [edges])

  const flowNodes = useMemo<Node<NodeData>[]>(
    () =>
      nodes.map((node) => ({
        id: node.id,
        type: node.kind,
        position: { x: node.column * COLUMN_WIDTH, y: node.row * bands.rowPitch },
        data: {
          label: node.label,
          count: node.count,
          dimmed: selected !== null && selected !== node.id,
          picked: selected === node.id,
        },
        draggable: false,
        connectable: false,
      })),
    [nodes, selected, bands.rowPitch],
  )

  const flowEdges = useMemo<Edge[]>(() => {
    return edges.map((edge) => {
        const route = edge.route
        const strokeWidth = MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * edge.share


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
            lift: route === 'chain' ? -CHAIN_LABEL_LIFT : ARC_LABEL_LIFT,
            labelAt: route === 'chain' ? undefined : LABEL_STOPS[edge.lane % LABEL_STOPS.length],
          } satisfies EdgeData,
          style: { strokeWidth },
          ariaLabel: `${edge.weight} of the applicants on this role, ${sharePercent(edge)} percent, have this step in their pipeline`,
        }
    })
  }, [edges])

  return (
    <div className="graph">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        fitView
        proOptions={{ hideAttribution: false }}
        onNodeClick={(_event, node) => onSelect(selected === node.id ? null : node.id)}
        onPaneClick={() => onSelect(null)}
      >
        <FitOnMeasure shape={nodes.map((node) => node.id).join()} />
        {/* the graph can be wider than the panel on a role with a long pipeline, so it pans
            and zooms, and the controls say so */}
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

// a round somebody walks through, with the number of people standing there now.
//
// the two Top handles, and the two Bottom ones, would otherwise be coincident anchors at the
// middle of their edge, so each is nudged to the side its traffic comes from: hops run left to
// right, so they leave from the right of the top edge and arrive at the left of it, and loops run
// right to left, so they do the opposite underneath. that keeps both families of arc monotone
// instead of doubling back on themselves at the ends
function StageNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className={nodeClass('graph-stage', data)}>
      <Handle type="target" position={Position.Left} id="in" isConnectable={false} />
      <Handle
        type="target"
        position={Position.Top}
        id="hop-in"
        style={{ left: '30%' }}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="hop-out"
        style={{ left: '70%' }}
        isConnectable={false}
      />
      <span className="graph-label">{data.label}</span>
      {data.count > 0 && <span className="graph-count">{data.count}</span>}
      <Handle type="source" position={Position.Right} id="out" isConnectable={false} />
      <Handle
        type="source"
        position={Position.Bottom}
        id="loop-out"
        style={{ left: '30%' }}
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="loop-in"
        style={{ left: '70%' }}
        isConnectable={false}
      />
    </div>
  )
}

// how an application ended. visually distinct from a stage because it is a result, not a round
// to walk through - the final column should read as an ending at a glance
function OutcomeNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className={nodeClass('graph-outcome', data)}>
      {/* an outcome has no outgoing edges, so it can never be an ancestor and never a loop's
          target; and it sits right of every stage, so an edge into it is a chain step or a hop
          and never a loop. two inbound handles is all it needs */}
      <Handle type="target" position={Position.Left} id="in" isConnectable={false} />
      <Handle
        type="target"
        position={Position.Top}
        id="hop-in"
        style={{ left: '30%' }}
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
  // at: a chain edge comes in from the left, a hop drops in from above, a loop rises from below
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

  // the path's own midpoint, unless the edge asked for somewhere else along its run
  const x =
    data?.labelAt === undefined ? labelX : sourceX + (targetX - sourceX) * data.labelAt

  return (
    <>
      <BaseEdge path={path} style={style} />
      <polygon points={head} fill={EDGE_COLOUR} />
      <EdgeText
        x={x}
        y={labelY + (data?.lift ?? 0)}
        label={data?.label ?? ''}
        labelShowBg
        labelBgPadding={[6, 3]}
        labelBgBorderRadius={4}
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
