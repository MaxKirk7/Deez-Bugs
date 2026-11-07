# 🐯 Tiger Data: our shared database

All our transactions live in **one shared cloud database** on [Tiger Data](https://www.tigerdata.com/) (formerly Timescale). It's PostgreSQL with extra features for time-based data, which suits bank transactions.

**You don't need to create anything.** The tables are already in the cloud. You only need to connect.

---

## 🧱 How it fits together

```
 📄 Kaggle CSV ──(conversion script)──▶ 🐯 Tiger Data ◀──(SQL)── ⚙️ FastAPI ◀──(JSON)── 🖥️ Frontend
                                         ▲
                     🤖 ML batch job ────┘  (reads transactions, writes segments / recommendations)
```

- The **frontend never talks to the database.** It calls the API.
- The **API** uses `connect()` from `deez_bugs.db` to run SQL.
- **ML** can read training data straight from the database too.

---

## ⚡ Setup (5 minutes, each person once)

**1. Get the connection line.** Ask Gayathri to send you the `DATABASE_URL=...` line **privately** (a DM, not the group chat). It holds the password.

**2. Make your `.env` file** in the repo root:
```bash
cp .env.example .env
```
Then open `.env` and replace the example line with the real one.

> 🔒 `.env` is git-ignored. **Never commit it and never paste the password in a public chat.**

**Turn on the secret guard** (once per clone). It blocks any commit that contains `.env` or a database password:
```bash
git config core.hooksPath .githooks
```
A GitHub check (`no-secrets`) also fails any push or PR that includes one.

> If your branch is older than this guide, run `git merge main` first so your `.gitignore` includes `.env`.

**3. Install and test:**
```bash
uv sync
uv run tiger-check
```
You should see:
```
✅ Connected to Tiger Data (Postgres 18.6 ...)
   TimescaleDB extension: 2.31.0
   transactions table: ... rows
   kaggle_transactions table: 10,000 rows
```

---

## 🗂️ What's in the database

The tables are defined in [`db/migrations/`](../db/migrations/). Read those files for every column.

**Source data**

| Name | Type | What it holds |
|---|---|---|
| `users` | Table | One row per person (`user_id`). Synthetic users, demo personas and real uploads. Income band, age band, city. |
| `merchants` | Table | UK shops with a `price_tier` (1 = budget, 3 = premium). |
| `categories` | Table | The 16 spending categories (`groceries`, `eating_out`, ...). |
| `statement_uploads` | Table | One row per uploaded CSV. |
| `transactions` | **Hypertable** | One row per bank transaction: `ts`, `user_id`, `merchant_id`, `amount_gbp` (**negative = money out**), `category`, `description`. |
| `monthly_category_spend` | **Continuous aggregate** | `month`, `user_id`, `category`, `spend_gbp`, `txn_count`. **Use this for "where your money goes" charts.** |
| `daily_cashflow` | **Continuous aggregate** | `day`, `user_id`, `money_in_gbp`, `money_out_gbp`, `txn_count`. **Use this for the payday forecast.** |

**ML outputs** (rebuilt by the batch job; empty them with `uv run python db/reset_derived.py --yes`)

| Name | What it holds |
|---|---|
| `model_runs` | One row per training run: `model_version`, params, metrics |
| `user_merchant_stats` | Visits and spend per user per merchant (KNN input) |
| `user_features` | One row of numbers per user (k-means input) |
| `segments` / `user_segment` | The k-means groups, and which group each user is in |
| `user_neighbours` | Each user's ~20 most similar users |
| `recommendations` / `rec_feedback` | Cheaper-shop suggestions, and what users did with them |

**Old raw data:** `kaggle_transactions` and `kaggle_daily_spend` hold the untouched Kaggle columns (`cc_num`, `trans_time`, `amt`, ...). The app doesn't use them.

**Words you'll hear:**
- **Hypertable:** a table that Tiger splits into time chunks automatically, so date-range queries stay fast.
- **Continuous aggregate:** a summary table that Tiger keeps up to date for you.
- **`time_bucket('1 week', col)`:** groups timestamps into weeks, days, months and so on. Like `GROUP BY week`.

---

## 🐍 Using it in Python (e.g. a FastAPI endpoint)

```python
from deez_bugs.db import connect

# Monthly spend per category for one user
with connect() as conn:
    rows = conn.execute(
        """
        SELECT month, category, spend_gbp
        FROM monthly_category_spend
        WHERE user_id = %s
        ORDER BY month, spend_gbp DESC
        """,
        (42,),
    ).fetchall()
```

> ⚠️ Always pass values with `%s` and a tuple, as above. **Never** put them into the SQL string with f-strings, because that allows SQL injection.

### Getting a pandas DataFrame (for ML / analysis)

```python
import pandas as pd
from deez_bugs.db import connect

with connect() as conn:
    cur = conn.execute(
        "SELECT ts, user_id, category, amount_gbp FROM transactions WHERE amount_gbp < 0"
    )
    df = pd.DataFrame(cur.fetchall(), columns=[c.name for c in cur.description])
```

---

## 🧽 Cleaning and selecting data for your feature

**Rule: never change or delete rows in `transactions`** (except through `db/delete_user.py`). Everyone shares it. Instead, do one of these:

| Need | Do this |
|---|---|
| Only some rows/columns, just for you | Filter in your query: `SELECT ... WHERE ...` (as above) |
| Cleaning in Python | Load a DataFrame and clean it in pandas. The database stays untouched. |
| A cleaned version the **whole team** can reuse | Create a **view** with your own name on it: |

```sql
-- A view is a saved query. It looks like a table but copies no data.
CREATE OR REPLACE VIEW ml_spending AS
SELECT ts, user_id, category, -amount_gbp AS spend_gbp,
       EXTRACT(HOUR FROM ts) AS hour
FROM transactions
WHERE amount_gbp < 0;
```
Then anyone can run `SELECT * FROM ml_spending`. Please save new views in git as a new numbered file in [`db/migrations/`](../db/migrations/) (e.g. `005_ml_views.sql`), then run `uv run python db/migrate.py`.

Want a quick look at the data without Python? Run `tiger db psql` (if you're on the Tiger project), or open the [Tiger console](https://console.cloud.tigerdata.com/projects/e7rmapoamt/services/ctq89jm1dk/overview).

---

## 🧰 Database scripts

```bash
uv run python db/migrate.py              # create/update tables (safe to re-run; only new files are applied)
uv run python db/verify.py               # smoke test: inserts test data, checks everything, cleans up
uv run python db/delete_user.py 42 --yes # "delete my data": user 42 and everything about them
uv run python db/reset_derived.py --yes  # empty all ML output tables before a rebuild
```

**After inserting an upload**, refresh the aggregates for its dates. Uploads contain past dates, which the real-time part of the aggregates doesn't pick up:
```python
from db import refresh_aggregates   # with db/ on your path
refresh_aggregates(first_ts, last_ts)
```

**Changing the schema:** never edit a migration that has already been applied. Add a new numbered file instead. `099_columnstore_optional.sql` (compression) is never applied automatically.

---

## 📥 Loading more raw Kaggle data (only one person, only if needed)

This loads into `kaggle_transactions`, not the app's `transactions`. It currently holds **all 999 users, each with their latest 12 months (~929k rows)**. Run `uv run python data/transaction.py` first to get the CSVs into `data/raw/`.

```bash
uv run tiger-load                  # all users, latest 12 months each (already done)
uv run tiger-load --replace --yes  # empty the table first, then load again
```
- **Safe to re-run:** rows that are already there are skipped.
- The table takes about 385 MB.

---

## 🛠️ Where the code is

| File | What it does |
|---|---|
| [`db/migrations/`](../db/migrations/) | **The app schema**, as numbered SQL files |
| [`db/db.py`](../db/db.py) | `get_conn()` and `refresh_aggregates(start, end)` |
| [`db/migrate.py`](../db/migrate.py), [`verify.py`](../db/verify.py), [`delete_user.py`](../db/delete_user.py), [`reset_derived.py`](../db/reset_derived.py) | See "Database scripts" above |
| [`src/deez_bugs/db/__init__.py`](../src/deez_bugs/db/__init__.py) | `connect()`: same connection, importable from the `deez_bugs` package (e.g. in FastAPI) |
| [`src/deez_bugs/db/schema.sql`](../src/deez_bugs/db/schema.sql) | The raw `kaggle_*` tables only |
| [`src/deez_bugs/db/load.py`](../src/deez_bugs/db/load.py) | `uv run tiger-load`: copies the raw CSV into `kaggle_transactions` |
| [`src/deez_bugs/db/check.py`](../src/deez_bugs/db/check.py) | `uv run tiger-check`: tests your connection |

---

## 🆘 Troubleshooting

| Problem | Fix |
|---|---|
| `DATABASE_URL is not set` | You don't have a `.env` file yet, or it still has the example line. See setup step 2. |
| `password authentication failed` | The password in `.env` is wrong. Get it again. |
| `connection timed out` | Check your internet connection. Some uni Wi-Fi blocks unusual ports, so try a phone hotspot. |
| VS Code shows `Import "psycopg" could not be resolved` | Run `uv sync`, then in VS Code: **Cmd+Shift+P → Python: Select Interpreter → `.venv`** |
