# whereami

See where you and everyone else stand on the roles you applied to.

Job applicants record the jobs they applied to, describe the interview stages the company
told them about, move themselves along as they go, and see where everyone else applying for
the same role is. The end users are applicants, not recruiters — the larger goal is to
recreate employers' applicant tracking systems by crowdsourcing them. It is at MVP stage.

The unit that matters is a **role at a company**, not a single posting. Acme may advertise
"Backend Engineer" and "Platform Engineer" separately and interview both through the same
process, so the app pools them: one role view, every posting under it, everyone applying.

## Running it

You need Java 25 and the Node version in `frontend/.nvmrc`. Maven itself comes from the
wrapper, so there is nothing to install for the backend.

Backend, on port 8080:

```
cd mvp
./mvnw spring-boot:run
```

Frontend, on port 5173, in a second terminal:

```
cd frontend
nvm use
npm install
npm run dev
```

Then open http://localhost:5173.

Everything lives in memory in the backend process. There is no sample data — you create
users, jobs and pipelines through the UI — and restarting the backend clears all of it.

## Using it

Sign in by typing a user id, or create one. The id is kept in `sessionStorage`, so **each
browser tab is a separate user**: open a second tab, sign in as somebody else, and you have
two applicants on one role without needing two browsers.

- **Browse roles** lists the companies someone has recorded a job at. Expanding one shows the
  roles recorded there. There is no list of every job any more — the backend is organised by
  company and then by role.
- **Submit a job** records a posting *and* your application to it, then drops you on the role
  view. Submitting a posting someone else already recorded is harmless: a job's id is derived
  from its fields, so you land on the same entry rather than creating a duplicate. That is
  what puts two applicants on one role.
- **My applications** is every job you applied to, the round you are on, and the outcome if
  it has ended.
- **A role** (`/roles/:company/:role`) is the point of the app: the postings recorded for it,
  the merged pipeline graph, and everyone on it.
- **Your application** on one posting lets you edit the rounds you were told about, say which
  one you are on, advance, jump, record how it ended, or delete the record.

### The role view

The graph merges every stage ordering anyone recorded for that role into one picture.

- A node is a **(stage, occurrence)** pair, so someone's second technical round is a
  different node from their first. A stage is numbered only if the role spans more than one
  of it — which means your own plain "Technical Round" can appear here as "Technical Round 1".
- A node's **badge** counts the people standing there now. Clicking a node filters the list
  below to exactly those people.
- An edge's **label** is how many applicants have that transition in their pipeline and what
  share of the role that is, and its **thickness** tracks that share on a fixed scale, so a
  thin line always means few people. The shares do not add up to 100% at a node and are not
  meant to — the graph's conservation law is on the badges, which count every applicant
  exactly once.
- The graph is **directed and may contain cycles**: a role that sends someone back for another
  round after a technical one is a real shape, not a mistake by whoever recorded it. Laying the
  columns out still needs an acyclic graph, so one edge of each cycle is held out of the
  ranking — chosen by weight, so one outlier cannot reorder the graph — but it is drawn like
  every other edge, arcing under the chain so it stays visible. Arrowheads carry the direction.
- An edge that reaches past the next column **arcs over** the nodes in between rather than
  cutting through them, and arcs are stacked into lanes so that two which overlap are never
  drawn on top of each other. Labels sit beside their line, not on it.
- The **final column** holds outcomes rather than rounds. Their placement asserts nothing
  about when people fall out — the edge weights carry that. An outcome nobody holds is not
  drawn at all.

### Stage and status are two different things

This is the core of the model and the easiest thing to get wrong.

- `Pipeline.Stage` is **where you are**: `APPLIED`, `RECRUITER_SCREEN`,
  `HIRING_MANAGER_SCREEN`, `TECHNICAL_ROUND`, `BEHAVIORAL_ROUND`, `ONSITE`.
- `Pipeline.Status` is **how it ended, or that it has not**: `ACTIVE`, `USER_WITHDREW`,
  `OFFER`, `REJECTED`.

Every application carries both. "Rejected after the recruiter screen" is
`currentStagePosition = 1, status = REJECTED` — nothing is truncated or appended to say so.
Recording an outcome therefore costs nothing and reopening restores nothing, because the
rounds were never touched. Withdrawing is a status; **deleting** a record is the separate,
irreversible action that erases it and takes its contribution to the role's graph with it.

## Tests

```
cd mvp && ./mvnw test          # backend: a MockMvc test per controller
cd frontend && npm test        # vitest: the API client's URLs and the graph model
cd frontend && npm run build   # typecheck and build
cd frontend && npm run lint    # oxlint
```

`npm test` is the one worth understanding. `fetch` responses are cast rather than validated,
so a client function can request a path the backend stopped serving and still typecheck
cleanly — which is exactly how the frontend once drifted a whole release behind the API.
`src/api/client.test.ts` pins the path, method and body of every wrapped endpoint, so a
rename on either side breaks a line there.

## Layout

- `mvp/` — the Java backend. `entities` and `server` are the original MVP classes; `api` is
  the Spring Boot layer that exposes them over HTTP.
- `frontend/` — Vite, React and TypeScript. The dev server proxies `/api` to port 8080.

`CLAUDE.md` has the fuller tour, including the known bugs that are marked with `//TODO` and
deliberately left alone.
