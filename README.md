# QuizQuest API

A safe LLM proxy for the QuizQuest kids' quiz frontend. It keeps the Anthropic
API key server-side with a strict schema for model, moderates topics and
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
cd backend
python -m venv .venv
source .venv/bin/activate
```

**Windows — PowerShell**
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
```
If PowerShell blocks the script ("running scripts is disabled"), run once:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, then activate again.

**Windows — Command Prompt**
```bat
cd backend
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

To run the whole API offline (no call to LLM) with hardcoded responses (Pokémon MCQs), set
`MOCK_MODE=true` in `.env` (or export it) and start normally:

```bash
MOCK_MODE=true uvicorn app.main:app --reload --port 8000   # Windows: set MOCK_MODE first
```

In mock mode no `ANTHROPIC_API_KEY` is required and nothing hits the network —
`/api/generate` and `/api/grade` return canned data that still flows through the
real validation, moderation, cache, and sanitize pipeline. Flip it back to
`false` to use the live models. This mirrors the frontend's `MOCK_MODE` flag.

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