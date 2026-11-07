"""Turn the database into one row of numbers per user.

The main feature is the **% of spending in each of the 14 categories** (the "share").
Each user's row adds up to 1.0, so a big spender and a small spender with the same
habits look the same: we group people by WHAT they buy, not how much.
"""

import pandas as pd

from deez_bugs.db import CATEGORIES, connect


def load_spend(source: str | None = "reference", cc_num: int | None = None) -> pd.DataFrame:
    """Total spend per user per category (from the daily_category_spend aggregate).

    Returns a table: one row per cc_num, one column per category, plus
    `months` (how many months of data that user has).
    Pass source="reference" for the 908 comparison users, or cc_num=... for one user.
    """
    if cc_num is not None:
        where, params = "WHERE d.cc_num = %s", (cc_num,)
    elif source:
        where, params = "WHERE u.source = %s", (source,)
    else:
        where, params = "", ()
    with connect() as conn:
        rows = conn.execute(
            f"""SELECT d.cc_num, d.category, SUM(d.spend)::float AS spend,
                       MIN(d.day) AS first_day, MAX(d.day) AS last_day
                FROM daily_category_spend d JOIN users u USING (cc_num)
                {where}
                GROUP BY d.cc_num, d.category""",
            params,
        ).fetchall()
    df = pd.DataFrame(rows, columns=["cc_num", "category", "spend", "first_day", "last_day"])
    if df.empty:
        return pd.DataFrame(columns=CATEGORIES + ["months"])
    spend = df.pivot_table(index="cc_num", columns="category", values="spend", fill_value=0.0)
    spend = spend.reindex(columns=CATEGORIES, fill_value=0.0)
    days = df.groupby("cc_num").agg(first=("first_day", "min"), last=("last_day", "max"))
    spend["months"] = ((days["last"] - days["first"]).dt.days.clip(lower=30) / 30.44)
    return spend


def to_shares(spend: pd.DataFrame) -> pd.DataFrame:
    """Spend per category -> % of that user's total (each row sums to 1)."""
    cats = spend[CATEGORIES]
    return cats.div(cats.sum(axis=1), axis=0).fillna(0.0)


def monthly_spend(spend: pd.DataFrame) -> pd.Series:
    """Average spend per month per user."""
    return spend[CATEGORIES].sum(axis=1) / spend["months"]
