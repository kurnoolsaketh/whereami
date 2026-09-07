import type { Pipeline, Stage, Status } from '../api/types'

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
    const name = enumLabel(stage)
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

// the pair (stage, occurrence), which is what groups two applicants together. an applicant with
// one technical round is labelled "Technical Round" and one with two is at "Technical Round 1",
// but both are at their first technical round, so the label can never be the key
export function stageKey(pipeline: Pipeline): string {
  return keyOf(currentStage(pipeline))
}

export const UNKNOWN_KEY = '?'

// the id format for a (stage, occurrence) pair, defined once. graph.ts names its stage nodes
// with this and the roster filters on stageKey, so the two are the same string by construction
// rather than by two call sites agreeing to format it the same way
export function nodeKey(stage: Stage, occurrence: number): string {
  return `${stage}#${occurrence}`
}

function keyOf(at: LabelledStage | null): string {
  return at === null ? UNKNOWN_KEY : nodeKey(at.stage, at.occurrence)
}

// TECHNICAL_ROUND -> Technical Round, USER_WITHDREW -> User Withdrew. serves Stage and Status
// both, which is why it is not named for either: neither enum overrides toString on the
// backend, so both arrive as constant names and are titled the same way. Role and Level do
// override it and must never be passed through here - they arrive readable already
export function enumLabel(constant: Stage | Status): string {
  return constant
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
