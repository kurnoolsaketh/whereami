# Applicant Tracking System for Applicants (exact name TBD)

This project allows job applicants to see statistics on who else has applied to jobs that they have and where they are in the pipeline. It is currently in MVP stage.

## MVP Implementation
### Structure
MVP can be found under `whereami/mvp`. Its package structure is as follows:

- `where.am.i.mvp.Client`: A simple client implementation that describes the public facing API of the app. Refer to this to understand how a `User` should interact with the app. This is not to be used literally in a frontend.
- `where.am.i.mvp.entities`: Sub-package that defines the shape of the core entities in the system (ie, the "nouns"). The entities are Java POJOs:
  - `User`: a user of the app. `User`s apply to `Job`s.
  - `Job`: a job that a `User` applies to.
  - `Pipeline`: a wrapper around the interview stages that a `User` goes through (as specified by the hiring team/recruiter) plus the `User`'s current interview stage. There is one `Pipeline` instance per `Job` per `User`. In other words, different `User`s may have different `Pipeline`s for the same `Job` to reflect how the interview process may be different for each candidate.
- `where.am.i.mvp.server`: Sub-package that contains a primitive backend server implementation:
  - `JobRegistry`: manages job lifecycle on the backend (create and get)
  - `PipelineController`: manages pipeline lifecycle on the backend
  - `UserRegistry`: manages user lifecycle on the backend

Tests can be found under `mvp/test`.

### Next Steps
- [ ] Turn the MVP into a live app that runs locally and supports basic user/job/pipeline creation
  - [ ] Implement the frontend using ReactJS
- [ ] Durably persist users, jobs, and pipelines in a database
