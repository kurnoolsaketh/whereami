import { useMemo } from 'react'
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { GraphEdge, GraphNode } from './graph'

// graph.ts already assigned every node a column and a row, so there is no layout engine here -
// React Flow is only asked to draw. the spacing is generous because React Flow routes an edge
// as a spline between two handles rather than around whatever sits in between, so a transition
// that skips several columns needs room to arc clear of the nodes it passes
const COLUMN_WIDTH = 220
const ROW_HEIGHT = 96

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

export function PipelineGraph({ nodes, edges, selected, onSelect }: PipelineGraphProps) {
  const flowNodes = useMemo<Node<NodeData>[]>(
    () =>
      nodes.map((node) => ({
        id: node.id,
        type: node.kind,
        position: { x: node.column * COLUMN_WIDTH, y: node.row * ROW_HEIGHT },
        data: {
          label: node.label,
          count: node.count,
          dimmed: selected !== null && selected !== node.id,
          picked: selected === node.id,
        },
        draggable: false,
        connectable: false,
      })),
    [nodes, selected],
  )

  const flowEdges = useMemo<Edge[]>(
    () =>
      edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        // a back edge runs right to left. sent through the normal side handles it would be
        // splined straight along the row and vanish under the main chain, so it leaves from
        // the bottom and arrives at the top instead, and reads as the loop it is
        sourceHandle: edge.outOfOrder ? 'back-out' : 'out',
        targetHandle: edge.outOfOrder ? 'back-in' : 'in',
        label: String(edge.weight),
        // an out-of-order edge closed a cycle: somebody recorded these rounds the other way
        // round from everyone else. it is drawn, but drawn as the exception it is
        animated: false,
        style: {
          strokeWidth: Math.min(1 + edge.weight, 6),
          // dashed AND coloured: a back edge runs right to left across the whole graph, and
          // React Flow splines it straight over whatever sits in between rather than routing
          // around, so dashes alone are easy to lose against the main chain
          strokeDasharray: edge.outOfOrder ? '6 4' : undefined,
          stroke: edge.outOfOrder ? 'var(--error-text)' : undefined,
        },
        labelShowBg: true,
        ariaLabel: edge.outOfOrder
          ? `${edge.weight} recorded this transition, against the order everyone else recorded`
          : `${edge.weight} recorded this transition`,
      })),
    [edges],
  )

  return (
    <div className="graph">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        fitView
        proOptions={{ hideAttribution: false }}
        onNodeClick={(_event, node) => onSelect(selected === node.id ? null : node.id)}
        onPaneClick={() => onSelect(null)}
      >
        {/* the graph can be wider than the panel on a role with a long pipeline, so it pans
            and zooms, and the controls say so */}
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

// a round somebody walks through, with the number of people standing there now
function StageNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className={nodeClass('graph-stage', data)}>
      <Handle type="target" position={Position.Left} id="in" isConnectable={false} />
      <Handle type="target" position={Position.Top} id="back-in" isConnectable={false} />
      <span className="graph-label">{data.label}</span>
      {data.count > 0 && <span className="graph-count">{data.count}</span>}
      <Handle type="source" position={Position.Right} id="out" isConnectable={false} />
      <Handle type="source" position={Position.Bottom} id="back-out" isConnectable={false} />
    </div>
  )
}

// how an application ended. visually distinct from a stage because it is a result, not a round
// to walk through - the final column should read as an ending at a glance
function OutcomeNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className={nodeClass('graph-outcome', data)}>
      {/* an outcome has no outgoing edges, so it can never be an ancestor and never the target
          of a back edge - one inbound handle is all it needs */}
      <Handle type="target" position={Position.Left} id="in" isConnectable={false} />
      <span className="graph-label">{data.label}</span>
      {data.count > 0 && <span className="graph-count">{data.count}</span>}
    </div>
  )
}

function nodeClass(kind: string, data: NodeData): string {
  return ['graph-node', kind, data.picked ? 'picked' : '', data.dimmed ? 'dimmed' : '']
    .filter((part) => part !== '')
    .join(' ')
}

// defined outside the component: React Flow warns and re-creates its internals if this object
// changes identity between renders
const nodeTypes = { stage: StageNode, outcome: OutcomeNode }
