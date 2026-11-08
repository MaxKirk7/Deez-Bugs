# Penny
## Your money. Your patterns. Your next decision.

### Hackathon presentation

---

## 1. The problem

Students can see every transaction they made, but not always:

- which habits are quietly costing them money;
- how their behaviour compares with similar people;
- which change would have the biggest impact;
- whether an unusual transaction is distorting their picture;
- what practical alternatives are available.

Penny turns a bank statement into an understandable decision loop.

---

## 2. Our solution

**Upload -> understand -> compare -> decide -> act**

Penny:

1. Reads a student's transaction statement.
2. Builds a personal spending profile.
3. Finds similar spenders using machine learning.
4. Explains the largest opportunities to save.
5. Researches practical alternatives.
6. Lets the student correct the data and refresh the advice.

The customer stays in control. Penny provides evidence, options, and consequences—not judgement.

---

## 3. What makes Penny technically different

### Large-scale data

- Approximately **928,000 transactions**
- **908 reference users**
- Up to 12 months of history per user
- **14 spending categories**
- Fraud-aware statistics

### Explainable machine learning

- Category-share feature vectors
- StandardScaler normalisation
- Six K-means spending segments
- 20-user KNN peer groups
- Collaborative filtering recommendations

### Real-time product feedback

- Fresh CSV uploads become new users immediately.
- Recommendations are generated from the uploaded profile.
- “Was this you?” corrections refresh downstream insights.

---

## 4. The customer journey

### Upload

Drop a CSV into the app.

### Understand

See spending categories, monthly totals, locations, patterns, and unusual activity.

### Compare

Discover a named spending segment and 20 similar people.

### Decide

See the biggest behavioural gap and an estimated monthly saving.

### Act

Ask Penny for an explanation or let the savings agent research alternatives.

---

## 5. Challenge: best use of data for predictions and decisions

### Feature

Penny uses population-scale transaction data to predict what a customer could change.

### How it works

- Each user becomes a 14-dimensional spending-share vector.
- K-means identifies six interpretable spending profiles.
- KNN finds the 20 closest reference users.
- Category gaps become ranked recommendations.
- Monthly spend converts percentage differences into estimated money.

### Evidence

- Nearest-neighbour holdout error: **2.42 percentage points**
- Population-average baseline: **3.24 percentage points**
- Six-cluster silhouette score: **0.34**
- Cluster stability: **ARI = 1.00**

### Why it matters

Penny does not give generic budgeting advice. It uses data to identify the most relevant decision for this customer.

---

## 6. Challenge: G-Research — make the invisible visible

### Feature

Penny reveals patterns hidden inside ordinary transaction rows.

### What becomes visible

- A customer's spending identity
- Peer-relative overspending
- The monthly consequence of a habit
- Purchases unusual for that individual
- The reasons an item was flagged

### Technical approach

The unusual-transaction model considers:

- amount and category;
- time of day;
- amount relative to the customer's category median;
- activity within a 24-hour window;
- comparison with similar users;
- purchase location context.

### Result

The customer can inspect a pattern, understand why it matters, correct the data, and see the dashboard update.

**Observe -> explain -> correct -> recompute**

---

## 7. Challenge: Bank of Scotland — smart cost of living

### Feature

Penny helps customers navigate tradeoffs instead of telling them to cut everything.

### How it works

- Finds the largest actionable category gap.
- Requires a minimum three-percentage-point difference.
- Estimates the monthly amount that could be freed.
- Explains the tradeoff in plain language.
- Leaves the lifestyle decision with the customer.

### Example

> “You spend 20% of your money on this category; similar users spend 14%. Moving towards them could free approximately £X per month.”

The customer can decide whether that saving is worth changing convenience, enjoyment, or routine.

---

## 8. Challenge: InstillAI — an assistant that adapts

### Feature

Penny explains real financial data in a format that matches the person using it.

### Implemented experience

- Grounded answers based only on the current profile
- Suggested prompts for users who do not know where to start
- Concise two-to-five bullet summaries
- Follow-up questions
- Optional voice answers
- Mute, close, and cancellation controls
- Explicit errors when data or providers are unavailable

### Persona

We designed for the **overwhelmed student**:

- plain language;
- one clear next step;
- no judgement;
- short explanations;
- optional audio;
- no confident guesses when information is missing.

The same architecture can later adapt an IDE agent for beginners, senior engineers, and other working styles.

---

## 9. Challenge: Wordsmith — agentic browser workflow

### Feature

The savings agent turns a recommendation into a visible research workflow.

### Three task-specific agents

#### Grocery basket

Reconstructs a normal basket, compares 18 items across three shops, checks travel time, and returns cheaper practical options.

#### Takeaway replacement

Looks at repeated orders, finds budget recipes, checks deals, and builds a meal-swap plan.

#### Subscription setup

Checks provider plans, student deals, bundles, and rotation strategies.

### Visible agent steps

**Search -> visit -> compare -> done**

The UI shows progress, source URLs, alternatives, caveats, and estimated monthly savings.

The current browser runner is a deterministic prototype with a typed seam ready for a live browser worker. It does not silently spend money or make irreversible changes.

---

## 10. MLH: best use of ElevenLabs

### Feature

Penny can speak the same grounded financial explanation aloud.

### Technical implementation

- FastAPI keeps the ElevenLabs key server-side.
- The backend sends the generated answer to text-to-speech.
- The browser decodes and plays the audio through Web Audio.
- AbortController cancels stale speech.
- Muting or closing stops current audio.
- Provider failures are surfaced clearly.

### Why it matters

Voice makes financial guidance more accessible when a user is screen-fatigued, busy, or finds a dashboard difficult to interpret.

---

## 11. MLH: best use of Tiger Data

### Feature

Tiger Data powers the full data-to-decision pipeline.

### Technical implementation

- Transactions stored in a TimescaleDB hypertable
- Monthly time chunks
- `(cc_num, ts DESC)` index
- Daily category-spend continuous aggregate
- Fraud rows excluded from normal spending statistics
- Reference and uploaded users share the same schema

Tiger is not just storage: it turns a large transaction history into fresh features for segmentation, recommendations, maps, and anomaly checks.

---

## 12. MLH: best use of Google Cloud

### Honest status

Google Cloud is not currently integrated in the repository, so we do not claim that it is.

### Planned integration

Google Cloud Run is the intended deployment boundary for isolated browser-research workers:

- receive one typed savings task;
- run a restricted browser session;
- stream typed agent events;
- validate prices and source provenance;
- return a typed result;
- shut down after completion.

Tiger Data would remain the durable data and feature store, while Cloud Run would provide elastic execution for expensive browser jobs.

---

## 13. The complete technical story

**Tiger Data stores the evidence.**

**Machine learning finds the relevant pattern.**

**Penny explains the decision.**

**The browser agent researches alternatives.**

**ElevenLabs makes the explanation accessible.**

**The customer chooses what to do.**

---

## 14. Closing

Penny is not another spending chart.

It is a transparent decision-support system that:

- learns from real transaction data;
- makes invisible behaviour visible;
- explains the tradeoffs;
- researches practical alternatives;
- adapts to the person using it;
- and stays honest about its evidence and limitations.

### One-line pitch

**Penny helps students understand what their money is doing—and choose the one change that matters most.**
