# QuizQuest — frontend (Vite + React)

The kids' quiz UI. Talks to the FastAPI backend for question generation and
open-answer grading.

## Run it

```bash
npm install        # one time
npm run dev
```

Vite prints a URL — open it (usually **http://localhost:5173**).

For the quiz to generate, the **backend must also be running** in another
terminal:

```bash
# in the quizquest-backend folder
uvicorn app.main:app --port 8000
# no API key? start it in mock mode instead:
#   MOCK_MODE=true uvicorn app.main:app --port 8000   (PowerShell: set $env:MOCK_MODE="true" first)
```

The backend URL is read from `.env` (`VITE_API_BASE`, default
`http://localhost:8000`). Change it there if your backend runs elsewhere.

## Run the UI without any backend

Open `src/QuizQuest.jsx` and set `const MOCK_MODE = true;`. The app then uses a
built-in Pokémon quiz and never calls the backend — handy for pure UI work.

## Files

- `src/QuizQuest.jsx` — the app (all screens, scoring, answer checking)
- `src/api.js` — thin client for the backend (`/api/generate`, `/api/grade`)
- `src/main.jsx` — mounts the app
- `index.html` — loads Tailwind (Play CDN) and the app

## Note on Tailwind

This project uses the Tailwind Play CDN (a `<script>` in `index.html`) so there's
no build config to fuss with. It logs a "not for production" warning in the
console — fine for local dev. For a production build, install Tailwind properly
(`tailwindcss` + PostCSS, or the `@tailwindcss/vite` plugin) and remove the CDN
script.
