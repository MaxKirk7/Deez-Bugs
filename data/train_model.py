"""Train the Kaggle-derived segmentation and recommendation model.

Usage:
    uv run python data/train_model.py /path/to/fraudTrain.csv
"""

import argparse
from pathlib import Path

from deez_bugs.data_processing import (
    load_or_train_spending_profile_model,
    save_spending_profile_model,
    train_spending_profile_model,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("train_csv", type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/spending_profile_model.pkl"),
    )
    parser.add_argument("--clusters", type=int, default=8)
    parser.add_argument(
        "--force",
        action="store_true",
        help="retrain even when the output model already exists",
    )
    args = parser.parse_args()

    if args.output.exists() and not args.force:
        print(f"Loading existing model from {args.output}")
        load_or_train_spending_profile_model(
            args.train_csv,
            args.output,
            n_clusters=args.clusters,
        )
    else:
        model = train_spending_profile_model(
            args.train_csv,
            n_clusters=args.clusters,
        )
        save_spending_profile_model(model, args.output)
        print(f"Saved model to {args.output}")


if __name__ == "__main__":
    main()
