"""The numbers the "Unusual transactions" check looks at, for every purchase.

Everything is measured against the person's OWN statement (or their KNN neighbours),
so a reference user and an uploaded statement are treated exactly the same.
See DESIGN.md, section 3.
"""

import io

import numpy as np
import pandas as pd

from deez_bugs.db import CATEGORIES, connect

# What the model uses to decide (the rest only explains a row).
MODEL_FEATURES = ["amount", "category", "hour", "x_usual_cat", "busy_vs_usual", "big_nearby", "x_like_you"]
DAY = np.timedelta64(24, "h")


def load_reference_purchases() -> pd.DataFrame:
    """Every reference purchase with its fraud label, for training (~8 s from Tiger)."""
    with connect() as conn, conn.cursor().copy(
        """COPY (SELECT t.cc_num, ts, category, amount, is_fraud FROM transactions t JOIN users u USING (cc_num)
                 WHERE u.source = 'reference' ORDER BY t.cc_num, ts) TO STDOUT WITH (FORMAT csv)""") as copy:
        data = b"".join(bytes(chunk) for chunk in copy)
    df = pd.read_csv(io.BytesIO(data), names=["cc_num", "ts", "category", "amount", "is_fraud"])
    return df.assign(ts=pd.to_datetime(df.ts, utc=True), is_fraud=df.is_fraud == "t")


def load_avg_purchase() -> pd.DataFrame:
    """Each reference user's average purchase per category (cc_num x 14 categories), from the aggregate."""
    with connect() as conn:
        rows = conn.execute(
            """SELECT d.cc_num, d.category, SUM(d.spend)::float8 / SUM(d.txn_count)
               FROM daily_category_spend d JOIN users u USING (cc_num)
               WHERE u.source = 'reference' GROUP BY 1, 2""").fetchall()
    df = pd.DataFrame(rows, columns=["cc_num", "category", "avg"])
    return df.pivot(index="cc_num", columns="category", values="avg").reindex(columns=CATEGORIES)


def load_user_purchases(cc_num: int) -> tuple[pd.DataFrame, dict | None]:
    """One user's purchases (with locations) and their users row. (empty, None) if unknown."""
    with connect() as conn:
        user = conn.execute("SELECT source, lat, long FROM users WHERE cc_num = %s", (cc_num,)).fetchone()
        rows = conn.execute(
            """SELECT ts, merchant, category, amount::float8, merch_lat, merch_long, is_fraud
               FROM transactions WHERE cc_num = %s ORDER BY ts""", (cc_num,)).fetchall()
    df = pd.DataFrame(rows, columns=["ts", "merchant", "category", "amount", "lat", "long", "is_fraud"])
    df["ts"] = pd.to_datetime(df.ts, utc=True)
    df[["lat", "long"]] = df[["lat", "long"]].astype(float)
    info = None if user is None else {"source": user[0], "home": (user[1], user[2])}
    return df.assign(cc_num=cc_num, key=cc_num), info


def _within_a_day(d: pd.DataFrame, mask: np.ndarray | None = None) -> np.ndarray:
    """Per purchase: how many of that statement's purchases (only `mask` ones, if given) are within ±24 h."""
    out = np.zeros(len(d))
    for _, idx in d.groupby("key").indices.items():
        t = d.ts.values[idx]
        tm = t if mask is None else t[mask[idx]]
        out[idx] = np.searchsorted(tm, t + DAY, "right") - np.searchsorted(tm, t - DAY, "left")
    return out


def purchase_features(d: pd.DataFrame, like_you_avg: np.ndarray, no_time: bool = False) -> pd.DataFrame:
    """d: purchases sorted by (key, ts); `key` = one statement. like_you_avg: per purchase, what people
    like this person usually pay in that category. no_time: the statement only has dates."""
    g = d.groupby("key")
    by_cat = d.groupby(["key", "category"])
    f = pd.DataFrame(index=d.index)
    f["amount"] = d.amount
    f["category"] = d.category.map({c: i for i, c in enumerate(CATEGORIES)})
    f["hour"] = np.nan if no_time else d.ts.dt.hour
    f["x_usual_cat"] = d.amount / by_cat.amount.transform("median")           # vs your usual in this category
    per_day = g.ts.transform("size") / (g.ts.transform("max") - g.ts.transform("min")).dt.days.clip(lower=1)
    f["busy_vs_usual"] = _within_a_day(d) / (2 * per_day)                     # purchases in ±24 h vs a normal 2 days
    f["big_nearby"] = _within_a_day(d, (f.x_usual_cat > 3).to_numpy())        # big-for-you purchases in ±24 h
    f["x_like_you"] = d.amount / like_you_avg                                 # vs people like you (KNN)
    # Chip-only numbers (explain a row; the model doesn't use them).
    band = d.ts.dt.hour // 3
    f["time_share"] = band.groupby([d.key, band]).transform("size") / g.ts.transform("size")
    f["cat_share"] = by_cat.ts.transform("size") / g.ts.transform("size")
    return f
