# "Unusual transactions: was this you?" design

> **Status: built** on branch `fraud-check`. Code: `features.py`, `model.py`, `evaluate.py` in this folder, plus the
> card `frontend/src/components/UnusualTransactions.tsx`. Section 8 lists what changed from the plan while building.

**Goal:** a small dashboard card that lists the purchases that **don't look like this person**, and asks "Was this you?"

Each purchase is checked against **the person's own habits** (price, time, category, place, shop) **and against people like them**. "People like them" are the 20 nearest neighbours that the KNN in `ml/model.py` already finds.
- **✓ It was me:** it stays, and we never ask about it again.
- **✕ Not me:** it's marked as fraud and drops out of their spending stats (score, groups, map and calendar).

**In one line:** we reuse the data and models we already have. The 908 reference users and their **4,075 labelled fraud purchases** teach a small model what "unusual in a way that matters" looks like. The KNN supplies the "people like you" comparison. Every dimension is used to explain *why* a purchase is on the card.

**Result on 227 American users the model never saw (1–2 month statements):** of the purchases on the card, **98–99% are real fraud**. It catches **92–94%** of people whose card was used by someone else. Only **2%** of people with no fraud see anything on the card. These are the final numbers from `evaluate.py` (section 8).

---

## 1. Done already: the database

| What | Now |
|---|---|
| `transactions.is_fraud` | **true** = not made by the owner (the dataset's label, or the user said "not me"). **false** = the owner made it. **NULL** = not known yet (uploads start this way). |
| Fraud rows | **4,075** purchases put back, across **415** of the 908 users, about 10 each. They're only the ones inside each user's 12 months. |
| Spending stats | `daily_category_spend` has `WHERE is_fraud IS NOT TRUE`, so scores, groups, KNN, recommendations and the map **ignore fraud**. Checked: the totals match the genuine purchases exactly. |
| Uploads | Always `is_fraud = NULL`. An `is_fraud` column in an uploaded CSV is ignored: we find unusual purchases ourselves. |
| `uv run tiger-check` | `transactions: 929,802 (4,075 labelled fraud)` |

Files changed: `db/schema.sql`, `db/__init__.py`, `db/load.py`, `db/places.py`, `db/check.py`, plus the docs.

**What fraud looks like in this data** (real example, user `213156747557083`, who usually spends about $6 a time on online shopping):

| When | Category | Amount | Why it stands out |
|---|---|---|---|
| Fri 04 Dec 02:04 | gas_transport | $9.79 | small "test" purchase first |
| Fri 04 Dec 21:50 | shopping_pos | **$959.59** | about 150× their usual |
| Fri 04 Dec 23:47 | shopping_net | **$1,068.48** | 165× their usual, late at night |
| Sat 05 Dec 02:34 | grocery_pos | **$316.71** | 6× their usual, at 2am |
| … 5 more | | | **9 purchases, $4,975, in 2 days** |

Across all fraud purchases: the median is **$370 vs $47** for normal ones, **85%** are between 22:00 and 03:59 (vs 23% normally), and they come in **bursts over 1–2 days**.

---

## 2. What the user sees

One small card. Each row is **one thing to check**: either a single purchase or a burst of them (so 9 fraud purchases are one click, not nine).

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 🔍 Unusual transactions · Was this you?                     2 to check   │
│    Purchases that don't look like your usual spending                    │
│                                                                          │
│  Sat 13 Sep, 01:12 → 03:40 · 4 purchases        £1,879.50   [✓] [✕]     │
│    ⚡ 4 big purchases in 3 hours   📈 up to 41× your usual   🌙 Late night │
│    ▸ ASOS £640 · John Lewis £820 · Amazon £410 · Cafe Nero £9.50          │
│                                                                          │
│  Wed 03 Sep, 14:20 · Harrods (London)              £96.00   [✓] [✕]     │
│    📍 534 km from your usual places   🏪 First time at this shop         │
└──────────────────────────────────────────────────────────────────────────┘
```

- **✕ Not me:** "Removed from your spending (£1,879.50). In real life, call your bank and freeze your card." The score, groups, map and calendar refresh.
- **✓ It was me:** the row slides away and is never asked about again.
- At most 3 rows are shown, then "Show 2 more".
- **Nothing unusual:** a single slim line: `✓ Nothing unusual. We checked all 220 purchases against your habits and people like you.`

---

## 3. How it works

```
statement ─► "unusual for you?" on every dimension ─► model scores each purchase ─► rows on the card
(in the DB)   price · time · category · place · shop   (trained on 908 users +      (+ reason chips)
              · bursts · vs people like you (KNN)       their 4,075 fraud labels)
```

### Step 1. Check every dimension

Each number comes from the person's **own statement**, or from **their KNN neighbours**. A reference user and an upload are treated exactly the same.

| Dimension | Compared with | Example chip | Role |
|---|---|---|---|
| **Price** | your usual purchase in this category | 📈 41× your usual online shopping | model |
| **Price** | **people like you** (your 20 KNN neighbours from `ml/model.py`) | 👥 12× what people like you spend | model |
| **Price** | the amount itself | | model |
| **Category** | which of the 14 | | model |
| **Bursts** | big-for-you purchases within ±24 h; purchases within ±24 h vs your normal | ⚡ 4 big purchases in 3 hours | model |
| **Time** | hour of day (left empty if the statement has no times) | 🌙 Late night (01:31) | model |
| **Time** | how often *you* buy at this time of day | 🕒 You rarely shop at this time | chip only |
| **Category** | how often you and people like you use it | 🧭 You rarely buy Travel (1% of purchases) | chip only |
| **Place** | distance to your nearest usual area (the circles from the map, `places.py`) | 📍 534 km from your usual places | **rule** + chip |
| **Shop** | how many times you've been there | 🏪 First time at this shop | chip only |

"Model" means the model uses it to decide what goes on the card. "Chip only" means it's used to explain a row but doesn't decide anything. Section 4 shows why: in this data, time habits, category habits, place and shop **carry no signal**, so adding them to the model made it slightly worse. The dataset puts every shop at a random spot near home, so the model *can't* learn place. For real uploads, place still matters. That's why it gets its own simple **rule**, explained in step 3.

### Step 2. The model

- **Gradient-boosted trees** (`HistGradientBoostingClassifier`, already in scikit-learn), on the 7 "model" numbers above.
  - **Why:** "unusual" is a *combination* (big **and** late **and** in a burst **and** more than people like you would spend). Trees learn combinations by themselves. Rules alone ("late at night and over 5× your usual") flag 3 normal purchases for every fraud one, and miss 40% of fraud.
  - It handles categories and missing values natively, needs no scaling, and trains in about 4 s.
- **Trained on:** the 908 reference users, plus **1-, 2- and 3-month slices** of them, plus those slices **with the time removed**. Uploads are short and often dates-only, so it learns from statements like theirs.
- **"People like you" reuses the existing KNN:** `get_model()` already finds each user's 20 nearest reference users by spending mix. We add their **average purchase per category** (`spend / txn_count` from `daily_category_spend`). This also fixes a weakness: if you've only bought one thing in a category, "your usual" means nothing, but "people like you" still does.
- **Trains on the first request**, then stays cached with a lock (same pattern as `ml/model.py`): about 8 s to pull 928k rows from Tiger, plus about 10 s to build and train. The API warms it up when it starts, so no user waits. There's no model file to commit.

### Step 3. What goes on the card

A purchase that hasn't been answered yet (`is_fraud IS NULL`) goes on the card if **any** of these is true:
1. **Score ≥ 0.95**: very unusual on its own.
2. **3 or more purchases with score ≥ 0.5 within 48 h**: a burst. These become **one row**.
3. **Place rule:** more than **50 km** from every usual area, it's an in-person category (`_pos`, not `_net`), and you have **10 or more** located purchases (so "usual" means something).

Rows are sorted by score, most unusual first.

### Step 4. Reason chips

A row shows its **2–3 strongest** chips from the table in step 1. Each one is a plain, true statement about the purchase ("41× your usual online shopping"), not the model's internals. Thresholds: × usual ≥ 3, × people like you ≥ 3, 22:00–03:59 for "late night", a time band holding < 5% of your purchases, a category holding < 2% of them, first visit, more than 50 km.

---

## 4. Why this design: the evidence

Tested on **227 users the model never saw** (97 with fraud, 130 without), held out by user with the same seed every time. For short statements, each fraud user's window includes their fraud burst. Scripts: `evaluate.py` (section 5) reprints all of this.

**Which dimensions help?** PR-AUC per purchase (1.0 is perfect; how well fraud is ranked above normal purchases):

| Model uses… | 1 month | 2 months | 12 months | 12 months, dates only |
|---|---|---|---|---|
| price + category + time + bursts (6 numbers) | 0.956 | 0.940 | 0.858 | 0.813 |
| **every** dimension (14 numbers) | 0.936 | 0.931 | 0.833 | 0.739 |
| **6 + "people like you" price (7, the plan)** | **0.974** | **0.960** | **0.901** | **0.820** |

Importance, measured in the 14-number model: amount 0.79 · category 0.60 · **people-like-you price 0.55** · bursts 0.30 · your-usual price 0.07 · hour 0.03 · time habits 0.02 · distance from home 0.01 · shop visits 0.01 · category habits 0.01 · distance vs usual 0.00.

These numbers are the reason for the "chip only" and "rule" split in step 1.

**Which card rule?** (the 7-number model)

| Statement | Show any purchase scoring ≥ 0.8 | **The plan: ≥ 0.95 alone, or a burst of 3+** |
|---|---|---|
| 1 month | 98% real · 98% caught · 4% of genuine users see something | **99% real · 97% caught · 2%** |
| 1 month, dates only | 98% · 98% · 7% | **99% · 97% · 2%** |
| 2 months | 97% · 98% · 6% | **98% · 98% · 2%** |
| 2 months, dates only | 94% · 99% · 13% | **97% · 99% · 4%** |
| 12 months | 85% · 98% · 28% | **92% · 97% · 13%** |
| 12 months, dates only | 68% · 98% · 52% | **76% · 98% · 32%** ⚠ |

"Real" means the purchase on the card is labelled fraud. A genuine purchase on the card isn't really a mistake for this feature: it's still something genuinely unusual for that person, like a £900 TV at midnight.

**Known limit:** a full year with no times shows too much. Fix while building: for dates-only statements longer than 3 months, raise the bar to 0.98 or a burst of 4+, and check the table improves.

**The place rule can't be tested on this data** (shops are randomly placed). It's deliberately strict (more than 50 km, in person, 10+ located purchases), and the demo statement includes a purchase that triggers it.

---

## 5. Build plan

### Files

| File | What it does |
|---|---|
| `fraud/features.py` | `purchase_features(df, like_you)`: the 7 model numbers + the chip-only numbers. `load_purchases(cc_num=None)` reads purchases from Tiger. |
| `fraud/model.py` | `UnusualModel.fit()` (years + slices + no-time copies) and `.check(cc_num)` → rows with reasons. `get_unusual_model()` trains once, with a lock. |
| `fraud/evaluate.py` | `uv run python -m deez_bugs.fraud.evaluate`: reprints the section 4 tables. |
| `ml/model.py` | + `neighbours_avg_purchase(cc_num)`: the 20 KNN neighbours' average purchase per category (reuses the trained KNN). |
| `db/places.py` | + `usual_areas(cc_num)`: the area centres with 3 or more visits (reuses `group_into_areas`), for the place rule. |
| `db/__init__.py` | + `answer_purchases(cc_num, purchases, was_me)`: sets `is_fraud`, **uploads only** (never the reference labels), then refreshes `daily_category_spend` for those days. |
| `api/api.py` | + 2 endpoints (below), + warm both models when the server starts. |
| `frontend/src/components/UnusualTransactions.tsx` | The card in section 2. Reuses `Card`, `CardHeader`, `Badge` from `ui.tsx`. |
| `frontend/src/types.ts`, `api.ts` | `Unusual` type. `liveResults()` also fetches `/unusual`. + `answerUnusual()`. |
| `frontend/src/components/Dashboard.tsx` | Place the card (decision 2). After "not me", refetch insights and places, and hide those rows from the calendar. |
| `frontend/src/mock/demoData.ts` | Alex's statement gets a 4-purchase late-night burst **and** one far-away in-store purchase, so the demo shows both kinds of row. Bump `DEMO_ID_KEY` to `v3` so the new Alex gets uploaded. Add a ready-made result for offline demo mode. |
| `data/samples/sample_statement_unusual.csv` | The sample statement plus those purchases, for testing by hand (gitignored). |

### API

```
GET  /users/{cc_num}/unusual
→ { "cc_num": 23, "checked": 220,
    "rows": [ { "kind": "burst",                      // "burst" (3+ together) or "single"
                "start": "2026-09-13T01:12:00Z", "end": "2026-09-13T03:40:00Z", "total": 1879.5,
                "purchases": [ { "ts": "...", "merchant": "ASOS", "category": "shopping_net",
                                 "amount": 640.0, "score": 0.98 }, ... ],
                "reasons": [ { "kind": "burst",   "text": "4 big purchases in 3 hours" },
                             { "kind": "x_usual", "text": "up to 41× your usual" },
                             { "kind": "night",   "text": "Late night" } ] } ] }

POST /users/{cc_num}/unusual     body: { "was_me": false, "purchases": [ { "ts": "...", "merchant": "ASOS" }, ... ] }
→ { "updated": 4 }               404 if not an uploaded user
```

A purchase is identified by **(cc_num, ts, merchant)**. The table has no ID column, and adding one would rewrite all 928k rows.

### Order, and how to check each step

1. `features.py` + `evaluate.py`: the numbers match section 4.
2. `neighbours_avg_purchase` + `usual_areas` + `model.py`: `check(<a reference cc_num with fraud>)` finds their burst as one row.
3. `answer_purchases` + the endpoints: in `/docs`, upload `sample_statement_unusual.csv`. `GET` shows 2 rows. `POST was_me=false` changes `/insights`, and the next `GET` no longer shows that row.
4. Frontend: `./run.sh`, upload the sample, and the card shows 2 rows. "Not me" updates the score, and after a refresh it isn't asked again. The clean sample shows "Nothing unusual". The demo button shows Alex's 2 rows.
5. Docs: `HOW_IT_WORKS.md` in this folder (what was built and the final numbers), plus a line in `docs/README.md`.

---

## 6. Edge cases

| Case | What happens |
|---|---|
| No times (dates only) | `hour` is left empty: the model was trained for this. No 🌙 or 🕒 chips. Long statements use the stricter bar (section 4). |
| Fewer than 20 purchases | Too little to know "usual": show "Not enough purchases to check yet". |
| Only 1–2 purchases in a category | "Your usual" is noisy, but "people like you" covers it. That's one reason it's in the model. |
| No locations in the CSV | The place rule and 📍 chip are skipped. Everything else works. |
| Online purchases | Never get the place rule (`_net`: where the server sits means nothing). |
| Already answered | Only `is_fraud IS NULL` purchases can appear, so nobody is asked twice. |
| Reference users | Labels are fixed. `POST` refuses them, so the training data can't be changed from the website. |
| £ uploads vs $ training data | Most numbers are relative (× your usual, × people like you), so the currency barely matters. |
| "Delete my data" | Unchanged: deleting the user deletes their purchases and answers. |
| Privacy | Runs on our server. Nothing goes to OpenAI (the assistant only sees totals). |

---

## 7. Decisions for you

1. **Card title:** "Unusual transactions: was this you?" or "Miscellaneous transactions: was this you?" *Recommended: "Unusual".* The data already has a "misc" category (`misc_pos` / `misc_net`, shown as "Other"), so "miscellaneous" could be read as that category.
2. **Where on the dashboard?** Right under the Hero, or in the grid next to the map (it talks about places too). *Recommended: under the Hero.* It's the only thing on the page that asks the user something. When nothing is unusual, it's just one slim line.
3. **"Not me" removes the purchases from their stats** (score, groups, map, calendar)? *Recommended: yes.* It's the honest number, and the score changing live is a nice demo moment.
4. **Demo:** give Alex a late-night burst plus one far-away purchase, so both kinds of row always show in the demo? *Recommended: yes.*

---

## 8. What changed while building (and the final numbers)

**Small purchases can never be flagged.**
- **Why:** in the dataset, fraud often starts with a tiny "test" purchase, and normal transport spending is about $65 of fuel. So the model learned to distrust small transport purchases, and on a UK-style statement it flagged £2 bus fares.
- **Now:** a purchase only counts if it's **3× or more your usual, or 3× what people like you pay, and never less than people like you pay**.
- **Bursts:** because of that guard, a burst can use a lower score bar: 3+ big purchases scoring **≥ 0.2** within 48 h. (I tried "3+ big purchases always count" and it gave far too many false alarms, so it was dropped.)

**The place rule is relative to the person.** It needs more than 50 km **and** more than 3× the person's own usual spread. Dataset users shop over a whole region (shops up to about 100 km from home), so a flat 50 km flagged about 20 of their purchases. Alex's limit is still 50 km.

**Test on American data.** The model learned from American spending, so that's the fair test. `uv run python -m deez_bugs.fraud.evaluate` on 227 held-out users:

| Statement | On the card: real fraud | Fraud users caught | Genuine users shown something |
|---|---|---|---|
| 1 month, with times | 99% | 93% | 2% |
| 1 month, dates only | 99% | 93% | 2% |
| 2 months, with times | 99% | 94% | 2% |
| 2 months, dates only | 98% | 92% | 2% |
| 12 months, with times | 94% | 90% | 12% |
| 12 months, dates only | 90% | 86% | 12% |

**Hand tests through the API**, with real American statements from the dataset (in `data/samples/`, gitignored):
- `us_statement_fraud.csv` (2 months, 8 fraud purchases): **one burst row with 7 of them**, $5,600 in 2 days. The 8th is an $11 "test" purchase, which the guard skips by design. "Not me" moved the score from 62 to 67 and monthly spend from $5,087 to $2,198, and the card emptied.
- `us_statement_clean.csv`: **nothing on the card.**

**Known limit:** UK-style statements (smaller amounts, bus fares) are further from the training data. Alex's demo burst copies the shape of real dataset fraud (about £1,000 online orders at night), and the live model catches it. Real UK uploads may be caught less often.

**Files, as built:** `ml/model.py` didn't need changing (the KNN is used directly). `db/places.py` gained `label_areas` and `usual_centres`, and the map uses the same code.
