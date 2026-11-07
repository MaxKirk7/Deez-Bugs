-- 099: OPTIONAL. Not applied by migrate.py.
--
-- Turns on the columnstore (compression) for old transactions. This saves a lot of
-- storage, but compressed chunks are slower to insert into or update, so
-- only run it once the data is loaded and backdated uploads are no longer expected.
--
-- Run by hand, e.g. in the Tiger console SQL editor, or:
--   psql "$DATABASE_URL" -f db/migrations/099_columnstore_optional.sql

ALTER TABLE transactions SET (
    timescaledb.enable_columnstore = true,
    timescaledb.segmentby = 'user_id',
    timescaledb.orderby = 'ts DESC'
);

-- Compress chunks once they are more than 3 months old.
CALL add_columnstore_policy('transactions', after => INTERVAL '3 months', if_not_exists => true);

-- To undo: CALL remove_columnstore_policy('transactions', if_exists => true);
--          then decompress with: SELECT decompress_chunk(c, true) FROM show_chunks('transactions') c;
