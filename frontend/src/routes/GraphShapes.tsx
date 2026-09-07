import { useState } from 'react'
import { buildGraph, type Selection } from '../pipeline/graph'
import { PipelineGraph } from '../pipeline/PipelineGraph'
import { SHAPES, STAGES, STATUSES, type Shape } from '../pipeline/fixtures'

// every role shape the layout has to survive, one under the next, with no backend behind any of
// them. the graph is the one part of this app whose correctness is judged by eye, so it needs a
// page where a change to a constant shows its effect on all seven shapes at once - reseeding a
// running backend for each tuning pass is not a loop anybody would use.
//
// it is not linked from anywhere: it is reached by typing /dev/graph, and it exists for whoever
// is working on layout.ts and edgePath.ts
export function GraphShapes() {
  return (
    <main>
      <section className="graph-shapes">
        <div className="section-header">
          <div>
            <h2>Graph shapes</h2>
            <p className="subtitle">
              fixtures, not data — drag to pan, scroll to zoom, click a line or a round
            </p>
          </div>
        </div>
        {SHAPES.map((shape) => (
          <One key={shape.name} shape={shape} />
        ))}
      </section>
    </main>
  )
}

function One({ shape }: { shape: Shape }) {
  const [selected, setSelected] = useState<Selection | null>(null)
  const graph = buildGraph(shape.pipelines, STAGES, STATUSES)

  return (
    <article className="card">
      <h3>{shape.name}</h3>
      <p>{shape.note}</p>
      <PipelineGraph graph={graph} selected={selected} onSelect={setSelected} />
    </article>
  )
}
