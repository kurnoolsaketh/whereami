# whereami

See where you and everyone else stand on the jobs you applied to.

Job applicants record the jobs they applied to, describe the interview stages the company
told them about, move themselves along as they go, and see where the other applicants for
the same job are. The end users are applicants, not recruiters — the larger goal is to
recreate employers' applicant tracking systems by crowdsourcing them. It is at MVP stage.

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
two applicants on one job without needing two browsers.

- **Browse jobs** lists every job anyone has recorded, marking the ones you applied to. Add
  a job only when yours is not already there — applicants landing on the same job entry is
  what makes the numbers mean anything.
- **My applications** is every job you applied to and the stage you are on.
- A **job** shows your pipeline on it. Edit the list of rounds and say which one you are on,
  advance to the next round, jump straight to a round, or withdraw.
- The same page lists everyone else on that job and the round each of them is at, with a
  head count per round.

## Tests

```
cd mvp && ./mvnw test          # backend: Client plus a MockMvc test per controller
cd frontend && npm run build   # typecheck and build
cd frontend && npm run lint    # oxlint
```

## Layout

- `mvp/` — the Java backend. `entities` and `server` are the original MVP classes; `api` is
  the Spring Boot layer that exposes them over HTTP.
- `frontend/` — Vite, React and TypeScript. The dev server proxies `/api` to port 8080.

`CLAUDE.md` has the fuller tour, including the known bugs that are marked with `//TODO` and
deliberately left alone.
