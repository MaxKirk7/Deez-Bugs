# Dataset: Credit Card Transactions (Fraud Detection)

Source: [kartik2112/fraud-detection](https://www.kaggle.com/datasets/kartik2112/fraud-detection) on Kaggle.

The data is **synthetic**. It was generated with the Sparkov simulator, so all names, addresses and card numbers are fake. It covers US cardholders between 2019-01-01 and 2020-12-31.

## Getting the data

The CSVs are **not in git** because they are too big for GitHub (the train file alone is 335 MB). Download them with:

```bash
uv sync
uv run python data/transaction.py
```

The files go to Kaggle's cache, not to this repo:
`~/.cache/kagglehub/datasets/kartik2112/fraud-detection/versions/1/`

```python
import kagglehub, pandas as pd
path = kagglehub.dataset_download("kartik2112/fraud-detection")
train = pd.read_csv(f"{path}/fraudTrain.csv", index_col=0)  # index_col=0 drops the unnamed row-number column
test  = pd.read_csv(f"{path}/fraudTest.csv",  index_col=0)
```

## Training the spending profile model

The feature pipeline creates one row per `cc_num`, using only fields that can
also be derived from an uploaded statement. Train the unsupervised spending
profile model with:
with:

```bash
uv run python data/train_model.py /path/to/fraudTrain.csv
```

The model uses transaction counts and amounts, category shares, time-of-day
and weekend behaviour, distance from home to merchant, user age, and city
population. It does not use `is_fraud`. It stores user feature vectors,
K-Means segment labels, and user-to-merchant indexes so uploaded users can be
matched with similar customers and given merchant recommendations.

To retrain after changing the training data or cluster count:

```bash
uv run python data/train_model.py /path/to/fraudTrain.csv --clusters 8 --force
```

| File | Rows | Size | Date range | Fraud rows | Fraud rate |
|---|---|---|---|---|---|
| `fraudTrain.csv` | 1,296,675 | 335 MB | 2019-01-01 → 2020-06-21 | 7,506 | 0.58% |
| `fraudTest.csv` | 555,719 | 143 MB | 2020-06-21 → 2020-12-31 | 2,145 | 0.39% |

The split is by **time**: the test set starts where the train set ends.

## One row = one transaction

Each row is a single card transaction. A **user is identified by `cc_num`**. Every card belongs to exactly one person, and that person's details (name, DOB, address, job) are the same on every row. There are 999 users in total, and 908 of them appear in both files. A typical user has about 1,500 transactions (min 6, max 4,392).

### Columns about the user (same on every row for a given `cc_num`)

| Column | Type | Description | Example |
|---|---|---|---|
| `cc_num` | int | Credit card number. **Use as the user ID.** | `2291163933867244` |
| `first` | str | First name | `Jeff` |
| `last` | str | Last name | `Elliott` |
| `gender` | str | `M` / `F` | `M` |
| `dob` | date | Date of birth. Use it to work out age at the time of the transaction. | `1968-03-19` |
| `job` | str | Occupation | `Mechanical engineer` |
| `street` | str | Home street address | `351 Darlene Green` |
| `city` | str | Home city | `Columbia` |
| `state` | str | US state code | `SC` |
| `zip` | int | ZIP code | `29209` |
| `lat` / `long` | float | Coordinates of the user's home | `33.9659`, `-80.9355` |
| `city_pop` | int | Population of the user's city | `333497` |

### Columns about the transaction (different on every row)

| Column | Type | Description | Example |
|---|---|---|---|
| `trans_date_trans_time` | datetime str | When the transaction happened | `2020-06-21 12:14:25` |
| `unix_time` | int | Timestamp in seconds. **Note:** it is offset from `trans_date_trans_time` (it ends in 2013), so use the datetime column for real dates. It is still fine for ordering transactions and measuring time gaps. | `1371816865` |
| `trans_num` | str | Unique transaction ID | `2da90c7d74bd46a0caf3777415b3ebd3` |
| `amt` | float | Amount in USD | `2.86` |
| `category` | str | Merchant category (14 values, see below) | `personal_care` |
| `merchant` | str | Merchant name (693 unique). **Every merchant name starts with `fraud_`.** This prefix is a quirk of the generator and does *not* mean the merchant is fraudulent. | `fraud_Kirlin and Sons` |
| `merch_lat` / `merch_long` | float | Where the transaction happened | `33.986391`, `-81.200714` |
| `is_fraud` | int | **Target label.** 1 = fraud, 0 = legitimate. | `0` |

## Things worth knowing

- **Heavy class imbalance.** About 0.5% of rows are fraud. Accuracy is a misleading metric here: a model that always predicts "not fraud" scores 99.5%. Use precision, recall, F1 or PR-AUC, and consider class weights or resampling.
- **Fraud transactions are larger.** Fraud amounts have a mean of about $531 and a median of $390, capped at about $1,376. Legitimate amounts have a mean of about $68 and a median of $47.
- **Fraud rate by category** (highest first): `shopping_net` 1.6%, `misc_net` 1.3%, `grocery_pos` 1.3%, `shopping_pos` 0.6%, `gas_transport` 0.4%, and 0.3% or less for everything else (`misc_pos`, `grocery_net`, `travel`, `personal_care`, `entertainment`, `kids_pets`, `food_dining`, `home`, `health_fitness`). `_net` means online and `_pos` means in person.
- **Useful features to derive:** user age (`trans_date_trans_time - dob`), hour of day and day of week, distance between home and merchant (`lat/long` vs `merch_lat/merch_long`), and per-user behaviour such as time since the last transaction, number of transactions in the last hour or day, and how far `amt` is from that user's usual spend.
- **No missing values** in either file.
- **Don't treat the Unnamed: 0 column as a feature.** It is just a row index, which `index_col=0` drops.
