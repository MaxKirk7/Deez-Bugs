"""Shared database helpers.

    from db import get_conn, refresh_aggregates      # when running scripts in db/
    with get_conn() as conn:
        conn.execute("SELECT * FROM monthly_category_spend WHERE user_id = %s", (42,))

Always pass values with %s and a tuple. Never build SQL with f-strings (SQL injection).
"""

import os
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[1]


def get_conn(autocommit: bool = False) -> psycopg.Connection:
    """Open a connection using DATABASE_URL from the environment or the repo's .env file."""
    load_dotenv(REPO_ROOT / ".env")
    url = os.getenv("DATABASE_URL")
    if not url or "YOUR_PASSWORD" in url:
        # Don't print the URL: it contains the password.
        raise RuntimeError("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")
    return psycopg.connect(url, autocommit=autocommit)


def _utc(ts: datetime) -> datetime:
    """Treat naive datetimes as UTC."""
    return ts.replace(tzinfo=timezone.utc) if ts.tzinfo is None else ts.astimezone(timezone.utc)


def refresh_aggregates(start_ts: datetime, end_ts: datetime) -> None:
    """Recompute both continuous aggregates for rows between start_ts and end_ts.

    Call this after inserting an upload (uploads have past dates, which the
    real-time part of the aggregates doesn't cover).

    A refresh only recomputes buckets that sit fully inside the window, so the
    window is widened to whole months (UTC) to cover the monthly view.
    """
    start = _utc(start_ts).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = _utc(end_ts).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = end.replace(year=end.year + 1, month=1) if end.month == 12 else end.replace(month=end.month + 1)

    # refresh_continuous_aggregate can't run inside a transaction, hence autocommit.
    with get_conn(autocommit=True) as conn:
        for view in ("monthly_category_spend", "daily_cashflow"):
            conn.execute("CALL refresh_continuous_aggregate(%s, %s, %s)", (view, start, end))
