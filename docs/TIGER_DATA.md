# 🐯 Tiger Data: our shared database

All our transactions live in **one shared cloud database** on [Tiger Data](https://www.tigerdata.com/) (formerly Timescale). It's PostgreSQL with extra features for time-based data, which suits bank transactions.

**You don't need to load any data.** It's already in the cloud. You only need to connect.

---

## 🧱 How it fits together

```
 📄 Kaggle CSV ──(uv run tiger-load)──▶ 🐯 Tiger Data ◀──(SQL)── ⚙️ FastAPI ◀──(JSON)── 🖥️ Frontend
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

**3. Install and test:**
```bash
uv sync
uv run tiger-check
```
You should see:
```
✅ Connected to Tiger Data (Postgres 18.6 ...)
   TimescaleDB extension: 2.31.0
   transactions table: 10,000 rows
```

---

## 🗂️ What's in the database

| Name | Type | What it holds |
|---|---|---|
| `transactions` | **Hypertable** | One row per card transaction. Same columns as the Kaggle CSV ([data/README.md](../data/README.md)), except `trans_date_trans_time` is renamed **`trans_time`**. |
| `daily_spend` | **Continuous aggregate** | Pre-computed totals: `day`, `cc_num` (user), `category`, `n_transactions`, `total_amt`. **Use this for dashboard charts.** It's much faster than summing `transactions`. |

**Words you'll hear:**
- **Hypertable:** a table that Tiger splits into time chunks automatically, so date-range queries stay fast.
- **Continuous aggregate:** a summary table that Tiger keeps up to date for you.
- **`time_bucket('1 week', col)`:** groups timestamps into weeks, days, months and so on. Like `GROUP BY week`.

---

## 🐍 Using it in Python (e.g. a FastAPI endpoint)

```python
from deez_bugs.db import connect

# Weekly spend per category for one user
with connect() as conn:
    rows = conn.execute(
        """
        SELECT time_bucket('1 week', day) AS week,
               category,
               SUM(total_amt)            AS spent
        FROM daily_spend
        WHERE cc_num = %s
        GROUP BY week, category
        ORDER BY week
        """,
        (2703186189652095,),
    ).fetchall()
```

> ⚠️ Always pass values with `%s` and a tuple, as above. **Never** put them into the SQL string with f-strings, because that allows SQL injection.

### Getting a pandas DataFrame (for ML / analysis)

```python
import pandas as pd
from deez_bugs.db import connect

with connect() as conn:
    cur = conn.execute(
        "SELECT trans_time, cc_num, category, amt FROM transactions WHERE is_fraud = 0"
    )
    df = pd.DataFrame(cur.fetchall(), columns=[c.name for c in cur.description])
```

---

## 🧽 Cleaning and selecting data for your feature

**Rule: never change or delete rows in `transactions`.** Everyone shares it. Instead, do one of these:

| Need | Do this |
|---|---|
| Only some rows/columns, just for you | Filter in your query: `SELECT ... WHERE ...` (as above) |
| Cleaning in Python | Load a DataFrame and clean it in pandas. The database stays untouched. |
| A cleaned version the **whole team** can reuse | Create a **view** with your own name on it: |

```sql
-- A view is a saved query. It looks like a table but copies no data.
CREATE OR REPLACE VIEW ml_clean_transactions AS
SELECT trans_time, cc_num, category, amt,
       EXTRACT(HOUR FROM trans_time) AS hour
FROM transactions
WHERE is_fraud = 0 AND amt > 0;
```
Then anyone can run `SELECT * FROM ml_clean_transactions`. Please add new views to [`schema.sql`](../src/deez_bugs/db/schema.sql) so they're saved in git.

Want a quick look at the data without Python? Run `tiger db psql` (if you're on the Tiger project), or open the [Tiger console](https://console.cloud.tigerdata.com/projects/e7rmapoamt/services/ctq89jm1dk/overview).

---

## 📥 Loading more data (only one person, only if needed)

The database currently has **10,000 rows** from `fraudTrain.csv`.

```bash
uv run tiger-load                  # first 10,000 rows (already done)
uv run tiger-load --rows 100000    # first 100,000 rows
uv run tiger-load --all            # everything: ~1.85M rows, a few minutes
```
- **Safe to re-run:** rows that are already there are skipped.
- We're on Tiger's **free plan**, which has limited storage. Check the console before running `--all`.

---

## 🛠️ Where the code is

| File | What it does |
|---|---|
| [`src/deez_bugs/db/__init__.py`](../src/deez_bugs/db/__init__.py) | `connect()`: opens a connection using `DATABASE_URL` from `.env` |
| [`src/deez_bugs/db/schema.sql`](../src/deez_bugs/db/schema.sql) | Creates the tables (safe to re-run) |
| [`src/deez_bugs/db/load.py`](../src/deez_bugs/db/load.py) | `uv run tiger-load`: copies the CSV into the database |
| [`src/deez_bugs/db/check.py`](../src/deez_bugs/db/check.py) | `uv run tiger-check`: tests your connection |

---

## 🆘 Troubleshooting

| Problem | Fix |
|---|---|
| `DATABASE_URL is not set` | You don't have a `.env` file yet, or it still has the example line. See setup step 2. |
| `password authentication failed` | The password in `.env` is wrong. Get it again. |
| `connection timed out` | Check your internet connection. Some uni Wi-Fi blocks unusual ports, so try a phone hotspot. |
| VS Code shows `Import "psycopg" could not be resolved` | Run `uv sync`, then in VS Code: **Cmd+Shift+P → Python: Select Interpreter → `.venv`** |
