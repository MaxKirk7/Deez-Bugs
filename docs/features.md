# Penny: Features and challenge-track evidence

> A judge-facing overview of what Penny does, how it works, and which implemented features address each hackathon challenge.

## At a glance

Penny turns a student's transaction statement into an explainable decision loop:

**upload -> aggregate -> model -> explain -> research -> act**

The sections below describe the implementation, technical evidence, demo narrative, and honest boundaries for each challenge track.

### Contents

- [Best use of data for predictions and decision making](#challenge-track-best-use-of-data-for-predictions-and-decision-making)
- [G-Research: make the invisible visible](#challenge-track-g-research--make-the-invisible-visible)
- [Bank of Scotland: better everyday money decisions](#challenge-track-bank-of-scotland--better-everyday-money-decisions)
- [InstillAI: an assistant that adapts to its user](#challenge-track-instillai--an-assistant-that-adapts-to-its-user)
- [Wordsmith: an end-to-end agentic browser workflow](#challenge-track-wordsmith--an-end-to-end-agentic-browser-workflow)
- [MLH challenge tracks](#mlh-challenge-tracks)
- [Challenge coverage summary](#challenge-coverage-summary)

## Challenge track: best use of data for predictions and decision making

### Penny turns transaction data into an immediate, explainable decision loop

We completed this challenge track by building a working pipeline that transforms raw bank-statement data into personalised financial decisions rather than stopping at charts:

**transaction data -> behavioural features -> predictive models -> explanation -> action**

When a student drops in a CSV, Penny validates and stores the statement, calculates their spending profile, finds comparable people in the reference population, predicts where their behaviour differs from that peer group, and turns the result into a ranked set of potential savings decisions. The same upload also powers an unusual-transaction check, so the student can correct suspicious data and immediately see their profile, score, recommendations, map, and spending history update.

### Scale and diversity of the data

- The reference population contains approximately **928,000 purchases from 908 users**, each with up to 12 months of history.
- Every purchase is represented across **14 behavioural categories**, including groceries, food, transport, shopping, home, health and fitness, travel, entertainment, and online versus in-person variants.
- The model deliberately uses **spending proportions**, not raw totals. This makes the representation comparable across different budgets: a student spending £500 and another spending £2,000 can still be recognised as having the same habits.
- Fraud-labelled reference transactions are excluded from normal spending statistics, preventing corrupted labels from influencing a person's baseline behaviour.
- A new statement is treated as a first-class user and compared with the full reference population, so the experience is personalised without requiring the user to provide demographic or income data.

### The technical pipeline

1. **Aggregation:** Tiger Data/TimescaleDB stores transactions in a time-partitioned hypertable. A continuous aggregate maintains daily category spend, avoiding repeated full-table scans for interactive analysis.
2. **Feature engineering:** each user becomes a 14-dimensional vector of category shares that sums to 1.0. Monthly spend is retained separately so recommendations can be expressed in money, not only percentages.
3. **Normalisation:** `StandardScaler` puts large and small categories on a comparable scale before distance-based modelling.
4. **Segmentation:** deterministic K-means (`k=6`, fixed seed, ten initialisations) identifies six interpretable spending profiles. Segment names are generated from the categories that are over-represented relative to the overall population.
5. **Similarity search:** KNN retrieves the 20 closest reference users for a new profile. Similarity is distance-based and the user's own record is excluded.
6. **Decision modelling:** collaborative filtering compares the student's category mix with their nearest neighbours. Categories where the student is at least three percentage points above their peer group become ranked, quantified recommendations.
7. **Fresh-data inference:** uploaded statements are parsed and inserted immediately, then scored by the cached model. The first request trains the reference model; subsequent requests reuse it, keeping the interactive path fast while avoiding unstable retraining for every click.

### What the student can decide

Penny does not only say “you spent more.” It answers:

- **Who am I most like?** A named segment plus 20 similar reference users.
- **Where am I different?** A category-by-category comparison of the student's share, neighbour share, and segment share.
- **What could I change?** Up to three recommendations, ranked by the largest behavioural gap.
- **What is the consequence?** Each recommendation estimates monthly money that could be freed if the student moved toward the peer-group mix.
- **Can I trust the input?** The unusual-transaction flow surfaces purchases that are atypical for the student's amount, category, timing, frequency, and peer-relative behaviour. Marking a purchase as unauthorised removes it from future spending statistics and refreshes the decisions.

This makes the output actionable and auditable: every recommendation can be traced back to the transactions, the engineered feature vector, the nearest-neighbour cohort, and the explicit percentage-point gap that produced it.

### Evidence that the predictions are useful

The model was tested rather than selected by appearance alone:

- Six clusters produced the strongest silhouette score in the tested range: **0.34**, compared with 0.23–0.31 for three to five and seven to nine clusters.
- Five independent K-means starts produced **ARI = 1.00**, showing the segmentation is stable rather than a lucky initialisation.
- In a temporal holdout test, the 20 nearest neighbours predicted a user's later spending mix with **2.42 percentage points mean category error**, versus **3.24** for the population average and **3.30** for random users. The matched cohort therefore reduced prediction error by roughly **25% versus the baseline**.
- The model returns a 0–100 spending-mix score, but keeps the score interpretable: it measures alignment with similar spenders, not financial worth or income.

### Why this is a strong use of data

The key design choice is to combine **population-scale learning** with **individual-level feedback**. A student's own statement may be short and noisy, but the reference population supplies context; the student's own transactions still determine the final profile and recommendations. This avoids generic budgeting advice while remaining explainable enough for a user to challenge or correct.

The system is also designed for responsible decision support:

- it recommends categories rather than pretending fake merchant names are real;
- it distinguishes estimated savings from guaranteed savings;
- it does not infer income or claim that a higher score means a healthier financial life;
- it allows the user to correct unusual transactions, with downstream insights recalculated;
- it keeps uploaded users separate from reference users and supports deletion of uploaded data.

### Judge demo story

1. Drop a statement into the upload zone.
2. Show the new user's spending profile and named segment.
3. Open the “people like you” comparison and point to the 20-neighbour cohort.
4. Highlight a recommendation such as: “your peer group spends 14% on this category; you spend 20%; moving toward them could free approximately £X per month.”
5. Open the unusual-transactions view, answer “was this you?”, and show the dashboard update.
6. Explain that this is not a static dashboard: each answer changes the underlying data and the next decision.

### Relevant implementation

- Feature engineering: `src/deez_bugs/ml/features.py`
- Segmentation, KNN, scoring, and recommendations: `src/deez_bugs/ml/model.py`
- Purchase-level unusual-transaction features: `src/deez_bugs/fraud/features.py`
- Live model endpoints: `src/deez_bugs/api/api.py`
- Upload and live refresh flow: `frontend/src/api.ts`
- Validation results and model rationale: `src/deez_bugs/ml/HOW_IT_WORKS.md`

## Challenge track: G-Research — make the invisible visible

### The hidden problem: financial behaviour is easy to record but hard to see

A bank statement is a long list of individually plausible transactions. The important patterns are usually invisible:

- a small category slowly becoming a meaningful share of a student's budget;
- spending behaviour that is unusual for the person, even when each purchase looks normal;
- a purchase that is normal for the population but abnormal for this individual;
- the gap between what similar people do and what the student could change;
- the downstream monthly cost of repeating a habit.

We used public synthetic card-transaction data as the reference population and combined it with a student's uploaded statement. The result is a visual and predictive layer over the raw ledger: Penny turns isolated rows into patterns, comparisons, anomalies, and decisions.

### What we collected and why it matters

The reference dataset provides approximately **928,000 labelled transactions from 908 users**, covering up to 12 months per user. Each row contains time, merchant, amount, category, and transaction location, with fraud labels available for reference users. We use this public data to learn what normal spending looks like at population scale, while keeping the user's uploaded statement as the source of truth for their own behaviour.

Instead of exposing a table of transactions, we derive:

- **14 category shares**: what proportion of spending goes to each type of purchase;
- **monthly spend**: the scale needed to translate behavioural gaps into estimated money;
- **temporal signals**: hour, transaction density, and purchases within a 24-hour window;
- **personal baselines**: how large a purchase is compared with the user's usual amount in that category;
- **peer baselines**: how large a purchase is compared with what similar users usually pay;
- **location signals**: where purchases happen relative to the user's home and other activity;
- **future-facing context**: what similar users' later spending mix suggests about the user's likely direction.

### How Penny makes it visible

#### 1. Hidden spending identity

K-means compresses a user's 14-category spending mix into one of six interpretable segments. Rather than asking a student to inspect dozens of percentages, Penny names the pattern, for example “More than most on Eating out & Kids & pets.” This makes an implicit spending identity legible.

#### 2. Hidden peer comparison

KNN finds the 20 closest reference users by normalised spending behaviour. Penny then displays the student's share, their neighbours' share, and their wider segment share category by category. This reveals differences that a personal statement cannot show on its own: a student can see not merely that they spent money on travel, but that travel occupies substantially more of their mix than people with similar habits.

#### 3. Hidden consequences

The recommendation engine converts a percentage-point gap into an estimated monthly saving:

`monthly spend × (student category share − neighbour category share)`

Only gaps of at least three percentage points are promoted, and the largest three are ranked first. This turns an abstract pattern into a concrete decision: “matching the behaviour of similar users could free approximately X per month.” The estimate is explicitly labelled as an estimate, not a promise.

#### 4. Hidden anomalies

The “Was this you?” flow surfaces transactions that are difficult to identify with a simple threshold. The purchase-level model combines:

- absolute amount;
- category;
- time of day;
- amount relative to the user's category median;
- how busy the surrounding 24-hour window is;
- whether nearby activity contains unusually large purchases;
- amount relative to similar users.

This makes personal unusualness visible. A transaction does not need to be globally large to be suspicious; it can be suspicious because it is inconsistent with this person's normal pattern. When the user says a purchase was not theirs, it is removed from their spending statistics and the downstream dashboard, segment, score, map, and recommendations are refreshed.

### From raw data to a clear story

The demo deliberately moves through three levels of visibility:

1. **Raw:** show the uploaded statement and its transaction rows.
2. **Pattern:** show the category mix, segment, peer comparison, map, calendar, and unusual purchases.
3. **Decision:** show the ranked recommendation and its estimated monthly consequence, then correct an anomalous transaction and demonstrate the result changing.

This is the core G-Research story: we did not collect more data merely to produce a bigger table. We used public data to establish a meaningful baseline, engineered features that capture behaviour rather than just transactions, and designed the interface so a hidden pattern becomes something a person can understand and act on.

### Technical implementation

- Public reference data is loaded into Tiger Data/TimescaleDB as a time-partitioned transactions hypertable.
- Continuous aggregates maintain daily category spend for efficient interactive queries.
- The spending model uses `StandardScaler`, K-means, and KNN over category-share vectors.
- The unusual-transaction model uses personal, temporal, peer-relative, and location-aware features.
- FastAPI exposes the live insights and unusual-transaction endpoints.
- The frontend renders the result as an interactive dashboard and refreshes it after user feedback.

### What makes the result technically credible

The system exposes its reasoning rather than hiding it behind a black-box label. Every insight can be traced to source transactions, an explicit engineered feature, a reference cohort, and a measurable difference. The segmentation and neighbour model have been evaluated with silhouette score, cluster stability, and temporal holdout error; the documented nearest-neighbour holdout error is **2.42 percentage points**, compared with **3.24** for a population-average baseline.

The most important outcome is not anomaly detection in isolation. It is the feedback loop:

**observe -> explain -> let the user correct the data -> recompute -> show the changed decision**

That loop makes invisible financial behaviour visible while preserving user control over the interpretation.

## Challenge track: Bank of Scotland — better everyday money decisions

### The problem: cost of living is a tradeoff problem, not just a budgeting problem

Students rarely need another statement telling them what they already bought. They need help deciding what to do next without losing the things that matter in everyday life. Cutting every enjoyable purchase is unrealistic; ignoring repeated small decisions can quietly create a large monthly cost.

Penny helps customers navigate that tradeoff by connecting three things:

1. **Their real behaviour:** what they actually spend money on and how often.
2. **A useful comparison:** what people with similar spending patterns do differently.
3. **A practical consequence:** an estimated monthly amount that could be freed by changing one category.

This turns cost-of-living support from generic advice into a personalised choice: the customer can see the likely benefit of a change and decide whether it is worth the lifestyle tradeoff.

### How the solution supports better decisions

#### Find the highest-impact change

Penny ranks recommendations by the largest gap between the customer's spending mix and their 20 closest behavioural neighbours. A three-percentage-point minimum prevents the product from making noisy recommendations about insignificant differences. The top three opportunities are shown with an estimated monthly saving, so the customer can focus on one change rather than being overwhelmed by every possible optimisation.

#### Preserve context instead of judging spending

The model compares proportions and categories, not personal worth. Someone is not labelled “bad with money” because they spend more overall; the system identifies where their mix differs from similar customers. The recommendation can therefore be framed as a choice:

> “You spend more of your budget on eating out than people with similar habits. Reducing this gap could free approximately X per month.”

The customer remains in control of whether that saving is more valuable than the convenience, social time, or enjoyment represented by the spending.

#### Make the tradeoff measurable

The estimated saving is calculated from the customer's own monthly spend and the observed peer-group gap. This gives a concrete counterfactual: not “spend less,” but “if this category moved closer to the peer pattern, this is the approximate monthly amount available for another priority.”

That amount can support everyday decisions such as:

- keeping more money available until the end of the month;
- redirecting frequent takeaway spending towards groceries;
- choosing whether a subscription or convenience habit is worth its recurring cost;
- freeing money for transport, social activities, savings, or an unexpected bill.

#### Help customers correct the picture

Cost-of-living advice is only useful if the underlying data is trustworthy. Penny surfaces unusual transactions and asks “Was this you?” If the customer marks a purchase as unauthorised, the transaction is removed from their spending statistics and the relevant insights are recalculated. This prevents a one-off error, fraud event, or miscategorised purchase from driving an inappropriate recommendation.

### A customer-centred decision journey

1. **Upload:** the customer drops in a statement; Penny validates the required fields and builds a personal spending profile.
2. **Understand:** the dashboard shows category shares, monthly spend, trends, places, and unusual activity.
3. **Compare:** the customer sees a named spending segment and the behaviour of 20 similar people.
4. **Choose:** Penny highlights the largest actionable gap and estimates its monthly impact.
5. **Reflect:** the customer decides whether that change fits their priorities and lifestyle.
6. **Correct and continue:** the customer can reject an unusual transaction, after which the model refreshes the advice instead of treating its first answer as permanent.

### Why this is more useful than generic financial advice

Generic cost-of-living guidance assumes everyone has the same priorities. Penny uses a customer's own transaction history to identify the smallest number of changes likely to have the largest effect for them. It also avoids pretending that a statistical comparison is a command: recommendations are estimates, merchant names in the public reference data are synthetic, and the customer chooses what to change.

The technical design supports this experience:

- category-share features make customers comparable across different spending levels;
- KNN provides a behaviourally relevant peer group rather than a random average;
- collaborative filtering turns peer differences into ranked interventions;
- monthly-spend scaling turns percentage gaps into understandable money;
- the frontend updates recommendations after user feedback;
- uploaded data is isolated per user and can be deleted.

### Judge demo story

Show a customer with a clear but realistic tradeoff: their spending is concentrated in eating out, online shopping, or transport. Penny identifies that this category is materially higher than their similar-user cohort and estimates the monthly amount available if they moved closer to that cohort. Then explain that Penny is not prescribing deprivation; it is showing the customer the size of the tradeoff so they can decide what matters most.

Finish by answering an unusual transaction and refreshing the dashboard. This demonstrates that the advice is not a static score: it is a transparent, interactive decision-support loop that gets better when the customer provides context.

## Challenge track: InstillAI — an assistant that adapts to its user

### The idea: guidance should match the person, not just the task

Most AI assistants return the same kind of answer to everyone. Penny takes a different approach: it separates the underlying facts from the way those facts are explained. The assistant receives a structured profile of the customer's actual spending and recommendations, then produces both:

- a natural-language answer for a conversational interaction; and
- a short, display-ready summary for someone who wants the result without a lecture.

This is the foundation of an agentic product that can adapt its language, level of detail, interaction mode, and willingness to act based on the person using it.

### It works on real data and is honest about what it did

Penny's assistant is grounded in the live dashboard profile:

- total spend;
- monthly spend by month;
- category spend;
- the model's ranked recommendations; and
- the customer's selected currency.

The backend explicitly instructs the model to use only this supplied aggregate, not to invent transactions, merchants, income, or unsupported facts. It also refuses to present regulated financial advice as certainty and says when the profile does not contain enough information. This makes the assistant useful without pretending that a language model is the source of truth.

The assistant is connected to real product actions rather than being a disconnected chat box. Its answers reference the same K-means segment, KNN peer comparison, estimated savings, and unusual-transaction workflow that the dashboard uses. If the customer corrects an unusual purchase, the profile changes and the next answer is generated from the updated data.

### It reads the user through interaction

The interface learns lightweight signals from the current interaction without requiring a personality questionnaire:

- suggested prompts provide a gentle starting point for someone who does not know what to ask;
- asked prompts are visibly de-emphasised so the user is not sent in circles;
- the first answer is presented as a concise bullet summary;
- “Ask another question” keeps the user in control of the depth and direction;
- the user can mute or enable spoken answers;
- in-flight speech is cancelled when the user asks something else, closes the assistant, or mutes it.

This is deliberate adaptation: the user chooses whether they want a quick scan, another question, or an audio explanation, while the assistant preserves the same grounded facts underneath.

### Persona design: the overwhelmed student

Beyond a beginner developer and a senior engineer, we designed for **the overwhelmed student who is capable but short on time, attention, or confidence**. This persona matters because cost-of-living decisions are often made under stress, and a dense explanation can be as unhelpful as no explanation.

For this person, Penny is designed to:

- start with plain-language suggested questions rather than an empty chat box;
- lead with the actionable conclusion and key amount;
- show two to five concise bullets instead of a wall of generated text;
- explain the reason behind a recommendation through the peer comparison;
- offer voice playback for hands-busy or screen-fatigued use;
- avoid judgemental language and leave the final choice with the student;
- recover safely when data is missing instead of filling the gap with a confident guess.

The same underlying model can therefore support a more exploratory user with follow-up questions without forcing every customer through a long tutorial.

### Agentic interaction pattern

The product demonstrates the core loop we would carry into an adaptive IDE:

1. **Observe:** read the user's structured context and the way they are interacting.
2. **Plan:** select the appropriate response shape—answer, concise summary, or speech.
3. **Act:** call the grounded assistant and, when requested, the speech service.
4. **Explain:** show the supporting figures and recommendations.
5. **Check:** let the user ask again, mute, close, or correct the underlying data.
6. **Update:** regenerate from the changed profile rather than defending the previous answer.

The system is asynchronous and cancellable: React aborts stale speech requests, the backend validates profile fields with Pydantic, and provider failures are surfaced to the user instead of becoming a success-shaped placeholder. This is the same reliability standard an IDE agent needs when editing real code: make the smallest justified action, expose what happened, and recover explicitly when a dependency fails.

### What we built versus where this goes next

In this project, the implemented agent works inside a real financial application: it explains live spending data, provides grounded recommendations, and supports voice. The repository is not claiming that Penny is already a full code-editing IDE with debugger and refactoring tools.

The demonstrated architecture is intentionally transferable. In an IDE version, the structured profile would contain the repository, diagnostics, current file, test failures, and user interaction history. The same adaptation layer could then:

- teach a first-day programmer step by step and ask them to confirm before editing;
- give a senior engineer a concise root cause and smallest patch;
- support the overwhelmed student persona with a short explanation, visible checkpoints, and optional narration;
- run tests after an edit and report exactly what changed and what was verified.

### Technical evidence for judges

- The frontend builds an `AssistantProfile` directly from the current dashboard state.
- FastAPI validates the profile and question with typed Pydantic models.
- The answer prompt is explicitly grounded and bounded to aggregated user data.
- A second model call converts the answer into a display summary while preserving figures and claims.
- ElevenLabs speech is isolated behind a backend endpoint so API credentials are not exposed in the browser.
- Abort controllers prevent stale answers and audio from leaking across interactions.
- Errors from missing keys, provider failures, empty responses, and network failures are surfaced explicitly.

### Judge demo story

Ask Penny, “How can I save more money?” Show the grounded natural-language answer and the short bullet summary. Toggle voice to demonstrate a different interaction mode. Ask a second question, then mark an unusual transaction as unauthorised and ask again: the assistant now works from the corrected profile.

The point is not merely that the app can call an LLM. It is that the agent is connected to real application state, explains how it reached its answer, adapts the presentation to the person, and stays honest about the boundary between evidence and advice.

## Challenge track: Wordsmith — an end-to-end agentic browser workflow

### From “I could save money” to a researched, comparable action

The Wordsmith challenge is where Penny moves from analysis to action. The dashboard identifies a savings opportunity; the browser agent then turns that opportunity into a multi-step research task with visible progress and a decision-ready result.

The workflow is intentionally more than a single search:

**customer data -> opportunity -> task plan -> browser research -> extraction -> normalisation -> comparison -> recommendation**

For example, the groceries workflow starts from Alex's actual grocery behaviour, reconstructs the usual basket, checks the same basket across Tesco, Aldi, and Lidl, filters by travel distance, compares 18 items, and returns cheaper options with an estimated monthly saving. The customer sees the reasoning trail rather than receiving an unexplained answer.

### The complete workflow

1. **Detect an opportunity:** Penny's spending model identifies a category with a meaningful savings range.
2. **Build a task-specific objective:** the agent turns “save on groceries” into a constrained objective: preserve the customer's normal basket, compare equivalent products, respect the local area, and minimise cost.
3. **Gather context:** it uses the customer's transaction history to understand their recurring basket, takeaway preferences, or active subscriptions.
4. **Choose sources:** it selects relevant retailer, provider, recipe, deal, or comparison pages instead of treating every web result as equivalent.
5. **Navigate:** it visits multiple websites, following the journey a human shopper would take.
6. **Extract evidence:** it records item names, prices, plans, offers, distance, and relevant notes from each source.
7. **Normalise the comparison:** it compares like with like—basket totals, meal portions, or equivalent subscription plans—rather than presenting misleading headline prices.
8. **Apply constraints:** it keeps practical details such as walking time, bus routes, own-brand substitutions, freezing suitability, adverts, or re-subscription friction in the result.
9. **Calculate the consequence:** it translates a one-off or weekly difference into a monthly saving.
10. **Explain the tradeoff:** it returns the current option, alternatives, prices, caveats, and why each alternative may fit the customer's life.
11. **Ask for the final choice:** the agent recommends; the customer decides whether the convenience, quality, travel time, or flexibility is worth the difference.

### Multiple agent tasks, not one generic prompt

The demo contains three distinct research strategies:

#### Grocery basket optimisation

- reconstruct the customer's usual basket;
- price it at three supermarkets;
- compare 18 items;
- search for nearby stores within 15 minutes;
- account for own-brand swaps and loyalty offers;
- return the cheapest practical equivalent.

#### Takeaway-to-meal substitution

- inspect eight takeaway orders from the month;
- identify the dishes and routines the customer actually repeats;
- search budget recipes under £2 per portion;
- check student deals;
- match recipes to familiar meals;
- return a batch-cooking plan rather than a generic list of recipes.

#### Subscription configuration

- identify two services in the customer's spending;
- check current provider plans;
- search student and bundle options;
- compare monthly combinations;
- surface rotation and ad-supported tradeoffs;
- return the cheapest setup that preserves access.

Each task has a different browsing plan, evidence shape, and comparison rule. That is the important agentic property: the workflow is selected from the user's opportunity, not hard-coded as one universal answer.

### Observable reasoning and human control

The agent exposes a live event log with typed steps:

- **search:** the agent is deciding what evidence or option to look for;
- **visit:** it is inspecting a specific retailer or provider;
- **compare:** it is evaluating normalised options;
- **done:** it has produced a result.

The UI streams each step as it happens, shows source URLs, keeps the current option visible next to alternatives, and reports the final monthly saving. Users can run one opportunity or research all opportunities. Failed runs are displayed as errors with a retry action rather than silently presenting a result.

This makes a complicated browser workflow understandable and auditable. A judge can see the agent move from intent to evidence to comparison, while a customer can challenge the assumptions before acting.

### What makes the workflow technically difficult

The hard part is not opening a webpage. It is maintaining a chain of meaning across different representations:

- messy personal transactions;
- an inferred recurring behaviour;
- a natural-language savings objective;
- heterogeneous websites and pricing models;
- equivalent products or plans;
- practical constraints such as locality and convenience;
- a final recommendation that is useful without being overconfident.

The frontend models this as a state machine (`idle -> running -> done/error`). Each opportunity maintains its own run, streamed steps are appended incrementally, results are typed, and the total found saving is aggregated only from completed runs. The result schema keeps the current choice, alternatives, notes, URLs, and monthly saving separate, which makes the decision traceable and testable.

### What is implemented today

The repository currently implements the full user-facing orchestration and observability layer with deterministic demo runs:

- opportunity cards are generated from the dashboard's savings data;
- the user can launch one or all research tasks;
- each task streams search, visit, compare, and completion events;
- source URLs and practical notes are displayed;
- the final result compares the current option with alternatives;
- monthly savings are calculated and summed across completed tasks;
- errors have an explicit retry path.

The current `researchSavings` function uses scripted evidence and illustrative prices, so the repository does **not** claim that a live browser-use agent is already scraping retailer sites in production. The integration seam is explicit: replace the scripted runner with a browser-use worker while preserving the typed `AgentStep` and `AgentResult` contracts and the existing UI.

### Live browser-use architecture

The next production layer would keep the same contract and add:

1. a task planner that converts an opportunity into a constrained research plan;
2. a browser worker with isolated sessions and navigation/tool permissions;
3. extraction validators for prices, units, plan periods, and availability;
4. provenance records linking every result field to a source URL and timestamp;
5. retry and backoff for dynamic pages, blocked navigation, and transient failures;
6. confidence checks that reject incomplete or incomparable baskets;
7. a final synthesis step that distinguishes observed prices from estimates;
8. a human confirmation gate before any purchase, subscription change, or external action.

This preserves the most important design principle: the agent may research and compare, but it does not silently spend the customer's money or make an irreversible decision.

### Judge demo story

Open the Savings agent and click **Research all**. Show the three opportunities running in parallel, with each one following a different plan. Point out the live step log and source sites, then show:

- the grocery basket changing from a current £45.20 to a £39.10 equivalent;
- the takeaway agent producing batch meals matched to the customer's actual orders;
- the streaming agent comparing plan combinations and rotation;
- the total monthly saving found across completed workflows.

Finish by explaining the engineering boundary: this is a complete, observable agentic workflow prototype with a typed browser-worker seam. The UI already demonstrates the difficult orchestration and decision experience; a live browser-use worker can replace the deterministic runner without changing the product contract.

## MLH challenge tracks

### Best use of ElevenLabs: Penny is an assistant you can listen to

We use ElevenLabs for a meaningful product interaction, not as a novelty button. Penny's assistant can explain a student's real spending profile aloud, which is valuable when the user is walking, cooking, screen-fatigued, or struggling to interpret a financial dashboard.

The end-to-end voice path is:

1. The frontend builds a structured profile from the current dashboard.
2. The backend generates a grounded answer using only the supplied totals, category spend, monthly spend, currency, and recommendations.
3. The same answer is sent to the ElevenLabs text-to-speech API through a server-side FastAPI endpoint.
4. The browser decodes the returned audio and plays it through the Web Audio API.
5. The user can mute, stop, close, or ask another question at any point.

The integration is deliberately secure and resilient:

- the ElevenLabs key stays in the backend environment and is never exposed to the browser;
- voice, model, speed, stability, and similarity are configured server-side;
- requests have a 30-second provider timeout;
- provider HTTP and network errors are converted into explicit API errors;
- the frontend uses `AbortController` to cancel stale speech when the user changes context;
- the UI stops current audio when muted or closed instead of letting old answers continue.

The result is a more accessible financial assistant: the same evidence can be consumed visually as two-to-five bullets or audibly as a natural explanation. Voice does not replace the source data; it makes the decision support easier to use.

**Relevant implementation:** `src/deez_bugs/api/api.py` (`/assistant/speech`), `frontend/src/api.ts` (`speakAssistant`), and `frontend/src/components/AssistantScreen.tsx`.

### Best use of Tiger Data: time-series infrastructure directly powering decisions

Tiger Data is the data foundation for the entire product. We use PostgreSQL and TimescaleDB features for the workload they are designed for: large, time-stamped transaction histories, fast per-user queries, and continuously maintained aggregates.

The implementation uses:

- a **transactions hypertable** partitioned by timestamp into one-month chunks;
- a compound `(cc_num, ts DESC)` index for user timeline and recent-activity queries;
- a **daily category spend continuous aggregate** that stores user/category/day totals and transaction counts;
- fraud-aware aggregation that excludes transactions marked as not made by the card owner;
- a shared cloud dataset of approximately **928,000 purchases from 908 reference users**;
- the same schema for reference users and newly uploaded users, keeping live inference consistent.

This architecture matters because Penny must answer interactive questions without repeatedly scanning every raw row:

1. raw transactions arrive in the time-series hypertable;
2. Tiger maintains the daily aggregate;
3. the ML feature layer reads category totals from that aggregate;
4. category shares feed K-means segmentation and KNN similarity;
5. the API returns recommendations, maps, and unusual-transaction context.

Tiger is therefore not just storage behind the demo. Its time-series model is part of the product's prediction loop: it turns a large transaction history into fresh, queryable features while preserving the underlying rows for explanations and correction.

**Relevant implementation:** `src/deez_bugs/db/schema.sql`, `src/deez_bugs/db/__init__.py`, `src/deez_bugs/ml/features.py`, `docs/TIGER_DATA.md`, and `docs/DB_DESIGN.md`.

### Best use of Google Cloud: honest status and intended role

The current repository does not contain a Google Cloud SDK, Google Cloud API integration, or Google Cloud deployment configuration. We do not claim that Penny currently uses Google Cloud; the live cloud data service is Tiger Data, and the language and voice providers are accessed through server-side APIs.

The clean Google Cloud integration point is the agent worker layer. If deployed for production, Google Cloud Run would be a strong fit for isolated, autoscaled browser-research jobs:

- the FastAPI application would enqueue a savings-research task;
- a short-lived Cloud Run worker would receive one typed opportunity;
- the worker would run an isolated browser session with restricted permissions;
- streamed `AgentStep` events would be persisted and sent to the frontend;
- extracted prices and URLs would be validated before synthesis;
- the worker would shut down after returning a typed `AgentResult`.

That design would complement, rather than duplicate, Tiger Data: Tiger remains the durable transaction and feature store, while Google Cloud provides elastic execution for expensive, bursty browser tasks. It also gives each browser run a clear security boundary and makes retries, timeouts, and cost controls explicit.

For judging purposes, the accurate claim is: **Tiger Data and ElevenLabs are implemented and used in the working product; Google Cloud is the documented deployment boundary for the next browser-agent integration, not a service currently hidden behind an unsupported claim.**

### The combined MLH story

These integrations work together as one pipeline:

**Tiger Data stores and aggregates the evidence -> ML finds the decision -> the agent explains the options -> ElevenLabs makes the explanation accessible -> the customer remains in control.**

The technical choices are complementary:

- Tiger Data handles scale and time-series freshness.
- The ML layer converts transactions into interpretable peer-relative decisions.
- The agent workflow turns a recommendation into researched alternatives.
- ElevenLabs delivers the result in a human, accessible format.
- Explicit provider boundaries and error handling keep the system honest when a dependency is unavailable.

## Challenge coverage summary

| Challenge track | Features that complete it | Evidence / status |
|---|---|---|
| **Best use of data for predictions and decision making** | 928k transactions from 908 reference users; 14-category behavioural features; Tiger continuous aggregates; K-means segmentation; KNN peer matching; collaborative recommendations; quantified monthly savings | **Implemented and live.** Temporal holdout error: 2.42 percentage points for nearest neighbours versus 3.24 for the population baseline. |
| **G-Research — make the invisible visible** | Personal spending identity; peer-relative comparisons; hidden financial consequences; unusual-transaction detection; explainable reasons; feedback loop after correcting data | **Implemented and live.** Raw transactions become visible patterns, anomalies, and decisions. |
| **Bank of Scotland — smart cost of living** | Ranked savings opportunities; percentage-gap-to-money conversion; practical tradeoff explanations; customer-controlled recommendations; corrected data refresh | **Implemented and live.** Helps customers choose one realistic change without prescribing their lifestyle. |
| **InstillAI — adaptive agentic assistance** | Grounded assistant; structured profile; concise summaries; suggested prompts; follow-up questions; voice mode; cancellable audio; overwhelmed-student persona | **Implemented and live.** The assistant adapts the explanation and interaction mode while staying grounded in real dashboard data. |
| **Wordsmith — complicated end-to-end browser-use workflow** | Opportunity-specific research plans; grocery, takeaway, and subscription workflows; streamed search/visit/compare steps; typed results; source URLs; retries; human confirmation boundary | **Workflow implemented as an observable prototype.** Current browser runner uses deterministic scripted evidence; the typed seam is ready for a live browser worker. |
| **MLH — best use of ElevenLabs** | Server-side text-to-speech; accessible spoken financial explanations; Web Audio playback; mute/close controls; abortable requests; provider error handling | **Implemented.** Credentials remain backend-only and failures are surfaced explicitly. |
| **MLH — best use of Tiger Data** | TimescaleDB hypertable; monthly time chunks; `(cc_num, ts DESC)` index; daily category-spend continuous aggregate; fraud-aware statistics; shared cloud dataset | **Implemented.** Tiger Data directly powers feature generation, maps, insights, and interactive queries. |
| **MLH — best use of Google Cloud** | Proposed isolated Cloud Run browser workers; typed task/result contract; autoscaling; retries; provenance; validation; human confirmation gate | **Not currently integrated.** Documented as the next deployment boundary rather than claimed as an existing service. |

### One-line judge summary

**Penny uses Tiger Data to turn large-scale transaction history into explainable decisions, uses an agent to research practical alternatives, and uses ElevenLabs to make those decisions accessible—while keeping the customer in control and being explicit about what is implemented today.**