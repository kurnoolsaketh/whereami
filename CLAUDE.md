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
  - `route`, `lane` and the two **ports** are layout, and they live here rather than in the renderer. A `route` says how an edge has to travel to stay visible — `chain` to the next depth, `hop` reaching past it, `loop` closing a cycle; a `lane` says which track of its band or channel it travels in; and `sourcePort`/`targetPort` say where along a node's border it attaches. Together they are the promise that **no two edges are ever drawn along the same line**.
    - **Lanes and tracks** are one greedy interval-graph colouring, `packSpans`, called twice. `packLanes` gives arcs a lane in their gutter — an arc occupies the whole span of depths between its endpoints, and a band is one slot's gutter, so two arcs in *different* gutters are a slot apart and may share a lane freely; `bandSlot` in `edgePath.ts` decides which gutter, and the renderer asks it the same question when it draws, because a second answer here is exactly how the two would drift into drawing one arc on top of another. `packChainTracks` gives each sideways jog a track in the channel between its two rows, and its spans are the slots the jog crosses with the ends doubled, so that two jogs which merely *touch* still clash: an arc that reaches a slot stops at a border, but two jogs inside one slot are a few ports apart and would otherwise share a track. **Do not "simplify" a lane to a function of the span's length**: two arcs of equal length then get the same lane by definition, and a staircase of equal-length hops, which is exactly what consecutive stages produce, collapses onto one line.
    - **Ports are why a node's edges do not share a stub.** Every edge that meets a border gets its own point along it, so a node with three edges leaving it draws three lines from three places rather than three lines from one. Before them, every overlapping line in the picture was one of these: 25 pairs of collinear runs on the seeded role, all of them fan-in or fan-out, none of them in the channels. `assignPorts` orders a border so the ports do not tangle among themselves — an underside by where its edges are heading sideways, a side border with the arriving family above the leaving one and each following the lane it is heading for. A node reports `acrossPorts`/`downPorts`, the busiest border either way, and the renderer turns those into a minimum size.
  - `nodeHolds()` and `edgeHolds()` are the rules the roster filters by, and each is deliberately the same rule its number is counted by — `nodeHolds` against the badges, `edgeHolds` against the edge weights, both reading the same `movesOf()` a weight was built from. So a filtered list always has exactly as many rows as the thing you clicked claims. `edgeId()` exists for the same reason `nodeKey()` does: one place formats an edge id, so `bump` and `edgeHolds` cannot format it differently.
- `src/pipeline/edgePath.ts`: where an edge actually runs, in pixels, and the one place that knows it. Pure — no React, no measurement — so the property that matters is asserted directly rather than promised: `edgePath.test.ts` builds every edge of six role shapes, cuts each polyline into its straight legs, and fails if any two legs of different edges lie within 3px of the same line. That test is the deliverable; the rest is plumbing. `waypoints` gives an edge its corners (out of its port, along the one track reserved for it, in to its port), `trackOf` says which line it travels sideways on, `portPoint` slides a handle to this edge's own place on a border, and `pathFrom` rounds the corners. The geometry is derived from the model — depths, slots, lanes, ports — and never from a measured box, which is what lets the renderer and the test compute the same numbers.
- `src/pipeline/PipelineGraph.tsx`: renders that graph with `@xyflow/react`. It does no layout — `graph.ts` supplies `depth`, `slot`, `route`, `lane` and the ports, `edgePath.ts` turns those into corners; this file only supplies pixels, `x = slot * slotPitch` and `y = rowTop[depth]`. React Flow splines an edge between two handles rather than routing around intervening nodes, which is why a route exists at all: an edge that does not reach the very next depth would otherwise be drawn flat through the boxes it passes. The three routes differ in path only — colour, stroke and label format are identical, and each is the old left-to-right route turned a quarter clockwise:
  - adjacent depths: `Bottom → Top`, the chain.
  - a span greater than one: `Right → Right`, arcing **down the right** of the chain. This is what rescues outcome edges, which are pinned to the last row and so are usually long.
  - a `backEdge`: `Left → Left`, arcing back **up the left**.
  - **`PipelineEdge` builds its own path and there is no `getSmoothStepPath` any more.** A built-in bends where it likes, and that bend is exactly the knob the no-overlap property needs: every edge leaving a node shared the same run for as long as they all happened to agree. It now asks `edgePath` for the corners and `pathFrom` for the rounded polyline through them, and stops the line at the arrowhead's base — but never short of the corner before it, or the last leg would point backwards. The label goes at `labelAt` along the edge's **longest** leg, cycling through `LABEL_STOPS` by lane so that two arcs a lane apart put their chips at different heights.
  - **The arrowhead is drawn here too, as a `<polygon>`, not with React Flow's `markerEnd`.** A marker is pinned to the path end by a `refX` that the `EdgeMarker` type does not expose, which puts the head's *tip* exactly where the line stops; the head's edges slope at 0.8, so a line of half-width `h` escapes the triangle for the last `h/0.8` px — invisible at 1px, a blunt rectangular stub poking out of the point at 6px. Drawing it here lets the line stop at the head's **base**, which is the only way the two meet cleanly at every thickness. `APPROACH` gives the direction from the handle the edge arrives at, and the head outgrows the stroke so a thick edge cannot swallow it.
  - **Hover and selection are React state, not CSS.** A lit line takes `--accent` — the app's "this one" colour, which already rings a selected node — across its stroke, its arrowhead polygon and its label, so the chip visibly belongs to the line. It is state rather than a `:hover` rule because a lit line also has to come to the front, and SVG has no z-index: the only way to raise one is a higher `zIndex` for React Flow to reorder by. Red was considered and rejected — it means "error" everywhere else in the app, and this rework removed it from the graph precisely so a cycle stops reading as a mistake.
  - **The fit has to reserve the gutters.** `fitView` frames the *nodes*, and the gutters beside the outermost slots hang outside that box, so the arc running down the right of the last slot was cut off at the panel's edge. `measure` hands out both gutter widths along with the pitches, and the fit reserves what actually hangs over: on the left that is the loop gutter, which starts at the first slot's edge; on the right it is the hop gutter plus however much of the slot its nodes leave empty. The zoom controls moved to the top-right for the same reason: the corner they used to hold is now the bottom of the graph, and the leftmost outcome landed behind them.
  - **The panel grows with the graph**, and so do the rows. A row is as tall as its own node plus the channel below it, and a channel is only as deep as the jogs it carries — `measure` builds a `rowTop` table rather than a single pitch, because one pitch made every row as tall as the busiest channel in the graph and doubled the height of a role that had one crowded row. The panel's height is the last row's bottom, clamped between the 26rem it always had and 40rem and handed to the container as `--graph-height`; past the ceiling it pans as before.
  - `FitOnMeasure` refits once React Flow has measured the nodes. A node's width comes from its label, so the `fitView` prop fires against an unmeasured box and clamps to `maxZoom` — the graph opened at 2x, showing a corner. Measurement alone is not enough either; the refit waits two frames for layout to settle. It re-runs when the node set changes, so Refresh reframes rather than stranding new nodes off-screen. This is why the component is wrapped in a `ReactFlowProvider`. **Both fits must be given the same `fitViewOptions`**: the prop cannot be dropped (without it no fit is queued at all) and if left to its defaults its fit lands last and silently discards the padding — changing that padding then appears to do nothing at all.
  - `Legend` is a `Panel` in the top-left that appears **only while an edge is picked**, and explains that edge rather than edges in general: the sample carries the clicked line's own numbers, so the panel and the line are matched by sight before a word is read. It is the real thing in miniature — same `--edge` colour, same chip tokens, arrowhead from the same geometry — because a hand-drawn approximation would drift from the edges it describes. Its verb comes from the target: "advanced" is true of a move between rounds and false of every ending, so an outcome edge asks `endingVerb` instead. The fit deliberately does **not** reserve room for it — it would waste the corner on every role, and re-fitting when it appears would move the very line that was just clicked; so it overlays, and can cover a node.
  - Hence six handles on a stage node, all of them at the middle of their border. They are no longer nudged off centre: the ports do the spreading now, and they do it for every edge rather than for two families of them, so a handle is only the anchor React Flow reports and `portPoint` slides each edge along from there. The node takes its size from those ports — `acrossBorder`/`downBorder` turn a port count into the border length it needs, and every node takes the same height so a row reads as a row. `measure` sizes the gutters from the deepest lane and derives the **slot pitch** from them; a role whose applicants all walked the same order takes no gutters at all and stays as narrow as it ever was.
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
