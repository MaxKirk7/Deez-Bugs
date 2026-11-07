-- 003: Continuous aggregates: summary tables Tiger keeps up to date for us.
--
-- materialized_only = false: queries also include rows newer than the last refresh.
-- BUT uploads contain past dates, which that won't pick up. After inserting an
-- upload, call db.refresh_aggregates(start, end) for its date range.

CREATE MATERIALIZED VIEW IF NOT EXISTS monthly_category_spend
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
    time_bucket('1 month', ts) AS month,
    user_id,
    category,
    SUM(-amount_gbp)           AS spend_gbp,    -- positive number
    COUNT(*)                   AS txn_count
FROM transactions
WHERE amount_gbp < 0
GROUP BY month, user_id, category
WITH NO DATA;
COMMENT ON VIEW monthly_category_spend IS 'Continuous aggregate: money spent per user, per category, per month.';

CREATE MATERIALIZED VIEW IF NOT EXISTS daily_cashflow
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
    time_bucket('1 day', ts)        AS day,
    user_id,
    SUM(GREATEST(amount_gbp, 0))    AS money_in_gbp,
    SUM(GREATEST(-amount_gbp, 0))   AS money_out_gbp,   -- positive number
    COUNT(*)                        AS txn_count
FROM transactions
GROUP BY day, user_id
WITH NO DATA;
COMMENT ON VIEW daily_cashflow IS 'Continuous aggregate: money in and out per user per day.';

-- Refresh every hour. start_offset NULL = look back over all history;
-- only buckets whose data changed are recomputed, so this stays cheap.
SELECT add_continuous_aggregate_policy('monthly_category_spend',
    start_offset => NULL, end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour', if_not_exists => true);

SELECT add_continuous_aggregate_policy('daily_cashflow',
    start_offset => NULL, end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour', if_not_exists => true);
