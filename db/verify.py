"""Smoke test for the database layer.  Run:  uv run python db/verify.py

Inserts a little test data, checks the hypertable, aggregates and "delete my data"
all work, then removes every test row. Prints ALL CHECKS PASSED at the end.
"""

import random
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from db import get_conn, refresh_aggregates

TEST_TAG = "__verify__"   # marks test rows so cleanup can find them
START = datetime(2020, 1, 1, tzinfo=timezone.utc)
END = datetime(2020, 3, 31, 23, 59, tzinfo=timezone.utc)

EXPECTED_TABLES = {
    "categories", "users", "merchants", "statement_uploads", "transactions",
    "model_runs", "user_merchant_stats", "user_features", "segments", "user_segment",
    "user_neighbours", "recommendations", "rec_feedback", "schema_migrations",
}


def check(ok: bool, message: str) -> None:
    if not ok:
        raise AssertionError(message)
    print(f"  ✓ {message}")


def check_tables(conn) -> None:
    rows = conn.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1"
    ).fetchall()
    tables = {r[0] for r in rows}
    print("Tables:", ", ".join(sorted(tables)))
    missing = EXPECTED_TABLES - tables
    check(not missing, f"all expected tables exist {sorted(missing) if missing else ''}")

    ht = conn.execute(
        "SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'transactions'"
    ).fetchone()
    check(ht is not None, "transactions is a hypertable")

    caggs = {r[0] for r in conn.execute("SELECT view_name FROM timescaledb_information.continuous_aggregates")}
    check({"monthly_category_spend", "daily_cashflow"} <= caggs, "both continuous aggregates exist")


def insert_test_data(conn) -> tuple[list[int], list[int]]:
    """2 users, 3 merchants, ~60 transactions over Jan-Mar 2020. Returns (user_ids, merchant_ids)."""
    user_ids = [
        conn.execute(
            "INSERT INTO users (persona, income_band, city, source) VALUES (%s, '20-35k', 'Edinburgh', 'demo') RETURNING user_id",
            (TEST_TAG,),
        ).fetchone()[0]
        for _ in range(2)
    ]
    merchant_ids = [
        conn.execute(
            "INSERT INTO merchants (name, category, price_tier, city) VALUES (%s, %s, %s, %s) RETURNING merchant_id",
            (f"{TEST_TAG}{name}", category, tier, TEST_TAG),
        ).fetchone()[0]
        for name, category, tier in [("Lidl", "groceries", 1), ("Waitrose", "groceries", 3), ("Pret", "coffee", 2)]
    ]
    upload_id = conn.execute(
        "INSERT INTO statement_uploads (user_id, filename, row_count, status) VALUES (%s, 'test.csv', 30, 'done') RETURNING upload_id",
        (user_ids[0],),
    ).fetchone()[0]

    rng = random.Random(42)
    rows = []
    for user_id in user_ids:
        for month in (1, 2, 3):
            # Salary in, then ~9 purchases out.
            rows.append((datetime(2020, month, 1, 9, tzinfo=timezone.utc), user_id, None, Decimal("1800.00"), "income", True, "salary"))
            for _ in range(9):
                ts = datetime(2020, month, rng.randint(1, 28), rng.randint(0, 23), rng.randint(0, 59), tzinfo=timezone.utc)
                m = rng.randrange(3)
                category = "coffee" if m == 2 else "groceries"
                amount = -Decimal(rng.randint(150, 9000)) / 100
                rows.append((ts, user_id, merchant_ids[m], amount, category, False, None))

    with conn.cursor() as cur:
        cur.executemany(
            """INSERT INTO transactions (ts, user_id, merchant_id, upload_id, amount_gbp, category, description, injected, pattern_type)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            [(ts, u, m, upload_id if u == user_ids[0] else None, amt, cat, TEST_TAG, inj, pat)
             for ts, u, m, amt, cat, inj, pat in rows],
        )
    check(len(rows) == 60, f"inserted 2 users, 3 merchants, {len(rows)} transactions")
    return user_ids, merchant_ids


def check_aggregates(conn, user_ids: list[int]) -> None:
    monthly_view = conn.execute(
        """SELECT month, user_id, category, spend_gbp, txn_count FROM monthly_category_spend
           WHERE user_id = ANY(%s) ORDER BY 1, 2, 3""", (user_ids,)).fetchall()
    monthly_direct = conn.execute(
        """SELECT time_bucket('1 month', ts), user_id, category, SUM(-amount_gbp), COUNT(*) FROM transactions
           WHERE user_id = ANY(%s) AND amount_gbp < 0 GROUP BY 1, 2, 3 ORDER BY 1, 2, 3""", (user_ids,)).fetchall()
    check(len(monthly_view) > 0 and monthly_view == monthly_direct,
          f"monthly_category_spend matches a direct SUM ({len(monthly_view)} rows)")

    daily_view = conn.execute(
        """SELECT day, user_id, money_in_gbp, money_out_gbp, txn_count FROM daily_cashflow
           WHERE user_id = ANY(%s) ORDER BY 1, 2""", (user_ids,)).fetchall()
    daily_direct = conn.execute(
        """SELECT time_bucket('1 day', ts), user_id,
                  SUM(GREATEST(amount_gbp, 0)), SUM(GREATEST(-amount_gbp, 0)), COUNT(*)
           FROM transactions WHERE user_id = ANY(%s) GROUP BY 1, 2 ORDER BY 1, 2""", (user_ids,)).fetchall()
    check(len(daily_view) > 0 and daily_view == daily_direct,
          f"daily_cashflow matches a direct SUM ({len(daily_view)} rows)")


def insert_ml_rows(conn, user_ids: list[int], merchant_ids: list[int]) -> str:
    """One fake row in every Part B table, all about user_ids[0]. Returns the model_version."""
    u, other = user_ids
    lidl, waitrose, _ = merchant_ids
    version = f"{TEST_TAG}kmeans"
    conn.execute(
        """INSERT INTO model_runs (model_version, kind, params, metrics)
           VALUES (%s, 'kmeans', '{"k": 6}', '{"silhouette": 0.3}')""", (version,))
    conn.execute(
        "INSERT INTO user_merchant_stats (user_id, merchant_id, visits, total_gbp, avg_gbp) VALUES (%s, %s, 5, 100, 20)",
        (u, waitrose))
    conn.execute(
        "INSERT INTO user_features (user_id, share_groceries, avg_ticket_gbp, model_version) VALUES (%s, 0.6, 25, %s)",
        (u, version))
    conn.execute(
        """INSERT INTO segments (segment_id, model_version, name, n_users, profile_json)
           VALUES (0, %s, 'Test segment', 2, '{"groceries": 200}')""", (version,))
    conn.execute(
        "INSERT INTO user_segment (user_id, segment_id, model_version, distance) VALUES (%s, 0, %s, 1.5)",
        (u, version))
    # Neighbours in both directions, to check both are deleted.
    conn.execute(
        """INSERT INTO user_neighbours (user_id, neighbour_id, similarity, rank, model_version)
           VALUES (%s, %s, 0.9, 1, %s), (%s, %s, 0.9, 1, %s)""", (u, other, version, other, u, version))
    rec_id = conn.execute(
        """INSERT INTO recommendations (user_id, merchant_id, replaces_merchant_id, score, est_saving_gbp_year, reason, model_version)
           VALUES (%s, %s, %s, 0.8, 310, 'test', %s) RETURNING rec_id""", (u, lidl, waitrose, version)).fetchone()[0]
    conn.execute("INSERT INTO rec_feedback (rec_id, user_id, action) VALUES (%s, %s, 'clicked')", (rec_id, u))
    check(True, "inserted a model_runs row and one row in each Part B table")
    return version


def rows_about_user(conn, user_id: int) -> dict[str, int]:
    tables = ["users", "transactions", "statement_uploads", "user_merchant_stats", "user_features",
              "user_segment", "user_neighbours", "recommendations", "rec_feedback",
              "monthly_category_spend", "daily_cashflow"]
    counts = {t: conn.execute(f"SELECT COUNT(*) FROM {t} WHERE user_id = %s", (user_id,)).fetchone()[0] for t in tables}
    counts["user_neighbours (as neighbour)"] = conn.execute(
        "SELECT COUNT(*) FROM user_neighbours WHERE neighbour_id = %s", (user_id,)).fetchone()[0]
    return counts


def cleanup(conn) -> None:
    """Remove every test row, even if a check failed halfway."""
    conn.rollback()
    conn.execute("DELETE FROM model_runs WHERE model_version LIKE %s", (TEST_TAG + "%",))
    conn.execute("DELETE FROM users WHERE persona = %s", (TEST_TAG,))   # cascades to everything else
    conn.execute("DELETE FROM merchants WHERE city = %s", (TEST_TAG,))
    conn.commit()
    refresh_aggregates(START, END)


def main() -> None:
    with get_conn() as conn:
        try:
            print("1. Tables")
            check_tables(conn)

            print("2. Test data")
            user_ids, merchant_ids = insert_test_data(conn)
            conn.commit()

            print("3. Continuous aggregates")
            refresh_aggregates(START, END)
            check_aggregates(conn, user_ids)

            print("4. ML tables and delete my data")
            insert_ml_rows(conn, user_ids, merchant_ids)
            conn.commit()
            before = rows_about_user(conn, user_ids[0])
            check(all(n > 0 for n in before.values()), "test user has rows in every related table")
            conn.commit()   # don't hold locks while the delete script runs

            script = Path(__file__).with_name("delete_user.py")
            result = subprocess.run([sys.executable, str(script), str(user_ids[0]), "--yes"],
                                    capture_output=True, text=True)
            check(result.returncode == 0, f"delete_user.py ran ({result.stderr.strip()[-200:]})")
            conn.commit()   # end our read snapshot so we see the deletion
            after = rows_about_user(conn, user_ids[0])
            leftover = {t: n for t, n in after.items() if n}
            check(not leftover, f"every row about the user is gone {leftover or ''}")
            other_left = conn.execute("SELECT COUNT(*) FROM transactions WHERE user_id = %s", (user_ids[1],)).fetchone()[0]
            check(other_left == 30, "the other test user's data is untouched")
            conn.commit()
        finally:
            print("5. Cleanup")
            cleanup(conn)

        left = conn.execute(
            """SELECT (SELECT COUNT(*) FROM users WHERE persona = %s)
                    + (SELECT COUNT(*) FROM merchants WHERE city = %s)
                    + (SELECT COUNT(*) FROM model_runs WHERE model_version LIKE %s)""",
            (TEST_TAG, TEST_TAG, TEST_TAG + "%")).fetchone()[0]
        check(left == 0, "all test data removed")

    print("\nALL CHECKS PASSED")


if __name__ == "__main__":
    main()
