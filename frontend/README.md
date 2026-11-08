# Penny: frontend

React + TypeScript + Vite, styled with Tailwind, charts with Recharts, animation with Motion.

## Run it

Needs **Node.js 20.19+ or 22.12+** (`node --version`). Older Node (e.g. the one bundled with Anaconda) fails with *"Cannot find native binding"*. Fix: `brew install node` (or `nvm use`, which reads `.nvmrc`), then `rm -rf node_modules && npm install`.

```bash
cd frontend
npm install      # first time only
npm run dev      # → http://localhost:5173
```

- **http://localhost:5173/?demo** jumps straight to the dashboard (handy for rehearsing the demo).
- Works **without the backend**: it uses built-in demo data for a fake student, "Alex".

## The dashboard

| Section | Data | Source |
|---|---|---|
| Hero: "You spend like the … crowd" + score /100 | k-means group, score | **Real model** |
| Guess your mix (quiz) | your % per category vs people like you | **Real model** |
| Where you spend (map) | your purchases grouped into areas: circle size = visits, colour = money spent, dashed lines + km from home, click → real road route (OSRM) | **Real data** (`GET /users/{id}/places`) |
| Spending calendar (heatmap) | daily spend | **Your statement** (read in the browser) |
| Pick one thing to change | recommendations (collaborative filtering), one goal saved in this browser | **Real model** |
| Coming next: forecast, subscriptions, savings agent | Alex's made-up numbers | **PLACEHOLDER** (not in the backend yet) |

Every card has a tag: green **Real data** or amber **PLACEHOLDER**.

**Rule: only claim what the data proves.** For example, "Disney+ went up" ✅, but "you haven't been to the gym" ❌.

## Live vs demo mode

```
UploadScreen ──▶ ProcessingScreen ──▶ Dashboard
        │
   api.ts checks /api/openapi.json
        ├─ backend running → LIVE: POST /upload-csv/ → GET /users/{id}/insights   (real model)
        └─ backend offline → DEMO: mock/demoData.ts mockInsights()               (PLACEHOLDER)
```

Run both for the live demo (from the repo root):

```bash
./run.sh            # backend + frontend together, opens the browser (Ctrl+C stops both)
```
Or separately: `./run.sh backend` and `./run.sh frontend` (or `uv run runserver` for the backend).

- The first model call trains the model (10–40 s). The app starts that warm-up as soon as the upload page loads.
- **"Try it with Alex"** uploads Alex's statement to the real database **once**; the browser remembers Alex's `cc_num` and re-uses it on later clicks (uploads again only if that user was deleted).
- Uploads must have the backend's 4 columns: `trans_date_trans_time, merchant, category, amt`, and one of its 14 categories.
- Optional for the map: `merch_lat, merch_long` (where each purchase happened) and `lat, long, city` (home, used for the routes). Without them the map shows an empty state.
- Road routes come from the free OSRM demo server (`router.project-osrm.org`, car profile; walking time is estimated at 5 km/h). Needs internet.
- `VITE_USE_MOCK=true` in `frontend/.env` forces demo mode.

## For the backend team

[`src/types.ts`](src/types.ts) part 1 mirrors the real API exactly. Vite forwards `/api/x` to `http://localhost:8000/x`.

| Endpoint | Used for |
|---|---|
| `POST /upload-csv/` | Upload the statement → `cc_num` |
| `GET /users/{cc_num}/insights` | Hero, quiz, goals |
| `GET /users/{cc_num}/places` | The map: home + spending areas |
| `DELETE /users/{cc_num}` | "Delete my data" for an uploaded user (`deleteUpload()` in `api.ts`) |


## Where things are

| Path | What |
|---|---|
| `src/App.tsx` | Switches between the 3 screens |
| `src/api.ts` | All calls to the backend (or demo data) |
| `src/types.ts` | Data contract with the backend |
| `src/mock/` | Demo student data + scripted agent run |
| `src/components/` | One file per dashboard section |
| `src/index.css` | Colour tokens for light and dark mode |
| `src/lib/` | Formatting (£/$, dates), the 14 category names + icons, theme toggle |

## Changing things

- **App name:** "Penny" appears in `UploadScreen.tsx` (`Logo`), `index.html` and the footer in `Dashboard.tsx`.
- **Colours:** edit the tokens at the top of `src/index.css`. Every component uses them.
- **Demo student:** `src/mock/demoData.ts` (merchants, `BUDGET`, `DEMO_SEED`).
- **Look:** glass cards use the `.glass` class and tokens in `src/index.css` (font: Geist).
