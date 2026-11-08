"""Unusual transactions: "Was this you?"

    from deez_bugs.fraud.model import get_unusual_model
    get_unusual_model().check(cc_num)      # -> the rows for the dashboard card

How it works (details and evidence in DESIGN.md):
  1. Every purchase gets 7 numbers: price vs your usual and vs people like you (your 20 KNN
     neighbours from ml/model.py), the amount, category, time of day, and bursts of big purchases.
  2. Gradient-boosted trees learn from the 908 reference users which combinations are fraud
     (4,075 labelled purchases), on full years + 1-3 month slices + slices with dates only.
  3. Only big purchases count (3x+ your usual or people like you's, never less than they pay).
     One goes on the card if it scores >= 0.95 on its own, if 3+ such purchases score >= 0.2
     within 48 h (one "burst" row), or if it was in person far from all your usual places
     (> 50 km, and > 3x your own usual spread).
"""

import math
import threading
import warnings

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

from deez_bugs.db import CATEGORIES
from deez_bugs.db.places import km_between, usual_centres
from deez_bugs.fraud.features import (MODEL_FEATURES, load_avg_purchase, load_reference_purchases,
                                      load_user_purchases, purchase_features)
from deez_bugs.ml.model import LABELS, N_NEIGHBOURS, SpendingModel, get_model

SEED = 42
SLICE_DAYS = (30, 60, 90)       # uploads are short: also train on 1, 2 and 3-month slices
MIN_PURCHASES = 20              # fewer than this: too little to know what's "usual"
SINGLE, FLAG, BURST = 0.95, 0.2, 3
BIG = 3                         # only purchases 3x+ your usual (or people like you's) can be flagged
BURST_GAP = pd.Timedelta("48h")
FAR_KM, MIN_LOCATED = 50, 10
NIGHT = {22, 23, 0, 1, 2, 3}


def _slices(d: pd.DataFrame, days: int, rng: np.random.Generator) -> pd.DataFrame:
    """One `days`-long window per person: around their fraud if they have any, otherwise anywhere."""
    out = []
    for _, g in d.groupby("cc_num"):
        if g.is_fraud.any():
            start = g.ts[g.is_fraud].min() - pd.Timedelta(days=float(rng.uniform(0, days * 0.8)))
        else:
            start = g.ts.min() + (g.ts.max() - g.ts.min() - pd.Timedelta(days=days)) * rng.uniform()
        out.append(g[(g.ts >= start) & (g.ts < start + pd.Timedelta(days=days))])
    return pd.concat(out)


def dates_only(d: pd.DataFrame) -> pd.DataFrame:
    """The same statement as if the bank only gave dates (every time 00:00)."""
    return d.assign(ts=d.ts.dt.floor("D"))


def _times(x: float) -> str:
    return f"{x:.0f}×" if x >= 10 else f"{x:.1f}×"


def _span(hours: float) -> str:
    if hours < 1:
        return "under an hour"
    if hours < 24:
        return f"{math.ceil(hours)} hour{'s' if math.ceil(hours) > 1 else ''}"
    return f"{math.ceil(hours / 24)} days"


class UnusualModel:
    def fit(self, spending: SpendingModel, purchases: pd.DataFrame, avg_purchase: pd.DataFrame) -> "UnusualModel":
        """purchases: cc_num, ts, category, amount, is_fraud for the reference users (training)."""
        self.spending = spending
        # Each reference user's average purchase per category, lined up with the KNN's rows.
        self.avg = avg_purchase.reindex(spending.shares.index)[CATEGORIES].to_numpy()
        rng = np.random.default_rng(SEED)
        parts = [purchases] + [_slices(purchases, n, rng) for n in SLICE_DAYS]
        X, y = [], []
        for i, part in enumerate(parts):
            part = part.sort_values(["cc_num", "ts"]).reset_index(drop=True)
            part["key"] = pd.factorize(part.cc_num)[0] + i * 100_000          # one key per statement
            like = self.like_you_avg(part)
            versions = [part] if i == 0 else [part, dates_only(part)]        # slices also without times
            for v in versions:
                X.append(purchase_features(v, like, no_time=v is not part)[MODEL_FEATURES])
                y.append(v.is_fraud.to_numpy(dtype=bool))
        self.clf = HistGradientBoostingClassifier(
            max_iter=300, categorical_features=[MODEL_FEATURES.index("category")], random_state=SEED,
        ).fit(pd.concat(X, ignore_index=True), np.concatenate(y))
        return self

    def like_you_avg(self, d: pd.DataFrame) -> np.ndarray:
        """Per purchase: what this person's 20 most similar reference users usually pay in that category."""
        sp = self.spending
        spend = d.pivot_table(index="key", columns="category", values="amount", aggfunc="sum", fill_value=0)
        shares = spend.reindex(columns=CATEGORIES, fill_value=0)
        shares = shares.div(shares.sum(axis=1), axis=0)
        person = d.groupby("key").cc_num.first().reindex(shares.index).to_numpy()
        _, idx = sp.knn.kneighbors(sp.scaler.transform(shares), n_neighbors=N_NEIGHBOURS + 1)
        ids = sp.shares.index.to_numpy()
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)                   # a category none of them use
            table = np.array([np.nanmedian(self.avg[[p for p in row if ids[p] != me][:N_NEIGHBOURS]], axis=0)
                              for me, row in zip(person, idx)])
        return table[shares.index.get_indexer(d.key), [CATEGORIES.index(c) for c in d.category]]

    def select(self, d: pd.DataFrame, pending: pd.Series, home=(None, None)):
        """Which purchases go on the card, as rows (lists of d's index). d: one statement sorted by ts."""
        has_times = bool((d.ts.dt.hour * 3600 + d.ts.dt.minute * 60 + d.ts.dt.second).any())
        f = purchase_features(d, self.like_you_avg(d), no_time=not has_times)
        d = d.assign(score=self.clf.predict_proba(f[MODEL_FEATURES])[:, 1], km=self._km_from_usual(d, home))
        # A long statement with dates only is harder (DESIGN.md section 4), so the bar is higher.
        long_dates_only = not has_times and (d.ts.max() - d.ts.min()).days > 90
        single, burst = (0.98, 4) if long_dates_only else (SINGLE, BURST)

        # Small purchases are never flagged: the dataset's fraud starts with tiny "test" purchases,
        # so the model learned to distrust e.g. a £2 bus fare. On the card, only big-for-you counts.
        # Big = 3x your usual or people like you's, and never less than people like you pay.
        big = ((f.x_usual_cat >= BIG) | (f.x_like_you >= BIG)) & (f.x_like_you >= 1)
        rows, in_burst = [], set()
        flagged = d[pending & big & (d.score >= FLAG)]
        for _, g in flagged.groupby((flagged.ts.diff() > BURST_GAP).cumsum()):
            if len(g) >= burst:
                rows.append(list(g.index))
                in_burst.update(g.index)
        # Far = more than 50 km AND 3x further than this person's own usual spread (some people
        # shop over a whole region). Online shops have no real place.
        far = (d.km > self._far_limit(d.km)) & ~d.category.str.endswith("_net")
        lone = pending & ~d.index.isin(list(in_burst)) & ((big & (d.score >= single)) | far)
        rows += [[i] for i in d.index[lone]]
        return rows, d.join(f[["x_usual_cat", "x_like_you", "time_share", "cat_share"]]).assign(far=far), has_times

    @staticmethod
    def _far_limit(km: pd.Series) -> float:
        return FAR_KM if km.isna().all() else max(FAR_KM, 3 * float(np.nanpercentile(km, 90)))

    @staticmethod
    def _km_from_usual(d: pd.DataFrame, home) -> np.ndarray:
        """Distance from each purchase to the nearest place this person usually goes (or home)."""
        located = d[(d.is_fraud != True) & d.lat.notna() & d.long.notna()]   # noqa: E712 (None = not answered)
        if len(located) < MIN_LOCATED:
            return np.full(len(d), np.nan)
        centres = usual_centres(located)
        if home[0] is not None and home[1] is not None:
            centres = np.vstack([centres, [home]])
        if not len(centres):
            return np.full(len(d), np.nan)
        km = km_between(d.lat.to_numpy(float)[:, None], d.long.to_numpy(float)[:, None],
                        centres[None, :, 0], centres[None, :, 1])
        return km.min(axis=1)

    def check(self, cc_num: int) -> dict:
        """The dashboard card for one user. Raises KeyError if the user doesn't exist."""
        d, user = load_user_purchases(cc_num)
        if user is None:
            raise KeyError(cc_num)
        out = {"cc_num": cc_num, "checked": len(d), "too_few": len(d) < MIN_PURCHASES, "rows": []}
        if out["too_few"]:
            return out
        # Answered purchases are never asked about again. (Reference users' labels aren't answers.)
        pending = d.is_fraud.isna() if user["source"] == "upload" else pd.Series(True, index=d.index)
        rows, d, has_times = self.select(d, pending, user["home"])
        d["shop_visits"] = d.groupby("merchant").merchant.transform("size")
        out["rows"] = sorted((self._row(d.loc[idx], has_times) for idx in rows), key=lambda r: -r["top_score"])
        return out

    @staticmethod
    def _row(g: pd.DataFrame, has_times: bool) -> dict:
        """One row of the card, with its 2-3 strongest "why we're asking" reasons."""
        burst = len(g) > 1
        first = g.iloc[0]
        upto = "up to " if burst else ""
        reasons = []
        if burst:
            reasons.append(("burst", f"{len(g)} unusual purchases in {_span((g.ts.max() - g.ts.min()).total_seconds() / 3600)}"))
        if g.far.any():
            reasons.append(("place", f"{g.km.max():,.0f} km from your usual places"))
        if g.x_usual_cat.max() >= 3:
            reasons.append(("x_usual", f"{upto}{_times(g.x_usual_cat.max())} your usual"
                                       + ("" if burst else f" for {LABELS[first.category]}")))
        if g.x_like_you.max() >= 3:
            reasons.append(("like_you", f"{upto}{_times(g.x_like_you.max())} what people like you spend"))
        if has_times and g.ts.dt.hour.isin(NIGHT).any():
            reasons.append(("night", "Late night" if burst else f"Late night ({first.ts:%H:%M})"))
        elif has_times and not burst and first.time_share < 0.05:
            reasons.append(("rare_time", "You rarely shop at this time"))
        if not burst and first.cat_share < 0.02:
            reasons.append(("rare_category", f"You rarely buy {LABELS[first.category]}"))
        if not burst and first.shop_visits == 1:
            reasons.append(("new_shop", "First time at this shop"))
        if not reasons:
            reasons.append(("pattern", "Doesn't match your usual pattern"))
        return {
            "kind": "burst" if burst else "single",
            "start": g.ts.min().isoformat(),
            "end": g.ts.max().isoformat(),
            "total": round(float(g.amount.sum()), 2),
            "top_score": round(float(g.score.max()), 3),
            "purchases": [{"ts": r.ts.isoformat(), "merchant": r.merchant, "category": r.category,
                           "amount": round(float(r.amount), 2), "score": round(float(r.score), 3)}
                          for r in g.itertuples()],
            "reasons": [{"kind": k, "text": t} for k, t in reasons[:3]],
        }


_model: UnusualModel | None = None
_model_lock = threading.Lock()


def get_unusual_model() -> UnusualModel:
    """Train once on the reference users, then reuse (~20 s the first time; the API does it at startup)."""
    global _model
    with _model_lock:
        if _model is None:
            _model = UnusualModel().fit(get_model(), load_reference_purchases(), load_avg_purchase())
        return _model
