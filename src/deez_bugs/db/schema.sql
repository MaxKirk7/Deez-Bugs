-- Raw Kaggle tables (kaggle_transactions, kaggle_daily_spend). The app schema lives in db/migrations/
-- Safe to run more than once: everything uses IF NOT EXISTS.

-- 1. One row = one card transaction (the Kaggle CSV columns, minus gender and the fraud label).
CREATE TABLE IF NOT EXISTS kaggle_transactions (
    trans_time  TIMESTAMP        NOT NULL,  -- from trans_date_trans_time
    trans_num   TEXT             NOT NULL,  -- unique transaction ID
    cc_num      BIGINT           NOT NULL,  -- user ID
    merchant    TEXT             NOT NULL,
    category    TEXT             NOT NULL,
    amt         NUMERIC(10, 2)   NOT NULL,
    first       TEXT,
    last        TEXT,
    street      TEXT,
    city        TEXT,
    state       TEXT,
    zip         INTEGER,
    lat         DOUBLE PRECISION,
    long        DOUBLE PRECISION,
    city_pop    INTEGER,
    job         TEXT,
    dob         DATE,
    unix_time   BIGINT,
    merch_lat   DOUBLE PRECISION,
    merch_long  DOUBLE PRECISION,
    -- Hypertables need the time column in every unique key.
    PRIMARY KEY (trans_num, trans_time)
);

-- Older copies of this table had these columns. We don't use them (fairness / not our task).
ALTER TABLE kaggle_transactions DROP COLUMN IF EXISTS gender;
ALTER TABLE kaggle_transactions DROP COLUMN IF EXISTS is_fraud;

-- 2. Turn it into a hypertable: Tiger splits it into time chunks
--    so queries over a date range are fast.
SELECT create_hypertable('kaggle_transactions', by_range('trans_time'), if_not_exists => TRUE);

-- 3. Fast lookups of one user's history, newest first.
CREATE INDEX IF NOT EXISTS kaggle_transactions_user_time_idx
    ON kaggle_transactions (cc_num, trans_time DESC);

-- 4. Continuous aggregate: daily spend per user per category.
--    Tiger keeps this pre-computed, so the dashboard's charts load instantly.
CREATE MATERIALIZED VIEW IF NOT EXISTS kaggle_daily_spend
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', trans_time) AS day,
    cc_num,
    category,
    COUNT(*)  AS n_transactions,
    SUM(amt)  AS total_amt
FROM kaggle_transactions
GROUP BY day, cc_num, category
WITH NO DATA;
