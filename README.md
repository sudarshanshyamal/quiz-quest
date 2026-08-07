# QuizQuest API

A safe LLM proxy for the QuizQuest kids' quiz frontend. It holds the Anthropic
API key server-side, forces the model into a strict schema, moderates topics and
output, caches by request, and rate-limits per client.

## Architecture

```
  React frontend (QuizQuest.jsx)
        │  POST /api/generate   POST /api/grade
        ▼
  ┌─────────────────────────────────────────────┐
  │ FastAPI                                       │
  │  validate (Pydantic)                          │
  │  rate limit (per IP)                           │
  │  moderate topic (keyword + optional LLM)       │
  │  cache lookup ──────────────► hit ► return     │
  │  generation agent ─┐                           │
  │   messages.parse() │ structured output         │
  │   → GeneratedQuiz  │ (constrained decoding)     │
  │  scrub + sanitize  ◄┘                          │
  │  cache store                                   │
  │                                                │
  │  grading agent (LLM-as-judge) for open answers │
  └─────────────────────────────────────────────┘
        │
        ▼  Anthropic API (key stays here, never in the browser)
```

Deterministic checks (multiple choice, true/false, fill-in) stay in the
frontend; only open-ended answers hit `/api/grade`.

## Quickstart

Create and activate a virtual environment.

**macOS / Linux**
```bash
cd quizquest-backend
python -m venv .venv
source .venv/bin/activate
```

**Windows — PowerShell**
```powershell
cd quizquest-backend
python -m venv .venv
.venv\Scripts\Activate.ps1
```
If PowerShell blocks the script ("running scripts is disabled"), run once:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, then activate again.

**Windows — Command Prompt**
```bat
cd quizquest-backend
python -m venv .venv
.venv\Scripts\activate.bat
```

Then, on any OS (with the venv active — you'll see `(.venv)` in the prompt):
```bash
pip install -r requirements.txt
cp .env.example .env          # Windows: copy .env.example .env   — then add your ANTHROPIC_API_KEY
uvicorn app.main:app --reload --port 8000
```

Docs at http://localhost:8000/docs. Or run it in Docker:

```bash
docker build -t quizquest-api .
docker run --env-file .env -p 8000:8000 quizquest-api
```

## Mock mode (no API key)

To run the whole API offline with hardcoded responses (Pokémon MCQs), set
`MOCK_MODE=true` in `.env` (or export it) and start normally:

```bash
MOCK_MODE=true uvicorn app.main:app --reload --port 8000   # Windows: set MOCK_MODE first
```

In mock mode no `ANTHROPIC_API_KEY` is required and nothing hits the network —
`/api/generate` and `/api/grade` return canned data that still flows through the
real validation, moderation, cache, and sanitize pipeline. Flip it back to
`false` to use the live models. This mirrors the frontend's `MOCK_MODE` flag.

## Persistence (repository seam)

Data access goes through a `Repository` interface (`app/repository.py`):
parents + consent, child profiles, and a saved question bank. The default is an
in-memory implementation, so the app runs offline with nothing to configure.

Set `DATABASE_URL` to switch to Postgres (`app/db/postgres_repository.py`),
selected automatically by `make_repository`:

```bash
pip install asyncpg
psql "$DATABASE_URL" -f app/db/schema.sql
DATABASE_URL=postgresql://user:pass@localhost:5432/quizquest uvicorn app.main:app
```

The in-memory repo auto-seeds two demo parents; Postgres does not. If you use
`AUTH_ENABLED=true` with Postgres, seed them once so the stub tokens work:
`psql "$DATABASE_URL" -f app/db/seed_demo.sql` (or just sign in as a new parent
and grant consent through the flow).

Consent is read through the repository, and generated quizzes are written to the
question bank. Endpoints: `POST /api/children`, `GET /api/children`,
`GET /api/quizzes` (all behind the same consent gate as generation).

## MVP stubs: consent/auth + moderation service

Two seams are wired in for the path to a real kids' product, both designed to
swap for real providers and both no-ops offline:

**Consent/auth** (`app/auth.py`). Set `AUTH_ENABLED=true` to require a bearer
token from a consented parent on `/api/generate` and `/api/grade`. Missing token
→ 401; token without consent → 403. Off by default, so dev/offline/mock need no
token. Replace `_verify` with real verification against your auth provider
(Clerk / Auth0 / Firebase / Supabase) and read consent from your DB.

```bash
curl -s localhost:8000/api/generate -H "content-type: application/json" \
  -H "Authorization: Bearer demo-consented" \
  -d '{"topic":"space","age":8,"count":3,"types":[]}'
```

**Moderation service** (`app/moderation.py` → `ModerationService`). All
kid-safety checks go through one boundary: `screen_topic` (input) and
`clean_output` (generated questions), with flags recorded to a log
(`GET /admin/moderation-flags`, protect in prod). Swap the internals for a
dedicated moderation model without touching call sites.

## Endpoints

```bash
# Generate a quiz
curl -s localhost:8000/api/generate -H 'content-type: application/json' -d '{
  "topic": "dinosaurs", "age": 8, "count": 5, "types": [], "seed": "1"
}' | jq

# Grade an open-ended answer
curl -s localhost:8000/api/grade -H 'content-type: application/json' -d '{
  "question": "Why do plants need sunlight?",
  "model_answer": "To make food through photosynthesis.",
  "key_points": ["photosynthesis", "makes food/energy"],
  "child_answer": "so they can make their food",
  "age": 8
}' | jq
```

`/api/generate` returns `{ topic, age, questions: [...], cached }`. Each question
carries `id, type, question, options, correctIndex, answer, keyPoints,
explanation, hint`.

## Wiring the frontend

Copy `frontend/api.js` into your React app and make two swaps in `QuizQuest.jsx`:

1. **Generation** — in `App.generate`, replace the `callClaude(...)` +
   `extractJson` + `sanitizeQuestions` block with:

   ```js
   import { generateQuiz, gradeAnswer } from "./api";
   // ...
   const data = await generateQuiz({ ...cfg, seed: cfg.seed || Date.now().toString() });
   setQuestions(data.questions);
   setResults(new Array(data.questions.length).fill(null));
   setScreen("quiz");
   ```

   Pass a fresh `seed` (e.g. `Date.now()`) on the "New quiz on same topic" button
   so it bypasses the cache and gets new questions; a retry reusing the same seed
   is served from cache.

2. **Grading** — in `QuizScreen.check`, replace the subjective `callClaude(...)`
   call with:

   ```js
   const j = await gradeAnswer({
     question: q.question, modelAnswer: q.answer,
     keyPoints: q.keyPoints, childAnswer: text, age,
   });
   ```

You can then delete the in-browser `callClaude` helper entirely.

## Tests

```bash
pip install -r requirements-dev.txt
python -m pytest
```

No API key or network needed — the API tests replace the LLM client with an
offline fake and exercise the real pipeline (validation, moderation, cache,
scrub, sanitize). Coverage:

- `test_schemas.py` — request bounds (age 4-18, count 1-15, non-empty topic) and cleaning.
- `test_validation.py` — `sanitize()` drops malformed questions, clamps
  `correctIndex`, normalizes true/false, caps options; a **per-type contract**
  test asserts each question type satisfies its invariants; JSON-fallback extractor.
- `test_moderation.py` — topic gate and post-generation scrub.
- `test_api.py` — `/health`, generate happy path, cache hit on repeat, 422 on bad
  input, 422 on unsafe topic, and grading shape. The per-type invariants are
  re-checked against live API responses via `tests/invariants.py`

## Notes

- Models default to `claude-sonnet-4-6` (generation) and `claude-haiku-4-5`
  (grading); override via `GEN_MODEL` / `GRADE_MODEL`.
- Structured outputs guarantee the response *shape*, not factual correctness — so
  `validation.sanitize` still enforces semantics (option counts, index bounds,
  true/false normalization).
```
