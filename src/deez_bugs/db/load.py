"""Load the reference users from data/raw/ into the database.

    uv run python data/transaction.py    # once: download the CSVs into data/raw/
    uv run tiger-load                    # create the tables (if needed) and load
    uv run tiger-load --replace --yes    # delete the reference users first, then load again

Loads the 908 real users, each with their latest 12 months of purchases. Purchases the
dataset marks as not made by the card owner are left out (91 cards have only those,
so they disappear entirely).
"""

import argparse

import pandas as pd

from deez_bugs.db import REPO_ROOT, clean, connect, copy_transactions, create_schema, refresh_spend

RAW = [REPO_ROOT / "data" / "raw" / f for f in ("transactions_part1.csv", "transactions_part2.csv")]
COLUMNS = ["trans_date_trans_time", "cc_num", "merchant", "category", "amt", "dob", "is_fraud",
           "city", "state", "lat", "long", "merch_lat", "merch_long"]


def read_reference_users() -> pd.DataFrame:
    if not all(f.exists() for f in RAW):
        raise SystemExit("data/raw/ is missing. Run: uv run python data/transaction.py")
    df = pd.concat((pd.read_csv(f, usecols=COLUMNS) for f in RAW), ignore_index=True)
    df = df[df.is_fraud == 0]                                   # only the owner's own spending
    t = pd.to_datetime(df.trans_date_trans_time)
    return df[t > t.groupby(df.cc_num).transform("max") - pd.DateOffset(months=12)]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--replace", action="store_true", help="delete the reference users first")
    parser.add_argument("--yes", action="store_true", help="confirm --replace")
    args = parser.parse_args()
    if args.replace and not args.yes:
        raise SystemExit("--replace deletes every reference user and their transactions. Add --yes to confirm.")

    print("1/4 Creating tables (if needed)...")
    create_schema()

    print("2/4 Reading data/raw/ ...")
    df = read_reference_users()
    # One row per person: date of birth + home location (the same on every row of a card).
    users = df.groupby("cc_num")[["dob", "city", "state", "lat", "long"]].first()
    print(f"   {len(df):,} purchases from {len(users)} users")

    print("3/4 Loading...")
    rows = clean(df).assign(cc_num=df.cc_num)
    with connect() as conn:
        existing = conn.execute("SELECT COUNT(*) FROM users WHERE source = 'reference'").fetchone()[0]
        if existing and not args.replace:
            raise SystemExit(f"{existing} reference users are already loaded. Use --replace --yes to reload.")
        if existing:
            conn.execute("DELETE FROM users WHERE source = 'reference'")
        conn.execute(
            """INSERT INTO users (cc_num, source, dob, city, state, lat, long)
               SELECT cc, 'reference', dob, city, state, lat, long
               FROM unnest(%s::bigint[], %s::date[], %s::text[], %s::text[], %s::float8[], %s::float8[])
                    AS u(cc, dob, city, state, lat, long)""",
            (users.index.tolist(), users.dob.tolist(), users.city.tolist(), users.state.tolist(),
             users.lat.tolist(), users.long.tolist()),
        )
        conn.commit()
        # Save in batches, so a dropped connection loses one batch, not everything.
        # (If it does fail halfway, re-run with --replace --yes.)
        batch = 100_000
        for start in range(0, len(rows), batch):
            copy_transactions(conn, rows.iloc[start:start + batch])
            conn.commit()
            print(f"   {min(start + batch, len(rows)):,} / {len(rows):,} rows saved", flush=True)

    print("4/4 Updating daily_category_spend...")
    refresh_spend()
    print("✅ Done.")


if __name__ == "__main__":
    main()
