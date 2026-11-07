# Segmentation design: "people like you"

Branch: `feat/segmentation` · Code goes in this folder (`src/deez_bugs/ml/`), so the API can import it.

> **Database update:** the database was rebuilt to the simple design in [docs/DB_DESIGN.md](../../../docs/DB_DESIGN.md): `users`, `transactions` (cc_num, ts, merchant, category, amount) and `daily_category_spend`. Where this plan mentions `kaggle_transactions`, `user_id`, migrations or the ML tables, read `transactions` / `cc_num`. The ML output tables will be added when the ML is built.

**Goal:** group our 999 users into about **6 segments** of people who spend in similar ways, find each user's **20 most similar users** (KNN), and store both in the database. When someone uploads a bank statement, place them in a segment and find their neighbours in milliseconds, with no retraining.

The numbers below come from a quick prototype on the real data in `kaggle_transactions` (999 users, latest 12 months each).

---

## 1. What we have, and what we don't

| We have (per purchase) | We can derive (per user) |
|---|---|
| `amt`, `category` (14 values), `merchant`, `trans_time` | % of spend per category, spend per month, average purchase, purchases per week, weekend / night / online habits |
| `dob`, `city_pop`, `job`, `city` | age, city size (urban vs rural) |

**What we don't have:**
- **No income column.** Spending level (log monthly spend) is the closest proxy. Don't invent an income. `users.income_band` stays empty for these users.
- **No salary, rent or bills.** Every row is a card purchase, so "savings rate" can't be calculated for the Kaggle users. It can for uploads that include money coming in.
- **`job` is free text** (497 different values) and `city` has 906 values, so neither works directly as a feature. They're fine for display only.

---

## 2. Step 0: clean the data (decide before coding)

| Issue | Numbers | Proposal |
|---|---|---|
| **Purchases the card owner didn't make** (labelled fraud in the raw CSV) | 4,979 rows = 0.54% of rows but **4.1% of spend**, across 506 users | **Exclude them when loading.** They aren't the person's real spending: they inflate online shopping and make a few users look like big spenders. This is cleaning, not fraud detection. Needs a 1-line filter in `tiger-load` and a reload. |
| Very quiet users | 91 users have fewer than 20 purchases in 12 months | Keep them, but give them a `low_activity` flag. Their percentages are noisy, so don't use them as KNN neighbours. |
| Kaggle users aren't in `users` yet | `users` is empty and the ML tables need `user_id` | Migration `005`: add `users.kaggle_cc_num BIGINT UNIQUE`, then insert one `users` row per card (`source = 'synthetic'`, `age_band`, `city`). |
| `user_features` has UK category columns | The schema has `share_groceries`, ... but the data has `grocery_pos`, ... | Migration `005`: swap them for the 14 Kaggle share columns. The tables are empty, so nothing is lost. |

---

## 3. Features (one row per user)

### Used for grouping (k-means)

| Feature | How | Why |
|---|---|---|
| `share_<category>` × 14 | spend in that category ÷ total spend | **What people buy.** This is the core of "people like you". |
| `online_ratio` | share of purchases in `*_net` categories | Shopping style |

### Used for describing segments and filtering, not for grouping

| Feature | How |
|---|---|
| `monthly_spend` | total ÷ months active. **Our income proxy.** |
| `avg_ticket` | mean purchase amount |
| `txns_per_week` | purchases ÷ weeks active |
| `weekend_ratio`, `night_ratio` | share of purchases on Sat/Sun, or between 22:00 and 06:00 |
| `age`, `city_size` | from `dob` and `log10(city_pop)` |

**Why only shares for k-means?** We tested three versions. Grouping on shares alone gives the cleanest groups. Adding spend size makes the algorithm mostly split "big spenders vs small spenders", which is less interesting and is skewed by a few extreme users.

| Features used | Silhouette at k = 3…9 (higher = cleaner groups) |
|---|---|
| **% share per category** (fraud rows removed) | 0.23, 0.27, 0.31, **0.34 (k=6)**, 0.30, 0.30, 0.30 |
| shares + spend / behaviour (before cleaning) | 0.19 … 0.30, best at k=8 |
| all features incl. age, city (before cleaning) | 0.20 … 0.27, best at k=7–8 |

So **k = 6 on category shares** is the best result, and it matches our target. Prototype group sizes: 25, 107, 120, 146, 181, 329.

---

## 4. K-means: the 6 segments (batch job)

1. Build the feature table (section 3) from `kaggle_transactions`.
2. Standardise each column (`StandardScaler`), so every feature counts equally.
3. Run `KMeans(n_clusters=6, n_init=10, random_state=42)`.
4. **Name each segment automatically** from the 2 categories it over-indexes on most compared with everyone else, e.g. "Online shoppers" or "Groceries & fuel". Rename by hand if needed.
5. Write the results:
   - `model_runs`: `model_version` (e.g. `2026-11-08T10:00_kmeans6`), params including **the scaler means/stds and the 6 centres** (so uploads can be placed later without retraining), and metrics (silhouette, sizes, stability).
   - `segments`: 6 rows with name, `n_users`, average monthly spend, and `profile_json` (average share per category).
   - `user_segment`: one row per user, with their segment and distance to its centre.
   - `user_features`: one row per user (section 3).

---

## 5. KNN: 20 nearest neighbours (batch job)

- **Vector per user:** the standardised category shares + `online_ratio` + `log(monthly_spend)` + `age`. Spend and age are added here, unlike for k-means, so neighbours are similar in what they buy **and** in budget and life stage.
- **Similarity:** cosine similarity. 999 × 999 is tiny, so plain NumPy computes all of it in under a second, with no special library.
- **Store:** the top 20 per user in `user_neighbours` (`similarity`, `rank`). Low-activity users are excluded as neighbours.
- **Later, for shop recommendations:** `user_merchant_stats` (visits and spend per user per merchant) gives "your neighbours shop at X, where the average purchase is cheaper".

---

## 6. When someone uploads a statement (runtime)

```
upload CSV → categorise each row into the 14 categories → build their feature row
          → scale with the saved means/stds → nearest of the 6 saved centres = their segment
          → cosine vs the 999 stored user_features rows → top 20 neighbours
```

- **Categorise** is the one new piece of logic. Map each upload row to one of the 14 categories using keyword rules on the description (e.g. `TESCO` → `grocery_pos`, `UBER` → `gas_transport`, anything `.COM` / `ONLINE` → `*_net`). A rules table is simple and explainable. Leave an "uncategorised" bucket rather than guessing.
- Nothing is retrained. It's one matrix multiply against 999 rows.

---

## 7. How we show it works (for the judges)

| Check | How | Target |
|---|---|---|
| Groups are real | Silhouette score vs k (section 3) | Best at k = 6 ✓ |
| Groups are stable | Re-run with 5 seeds and compare (Adjusted Rand Index) | ARI > 0.8 |
| Neighbours predict behaviour | Hold out each user's last 3 months. Predict their category shares from their 20 neighbours' shares. Compare with predicting "everyone's average". | Neighbours beat the baseline. Report both numbers. |

All of these go into `model_runs.metrics`.

---

## 8. Files to write (in this folder)

| File | What it does |
|---|---|
| `features.py` | `build_features(df) -> DataFrame`, one row per user. Used by both the batch job and uploads. |
| `segment.py` | Fit k-means, name segments, return centres and scaler |
| `neighbours.py` | Cosine top-20 |
| `assign.py` | Runtime: place one new user (segment + neighbours) from the saved model |
| `categorise.py` | Upload row description → one of the 14 categories |
| `run_batch.py` | `uv run python -m deez_bugs.ml.run_batch`: load, build, fit, evaluate, write all tables |
| `db/migrations/005_segmentation.sql` | `users.kaggle_cc_num` + the Kaggle share columns in `user_features` |

New dependency: `scikit-learn`.

**Suggested order:** Step 0 cleaning → `features.py` → `segment.py` + `run_batch.py` (k-means in the database) → `neighbours.py` → `assign.py` + `categorise.py` → evaluation.

---

## 9. Decisions for you

1. **Exclude the purchases labelled fraud?** Recommended. It's 4.1% of spend, and they distort 506 users' profiles.
2. **Group on category shares only** (recommended, cleanest), or include spend level and age so groups also split by budget?
3. **Exactly 6**, or let the data choose between 5 and 7 each run?
