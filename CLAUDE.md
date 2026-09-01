# Applicant Tracking System for Applicants (exact name TBD)

This project allows job applicants to see statistics on who else has applied to jobs that they have and where they are in the pipeline. The end users are job applicants (not recruiters/employers). The larger goal of this app is to recreate employers' applicant tracking systems via crowdsourcing.
It is currently in MVP stage.

The unit the app is organised around is a **role at a company**, not an individual posting. A company may advertise the same role under several titles and run all of them through one interview process, so postings are pooled under `(company, role)` and that pair is what the interesting screen keys on.

## MVP Implementation
### Structure
MVP can be found under `whereami/mvp`. Its package structure is as follows:

- `where.am.i.mvp.entities`: Sub-package that defines the shape of the core entities in the system (ie, the "nouns"). All of them are Java records except `Pipeline`, which is mutable:
  - `User`: a user of the app. `User`s apply to `Job`s.
  - `Company`: a company, whose name is normalised to `toLowerCase().trim()` by `CompanyRegistry`. `"BumCo"` goes in and `"bumco"` comes back, so display exactly what the API returns rather than re-casing it — `eBay` would break.
  - `Role`: an enum of the roles a `Job` can be for. It overrides `toString()`, so it travels as a display name (`"Software Engineer"`), and `Role.fromName` expects that display name — the constant name is rejected.
  - `Level`: an enum of seniorities, also overriding `toString()`.
  - `Job`: a posting at a `Company` for a `Role`. Its id is a SHA-256 of `title + company + url + role`, so recreating an identical posting yields the same id and overwrites in place rather than erroring.
  - `Pipeline`: the interview stages a `User` was told about for one `Job`, plus where they are in them and how it ended. One per `Job` per `User`, so different `User`s can have different `Pipeline`s for the same `Job`.
- `where.am.i.mvp.server`: Sub-package that contains a primitive backend server implementation:
  - `JobRegistry`: manages job lifecycle on the backend (create, get, and list by company and/or role)
  - `ApplicantService`: manages pipeline lifecycle from the applicant's side — who applied to what, and where they are in it
  - `UserRegistry`: manages user lifecycle on the backend
  - `CompanyRegistry`: registers companies and normalises their names
- `where.am.i.mvp.api`: Sub-package that exposes the registries over HTTP, using Spring Boot. Nothing in `entities` or `server` was rewritten for it. A controller only translates: it resolves the ids in the URL to entities, calls the matching registry or service method, and returns a record. No state, no rules.
  - `Application`: the Spring Boot entry point. It sits in `where.am.i.mvp`, one level up, so component scanning reaches every sub-package.
  - `RegistryConfiguration`: builds the single `UserRegistry`, `JobRegistry`, `CompanyRegistry` and `ApplicantService` that the whole app shares. All four are in-memory, so everything is lost when the process stops.
  - `UserController`, `JobController`, `RolesController`, `ApplicantController`: the endpoints, split by the noun they act on.
  - `StageController`, `LevelController`, `StatusController`: serve `GET /api/stages`, `/api/levels` and `/api/statuses`, so the frontend never hardcodes an enum the backend owns.
  - `*Request` and `*Response` records carry the wire format rather than entities being serialized directly. `PipelineResponse` is the full stage list plus an index into it, never a stage name on its own — a pipeline may repeat a round, so only the index can say *which* technical round someone is in.
  - `ApiExceptionHandler`: maps `IOException` to HTTP 400 with a JSON message, because `IOException` is what the existing code throws for every validation failure. It also maps `HttpMessageNotReadableException` — a body Spring cannot parse is rejected before any controller runs, so without that handler an unknown enum value reaches the client as Spring's default error body, which has no `message` field for the frontend to read.
  - Every endpoint that returns a list sorts it in the controller. The underlying collections are `HashMap`s and `HashSet`s, so iteration order is not stable across runs.

Backend tests are under `mvp/src/test/java`: a MockMvc test per controller.

#### Path-variable order

`{company}` comes before `{role}` in every path that carries both — `JobController` and `RolesController` agree on this. Both segments are display names containing spaces, so every one must be percent-encoded by the caller.

Note that `RolesController.listApplicantsForCompanyAndRole` declares its parameters in the opposite order to its `{company}/{role}` mapping. Spring binds by name, so it is correct; do not "fix" it by swapping the mapping.

### The Stage / Status split

`Pipeline` carries two independent axes, and conflating them is the main way to break this app:

- **`Pipeline.Stage`** is *where you are*: `APPLIED, RECRUITER_SCREEN, HIRING_MANAGER_SCREEN, TECHNICAL_ROUND, BEHAVIORAL_ROUND, ONSITE`.
- **`Pipeline.Status`** is *how it ended, or that it has not*: `ACTIVE, USER_WITHDREW, OFFER, REJECTED`.

`OFFER` used to be a `Stage` and is now a `Status`. "Rejected after the recruiter screen" is `currentStagePosition = 1, status = REJECTED` — **nothing is ever truncated or appended to a stage list to express an outcome.** That is what makes recording an outcome free and reopening lossless, and it is asserted directly in `ApplicantControllerTest`.

Once a pipeline is not `ACTIVE`, `Pipeline` refuses stage changes (guarded there rather than in `ApplicantService`, because that is where `status` and `stages` are both fields). Reopening lifts the guard.

### Enum wire format is mixed

Jackson serializes an enum through `toString()`, and only some of these override it:

| Type | On the wire | Why |
|---|---|---|
| `Pipeline.Stage` | `"APPLIED"`, `"TECHNICAL_ROUND"` | no `toString()` override |
| `Pipeline.Status` | `"ACTIVE"`, `"USER_WITHDREW"` | same |
| `Role` | `"Software Engineer"` | `toString()` returns the display name |
| `Level` | `"Senior"` | same |

So the frontend's `enumLabel()` (the underscore splitter) applies to **stages and statuses only**. Roles and levels arrive readable and are handed straight back.

### Frontend
`frontend/` is a Vite + React + TypeScript app using react-router. Node is pinned by `frontend/.nvmrc`; the Vite dev server proxies `/api` to the backend on port 8080, which keeps the browser on one origin and means there is no CORS configuration to keep in step.

- `src/api/`: `client.ts` is the only module that calls `fetch` — no component talks to the network directly. `types.ts` mirrors the records in `where.am.i.mvp.api`. `useLoad.ts` is the load/error/reload hook every screen uses.
  - **`client.test.ts` is load-bearing.** `fetch` responses are cast rather than validated, so a client function can request a path the backend no longer serves and still typecheck cleanly — which is exactly how the frontend once drifted a whole release behind the API without anything noticing. This file pins the exact path, method and body of every wrapped endpoint against the controllers. When you change an endpoint on either side, a line here must break.
- `src/session/`: the signed-in user id, held in `sessionStorage` rather than `localStorage` so **each browser tab is a different user**. That is how you test several applicants on one role. There is one user per session, no password, and no user switcher.
- `src/pipeline/stages.ts`: turns a `stages` array into display labels — a repeated stage is numbered, a stage appearing once is not — and groups applicants on the pair `(stage, occurrence)`. The pair is the grouping key, never the label: an applicant with one technical round is labelled "Technical Round" and one with two is at "Technical Round 1", but both are at their first technical round. `nodeKey()` defines the id format for that pair, and both `stageKey` and `graph.ts` go through it so the two produce the same string by construction.
- `src/pipeline/status.ts`: the **only** file that names an individual status. `ACTIVE` has to be known by name — it is the difference between a running application and an ended one — but every outcome control is generated from `GET /api/statuses`, so a status added to the enum later gets its own button, tag and graph node with no frontend change. `endingVerb` is the one place a status is phrased for a sentence, and it keeps that rule: a status the enum gains later still gets its node, button and tag with no change here, and falls through to wording built from its own label rather than to something false.
- `src/pipeline/graph.ts`: builds the merged pipeline for a role. Pure — no React, no network — and covered by `graph.test.ts`. **The result is a directed graph and may contain cycles**: a role that sends someone back for another round after a technical one is a real shape, not an error by whoever recorded it. The graph reads **top to bottom**: `depth` is a node's distance from Applied and is drawn downward, `slot` is its place across the row of nodes at that depth. Only the depth ranking needs a DAG. The step order in `buildGraph` is load-bearing; the comments say why at each step. Six things to know before editing it:
  - Outcome nodes are synthesized **after** stage ranking, which is what pins them to the last row. Ranked together, one pipeline rejected early would drag its outcome into the middle of the graph.
  - `backEdge` is **layout metadata, not a verdict**. Ranking holds one edge of each cycle aside so it has an acyclic graph to rank; that edge is still drawn, and drawn exactly like every other one. Which edge is held aside is decided by exploring the heaviest outgoing edge first. Without that tie-break it would depend on traversal order, which follows the applicants list sorted by `userId` — so one outlier could outrank a transition eight people recorded, and the layout would change if somebody renamed themselves.
  - **An edge is a move somebody made, not a round they were announced.** `buildGraph` keeps two edge sets: `announced` (every consecutive pair in every stage list) exists only to lay the graph out, so a round nobody has reached yet still sits below the one before it and the layout does not reshuffle as applicants advance; `drawn` is the walked prefix of each pipeline plus one outcome edge per terminated applicant, and is what the graph shows. Ranking marks its cycle-breaks on `announced`, so `backEdge` is copied across by id before routes are decided. An announced step nobody has taken produces no edge at all — its rounds are still nodes.
  - `share` is an edge's weight over the applicants who **reached its source**, not over the role. That makes a node's outgoing edges a real partition: everyone who reached it either moved on (one walked edge), ended there (one outcome edge), or is standing on it (the badge, and no edge). So `outgoing weights + badge = reached` for every node, which `graph.test.ts` asserts directly. Note the consequence: a lone applicant on the only path out of a rarely-reached node renders at 100% and therefore thickest, so thickness reads "what happens next from here", not "how many people".
  - **A node sits under the parent that feeds it.** `assignSlots` orders each row by the slot of the heaviest edge into each node, so a branch stays in one block and its lines do not cross the next branch's; `sortKey` — the stages endpoint's order — only breaks ties, which is what keeps a fork readable and the layout identical however the applicants were sorted. Ordering a row by that endpoint alone, as the columns once did, puts a child wherever its own stage happens to rank, and two forks then swap over each other on the way down. Parents come from the same `announced` edges the ranking used, minus its cycle-breaks, so the sideways order is as still as the depths are; outcomes have no announced pair and take their drawn edges instead. One pass, no crossing-minimisation beyond it, and no centring of a parent over its children — slots are indices.
  - `route` and `lane` are **layout, and they live here rather than in the renderer**. A `route` says how an edge has to travel to stay visible — `chain` to the next depth, `hop` reaching past it, `loop` closing a cycle — and a `lane` says which level of its band an arc travels in. Arcs are packed by interval-graph colouring: an arc occupies the whole span of depths between its endpoints, and two arcs in the same band whose spans overlap must not share a lane or they are drawn one on top of the other. `packLanes` sorts by the shallower end and takes the lowest free lane, which needs every arc at once — which is why this cannot sit in the component. **Do not "simplify" a lane to a function of the span's length**: two arcs of equal length then get the same lane by definition, and a staircase of equal-length hops, which is exactly what consecutive stages produce, collapses onto one line. `graph.test.ts` asserts the no-overlap property directly rather than fixed lane numbers.
  - `nodeHolds()` and `edgeHolds()` are the rules the roster filters by, and each is deliberately the same rule its number is counted by — `nodeHolds` against the badges, `edgeHolds` against the edge weights, both reading the same `movesOf()` a weight was built from. So a filtered list always has exactly as many rows as the thing you clicked claims. `edgeId()` exists for the same reason `nodeKey()` does: one place formats an edge id, so `bump` and `edgeHolds` cannot format it differently.
- `src/pipeline/PipelineGraph.tsx`: renders that graph with `@xyflow/react`. It does no layout — `graph.ts` supplies `depth`, `slot`, `route` and `lane`; this file only turns them into handles and pixels, `x = slot * slotPitch` and `y = depth * DEPTH_PITCH`. React Flow splines an edge between two handles rather than routing around intervening nodes, which is why a route exists at all: an edge that does not reach the very next depth would otherwise be drawn flat through the boxes it passes. The three routes differ in path only — colour, stroke and label format are identical, and each is the old left-to-right route turned a quarter clockwise:
  - adjacent depths: `Bottom → Top`, the chain.
  - a span greater than one: `Right → Right`, arcing **down the right** of the chain. This is what rescues outcome edges, which are pinned to the last row and so are usually long.
  - a `backEdge`: `Left → Left`, arcing back **up the left**.
  - Labels are drawn by a **custom edge**, not by the built-in `smoothstep`. The built-ins place a label at the midpoint of the line and expose no way to move it off, and the chip is wider than the gap a node as wide as "Hiring Manager Screen" leaves beside it, so it covered the line and the arrowhead both. `PipelineEdge` computes the path itself and puts the label beside it: `labelAt` slides a label **down** its run, since every edge now travels mostly downward, and `lift` moves it **across** the run. A chain edge needs no lift — the gap below a node is sized to hold its chip — which is the one thing the turn made simpler; an arc lifts outward, because lane 0 hugs the node closely enough that a centred chip would lie over the box.
  - **The arrowhead is drawn here too, as a `<polygon>`, not with React Flow's `markerEnd`.** A marker is pinned to the path end by a `refX` that the `EdgeMarker` type does not expose, which puts the head's *tip* exactly where the line stops; the head's edges slope at 0.8, so a line of half-width `h` escapes the triangle for the last `h/0.8` px — invisible at 1px, a blunt rectangular stub poking out of the point at 6px. Drawing it here lets the line stop at the head's **base**, which is the only way the two meet cleanly at every thickness. `APPROACH` gives the direction from the handle the edge arrives at, and the head outgrows the stroke so a thick edge cannot swallow it.
  - **Hover and selection are React state, not CSS.** A lit line takes `--accent` — the app's "this one" colour, which already rings a selected node — across its stroke, its arrowhead polygon and its label, so the chip visibly belongs to the line. It is state rather than a `:hover` rule because a lit line also has to come to the front, and SVG has no z-index: the only way to raise one is a higher `zIndex` for React Flow to reorder by. Red was considered and rejected — it means "error" everywhere else in the app, and this rework removed it from the graph precisely so a cycle stops reading as a mistake.
  - **The fit has to reserve the arc bands.** `fitView` frames the *nodes*, and the bands beside the outermost slots hang outside that box, so the arc running down the right of the last slot was cut off at the panel's edge. `measureBands` hands out both band widths and the fit adds them to its padding, left and right. The zoom controls moved to the top-right for the same reason: the corner they used to hold is now the bottom of the graph, and the leftmost outcome landed behind them.
  - **The panel grows with the graph.** Its height is `depths * DEPTH_PITCH` clamped between the 26rem it always had and 40rem, handed to the container as `--graph-height`; a shallow role is framed exactly as it was, a deep one gets the room instead of being scaled down, and past the ceiling it pans as before.
  - `FitOnMeasure` refits once React Flow has measured the nodes. A node's width comes from its label, so the `fitView` prop fires against an unmeasured box and clamps to `maxZoom` — the graph opened at 2x, showing a corner. Measurement alone is not enough either; the refit waits two frames for layout to settle. It re-runs when the node set changes, so Refresh reframes rather than stranding new nodes off-screen. This is why the component is wrapped in a `ReactFlowProvider`. **Both fits must be given the same `fitViewOptions`**: the prop cannot be dropped (without it no fit is queued at all) and if left to its defaults its fit lands last and silently discards the padding — changing that padding then appears to do nothing at all.
  - `Legend` is a `Panel` in the top-left that appears **only while an edge is picked**, and explains that edge rather than edges in general: the sample carries the clicked line's own numbers, so the panel and the line are matched by sight before a word is read. It is the real thing in miniature — same `--edge` colour, same chip tokens, arrowhead from the same geometry — because a hand-drawn approximation would drift from the edges it describes. Its verb comes from the target: "advanced" is true of a move between rounds and false of every ending, so an outcome edge asks `endingVerb` instead. The fit deliberately does **not** reserve room for it — it would waste the corner on every role, and re-fitting when it appears would move the very line that was just clicked; so it overlays, and can cover a node.
  - Hence six handles on a stage node. The two `Right` and the two `Left` handles are nudged off centre so they are not coincident anchors, each to the end its traffic comes from: hops run downward, so they leave low on the right edge and arrive high on it, and loops run back upward and do the opposite on the left. `laneOffset` turns a lane index into a distance from the node's side, and `measureBands` sizes the bands from the deepest lane and derives the **slot pitch** from them — lanes are spaced to fit a label, and the label an arc has to clear now sits beside it, so a lane is wider than it used to be deep. The depth pitch, by contrast, is a plain constant: nothing arcs between two rows.
- `src/routes/`: one component per screen — sign in, my applications, browse, submit a job, your application on one posting, the role view, and a user-profile stub.
  - `links.ts` builds every URL that carries a company or role, so no call site can forget to encode a segment.
  - `RoleView.tsx` owns the role screen and exports `Roster`. The filtered panel is that same `Roster` given a filtered array — **do not build a second list for it**, or the profile links and posting titles will quietly drift out of the filtered view.
  - Roster labels come from the graph's nodes, not from re-deriving them off whatever array `Roster` was handed. Derived from a filtered subset, "Technical Round 1" would collapse back to "Technical Round" the moment you clicked it.

### Routes

| Route | What it is |
|---|---|
| `/sign-in` | user id only, no password |
| `/` | your applications, with an outcome tag on any that ended |
| `/browse` | companies, expanding to the roles recorded at each |
| `/jobs/new` | records a posting **and** your application, then lands on the role view |
| `/applied/:jobId` | your pipeline on one posting: edit rounds, move, record an outcome, or delete |
| `/roles/:company/:role` | the point of the app: postings, the merged graph, and everyone on the role |
| `/users/:userId` | a stub. Profiles are follow-up work |

### Running it locally
Needs Java 25 (the Maven Wrapper fetches Maven itself) and the Node version in `frontend/.nvmrc`.

```
cd mvp && ./mvnw spring-boot:run          # backend on :8080
cd frontend && nvm use && npm install && npm run dev   # frontend on :5173
```

`cd mvp && ./mvnw test` runs the backend tests. In `frontend/`, `npm test` runs vitest, `npm run build` typechecks and builds, and `npm run lint` runs oxlint.

There is no sample data and no database — you create everything through the UI, and restarting the backend clears it.

### Next Steps
- [x] Turn the MVP into a live app that runs locally and supports basic user/job/pipeline creation
  - [x] Implement the frontend using ReactJS
- [x] Track roles at companies rather than individual postings
- [x] A per-company/per-role view with the merged pipeline graph
- [ ] User profiles at `/users/:userId` — the route and its URL shape are settled, only the body is missing
- [ ] Filtering the role view by level (`RolesController` already carries a `// TODO: separate endpoint for level?`)
- [ ] Durably persist users, jobs, and pipelines in a database

### Known bugs, deliberately left alone
These predate the HTTP layer and are marked with `//TODO` where they live, rather than fixed:

- Validation failures throughout are signalled with `IOException`, which is not an I/O condition. Callers cannot tell a bad argument from a real read/write failure.
- `JobRegistry.getJob` rejects ids whose length is not 64 with the message "must be 64 bytes" — it is 64 hex characters, which is 32 bytes.
- `Job.getId()` digests through a single `static MessageDigest`, which is not thread-safe. It is fine while everything is in memory and single-threaded per request, but it will not survive real concurrency.
- `ApplicantService.addApplied`'s "already applied" message interpolates the whole `Job` record, so its `toString()` reaches the user. The frontend surfaces that message verbatim on the submit-a-job screen.
