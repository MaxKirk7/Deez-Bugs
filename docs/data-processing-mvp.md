# Data Processing MVP

## What has been implemented

The project now processes uploaded CSV files in memory. Uploaded data is not
written to the database or persisted as a CSV.

### CSV processing

The upload endpoint is implemented in
[`src/deez_bugs/api/api.py`](../src/deez_bugs/api/api.py).

It:

1. Accepts a `.csv` upload through `POST /upload-csv/`.
2. Validates the required Kaggle-compatible columns:

   ```text
   merchant
   category
   amt
   trans_date_trans_time
   cc_num
   ```

3. Parses dates and amounts.
4. Maps Kaggle categories to application categories.
5. Keeps the original transaction data.
6. Adds derived time and location fields where available.
7. Returns the results as JSON.

### Spending insights

[`src/deez_bugs/data_processing/processing.py`](../src/deez_bugs/data_processing/processing.py)
currently returns:

- Total spending
- Transaction count
- User count
- Average transaction amount
- Largest transaction
- Spending totals by category
- Spending totals by month
- Spending totals by hour
- Unique transaction locations
- Enriched transaction records
- Candidate model-input rows

### User-level feature engineering

[`src/deez_bugs/data_processing/features.py`](../src/deez_bugs/data_processing/features.py)
converts transaction rows into one feature row per customer, identified by
`cc_num`.

The features include:

- Transaction count
- Total, average, median, standard deviation, and maximum spend
- Number of active days
- Weekend spending share
- Night-time spending share
- Average transaction hour
- Range of transaction hours
- Average and maximum distance from home to merchant
- User age
- City population
- Spending share for each Kaggle category

The feature builder is shared by training and upload inference so both paths
produce the same feature structure.

### Customer segmentation and recommendations

[`src/deez_bugs/data_processing/model.py`](../src/deez_bugs/data_processing/model.py)
now trains and stores:

- A `StandardScaler`
- A K-Means customer segmentation model
- The reference customer feature matrix
- Customer segment labels
- Category distributions
- User-to-merchant indexes
- Segment sizes

For an uploaded CSV, the model:

1. Creates user-level features.
2. Assigns each user to a K-Means segment.
3. Calculates cosine similarity against Kaggle reference customers.
4. Finds merchants used by similar customers.
5. Removes merchants already used by the uploaded user.
6. Returns ranked merchant recommendations.

The Kaggle `is_fraud` column is not used.

## Training the model

Download the Kaggle dataset if necessary:

```bash
uv run python data/transaction.py
```

Train the persisted model:

```bash
uv run python data/train_model.py \
  ~/.cache/kagglehub/datasets/kartik2112/fraud-detection/versions/1/fraudTrain.csv \
  --clusters 8 \
  --force
```

The saved model is:

```text
data/spending_profile_model.pkl
```

The API loads this file when it starts. If the file is absent, the API still
processes CSVs and returns spending insights, but it cannot return segments or
recommendations.

The `--force` option is needed when the training data, feature definitions, or
cluster count changes.

## Running and testing the API

Start the API from the repository root:

```bash
uv run uvicorn deez_bugs.api.api:app --reload
```

Open the Swagger interface:

```text
http://127.0.0.1:8000/docs
```

Use `POST /upload-csv/` and upload
[`data/fake_transactions.csv`](../data/fake_transactions.csv).

The response contains:

```json
{
  "filename": "fake_transactions.csv",
  "analysis": {
    "transaction_count": 8,
    "by_category": [],
    "model": {
      "status": "scored",
      "users": []
    }
  }
}
```

The exact category, segment, similarity, and recommendation values depend on
the trained model and reference dataset.

## Current limitations

### Dataset format

The parser accepts the Kaggle fraud-detection schema and normalizes common bank
statement aliases such as `date`, `description`, `amount`, `debit`, and
`user_id`. Statements without a customer ID are treated as one upload-local
user. More account-specific debit/credit handling may still be needed for
providers that export separate credit and debit columns.

### Merchant recommendations

The Kaggle merchant names are synthetic and usually have a `fraud_` prefix.
The recommendation pipeline demonstrates the collaborative-filtering flow, but
the merchants are not suitable real-world alternatives. A production version
needs a merchant catalogue with real names, categories, locations, and prices.

### Similarity quality

The current similarity uses the complete scaled user feature vector. It does
not yet apply business weighting, category-specific similarity, recency
weighting, or minimum-data thresholds.

### Financial quality score

There is no labelled financial-health target in the Kaggle dataset. The current
pipeline should therefore be described as customer segmentation and merchant
recommendation, not as an objectively validated financial-health assessment.

### Dashboard

No React dashboard has been implemented yet. The API response now contains the
main data needed for charts and recommendation cards. This remains the main
frontend deliverable.

## Next steps

### 1. Stabilise the model training workflow

- Add a validation split or cross-validation strategy for segment quality.
- Select the number of clusters using silhouette score and domain review.
- Store model metadata: training date, source file, feature version, and
  cluster count.
- Add tests for saving, loading, and incompatible model files.

### 2. Improve recommendation quality

- Build a real merchant catalogue.
- Normalise merchant names.
- Recommend within the same category.
- Add minimum support thresholds so one-off merchants are not recommended.
- Rank recommendations using similarity, number of supporting users, category
  match, and price/value data.

### 3. Support normal bank CSVs

- Add configurable column aliases for dates, descriptions, debits, and
  credits.
- Infer or request the transaction sign convention.
- Make `cc_num` optional and assign an upload-local customer ID when absent.
- Preserve the original description for merchant matching.

### 4. Add API response models

- Define Pydantic response models for insights, segments, similar customers,
  and recommendations.
- Return stable field names and types for frontend use.
- Add explicit API error responses for malformed data and unavailable models.

### 5. Build the dashboard

The React frontend is still the remaining major deliverable. Create it with:

- Category spending chart
- Monthly spending chart
- Hour-of-day chart
- Customer segment card
- Similar-customer summary
- Merchant recommendation cards
- Transaction/location view

### 6. Add tests

The initial backend test suite now covers:

- Common bank-column normalization
- One feature row per user
- Spending insight totals
- Segment and recommendation response structure

Additional API and model persistence tests should still be added:

- Valid CSV uploads
- Missing required columns
- Invalid dates and amounts
- Category mapping
- Feature columns and missing optional fields
- K-Means assignment
- Cosine similarity ordering
- Excluding already-used merchants
- Model save/load
- API response shape

## Current MVP position

The project has the core data-processing and machine-learning backend
foundation. CSV upload, spending analysis, feature engineering, segmentation,
similar-customer matching, and basic collaborative recommendations are now
represented in code. The largest remaining product work is recommendation
quality, generic bank CSV support, API contracts, automated tests, and the
frontend dashboard.
