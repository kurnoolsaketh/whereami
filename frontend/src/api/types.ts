// the wire format, mirroring the records in where.am.i.mvp.api

export interface User {
  userId: string
  firstName: string
  lastName: string
}

// enums reach the frontend in two different shapes, because Jackson serializes through
// toString(). Stage and Status do not override it, so they arrive as constant names -
// APPLIED, USER_WITHDREW - and the frontend title-cases them for display. Role and Level do
// override it, so they arrive as display names - "Software Engineer", "Senior" - and are
// shown exactly as they came, and handed back the same way: Role.fromName matches on the
// display name and rejects the constant.
//
// all of them are opaque strings here on purpose. the values that exist come from
// /api/stages, /api/statuses, /api/roles and /api/levels, so adding one to an enum on the
// backend needs no change in this file
export type Stage = string
export type Status = string
export type Role = string
export type Level = string
export type Company = string

// url is not optional: the backend rejects a job without one, so every job it hands back has
// it. company comes back normalised to lower case, so display it as given rather than
// re-casing it
export interface Job {
  jobId: string
  title: string
  company: Company
  url: string
  role: Role
}

// two independent axes. currentStagePosition is where you are - the position, not the stage
// name, since a pipeline may repeat a round. status is how it ended, or that it has not.
// recording an outcome never touches the stage list
export interface Pipeline {
  jobId: string
  stages: Stage[]
  currentStagePosition: number
  level: Level
  status: Status
}

// one job a user applied to, and where they are in it. the job id appears twice - job.jobId
// and pipeline.jobId - because the backend record carries it in both; that is mirrored here
// rather than tidied away, since an Applicant has only the pipeline to name its posting by
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
