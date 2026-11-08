# Dataset: Synthetic Card Transactions

Source: [kartik2112/fraud-detection](https://www.kaggle.com/datasets/kartik2112/fraud-detection) on Kaggle.

> **Fraud is used only for the "Was this you?" check.** The dataset was published for fraud detection. We mainly use it as realistic spending data (who buys what, where, when and for how much) for spending groups and recommendations. The fraud label (`is_fraud`) is stored so we can also spot purchases that don't look like the user's. The spending stats never count those purchases. Gender is dropped.

The data is **synthetic**. It was generated with the Sparkov simulator, so all names, addresses and card numbers are fake. It covers about 1,000 US cardholders between 2019-01-01 and 2020-12-31.

## Getting the data

The CSVs are **not in git** because they are too big for GitHub (about 480 MB). Download them with:

```bash
uv sync
uv run python data/transaction.py
```

This copies both CSVs into **`data/raw/`**, which is gitignored. **Never edit them.** Then load them into the database with `uv run tiger-load` (see below).

```python
import pandas as pd
df = pd.concat([
    pd.read_csv("data/raw/transactions_part1.csv", index_col=0),  # index_col=0 drops the unnamed row-number column
    pd.read_csv("data/raw/transactions_part2.csv",  index_col=0),
])
```

| File | Rows | Size | Date range |
|---|---|---|---|
| `transactions_part1.csv` | 1,296,675 | 335 MB | 2019-01-01 → 2020-06-21 |
| `transactions_part2.csv` | 555,719 | 143 MB | 2020-06-21 → 2020-12-31 |

The "train/test" split is only by date and means nothing to us. Treat the two files as one dataset.

## One row = one transaction

Each row is a single card purchase. A **user is identified by `cc_num`**. Every card belongs to exactly one person, and that person's details (name, DOB, address, job) are the same on every row. There are 999 users in total, and a typical user has about 1,500 transactions over the two years (min 6, max 4,392).

### Columns about the user (same on every row for a given `cc_num`)

| Column | Type | Description | Example | We use it for |
|---|---|---|---|---|
| `cc_num` | int | Credit card number | `2291163933867244` | User ID |
| `first` / `last` | str | Name | `Jeff Elliott` | Stored, not used |
| `gender` | str | `M` / `F` | `M` | **Not stored** (fairness) |
| `dob` | date | Date of birth | `1968-03-19` | Age |
| `job` | str | Occupation | `Mechanical engineer` | Stored |
| `street`, `city`, `state`, `zip` | str/int | Home address (US) | `Columbia, SC` | Stored |
| `lat` / `long` | float | Home coordinates | `33.9659`, `-80.9355` | Stored |
| `city_pop` | int | Population of the user's city | `333497` | Stored |

### Columns about the transaction (different on every row)

| Column | Type | Description | Example |
|---|---|---|---|
| `trans_date_trans_time` | datetime str | When the purchase happened. **Use this for dates.** | `2020-06-21 12:14:25` |
| `unix_time` | int | Timestamp that is about 7 years off. Ignore it. | `1371816865` |
| `trans_num` | str | Unique transaction ID | `2da90c7d74bd46a0caf3777415b3ebd3` |
| `amt` | float | Amount in USD, always positive (every row is a purchase) | `2.86` |
| `category` | str | Spending category (14 values, see below) | `personal_care` |
| `merchant` | str | Shop name (693 unique, all fake). Every name has a meaningless `fraud_` prefix from the generator: stripped when loading. | `fraud_Kirlin and Sons` |
| `merch_lat` / `merch_long` | float | Where the purchase happened | `33.986391`, `-81.200714` |
| `is_fraud` | int | 1 = not made by the card owner. Stored as `transactions.is_fraud` (true/false). | `0` |

### Categories

The data has 14 categories. A `_pos` suffix means in person and `_net` means online:

`gas_transport`, `grocery_pos`, `grocery_net`, `home`, `shopping_pos`, `shopping_net`, `kids_pets`, `entertainment`, `personal_care`, `food_dining`, `health_fitness`, `misc_pos`, `misc_net`, `travel`

## In the database

`uv run tiger-load` stores the **908 real users, each with their latest 12 months** (about 928k purchases), in the `transactions` hypertable, with `cc_num` as the user ID. For each purchase we store `cc_num`, the time, the merchant (without the `fraud_` prefix), the category, the amount, where it happened and `is_fraud`. Each user's `dob` and home location go in `users`. 4,075 of those purchases are fraud, spread over 415 users. They're stored with `is_fraud = true` and left out of all the spending stats. 91 cards have only fraud purchases. They're skipped, which is why it's 908 users, not 999. See [docs/DB_DESIGN.md](../docs/DB_DESIGN.md).

## Things worth knowing

- **Only money out.** Every row is a purchase. There is no salary, rent or bills.
- **US data, in USD.** Shop names are fake.
- **Useful features for grouping users:** share of spend per category, average purchase size, purchases per week, weekend vs weekday, online (`_net`) vs in person (`_pos`), and which shops someone visits.
- **No missing values** in either file.
