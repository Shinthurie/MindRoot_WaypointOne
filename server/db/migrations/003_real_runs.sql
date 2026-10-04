-- Real runs: orders placed in the app live in the day's command log and state, not only in the dataset's orders
-- table, so a plan's items reference orders by ref without a database foreign key. Plans record their run date.
ALTER TABLE plan_items DROP CONSTRAINT IF EXISTS plan_items_order_ref_fkey;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS run_date date;
