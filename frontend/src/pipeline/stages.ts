import type { Pipeline, Stage } from '../api/types'

// turning a stages array into display labels, for the three screens that need it: your
// applications, your pipeline on a job, and where the other applicants are

export interface LabelledStage {
  stage: Stage
  // 1-based: how many entries at 0..i share this name. two applicants can be at different
  // labels - "Technical Round" against "Technical Round 1" - and still both be at their first
  // technical round, so the grouping key is the pair (stage, occurrence), never the label
  occurrence: number
  label: string
}

export const UNKNOWN_STAGE = 'Unknown stage'

// a name appearing once in the list is left unnumbered, so [APPLIED, TECHNICAL_ROUND,
// TECHNICAL_ROUND, ONSITE] reads Applied, Technical Round 1, Technical Round 2, Onsite
export function labelStages(stages: Stage[]): LabelledStage[] {
  const totals = new Map<Stage, number>()
  for (const stage of stages) {
    totals.set(stage, (totals.get(stage) ?? 0) + 1)
  }

  const soFar = new Map<Stage, number>()
  return stages.map((stage) => {
    const occurrence = (soFar.get(stage) ?? 0) + 1
    soFar.set(stage, occurrence)
    const name = stageName(stage)
    return { stage, occurrence, label: totals.get(stage) === 1 ? name : `${name} ${occurrence}` }
  })
}

// no API path produces a position outside the list any more - updateStages validates the
// position against the incoming list - so this is only defensive rendering
export function currentStage(pipeline: Pipeline): LabelledStage | null {
  return labelStages(pipeline.stages)[pipeline.currentStagePosition] ?? null
}

export function currentStageLabel(pipeline: Pipeline): string {
  return currentStage(pipeline)?.label ?? UNKNOWN_STAGE
}

// TECHNICAL_ROUND -> Technical Round. the stage picker names stages one at a time, with no list
// to count occurrences against, so it wants this rather than a label
export function stageName(stage: Stage): string {
  return stage
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
