# How the "people like you" ML works

Code: `src/deez_bugs/ml/` · Train and test: `uv run python -m deez_bugs.ml.train` · API: `GET /users/{cc_num}/insights`

---

## The idea in one line

Describe every user by **what % of their money goes to each category**. Group similar users (**k-means**), find each user's **20 most similar users (KNN)**, and give advice from what those similar users do differently (**collaborative filtering**).

---

## Step by step

### 1. Turn each user into 14 numbers (`features.py`)
- For each user, add up their spending per category from Tiger's `daily_category_spend` aggregate (about 2 seconds for all 908 users).
- Divide by their total, so each user becomes **14 percentages that add up to 100%**, e.g. groceries 20%, travel 5%, ...
- **Why percentages, not amounts:** someone spending 2,000/month and someone spending 8,000/month with the same habits should count as similar. We group by **what** people buy, not how much.

### 2. Put the categories on the same scale
- Groceries is usually 15–20% of spending, but online groceries only 1–3%. Without rescaling, only the big categories would matter.
- `StandardScaler` rescales each category so a "big difference" means the same in every category.

### 3. K-means: split the 908 users into 6 groups (`model.py`)
- K-means finds 6 "centre points" and puts each user in the group whose centre is closest to their 14 numbers.
- Each group gets a name from the 2 categories it spends **more than most people** on.

| Group | Users | Typical month | What stands out |
|---|---|---|---|
| More than most on **Travel** & Shopping (in store) | 107 | 5,838 | Travel is 20% of spending |
| More than most on **Groceries (online) & Shopping (online)** | 120 | 8,245 | Biggest spenders, lots of shopping |
| More than most on **Eating out & Kids & pets** | 181 | 3,912 | Family spending |
| More than most on **Groceries (online) & Health & fitness** | 146 | 5,581 | Spread across fuel, groceries, home |
| More than most on **Fuel & transport** & Other (online) | 329 | 5,360 | The "typical" group: groceries + fuel |
| More than most on **Other (online & in store)** | 25 | 6,847 | Small group of unusual spenders |

(Amounts are in the dataset's currency, USD.)

### 4. KNN: find each user's 20 most similar users
- For any user, reference or uploaded, find the 20 reference users whose 14 numbers are closest.
- The user is never matched with themselves. Each neighbour gets a `similarity` (1 = identical).

### 5. Collaborative filtering: advice from similar users
- Average the 20 neighbours' percentages: that's **"what people like you do"**.
- Compare category by category. If you spend **at least 3 percentage points more** than your neighbours, that becomes a recommendation, e.g.:
  > *"You spend 58% of your money on Travel; your 20 most similar users spend 28%. Matching them would free up about 1,177 a month."*
- **Estimated saving** = your monthly spend × the gap. If you're 10 points above on travel and spend 3,000/month, that's about 300.
- Up to 3 recommendations, biggest gap first.

### 6. The score (0–999, like a UK credit score)
- **Score = how much of your spending mix matches people like you.** 999 = identical to your neighbours.
- Calculated as 999 × (1 − the share of your money you spend *above* your neighbours).
- Across the 908 users (on the old 0–100 scale): median **94**, lowest **70**, highest **98**, i.e. about **939**, **699** and **979** out of 999.

### 7. A new upload works the same way
- An uploaded CSV becomes a new user in `transactions`, and the same 14 numbers are calculated for it.
- It's placed in the nearest group and matched with 20 reference users. **Nothing is retrained.**
- The API trains the model once when first asked (about 6–10 seconds), then answers in under 1 second.

---

## Proof that it works (`train.py`)

| Check | Result | What it means |
|---|---|---|
| **Is 6 the right number of groups?** Silhouette score for 3–9 groups (higher = clearer groups) | 3: 0.23 · 4: 0.28 · 5: 0.31 · **6: 0.34** · 7: 0.30 · 8: 0.30 · 9: 0.31 | 6 is the clearest split |
| **Are the groups stable?** Re-run k-means from 5 different random starts | ARI = **1.00** | Exactly the same groups every time, not luck |
| **Are neighbours really "people like you"?** Hide each user's last 3 months, predict their spending mix from their first 9 months | Error per category (lower = better):<br>everyone's average **3.24** pts<br>20 random users **3.30** pts<br>own group's average **2.43** pts<br>**20 nearest neighbours 2.42 pts** | Neighbours predict the future **25% better** than the average person. **Random users don't help at all**, so the matching is what makes the difference. |

---

## Tested end to end through the app
1. `POST /upload-csv/` with a 60-row statement creates a new user.
2. `GET /users/{cc_num}/insights` returned: group *"More than most on Eating out & Kids & pets"*, score 75 (749 on today's 0–999 scale), 20 neighbours, and 3 recommendations (Kids & pets, Groceries, Home).
3. An unknown user returns 404. The test upload was deleted afterwards.

---

## What `/users/{cc_num}/insights` returns

```json
{
  "cc_num": 2,
  "segment": {"id": 2, "name": "More than most on Eating out & Kids & pets", "size": 181},
  "score": 75,
  "monthly_spend": 3163.3,
  "neighbours": [{"cc_num": 348379466427142, "similarity": 0.148}, "... 20 in total"],
  "categories": [{"category": "kids_pets", "your_share": 0.20, "neighbours_share": 0.14, "segment_share": 0.12}, "..."],
  "recommendations": [{"category": "kids_pets", "est_monthly_saving": 203.0,
                       "message": "You spend 20% of your money on Kids & pets; your 20 most similar users spend 14%. ..."}]
}
```

---

## Limits to be honest about
- **Merchant names are fake** in the dataset, so we recommend at the **category** level ("spend less on travel"), not "switch shop X for Y".
- **The data has no income**, so the score is about your spending **mix**, not whether you're saving.
- **The saving is an estimate**: it assumes you'd spend less on that category and keep the rest the same.
- **Possible next steps:** add spending level and age to the neighbour search, and suggest merchants popular among your neighbours.

---

## Files

| File | What |
|---|---|
| `features.py` | Database → 14 percentages per user |
| `model.py` | K-means, KNN, recommendations, score. `get_model().insights(cc_num)` |
| `train.py` | Trains and runs all the checks above |
