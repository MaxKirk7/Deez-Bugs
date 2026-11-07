"""Load the raw Kaggle CSVs from data/raw/ into the kaggle_transactions table in Tiger Data.

    uv run python data/transaction.py   # once: download the CSVs into data/raw/
    uv run tiger-load                   # load every user's latest 12 months (~927k rows, 999 users)
    uv run tiger-load --replace --yes   # empty the table first, then load

What gets loaded: all 999 users, each with their most recent 12 months of purchases.
The data is stored as-is except: gender and the fraud label are dropped, and the
meaningless "fraud_" prefix is stripped from merchant names.

Safe to re-run: rows already in the database are skipped.
"""

import argparse
from pathlib import Path

import pandas as pd

from deez_bugs.db import REPO_ROOT, connect, create_schema

RAW_DIR = REPO_ROOT / "data" / "raw"
FILES = ["transactions_part1.csv", "transactions_part2.csv"]
MONTHS = 12

# Column order used for COPY. Must match the names in schema.sql.
COLUMNS = [
    "trans_time", "trans_num", "cc_num", "merchant", "category", "amt",
    "first", "last", "street", "city", "state", "zip",
    "lat", "long", "city_pop", "job", "dob", "unix_time",
    "merch_lat", "merch_long",
]
COLS_SQL = ", ".join(f'"{c}"' for c in COLUMNS)


def read_raw() -> pd.DataFrame:
    """Both CSVs, keeping each user's latest 12 months."""
    missing = [f for f in FILES if not (RAW_DIR / f).exists()]
    if missing:
        raise SystemExit(f"Missing {missing} in data/raw/. Run: uv run python data/transaction.py")
    df = pd.concat(pd.read_csv(RAW_DIR / f, index_col=0) for f in FILES)
    df = df.rename(columns={"trans_date_trans_time": "trans_time"})
    df["trans_time"] = pd.to_datetime(df.trans_time)
    last = df.groupby("cc_num").trans_time.transform("max")
    df = df[df.trans_time > last - pd.DateOffset(months=MONTHS)]
    df["merchant"] = df.merchant.str.removeprefix("fraud_")
    return df[COLUMNS]


def load_dataframe(df: pd.DataFrame, batch_size: int = 50_000) -> int:
    """COPY rows into a temp table, then insert the new ones. Returns rows inserted."""
    inserted = 0
    with connect() as conn:
        for start in range(0, len(df), batch_size):
            batch = df.iloc[start : start + batch_size]
            with conn.transaction():
                conn.execute(
                    "CREATE TEMP TABLE staging (LIKE kaggle_transactions INCLUDING DEFAULTS) ON COMMIT DROP"
                )
                with conn.cursor().copy(f"COPY staging ({COLS_SQL}) FROM STDIN WITH (FORMAT csv)") as copy:
                    copy.write(batch.to_csv(index=False, header=False))
                cur = conn.execute(
                    f"INSERT INTO kaggle_transactions ({COLS_SQL}) SELECT {COLS_SQL} FROM staging "
                    "ON CONFLICT DO NOTHING"
                )
                inserted += cur.rowcount
            print(f"   {min(start + batch_size, len(df)):,} / {len(df):,} rows processed")
    return inserted


def refresh_aggregates() -> None:
    with connect(autocommit=True) as conn:
        conn.execute("CALL refresh_continuous_aggregate('kaggle_daily_spend', NULL, NULL)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--replace", action="store_true", help="empty kaggle_transactions before loading")
    parser.add_argument("--yes", action="store_true", help="confirm --replace")
    args = parser.parse_args()
    if args.replace and not args.yes:
        raise SystemExit("--replace empties kaggle_transactions. Add --yes to confirm.")

    print("1/4 Creating table + hypertable (if needed)...")
    create_schema()
    if args.replace:
        with connect() as conn:
            conn.execute("TRUNCATE kaggle_transactions")
        print("   emptied kaggle_transactions")

    print("2/4 Reading data/raw/ ...")
    df = read_raw()
    print(f"   {len(df):,} rows, {df.cc_num.nunique()} users (latest {MONTHS} months each)")

    print("3/4 Loading rows...")
    total = load_dataframe(df)

    print("4/4 Refreshing the kaggle_daily_spend aggregate...")
    refresh_aggregates()

    print(f"✅ Done. {total:,} new rows added.")


if __name__ == "__main__":
    main()
