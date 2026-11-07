import io
import unittest

import pandas as pd

from deez_bugs.data_processing import (
    analyse_uploaded_transactions,
    build_user_features,
    normalize_transactions,
    process_csv,
    train_spending_profile_model,
)


CSV = """date,description,amount,user_id
2026-01-01,Local Grocery,40.00,user-1
2026-01-02,Local Cafe,8.00,user-1
2026-01-03,Local Grocery,25.00,user-1
2026-01-01,Other Grocery,35.00,user-2
2026-01-02,Other Cafe,7.00,user-2
"""


class DataProcessingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.frame = normalize_transactions(
            pd.read_csv(io.StringIO(CSV))
        )

    def test_normalizes_common_bank_columns(self) -> None:
        self.assertEqual(
            set(["trans_date_trans_time", "merchant", "amt", "cc_num"])
            <= set(self.frame.columns),
            True,
        )

    def test_features_have_one_row_per_user(self) -> None:
        features = build_user_features(self.frame)
        self.assertEqual(list(features.index), ["user-1", "user-2"])
        self.assertEqual(features.loc["user-1", "transaction_count"], 3)

    def test_processing_returns_insights(self) -> None:
        result = process_csv(CSV.encode())
        self.assertEqual(result["transaction_count"], 5)
        self.assertEqual(result["user_count"], 2)
        self.assertEqual(result["total_spend"], 115.0)

    def test_model_segments_and_recommends(self) -> None:
        model = train_spending_profile_model(
            self.frame,
            n_clusters=2,
        )
        result = analyse_uploaded_transactions(model, self.frame)
        self.assertEqual(result["status"], "scored")
        self.assertEqual(len(result["users"]), 2)
        self.assertIn("similar_users", result["users"][0])


if __name__ == "__main__":
    unittest.main()
