// the wire format, mirroring the records in where.am.i.mvp.api

export interface User {
  userId: string
  firstName: string
  lastName: string
}

// a Pipeline.Stage name, serialized by its enum constant. the frontend treats these as opaque
// strings it title-cases for display and hands back untouched: the set of stages that exist
// comes from GET /api/stages, so adding one to the enum needs no change here
export type Stage = string

// url is not optional: the backend rejects a job without one, so every job it hands back has it
export interface Job {
  jobId: string
  title: string
  company: string
  description: string
  reqId: string
  url: string
}

// the position, not the stage name, says where someone stands - a pipeline may repeat a round
export interface Pipeline {
  stages: Stage[]
  currentStagePosition: number
}

// one job a user applied to, and where they are in it
export interface Application {
  job: Job
  pipeline: Pipeline
}

// one user who applied to a job, and where they are in it. the requesting user is in this list
// too - there is no auth to exclude them by, so the UI marks which row is theirs
export interface Applicant {
  user: User
  pipeline: Pipeline
}
