"""Everything the app needs from the database.

    from deez_bugs.db import connect, save_upload, category_shares

Tables (see schema.sql): users, transactions (hypertable), daily_category_spend (aggregate).
Always pass values with %s and a tuple, never with f-strings (SQL injection).
"""

import io
import os
from pathlib import Path

import pandas as pd
import psycopg
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMA_FILE = Path(__file__).with_name("schema.sql")

CATEGORIES = [
    "grocery_pos", "grocery_net", "food_dining", "gas_transport", "shopping_pos", "shopping_net",
    "home", "kids_pets", "entertainment", "personal_care", "health_fitness", "travel",
    "misc_pos", "misc_net",
]
# Columns an uploaded CSV must have (same names as the dataset).
UPLOAD_COLUMNS = ["trans_date_trans_time", "merchant", "category", "amt"]
# Optional: where each purchase happened. Stored if present, left empty if not.
OPTIONAL_COLUMNS = ["merch_lat", "merch_long"]
# Optional: where the person lives (same on every row, as in the dataset). Needed for the map's routes.
HOME_COLUMNS = ["lat", "long", "city", "state"]


def connect(autocommit: bool = False) -> psycopg.Connection:
    """Open a connection using DATABASE_URL from the repo's .env file."""
    load_dotenv(REPO_ROOT / ".env")
    url = os.getenv("DATABASE_URL")
    if not url or "YOUR_PASSWORD" in url:
        raise RuntimeError("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")
    # keepalives: stop long uploads being silently dropped by the network
    return psycopg.connect(url.strip(), autocommit=autocommit,
                           keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=5)


def create_schema() -> None:
    """Create the tables if they don't exist (safe to re-run)."""
    # One statement at a time, in autocommit: Tiger's aggregate can't be created in a transaction.
    with connect(autocommit=True) as conn:
        for statement in SCHEMA_FILE.read_text().split(";"):
            if any(line.strip() and not line.strip().startswith("--") for line in statement.splitlines()):
                conn.execute(statement)


def refresh_spend(start=None, end=None) -> None:
    """Update daily_category_spend (call after inserting rows with past dates)."""
    with connect(autocommit=True) as conn:
        conn.execute("CALL refresh_continuous_aggregate('daily_category_spend', %s::timestamptz, %s::timestamptz)",
                     (start, end))


def copy_transactions(conn: psycopg.Connection, df: pd.DataFrame) -> None:
    """Bulk-insert rows with columns cc_num, ts, merchant, category, amount, merch_lat, merch_long."""
    cols = ["cc_num", "ts", "merchant", "category", "amount", "merch_lat", "merch_long"]
    with conn.cursor().copy(f"COPY transactions ({', '.join(cols)}) FROM STDIN WITH (FORMAT csv)") as copy:
        for start in range(0, len(df), 100_000):
            buf = io.StringIO()
            df[cols].iloc[start:start + 100_000].to_csv(buf, index=False, header=False)
            copy.write(buf.getvalue())


def clean(df: pd.DataFrame) -> pd.DataFrame:
    """Dataset-style columns -> our transaction columns. Raises ValueError if the CSV is wrong."""
    missing = [c for c in UPLOAD_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"CSV is missing columns: {missing}. Needed: {UPLOAD_COLUMNS}")
    unknown = sorted(set(df["category"].dropna()) - set(CATEGORIES))
    if unknown:
        raise ValueError(f"Unknown categories {unknown}. Allowed: {CATEGORIES}")
    out = pd.DataFrame({
        "ts": pd.to_datetime(df["trans_date_trans_time"]).dt.tz_localize("UTC"),
        "merchant": df["merchant"].astype(str).str.removeprefix("fraud_"),
        "category": df["category"],
        "amount": df["amt"].astype(float).round(2),
    })
    for col in OPTIONAL_COLUMNS:            # location is optional: empty (NULL) if not in the CSV
        out[col] = pd.to_numeric(df[col], errors="coerce") if col in df.columns else float("nan")
    out = out.dropna(subset=["ts", "merchant", "category", "amount"])
    return out[out.amount > 0]              # spending only


def home_from_csv(df: pd.DataFrame) -> dict:
    """The uploader's home from optional lat/long/city/state columns (first filled-in value of each)."""
    def first(col):
        if col not in df.columns:
            return None
        values = df[col].dropna()
        return values.iloc[0] if len(values) else None

    lat, lon = first("lat"), first("long")
    lat, lon = pd.to_numeric(lat, errors="coerce"), pd.to_numeric(lon, errors="coerce")
    valid = pd.notna(lat) and pd.notna(lon) and -90 <= lat <= 90 and -180 <= lon <= 180
    city, state = first("city"), first("state")
    return {
        "lat": float(lat) if valid else None,
        "long": float(lon) if valid else None,
        "city": None if city is None else str(city),
        "state": None if state is None else str(state),
    }


def save_upload(df: pd.DataFrame) -> dict:
    """Store an uploaded statement as a new user. Returns {"cc_num": ..., "rows": ...}."""
    rows = clean(df)
    if rows.empty:
        raise ValueError("No spending rows found in the CSV.")
    home = home_from_csv(df)
    with connect() as conn:
        cc_num = conn.execute(
            """INSERT INTO users (source, lat, long, city, state)
               VALUES ('upload', %s, %s, %s, %s) RETURNING cc_num""",
            (home["lat"], home["long"], home["city"], home["state"]),
        ).fetchone()[0]
        copy_transactions(conn, rows.assign(cc_num=cc_num))
    refresh_spend(rows.ts.min().floor("D"), rows.ts.max().floor("D") + pd.Timedelta(days=1))
    return {"cc_num": cc_num, "rows": len(rows)}


def delete_upload(cc_num: int) -> bool:
    """Delete my data: remove an uploaded user and all their transactions.

    Only works on uploads (never the reference users). Returns False if there was nothing to delete.
    """
    with connect() as conn:
        days = conn.execute("SELECT MIN(ts), MAX(ts) FROM transactions WHERE cc_num = %s", (cc_num,)).fetchone()
        deleted = conn.execute(
            "DELETE FROM users WHERE cc_num = %s AND source = 'upload'", (cc_num,)).rowcount   # cascades to transactions
    if deleted and days[0] is not None:
        # Take their totals out of daily_category_spend straight away.
        refresh_spend(pd.Timestamp(days[0]).floor("D"), pd.Timestamp(days[1]).floor("D") + pd.Timedelta(days=1))
    return bool(deleted)


def category_shares(cc_num: int) -> list[dict]:
    """This user's % of spend per category, next to the average of the reference users."""
    with connect() as conn:
        rows = conn.execute(
            """
            WITH totals AS (
                SELECT cc_num, category, SUM(spend) AS spend
                FROM daily_category_spend GROUP BY cc_num, category),
            shares AS (
                SELECT cc_num, category, spend / SUM(spend) OVER (PARTITION BY cc_num) AS share
                FROM totals)
            SELECT c.category,
                   COALESCE((SELECT share FROM shares s WHERE s.cc_num = %s AND s.category = c.category), 0),
                   COALESCE((SELECT SUM(s.share) FROM shares s JOIN users u USING (cc_num)
                             WHERE u.source = 'reference' AND s.category = c.category), 0)
                   / NULLIF((SELECT COUNT(*) FROM users WHERE source = 'reference'), 0)
            FROM unnest(%s::text[]) AS c(category)
            ORDER BY 2 DESC
            """,
            (cc_num, CATEGORIES),
        ).fetchall()
    return [{"category": c, "your_share": round(float(you), 4), "reference_avg_share": round(float(ref or 0), 4)}
            for c, you, ref in rows]
