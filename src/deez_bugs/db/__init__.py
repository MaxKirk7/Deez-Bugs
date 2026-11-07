"""Connect to our Tiger Data (TimescaleDB) database.

Usage from any Python code (e.g. FastAPI):

    from deez_bugs.db import connect

    with connect() as conn:
        rows = conn.execute("SELECT * FROM monthly_category_spend LIMIT 5").fetchall()
"""

import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

# Repo root is three folders up from this file: src/deez_bugs/db/__init__.py
REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMA_FILE = Path(__file__).with_name("schema.sql")


def database_url() -> str:
    """Read DATABASE_URL from the environment or from the .env file in the repo root."""
    load_dotenv(REPO_ROOT / ".env")
    url = os.getenv("DATABASE_URL")
    if not url or "YOUR_PASSWORD" in url:
        raise RuntimeError(
            "DATABASE_URL is not set. Copy .env.example to .env and paste your "
            "Tiger Data connection string into it."
        )
    return url


def connect(autocommit: bool = False) -> psycopg.Connection:
    """Open a connection to Tiger Data."""
    return psycopg.connect(database_url(), autocommit=autocommit)


def create_schema() -> None:
    """Create the raw kaggle_transactions hypertable and kaggle_daily_spend aggregate (safe to re-run)."""
    # autocommit: continuous aggregates can't be created inside a transaction.
    # Run statements one by one: sending them together would wrap them in one transaction.
    statements = [s.strip() for s in SCHEMA_FILE.read_text().split(";")]
    with connect(autocommit=True) as conn:
        for sql in filter(None, statements):  # skip the empty bit after the last ";"
            conn.execute(sql)
