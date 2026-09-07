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

Everything lives in memory in the backend process, so restarting the backend clears all of it.
There is no sample data either, but you do not have to click a dozen applicants back in by hand:

```
node scripts/seed.mjs
```

posts a set of role shapes through the real API and prints a link to each one. And if you are
working on the graph rather than on the app, http://localhost:5173/dev/graph draws every one of
those shapes from hand-written fixtures with **no backend at all**.

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

The graph merges every stage ordering anyone recorded for that role into one picture, read from
Applied **downwards**. Clicking a line explains it in the top-left corner, showing that line's own
numbers in a sample chip.

- A node is a **(stage, occurrence)** pair, so someone's second technical round is a
  different node from their first. A stage is numbered only if the role spans more than one
  of it — which means your own plain "Technical Round" can appear here as "Technical Round 1".
- A node's **badge** counts the people standing there now. Clicking a node filters the list
  below to exactly those people, and clicking a **line** does the same for the applicants who
  made that move — the filtered list always has exactly as many rows as the badge or count
  claims. Pointing at a line lifts it above the ones it crosses and colours it, which is how you
  tell which label belongs to which line where several run close together.
- An edge is a **move somebody made**, not a round they were told about: an applicant sitting at
  Applied with five rounds ahead is on none of the lines yet. Its **label** is how many
  applicants made that move, and its **thickness** is what share of everyone who *reached that
  node* they are — the share itself is spelled out when you click the line. So the edges leaving a node account for exactly the people who
  got there: each of them either moved on, ended there, or is standing on it and counted in the
  badge.
- A round sits **under the round that leads to it**, so a branch stays in one block instead of
  crossing the branch beside it. Where several rounds lead to the same one it hangs under the
  heaviest of them — the transition most applicants recorded.
- The graph is **directed and may contain cycles**: a role that sends someone back for another
  round after a technical one is a real shape, not a mistake by whoever recorded it. Ranking the
  rows still needs an acyclic graph, so one edge of each cycle is held out of the
  ranking — chosen by weight, so one outlier cannot reorder the graph — but it is drawn like
  every other edge. Arrowheads carry the direction.
- A line is **straight whenever a straight line fits**: down to the round below, or diagonally
  across open space to an outcome. It curves only where the straight version would cut through
  another round's box — and then it leaves the column entirely, sweeps down a gutter beside it,
  and comes back, rather than threading between the boxes.
- Where two rounds have traffic **both ways**, neither line is straight: they bend apart to
  opposite sides and enclose a narrow lens, so the two arrowheads never crowd each other.
- **Curves nest rather than cross.** The two gutters carry as near to half the curves each as the
  shape allows, and inside one gutter the longer curve runs outside the shorter, so a pair that
  nests reads as two arches.
- **No two lines are ever drawn on top of each other.** Each leaves its node at its own point on
  the border and travels in a track nothing else is using, so lines cross — which a merged
  pipeline really does — but never lie along each other, where two counts would look like one.
- The **last row** holds outcomes rather than rounds. Their placement asserts nothing
  about when people fall out — the edge weights carry that. An outcome nobody holds is not
  drawn at all.
- The panel **grows with the pipeline**, up to a point: a role with a few rounds is as compact as
  ever, a long one gets the height instead of being scaled down, and beyond that it pans and
  zooms.

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

The graph's *drawing* is not tested. `graph.test.ts` covers what it means — weights, shares,
badge counts, filtering, and that the whole layout comes out identical however the applicants
are ordered — but whether the picture reads well is checked by eye on `/dev/graph`, which is
why every shape worth looking at is a fixture there.

## Layout

- `mvp/` — the Java backend. `entities` and `server` are the original MVP classes; `api` is
  the Spring Boot layer that exposes them over HTTP.
- `frontend/` — Vite, React and TypeScript. The dev server proxies `/api` to port 8080.

`CLAUDE.md` has the fuller tour, including the known bugs that are marked with `//TODO` and
deliberately left alone.
