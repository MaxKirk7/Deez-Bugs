"""Check the numbers in DESIGN.md (section 4) on users the model never saw.

    uv run python -m deez_bugs.fraud.evaluate        (~1 minute)

Trains on 75% of the reference users, then runs the REAL card rules (model.select) on the
other 25%: as 1-month, 2-month and 12-month statements, with times and with dates only.
"Real fraud" uses the dataset's labels. (The place rule can't be tested: shops are randomly placed.)
"""

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

from deez_bugs.fraud.features import load_avg_purchase, load_reference_purchases
from deez_bugs.fraud.model import MIN_PURCHASES, UnusualModel, _slices, dates_only
from deez_bugs.ml.model import get_model


def main() -> None:
    purchases = load_reference_purchases()
    tr, te = next(GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42)
                  .split(purchases, groups=purchases.cc_num))
    train, test = purchases.iloc[tr], purchases.iloc[te]
    print(f"Training on {train.cc_num.nunique()} users. Testing on {test.cc_num.nunique()} users it never saw "
          f"({test.groupby('cc_num').is_fraud.any().sum()} of them with fraud).\n")
    model = UnusualModel().fit(get_model(), train, load_avg_purchase())

    rng = np.random.default_rng(1)
    print(f"{'Statement':26s}{'On the card: real fraud':>25s}{'Fraud users caught':>21s}{'Genuine users shown something':>32s}")
    for days in (30, 60, 365):
        statements = test if days == 365 else _slices(test, days, rng)
        for no_time in (False, True):
            real, caught, fraud_users, alarms, genuine_users = [], 0, 0, 0, 0
            for cc, d in statements.groupby("cc_num"):
                d = (dates_only(d) if no_time else d).sort_values("ts").reset_index(drop=True)
                d = d.assign(key=cc, merchant="", lat=np.nan, long=np.nan)
                shown = d.iloc[0:0]
                if len(d) >= MIN_PURCHASES:                       # same as check(): too few = not checked
                    rows, _, _ = model.select(d, pd.Series(True, index=d.index))
                    shown = d.loc[[i for row in rows for i in row]]
                real += list(shown.is_fraud)
                if d.is_fraud.any():
                    fraud_users += 1
                    caught += bool(shown.is_fraud.any())
                else:
                    genuine_users += 1
                    alarms += len(shown) > 0
            name = f"{'12 months' if days == 365 else f'{days // 30} month' + ('s' if days > 30 else '')}, {'dates only' if no_time else 'with times'}"
            print(f"{name:26s}{np.mean(real):>25.0%}{caught / fraud_users:>21.0%}{alarms / genuine_users:>32.0%}")


if __name__ == "__main__":
    main()
