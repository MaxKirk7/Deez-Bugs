# Penny: what to say at each sponsor

Use one section per booth: **their question → our answer → what to show → numbers → be honest about**.
Open the app on Alex's demo (`./run.sh`, then the demo button). Each section names the page to show.

**30-second opener (works at every booth):**
> Penny reads a student's bank statement and compares it with 908 real people's spending: about 928,000 purchases.
> It tells you the one thing worth changing, what it's worth in pounds, where this month is heading, and anything
> on your statement that doesn't look like you. Everything you see is computed from real data, live.

---

## HRT: best use of data for predictions and decisions

**Their question:** Can you use data to *predict* something and turn it into a *decision*, not just a chart?

**Our answer:**
- **Prediction 1: people like you.** Each person becomes 14 numbers (% of money per category). K-means puts them in 1 of 6 spending groups, and KNN finds their 20 most similar people out of 908.
- **Prediction 2: where this month is heading.** A real forecast from the statement: daily pace over 8 weeks, with an 80% likely range. One-off huge days are capped so they don't skew it.
- **Prediction 3: was this you?** A model trained on 4,075 known fraud purchases scores every payment.
- **The decision:** the biggest gap to your peers becomes "your one thing this month", converted into £ per month. The what-if slider shows "cut it by 20% → £252/month".

**Show:** Home (one thing + what-if) → Compare → Forecast.

**Numbers:**
- KNN beats the population average at predicting spending mix: **2.42 vs 3.24 percentage points** of error on held-out data.
- 6 groups: silhouette **0.34** (the best of 3 to 9 groups). Groups are stable across reruns (**ARI 1.00**).
- Fraud check on 227 people it never saw: **98–99%** of what it flags is real fraud, it catches **92–94%** of fraud cases, and only **2%** of genuine people get a false alarm (1–2 month statements).

**Be honest about:** the score measures how close your spending *mix* is to your peers, not your financial health. There's no income in the data.

---

## G-Research: make the invisible visible

**Their question:** What's hidden in data that people can't see, and how do you make it obvious?

**Our answer:**
- A statement is hundreds of rows that each look fine. Penny surfaces what you can't see row by row:
  - **Your spending identity:** "You spend like the Eating out & Entertainment crowd."
  - **The gap to your peers:** "53% of your money on online shopping; people like you spend 45%."
  - **The cost of a habit**, in £ per month and per year.
  - **When you spend:** a calendar heatmap, e.g. "84% of your spending happens Friday to Sunday".
  - **Where you spend:** a map of every place, sized by visits and coloured by spend, with real routes from home.
  - **Purchases that aren't you:** a burst of 4 big orders at 1am, or a shop 532 km from your usual places, each with plain reasons ("22× your usual", "late night").
- **Observe → explain → correct → recompute:** press "Not me" and the score, forecast, map and calendar all update.

**Show:** Fraud check (press Not me) → Home (the score changes) → Forecast (the calendar) → the map on Home.

**Be honest about:** the reference data is synthetic (Kaggle), so the place rule can't be validated on it. It's designed for real statements.

---

## Bank of Scotland: smart cost of living / better everyday money decisions

**Their question:** How can you help people, especially students, make better day-to-day money decisions with the cost of living as it is?

**Our answer:**
- **No "cut everything" advice.** Penny finds **one** realistic change: the category where you're most above people like you, and only if it's 3+ points above.
- **It's in pounds, not percentages:** "Matching them frees up about £173 a month, or £2,071 a year."
- **What-if slider:** you choose how far to go (5–50%) and see the saving instantly. You stay in control of the trade-off.
- **Goals:** pick one recommendation, and it's checked on your next statement.
- **Forecast:** "you're heading for £762–£910 by 30 Nov", so you see a problem before the month ends.
- **Fraud check:** it protects the student as well as advising them.

**Show:** Home (biggest win + what-if) → Recommendations (set a goal) → Forecast.

**Be honest about:** subscriptions and the price-rise checks are still demo data, marked "Placeholder".

---

## InstillAI: an assistant that adapts to its user

**Their question:** Can you build an AI assistant that adapts to the person using it?

**Our answer:**
- **Ask Penny** (top bar) answers questions using only your real profile (totals, categories, recommendations). It never invents transactions.
- **Built for the "overwhelmed student":** plain language, one clear next step, no judgement.
- **Two forms of every answer:** a 2–5 bullet summary, or the full answer read aloud.
- **Suggested prompts** for people who don't know what to ask, plus follow-ups. You can mute, stop or cancel at any time.

**Show:** Ask Penny → "Why is my score what it is?" → play the voice answer.

**Be honest about:** it needs `OPENAI_API_KEY` (and `ELEVENLABS_API_KEY` for voice) in `.env`. Check it works on the demo laptop before you walk up.

---

## Wordsmith: an end-to-end agentic browser workflow

**Their question:** Can an agent do a complicated, multi-step task in a browser from start to finish?

**Our answer:**
- **A recommendation becomes a research task.** "Groceries cost you more than your peers" → the agent rebuilds your usual basket → compares 18 items across Tesco, Aldi and Lidl → checks travel time → returns cheaper options with a monthly saving.
- **Three task-specific workflows:** grocery basket, takeaway replacement, subscription setup.
- **Every step is visible:** search → visit → compare → done, with source URLs, so the user can check the reasoning.
- **Safe:** it never spends money or changes anything without the user.

**Show:** Recommendations → Coming next → Savings agent.

**Be honest about (important):** the browser steps are a **scripted prototype**. The workflow, data types and UI are built and ready for a live browser worker, but it isn't browsing live yet. Say this up front; judges respect it.

---

## MLH: best use of Tiger Data

**Their question:** Did Tiger Data power the product, or just store it?

**Our answer:**
- About **928,000 purchases** in a **TimescaleDB hypertable**, split into monthly chunks, with a `(cc_num, ts)` index for fast per-person lookups.
- A **continuous aggregate** (`daily_category_spend`) keeps spend per person, per category, per day up to date automatically. The ML reads features from it instead of scanning raw rows.
- **The aggregate is fraud-aware:** it skips purchases marked "not me". So answering the fraud check changes the stats live, through the database.
- Uploads go into the same table as the reference users, so a new statement is treated exactly like the 908.

**Show:** press Not me on the Fraud check and watch the score change (the aggregate refreshing), and/or `uv run tiger-check`.

---

## MLH: best use of ElevenLabs

**Their question:** Is the voice a real part of the product, or a gimmick?

**Our answer:**
- Penny reads your **real** spending explanation aloud: useful when you're walking, cooking, or a dashboard is hard to read.
- The key stays on the server (FastAPI). Audio plays in the browser and can be cancelled when you ask something new, mute, or close.

**Show:** Ask Penny → play the answer.

---

## Not entering

- **Google Cloud:** not used. Max's docs describe it as a *future* home for the browser agent, not something we use now. Don't claim it.

---

## Quick facts to have ready

| | |
|---|---|
| Reference data | 908 real (synthetic Kaggle) card holders, ~928k purchases, latest 12 months each |
| Fraud labels | 4,075 purchases across 415 people (used only for the fraud check, never in spending stats) |
| Groups / neighbours | 6 k-means groups, 20 nearest neighbours |
| Score | 0–999, like a UK credit score: how closely your mix matches people like you |
| Fraud check accuracy | 98–99% of flags are real fraud, 92–94% of fraud caught, 2% false alarms (unseen people, 1–2 month statements) |
| Stack | React + Vite · FastAPI · scikit-learn · Tiger Data (TimescaleDB) · OpenAI · ElevenLabs · Leaflet + OSRM |
