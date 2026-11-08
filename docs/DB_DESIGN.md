# Database design: simplest version

**Status: built** on branch `feat/simple-db`. Decisions taken:
- **Uploads:** a CSV with the dataset's columns `trans_date_trans_time, merchant, category, amt` (plus optional `merch_lat, merch_long`). Every category is checked against the 14, and bad files are rejected.
- **Spending only:** rows with amount ≤ 0 are ignored.
- **Latest 12 months** per reference user.
- **One Tiger continuous aggregate** (`daily_category_spend`) was added.
- **An upload always becomes a new user** with an automatic `cc_num` (1, 2, 3, ...), so it can never mix with a reference user.

---

## 1. What our app needs from the database

1. **Store about 1,000 reference users' transactions**, so a new person can be compared against them.
2. **Store an uploaded bank statement** (a CSV of transactions) in the **same place**, in the **same shape**.
3. Make it easy to calculate **% of spending per category per user**. That's the input for scores, k-means, KNN and collaborative filtering later.

That's all. Everything else (ML results, scores, recommendations) gets added **when we build it**, not before.

---

## 2. What `data/transaction.py` produces

It downloads the Kaggle dataset and saves two CSVs in `data/raw/` (gitignored):

| File | Rows | Size |
|---|---|---|
| `transactions_part1.csv` | 1,296,675 | 335 MB |
| `transactions_part2.csv` | 555,719 | 143 MB |

**Together: 1,852,394 purchases from 999 cards, Jan 2019 – Dec 2020, 14 spending categories.**

Each row is one card purchase with 23 columns:

| Kind | Columns |
|---|---|
| **What we need** | `trans_date_trans_time` (when), `cc_num` (who), `merchant` (where), `category` (what kind), `amt` (how much, USD) |
| Person details | `first`, `last`, `gender`, `dob`, `job`, `street`, `city`, `state`, `zip`, `lat`, `long`, `city_pop` |
| Location (stored) | `city`, `state`, `lat`, `long` (home) and `merch_lat`, `merch_long` (where the purchase happened) |
| Fraud label (stored) | `is_fraud`: for the "Was this you?" check. Left out of all spending stats |
| Not useful to us | `trans_num`, `unix_time` (wrong year), an unnamed row number |

The 14 categories: `grocery_pos`, `grocery_net`, `food_dining`, `gas_transport`, `shopping_pos`, `shopping_net`, `home`, `kids_pets`, `entertainment`, `personal_care`, `health_fitness`, `travel`, `misc_pos`, `misc_net` (`_net` = online, `_pos` = in person).

**Two things found in the data:**
- **91 of the 999 cards are fake.** Every one of their purchases (6–19 each) is labelled as not made by the owner. That leaves **908 real users**.
- Every other user also has a few of these purchases (0.5% of rows, but 4% of spending). We store them with **`is_fraud = true`** (4,075 rows, 415 users) to train the "Was this you?" check. `daily_category_spend` and the map skip them, so each person's spending stats stay real.

---

## 3. The proposal: 2 tables

```
users  1 ──── many  transactions
```

**User IDs: we use `cc_num`.** The data has no separate user ID, but `cc_num` (the card number) is one: every card belongs to exactly one person, with the same name, dob and address on every row. So `cc_num` is the user ID in both tables, with the same name as in the CSV and no mapping. Reference users keep their own `cc_num`. Uploaded users always get an automatic number (1, 2, 3, ...). The shortest real card number has 11 digits, so automatic numbers can never clash.

**No conversion:** data is stored as-is: USD, the 14 Kaggle categories, the original merchant names.

### `users`: one row per person

| Column | Type | Example | Why |
|---|---|---|---|
| `cc_num` | BIGINT, primary key | `2291163933867244` (reference) or `1` (upload) | The user ID. Same name as in the CSV. |
| `source` | TEXT: `reference` or `upload` | `reference` | Tells the 908 comparison users apart from real app users |
| `dob` | DATE, nullable | `1968-03-19` | Age, a likely ML feature ("people your age") |
| `city`, `state` | TEXT, nullable | `Columbia`, `SC` | Home location |
| `lat`, `long` | DOUBLE PRECISION, nullable | `33.9659`, `-80.9355` | Home coordinates, for maps and routes |
| `created_at` | TIMESTAMPTZ | now | When they were added |

### `transactions`: every purchase, from everyone (Tiger **hypertable**)

| Column | Type | Example |
|---|---|---|
| `cc_num` | BIGINT → `users` | `2291163933867244` |
| `ts` | TIMESTAMPTZ | `2020-06-21 12:14:25` |
| `merchant` | TEXT | `Kirlin and Sons` (the meaningless `fraud_` prefix is stripped) |
| `category` | TEXT | `personal_care` |
| `amount` | NUMERIC(10,2) | `2.86` (**positive = money spent**, as in the CSV) |
| `merch_lat`, `merch_long` | DOUBLE PRECISION, nullable | `33.986391`, `-81.200714` (where the purchase happened; optional in uploads) |
| `is_fraud` | BOOLEAN, nullable | `false`. **true** = made by someone else (dataset label, or the user said "not me"). **false** = the owner made it. **NULL** = not known yet (uploads start this way) |

- **Hypertable** = Tiger splits it into monthly chunks automatically, so per-user and date-range queries stay fast. It's also what the "Best Use of Tiger Data" prize looks for.
- One index: `(cc_num, ts)`. That's the only lookup we need: "get this user's transactions".
- Deleting a user deletes their transactions too (`ON DELETE CASCADE`), so "delete my data" is one line.

**That's the whole database.** No category table, no merchants table, no ML tables yet.

### What gets loaded

**908 users × their latest 12 months ≈ 928,000 rows** (4,075 of them fraud), about 200 MB. The latest 12 months is plenty for spending habits, and halves the size compared with loading all 2 years.

**Not stored:** names, gender (fairness), street, zip, job, city_pop, `trans_num`, `unix_time`. (Location **is** stored: home city/state/lat/long and the merchant's lat/long, for maps and routes.) They aren't needed for categories, scores or ML. Anything can be added later from the CSV if it turns out we need it.

---

## 4. How the app uses it

**Upload a bank statement:**
1. Insert one `users` row (`source = 'upload'`).
2. Append its rows to `transactions` with that `cc_num`.

That makes the uploader directly comparable with the 908 reference users.

**% of spending per category for every user** (the input for scores, k-means, KNN):
```sql
SELECT cc_num, category,
       SUM(amount) / SUM(SUM(amount)) OVER (PARTITION BY cc_num) AS share
FROM transactions
GROUP BY cc_num, category;
```

**One person's monthly spending by category** (dashboard):
```sql
SELECT time_bucket('1 month', ts) AS month, category, SUM(amount)
FROM transactions WHERE cc_num = 2291163933867244
GROUP BY 1, 2 ORDER BY 1;
```

---

## 5. What was built

| File | What |
|---|---|
| `src/deez_bugs/db/schema.sql` | The 2 tables + the `daily_category_spend` aggregate |
| `src/deez_bugs/db/load.py` | `uv run tiger-load`: creates the tables and loads 908 users × 12 months |
| `src/deez_bugs/db/__init__.py` | `connect()`, `save_upload(df)`, `category_shares(cc_num)` |
| `src/deez_bugs/db/check.py` | `uv run tiger-check`: connection + counts |
| `src/deez_bugs/api/api.py` | `POST /upload-csv/` (checks + stores) and `GET /users/{cc_num}/categories` (compare with the reference users) |
| `docs/TIGER_DATA.md` | Short team guide |

Everything lives in the `deez_bugs` package, so the API and ML code import it directly. The old over-built setup (`db/` folder, migrations, 18 tables) was deleted.

## 6. Questions (answered: see Status at the top)

1. **What will an uploaded bank statement look like?** The API currently expects the Kaggle columns (`trans_date_trans_time`, `merchant`, `category`, `amt`, ...). A real bank statement has date, description and amount, but **no category**. If uploads won't have a category, we'll need a simple categoriser later. Should the first version accept only Kaggle-style CSVs?
2. **Money in (salary, refunds):** the Kaggle data has only spending. Keep the first version spending-only (positive amounts), and ignore money-in rows in uploads?
3. **Latest 12 months, or all 2 years?** 12 months is recommended (smaller, and habits are current).
4. **Optional Tiger extra:** add one continuous aggregate (pre-computed daily spend per user per category) for faster charts and a stronger Tiger prize entry? It's one extra statement. I'd add it only if you want it.
