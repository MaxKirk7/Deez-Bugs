-- Tiger Data (TimescaleDB) schema for Deez-Bugs.
-- Safe to run more than once: everything uses IF NOT EXISTS.

-- 1. One row = one card transaction (same columns as the Kaggle CSV).
CREATE TABLE IF NOT EXISTS transactions (
    trans_time  TIMESTAMP        NOT NULL,  -- from trans_date_trans_time
    trans_num   TEXT             NOT NULL,  -- unique transaction ID
    cc_num      BIGINT           NOT NULL,  -- user ID
    merchant    TEXT             NOT NULL,
    category    TEXT             NOT NULL,
    amt         NUMERIC(10, 2)   NOT NULL,
    first       TEXT,
    last        TEXT,
    gender      TEXT,
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
    is_fraud    SMALLINT         NOT NULL DEFAULT 0,
    -- Hypertables need the time column in every unique key.
    PRIMARY KEY (trans_num, trans_time)
);

-- 2. Turn it into a hypertable: Tiger splits it into time chunks
--    so queries over a date range are fast.
SELECT create_hypertable('transactions', by_range('trans_time'), if_not_exists => TRUE);

-- 3. Fast lookups of one user's history, newest first.
CREATE INDEX IF NOT EXISTS transactions_user_time_idx
    ON transactions (cc_num, trans_time DESC);

-- 4. Continuous aggregate: daily spend per user per category.
--    Tiger keeps this pre-computed, so the dashboard's charts load instantly.
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_spend
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', trans_time) AS day,
    cc_num,
    category,
    COUNT(*)  AS n_transactions,
    SUM(amt)  AS total_amt
FROM transactions
GROUP BY day, cc_num, category
WITH NO DATA;
