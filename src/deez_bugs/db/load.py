"""Load the Kaggle transactions CSV into Tiger Data.

    uv run tiger-load                  # first 10,000 rows of fraudTrain.csv (quick test)
    uv run tiger-load --rows 100000    # more rows
    uv run tiger-load --all            # everything (train + test, ~1.85M rows, takes a few minutes)

Safe to re-run: rows already in the database are skipped.
"""

import argparse

import kagglehub
import pandas as pd

from deez_bugs.db import connect, create_schema

DATASET = "kartik2112/fraud-detection"

# Column order used for COPY. Must match the names in schema.sql.
COLUMNS = [
    "trans_time", "trans_num", "cc_num", "merchant", "category", "amt",
    "first", "last", "gender", "street", "city", "state", "zip",
    "lat", "long", "city_pop", "job", "dob", "unix_time",
    "merch_lat", "merch_long", "is_fraud",
]
COLS_SQL = ", ".join(f'"{c}"' for c in COLUMNS)


def read_csv(path: str, nrows: int | None) -> pd.DataFrame:
    df = pd.read_csv(path, index_col=0, nrows=nrows)
    df = df.rename(columns={"trans_date_trans_time": "trans_time"})
    return df[COLUMNS]


def load_dataframe(df: pd.DataFrame, batch_size: int = 50_000) -> int:
    """COPY rows into a temp table, then insert the new ones. Returns rows inserted."""
    inserted = 0
    with connect() as conn:
        for start in range(0, len(df), batch_size):
            batch = df.iloc[start : start + batch_size]
            with conn.transaction():
                conn.execute(
                    "CREATE TEMP TABLE staging (LIKE transactions INCLUDING DEFAULTS) ON COMMIT DROP"
                )
                with conn.cursor().copy(f"COPY staging ({COLS_SQL}) FROM STDIN WITH (FORMAT csv)") as copy:
                    copy.write(batch.to_csv(index=False, header=False))
                cur = conn.execute(
                    f"INSERT INTO transactions ({COLS_SQL}) SELECT {COLS_SQL} FROM staging "
                    "ON CONFLICT DO NOTHING"
                )
                inserted += cur.rowcount
            print(f"   {min(start + batch_size, len(df)):,} / {len(df):,} rows processed")
    return inserted


def refresh_aggregates() -> None:
    with connect(autocommit=True) as conn:
        conn.execute("CALL refresh_continuous_aggregate('daily_spend', NULL, NULL)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--rows", type=int, default=10_000, help="rows to load from fraudTrain.csv (default 10,000)")
    parser.add_argument("--all", action="store_true", help="load every row of fraudTrain.csv and fraudTest.csv")
    args = parser.parse_args()

    print("1/4 Creating table + hypertable (if needed)...")
    create_schema()

    print("2/4 Finding the dataset...")
    path = kagglehub.dataset_download(DATASET)
    files = ["fraudTrain.csv", "fraudTest.csv"] if args.all else ["fraudTrain.csv"]

    print("3/4 Loading rows...")
    total = 0
    for name in files:
        print(f"   {name}")
        df = read_csv(f"{path}/{name}", None if args.all else args.rows)
        total += load_dataframe(df)

    print("4/4 Refreshing the daily_spend aggregate...")
    refresh_aggregates()

    print(f"✅ Done. {total:,} new rows added.")


if __name__ == "__main__":
    main()
