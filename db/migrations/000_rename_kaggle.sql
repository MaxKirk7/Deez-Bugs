-- 000: Move the old Kaggle-format tables out of the way.
--
-- Before this migration, `transactions` and `daily_spend` held the raw Kaggle
-- columns (cc_num, trans_time, ...), loaded by `uv run tiger-load`.
-- The app now uses its own `transactions` table (see 002_core.sql), so the old
-- objects are renamed with a kaggle_ prefix. No data is deleted.
--
-- Only runs if the OLD table is still called `transactions` (it has a cc_num column),
-- so it is safe to run again and safe on a fresh database.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'cc_num'
    ) THEN
        ALTER TABLE transactions RENAME TO kaggle_transactions;
        -- Index names must be unique per schema, so rename these too.
        ALTER INDEX IF EXISTS transactions_pkey           RENAME TO kaggle_transactions_pkey;
        ALTER INDEX IF EXISTS transactions_trans_time_idx RENAME TO kaggle_transactions_trans_time_idx;
        ALTER INDEX IF EXISTS transactions_user_time_idx  RENAME TO kaggle_transactions_user_time_idx;
        ALTER MATERIALIZED VIEW IF EXISTS daily_spend RENAME TO kaggle_daily_spend;
        RAISE NOTICE 'Renamed old Kaggle tables to kaggle_transactions / kaggle_daily_spend';
    END IF;
END
$$;
