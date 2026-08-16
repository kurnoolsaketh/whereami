# Applicant Tracking System for Applicants (exact name TBD)

This project allows job applicants to see statistics on who else has applied to jobs that they have and where they are in the pipeline. The end users are job applicants (not recruiters/employers). The larger goal of this app is to recreate employers' applicant tracking systems via crowdsourcing.
It is currently in MVP stage.

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
  - `PipelineService`: manages pipeline lifecycle on the backend
  - `UserRegistry`: manages user lifecycle on the backend
- `where.am.i.mvp.api`: Sub-package that exposes the registries over HTTP, using Spring Boot. Nothing in `entities` or `server` was rewritten for it. A controller only translates: it resolves the ids in the URL to `User` and `Job` objects, calls the matching registry or service method, and returns a record. No state, no rules. Controllers talk to the registries and the service directly, not through `Client` — `Client` describes the shape of the API, it is not a layer to route calls through.
  - `Application`: the Spring Boot entry point. It sits in `where.am.i.mvp`, one level up, so component scanning reaches every sub-package.
  - `RegistryConfiguration`: builds the single `UserRegistry`, `JobRegistry` and `PipelineService` that the whole app shares. All three are in-memory, so everything is lost when the process stops.
  - `UserController`, `JobController`, `PipelineController`, `StageController`: the endpoints, split by the noun they act on. `StageController` serves `GET /api/stages`, the `Pipeline.Stage` values, so the frontend never hardcodes the enum.
  - `*Request` and `*Response` records carry the wire format rather than entities being serialized directly. `PipelineResponse` is the full stage list plus an index into it, never a stage name on its own — a pipeline may repeat a round, so only the index can say *which* technical round someone is in.
  - `ApiExceptionHandler`: maps `IOException` to HTTP 400 with a JSON message, because `IOException` is what the existing code throws for every validation failure.
  - Every endpoint that returns a list sorts it in the controller. The underlying collections are `HashMap`s and `HashSet`s of `Job` and `User`, neither of which overrides `hashCode`, so their iteration order comes from identity hash codes and changes per run.

Backend tests are under `mvp/src/test/java`: `ClientTest`, plus a MockMvc test per controller.

### Frontend
`frontend/` is a Vite + React + TypeScript app using react-router. Node is pinned by `frontend/.nvmrc`; the Vite dev server proxies `/api` to the backend on port 8080, which keeps the browser on one origin and means there is no CORS configuration to keep in step.

- `src/api/`: `client.ts` is the only module that calls `fetch` — no component talks to the network directly. `types.ts` mirrors the records in `where.am.i.mvp.api`. `useLoad.ts` is the load/error/reload hook every screen uses.
- `src/session/`: the signed-in user id, held in `sessionStorage` rather than `localStorage` so **each browser tab is a different user**. That is how you test several applicants on one job. There is one user per session, no password, and no user switcher.
- `src/pipeline/stages.ts`: turns a `stages` array into display labels — a repeated stage is numbered, a stage appearing once is not — and groups applicants on the pair `(stage, occurrence)`. The pair is the grouping key, never the label: an applicant with one technical round is labelled "Technical Round" and one with two is at "Technical Round 1", but both are at their first technical round.
- `src/routes/`: one component per screen — sign in, my applications, browse jobs, add a job, and the job detail route, which carries your own pipeline and the list of everyone else on that job.

### Running it locally
Needs Java 25 (the Maven Wrapper fetches Maven itself) and the Node version in `frontend/.nvmrc`.

```
cd mvp && ./mvnw spring-boot:run          # backend on :8080
cd frontend && nvm use && npm install && npm run dev   # frontend on :5173
```

`cd mvp && ./mvnw test` runs the backend tests. In `frontend/`, `npm run build` typechecks and builds, and `npm run lint` runs oxlint.

There is no sample data and no database — you create everything through the UI, and restarting the backend clears it.

### Next Steps
- [x] Turn the MVP into a live app that runs locally and supports basic user/job/pipeline creation
  - [x] Implement the frontend using ReactJS
- [ ] Durably persist users, jobs, and pipelines in a database

### Known bugs, deliberately left alone
These predate the HTTP layer and are marked with `//TODO` where they live, rather than fixed:

- `Job` and `User` override `equals` without `hashCode`, and both are used as `HashMap` keys or `HashSet` members. This works only because `JobRegistry` hands out one instance per job.
- `User.equals` depends on the mutable `activeJobToPipeline`, so a user's equality changes as they apply to jobs.
- `PipelineService.removeApplicant` throws `NullPointerException` if the job has no applicants entry.
- `PipelineService.getApplicantsAtStage` wraps `IOException` in `RuntimeException`.
- `JobRegistry`'s constructor takes a `PipelineService` it never uses.
- `JobRegistry.getJob` rejects ids whose length is not 64 with the message "must be 64 bytes" — it is 64 hex characters, which is 32 bytes.
- Validation failures throughout are signalled with `IOException`, which is not an I/O condition.
