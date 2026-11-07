-- 001: Check TimescaleDB is installed, then create the categories lookup table.

DO $$
DECLARE v TEXT;
BEGIN
    SELECT extversion INTO v FROM pg_extension WHERE extname = 'timescaledb';
    IF v IS NULL THEN
        RAISE EXCEPTION 'TimescaleDB extension is not installed on this database';
    END IF;
    -- 002_core.sql uses the CREATE TABLE ... WITH (tsdb.hypertable) syntax from 2.20+.
    IF string_to_array(split_part(v, '-', 1), '.')::int[] < ARRAY[2, 20] THEN
        RAISE EXCEPTION 'TimescaleDB % is too old: need 2.20 or later', v;
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS categories (
    category     TEXT PRIMARY KEY,           -- machine name, e.g. 'eating_out'
    label        TEXT NOT NULL,              -- display name, e.g. 'Eating out'
    is_essential BOOLEAN NOT NULL DEFAULT false
);
COMMENT ON TABLE categories IS 'Fixed list of spending categories. Every transaction and merchant has one.';

INSERT INTO categories (category, label, is_essential) VALUES
    ('groceries',       'Groceries',            true),
    ('eating_out',      'Eating out',           false),
    ('coffee',          'Coffee',               false),
    ('transport',       'Transport',            true),
    ('fuel',            'Fuel',                 true),
    ('shopping',        'Shopping',             false),
    ('entertainment',   'Entertainment',        false),
    ('subscriptions',   'Subscriptions',        false),
    ('bills_utilities', 'Bills and utilities',  true),
    ('rent_mortgage',   'Rent or mortgage',     true),
    ('health',          'Health',               true),
    ('personal_care',   'Personal care',        false),
    ('travel',          'Travel',               false),
    ('income',          'Income',               false),
    ('transfer',        'Transfer',             false),
    ('other',           'Other',                false)
ON CONFLICT (category) DO NOTHING;
