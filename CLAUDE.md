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
- `src/pipeline/graph.ts`: what the merged pipeline **means** — nodes, edges, weights, shares, badge counts, and which pipelines a badge or a line is counting. Pure, no pixels and no sides, and covered by `graph.test.ts`. **The result is a directed graph and may contain cycles**: a role that sends someone back for another round after a technical one is a real shape, not an error by whoever recorded it. The step order in `buildGraph` is load-bearing; the comments say why at each step. Four things to know:
  - **An edge is a move somebody made, not a round they were announced.** `buildGraph` returns two edge sets: `edges` is the walked prefix of each pipeline plus one outcome edge per terminated applicant, and is what the graph shows; `announced` is every consecutive pair in every stage list, and exists only so `layout.ts` can rank on it — a round nobody has reached yet still sits below the one before it, and the layout does not reshuffle as applicants advance. An announced step nobody has taken produces no edge at all; its rounds are still nodes.
  - `share` is an edge's weight over the applicants who **reached its source**, not over the role. That makes a node's outgoing edges a real partition: everyone who reached it either moved on (one walked edge), ended there (one outcome edge), or is standing on it (the badge, and no edge). So `outgoing weights + badge = reached` for every node, which `graph.test.ts` asserts directly. Note the consequence: a lone applicant on the only path out of a rarely-reached node renders at 100% and therefore thickest, so thickness reads "what happens next from here", not "how many people".
  - `backEdge` marks an edge that closes a cycle, decided here by exploring the **heaviest** outgoing edge first. Without that tie-break it would depend on traversal order, which follows the applicants list sorted by `userId` — so one outlier could outrank a transition eight people recorded, and the layout would change if somebody renamed themselves. It is a fact about the shape, not a verdict: ranking holds these out so it has an acyclic graph to rank, and the edge is still drawn exactly like every other one.
  - `nodeHolds()` and `edgeHolds()` are the rules the roster filters by, and each is deliberately the same rule its number is counted by — `nodeHolds` against the badges, `edgeHolds` against the edge weights, both reading the same `movesOf()` a weight was built from. So a filtered list always has exactly as many rows as the thing you clicked claims. `edgeId()` exists for the same reason `nodeKey()` does: one place formats an edge id, so `bump` and `edgeHolds` cannot format it differently. `edgeLabel()` returns the **count alone** — the share sets the line's thickness and the legend spells it out in words, but a bare count is one glyph wide, which is what lets a chip sit on the line it belongs to rather than beside it.
- `src/pipeline/layout.ts`: where all of that **goes**. Pure — no React, no DOM, no measurement. The picture is a **central band of node boxes with a clear gutter down each side**: an edge is straight whenever a straight line between its two nodes would miss every other box, and when it would not it leaves the band entirely, runs down a track in one of the gutters, and comes back. A curve never threads between two boxes on a row. Six things to know before editing it:
  - **Boxes are all the same size**, from a glyph-count estimate of the longest label in the graph. That is what lets the whole layout be arithmetic: nothing is measured, so nothing races a render, and the renderer and any test compute identical numbers. This file owns the metrics as well as the decisions — a deliberate departure from "layout is indices, edgePath is pixels", because deciding where an edge attaches means asking which way it is about to travel, and that is a question about points.
  - **Rows are ranked, then centred.** `depth` is the longest path from Applied over the announced edges minus the cycle-breaks; nodes sharing a depth (a real fork) sit side by side, ordered so **a node sits under the parent that feeds it** — a branch then stays in one block and its lines do not cross the next branch's. Ordering a row by the stages endpoint alone puts a child wherever its own stage happens to rank, and two forks swap over each other on the way down. Outcomes are ranked **after** the stages, which is what pins them to the last row. Every row is then centred on one centreline, which is what leaves a gutter of equal width down each side.
  - **Ports aim at where the edge is actually going first** — the other node for a straight edge, the point where it joins its track for a curve. So a spine edge leaves the exact middle of a bottom border and runs dead vertical, a diagonal leaves near the corner it is heading for, and a curve leaves already going the way it will travel. Only collisions move anything, and the spacing runs **around the whole perimeter as one cyclic sequence**, not per border, so two edges either side of a corner are kept apart too.
  - **Straight is the default and it is tested against the boxes, not the ports.** The clearance test uses the centre-to-centre line, so the answer does not depend on the ports, which are decided from the answer. Two straight edges that want the same line both stay straight and are separated by their ports. The one exception is a **two-way pair** — two rounds with an edge each way — where both bend a fixed amount to opposite sides and enclose a thin lens; that is the only case where an edge that could be straight is not.
  - **The gutter assignment is exactly optimal, not greedy.** Colour every arc once by left endpoint — interval graphs are perfect, so that uses the fewest tracks — then deal the colour classes to the two gutters. A class never overlaps itself, so it costs one track wherever it lands; dealing *k* classes gives each side ⌈k/2⌉ or ⌊k/2⌋, and since ω arcs at the busiest row must split over two sides, ⌈ω/2⌉ is a hard lower bound that the dealing meets. Classes are dealt **by which way they lean** — the mean x of their endpoints — with the quota depending on the lean, so a single arc reaching the rightmost outcome takes the right gutter instead of crossing the entire band twice to get there. Within a gutter the **longest arc goes furthest out**, so a nested pair reads as concentric arches rather than crossing twice for nothing.
  - **Determinism is not automatic here.** An exact method returns any of several equally-optimal arrangements, so every sort key is intrinsic to the role's shape and never to the applicants' arrival order: span descending, weight descending, source depth, source slot, edge id. `graph.test.ts` asserts the whole layout is identical when the applicants are reversed.
- `src/pipeline/edgePath.ts`: the path an edge follows, and nothing else — layout has already decided the shape, the gutter, the track and the two points on the borders. A straight edge is a line. A curve is **two cubic S-bends joined by a straight run on the track**, each bend leaving its border along the border's own outward normal and arriving on the track running vertically. Because the middle of a long arc genuinely sits *on* its track, two arcs a track apart stay a track apart for the whole run — no-overlap is a property of the construction rather than something to go looking for afterwards. On a short arc the run has zero length and the two bends meet, which is one smooth bow and needs no special case. The bend's depth scales with **how far out the track is**: a bend that drops 36px while reaching 160px sideways is not a bend at all, it is a right angle with the corner rounded off. `labelPoints` places every chip, scoring candidate points along each path against every other path and every chip already placed, heaviest edge first.
- `src/pipeline/usePanZoom.ts`: the transform, the wheel and drag handlers, and fit-to-content. Separate from the renderer because it is a different concern that fails in a different way — a bug here moves the whole picture, a bug there draws the wrong one — and because this is the part that grows. **The fit is a layout effect, not a plain one**: a plain effect runs after the paint, so the frame in which the container's size first arrives would be painted with the previous transform and the correction would read as the graph jumping into place. The graph is also drawn at `opacity: 0` until the container has been measured, for the same reason.
- `src/pipeline/PipelineGraph.tsx`: draws it, in **plain SVG**. There is no graph library: every coordinate already comes from the model, so a library would only be asked to draw, and the price of asking was six handles per node, a fit that raced the node measurement, and edges that could only attach where a handle had been declared. Nodes are `rect` + `text` rather than HTML, so there is one element tree in one coordinate space and no second unit system to drift out of step with the first; the CSS classes still style them, only the property names change (`border-radius` → `rx`, the dashed outcome pill → `stroke-dasharray`, flex centring → `text-anchor`). Four things to know:
  - **Every line is drawn twice**: an invisible 16px `pointer-events: stroke` twin that catches the pointer, and the visible line, which can be as thin as 1px and is impossible to hit otherwise.
  - **The arrowhead is a `<polygon>`, not a marker.** A marker is pinned to the path end by a `refX` that puts the head's *tip* exactly where the line stops; the head's edges slope, so a line of half-width `h` escapes the triangle for the last `h/0.8` px — invisible at 1px, a blunt rectangular stub poking out of the point at 6px. Drawing it here lets the line stop at the head's **base**, which is the only way the two meet cleanly at every thickness, and the head outgrows the stroke so a thick edge cannot swallow it.
  - **A lit line is rendered last rather than given a z-index**, because SVG has none and we control the element order. It takes `--accent` — the app's "this one" colour, which already rings a selected node — across its stroke, its arrowhead and its chip, so the chip visibly belongs to the line. Red was considered and rejected: it means "error" everywhere else in the app, and this rework removed it from the graph precisely so a cycle stops reading as a mistake.
  - `Legend` appears **only while an edge is picked**, and explains that edge rather than edges in general: the sample carries the clicked line's own count, so the panel and the line are matched by sight before a word is read. It is where the **share** lives now that the chip is a bare count. Its verb comes from the target: "advanced" is true of a move between rounds and false of every ending, so an outcome edge asks `endingVerb` instead. It overlays rather than being fitted around — reserving the corner would waste it on every role, and re-fitting when it appears would move the very line that was just clicked.
- `src/pipeline/fixtures.ts` and `/dev/graph`: the role shapes the layout has to survive — the hand-drawn reference, a plain chain, a fork, a long cycle, a two-way pair, a role where everyone has ended, and one applicant — rendered one under the next with **no backend behind them**. The graph is the one part of this app judged by eye, so a change to a curve or track constant shows its effect on all seven at once on save. The route sits outside the session guard on purpose: needing to sign in would be needing the very thing it avoids. `scripts/seed.mjs` posts the same fixtures through the real API, one company each so they do not merge into a single graph, for checking the roster and the filtering in place.
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
| `/dev/graph` | not linked from anywhere, and outside the session: the layout fixtures |

### Running it locally
Needs Java 25 (the Maven Wrapper fetches Maven itself) and the Node version in `frontend/.nvmrc`.

```
cd mvp && ./mvnw spring-boot:run          # backend on :8080
cd frontend && nvm use && npm install && npm run dev   # frontend on :5173
```

`cd mvp && ./mvnw test` runs the backend tests. In `frontend/`, `npm test` runs vitest, `npm run build` typechecks and builds, and `npm run lint` runs oxlint.

There is no sample data and no database — restarting the backend clears everything. Rather than clicking a dozen applicants back in through the UI, `node scripts/seed.mjs` posts the graph fixtures through the real API and prints a link per role. For layout work you do not need the backend at all: `/dev/graph` renders every fixture shape straight from hand-written pipelines.

**The graph's correctness is judged by eye.** There is no automated no-overlap check — `npm test` covers what the graph *means* (weights, shares, badge counts, filtering, and that the whole layout is identical however the applicants are ordered) but not what it looks like. After changing anything in `layout.ts` or `edgePath.ts`, open `/dev/graph` and check all seven shapes against the six properties the layout exists to satisfy: curved rather than turning, concentric where they nest, never overlapping, a count unmistakably belonging to one line, straight wherever a straight line fits, and an even split between the two gutters.

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
