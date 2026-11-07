# 🐯 Tiger Data: our shared database

All transactions live in **one shared cloud database** on [Tiger Data](https://www.tigerdata.com/) (PostgreSQL + TimescaleDB). The design and the reasons behind it are in [DB_DESIGN.md](DB_DESIGN.md).

**You don't need to load anything.** The data is already in the cloud. You only need to connect.

---

## ⚡ Setup (each person once)

1. Ask for the `DATABASE_URL=...` line **privately** (a DM, not the group chat). It holds the password.
2. `cp .env.example .env`, then paste the real line into `.env`. **Never commit `.env`.**
3. Turn on the secret guard, which blocks commits containing `.env` or a password: `git config core.hooksPath .githooks`
4. Install and test:
   ```bash
   uv sync
   uv run tiger-check
   ```
   You should see about 908 reference users and about 924,000 transactions.

---

## 🗂️ What's in the database

| Name | What it is |
|---|---|
| `users` | One row per person. `cc_num` = user ID. `source` = `reference` (the 908 comparison users) or `upload` (people using the app). Also `dob` and home location: `city`, `state`, `lat`, `long`. |
| `transactions` | **Hypertable.** Every purchase from everyone: `cc_num`, `ts`, `merchant`, `category`, `amount`, and where it happened: `merch_lat`, `merch_long`. |
| `daily_category_spend` | **Continuous aggregate.** Spend per user per category per day, kept up to date by Tiger. Use it for "% of spend per category" and charts. |

The 14 categories: `grocery_pos`, `grocery_net`, `food_dining`, `gas_transport`, `shopping_pos`, `shopping_net`, `home`, `kids_pets`, `entertainment`, `personal_care`, `health_fitness`, `travel`, `misc_pos`, `misc_net`.

---

## 🐍 Using it from Python

```python
from deez_bugs.db import connect, save_upload, category_shares

category_shares(2291163933867244)   # one user's % per category vs the reference average
save_upload(df)                     # store an uploaded statement as a new user -> {"cc_num": 1, "rows": 120}

with connect() as conn:             # any SQL. Always use %s, never f-strings.
    rows = conn.execute(
        "SELECT category, SUM(spend) FROM daily_category_spend WHERE cc_num = %s GROUP BY 1",
        (2291163933867244,),
    ).fetchall()
```

**The API** (`uv run python -m deez_bugs.api.api`, then open http://127.0.0.1:8000/docs):
- `POST /upload-csv/` takes a CSV with columns `trans_date_trans_time, merchant, category, amt` (optional: `merch_lat, merch_long`) and returns the new user's `cc_num`. Unknown categories or missing columns are rejected with a 400.
- `GET /users/{cc_num}/categories` returns that user's % per category next to the reference users' average.
- `GET /users/{cc_num}/places` returns the map data: home (`lat`/`long` from `users`) and purchases grouped into areas (visits, money spent, top shops, km from home). Uploads can add home with optional `lat, long, city` columns.

---

## 🛠️ Commands

```bash
uv run python data/transaction.py    # download the raw CSVs into data/raw/ (gitignored)
uv run tiger-load                    # create the tables + load the 908 reference users (already done)
uv run tiger-load --replace --yes    # reload the reference users from scratch
uv run tiger-check                   # connection + row counts
```

| File | What |
|---|---|
| [`src/deez_bugs/db/schema.sql`](../src/deez_bugs/db/schema.sql) | The whole database (2 tables + 1 aggregate) |
| [`src/deez_bugs/db/__init__.py`](../src/deez_bugs/db/__init__.py) | `connect`, `save_upload`, `category_shares` |
| [`src/deez_bugs/db/load.py`](../src/deez_bugs/db/load.py) | `tiger-load` |
| [`src/deez_bugs/api/api.py`](../src/deez_bugs/api/api.py) | The upload API |

---

## 🆘 Troubleshooting

| Problem | Fix |
|---|---|
| `DATABASE_URL is not set` | No `.env` yet, or it still has the example line |
| `password authentication failed` | The password in `.env` is wrong, or the user isn't exactly `tsdbadmin` |
| `connection timed out` | Uni Wi-Fi may block port 30401. Try a phone hotspot. |
| VS Code can't find `psycopg` | `uv sync`, then **Cmd+Shift+P → Python: Select Interpreter → `.venv`** |
