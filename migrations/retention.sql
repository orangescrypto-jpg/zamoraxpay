-- =====================================================================
-- PREFLIGHT — read before running.
--
-- Three tables this feature cleans are NOT created by any migration in
-- the repo (they were created directly on your D1): cashback_awards,
-- pin_attempts, weekend_bonus_payouts. This file does not create them.
-- Before running, confirm each has the columns the jobs use:
--
--   wrangler d1 execute zamoraxpay-db --remote --command "PRAGMA table_info(cashback_awards);"
--   wrangler d1 execute zamoraxpay-db --remote --command "PRAGMA table_info(pin_attempts);"
--   wrangler d1 execute zamoraxpay-db --remote --command "PRAGMA table_info(weekend_bonus_payouts);"
--
-- Needed: cashback_awards(id, claimed, created_at)
--         pin_attempts(user_id, failed_attempts, locked_until, updated_at)
--         weekend_bonus_payouts(id, created_at)
-- If any column is missing, tell me and I will adjust that job. The
-- CREATE INDEX lines for those tables are deliberately NOT in this file.
-- =====================================================================

-- =====================================================================
-- DATA RETENTION — rollups, archive ledger, admin-controlled settings
--
-- Run ONCE against your D1 (safe to re-run: everything is IF NOT EXISTS
-- or INSERT OR IGNORE):
--
--   wrangler d1 execute zamoraxpay-db --file=migrations/retention.sql --remote
--
-- Every retention window below is a number of DAYS stored in
-- site_settings and editable from /admin/retention. 0 = that job is OFF.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Wallet ledger rollup
--
-- withdrawals.ts computes withdrawable = SUM(funding credits) - SUM(all
-- debits) over the WHOLE ledger. When old wallet_transactions rows are
-- deleted, their totals are folded in here FIRST so that math never
-- changes. One row per user.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallet_ledger_rollup (
  user_id                TEXT PRIMARY KEY,
  funding_credits_kobo   INTEGER NOT NULL DEFAULT 0,  -- completed credits of type 'funding'
  total_debits_kobo      INTEGER NOT NULL DEFAULT 0,  -- completed debits of every type
  rows_archived          INTEGER NOT NULL DEFAULT 0,
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);


-- ---------------------------------------------------------------------
-- 2. Archived references
--
-- wallet_transactions.reference is UNIQUE — that constraint is what stops
-- a replayed payment webhook from crediting a wallet twice. Once a row is
-- deleted the constraint can no longer protect that reference, so the
-- reference is kept here (tiny: ~50 bytes/row).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS archived_wallet_references (
  reference    TEXT PRIMARY KEY,
  applied      INTEGER NOT NULL DEFAULT 0,   -- 1 once this row's totals are in wallet_ledger_rollup
  archived_at  TEXT NOT NULL DEFAULT (datetime('now'))
);


-- ---------------------------------------------------------------------
-- 2b. Atomic apply: fold a row's totals into the rollup AND record its
--     reference in ONE statement.
--
-- D1 has no transactions, so two separate statements can be split by a
-- crash, leaving totals folded but the reference unrecorded (or the other
-- way round) and the balance silently wrong. Instead the job does a single
--   INSERT INTO wallet_rollup_apply (...)
-- and this trigger performs both writes inside that one statement: either
-- both happen or neither does. The PRIMARY KEY on reference makes a replay
-- of the same row fail with a constraint error instead of double counting.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallet_rollup_apply (
  reference  TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  funding_credits_kobo INTEGER NOT NULL DEFAULT 0,
  total_debits_kobo    INTEGER NOT NULL DEFAULT 0
);

CREATE TRIGGER IF NOT EXISTS trg_wallet_rollup_apply
AFTER INSERT ON wallet_rollup_apply
BEGIN
  INSERT INTO wallet_ledger_rollup (user_id, funding_credits_kobo, total_debits_kobo, rows_archived)
  VALUES (NEW.user_id, NEW.funding_credits_kobo, NEW.total_debits_kobo, 1)
  ON CONFLICT(user_id) DO UPDATE SET
    funding_credits_kobo = funding_credits_kobo + NEW.funding_credits_kobo,
    total_debits_kobo    = total_debits_kobo    + NEW.total_debits_kobo,
    rows_archived        = rows_archived        + 1,
    updated_at = datetime('now');

  INSERT INTO archived_wallet_references (reference, applied) VALUES (NEW.reference, 1);
END;


-- ---------------------------------------------------------------------
-- 3. Spin all-time stats rollup
--
-- The admin spin log shows "all time" totals computed from spin_spins.
-- Once old spins are deleted those totals would silently shrink, so the
-- deleted rows are folded in here first. Single row (id = 1).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS spin_stats_rollup (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  spins        INTEGER NOT NULL DEFAULT 0,
  wins         INTEGER NOT NULL DEFAULT 0,
  cost_kobo    INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO spin_stats_rollup (id) VALUES (1);


-- ---------------------------------------------------------------------
-- 4. Retention run log — what each job did, shown on /admin/retention
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS retention_runs (
  id             TEXT PRIMARY KEY,
  job_key        TEXT NOT NULL,
  trigger_source TEXT NOT NULL,              -- 'cron' | 'admin'
  rows_affected  INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL,              -- 'ok' | 'partial' | 'error' | 'skipped'
  message        TEXT,
  started_at     TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_retention_runs_job ON retention_runs(job_key, started_at);


-- ---------------------------------------------------------------------
-- 5. Indexes the cleanup jobs need to run fast.
--
-- Without a created_at index every "older than N days" delete would scan
-- the whole table on every cron run and burn D1 rows-read quota.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created         ON wallet_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_spin_tickets_created      ON spin_tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_push_notif_log_created    ON push_notification_log(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_processed ON payment_webhook_events(processed_at);
CREATE INDEX IF NOT EXISTS idx_vtu_webhook_processed     ON vtu_webhook_events(processed_at);
CREATE INDEX IF NOT EXISTS idx_spin_vouchers_created     ON spin_vouchers(created_at);
CREATE INDEX IF NOT EXISTS idx_streak_checkins_created   ON daily_streak_checkins(created_at);
CREATE INDEX IF NOT EXISTS idx_cookie_consents_created   ON cookie_consents(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_created         ON admin_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_vtu_orders_created        ON vtu_orders(created_at);


-- ---------------------------------------------------------------------
-- 6. Retention settings (days). 0 = job disabled.
--    Keys are prefixed retention_ so the admin page can list them.
-- ---------------------------------------------------------------------
INSERT OR IGNORE INTO site_settings (key, label, description, value, value_type) VALUES
  ('retention_enabled', 'Retention: master switch', 'When off, the retention cron does nothing. Manual "Run now" buttons on /admin/retention still work.', 'true', 'boolean'),

  ('retention_spin_tickets_days', 'Spin tickets (used/expired) — delete after (days)', 'Deletes used and expired spin tickets older than this. Available (unspent) tickets are never touched.', '30', 'number'),
  ('retention_spin_vouchers_days', 'Spin vouchers (used/expired) — delete after (days)', 'Deletes used and expired vouchers/coupons older than this. Active vouchers are never touched.', '30', 'number'),
  ('retention_spin_nowin_days', 'Spin no-win rows — delete after (days)', 'Permanently deletes spins where the user won nothing. Minimum 7 (jackpot weekly caps look back 7 days).', '7', 'number'),
  ('retention_spin_win_days', 'Spin win rows — delete after (days)', 'Permanently deletes winning spins older than this. Minimum 7. Totals are folded into the all-time stats first.', '60', 'number'),

  ('retention_push_log_days', 'Push notification log — delete after (days)', 'Deletes push_notification_log rows older than this. Minimum 7 so a nudge cannot fire twice for the same day.', '30', 'number'),

  ('retention_payment_webhook_blank_days', 'Payment webhook payloads — blank after (days)', 'Empties the raw JSON body of Korapay/Paystack events (keeps the event ID for duplicate protection). Minimum 7.', '30', 'number'),
  ('retention_payment_webhook_delete_days', 'Payment webhook events — delete rows after (days)', 'Deletes the whole event row. Minimum 30. After this a replayed old event is no longer recognised by this table (the wallet reference check still protects you).', '90', 'number'),
  ('retention_vtu_webhook_blank_days', 'VTU webhook payloads — blank after (days)', 'Empties the raw JSON body of Pairgate/VTU.ng events. Minimum 7.', '30', 'number'),
  ('retention_vtu_webhook_delete_days', 'VTU webhook events — delete rows after (days)', 'Deletes the whole event row. Minimum 30.', '90', 'number'),

  ('retention_wallet_tx_days', 'Wallet transactions — archive to R2 & delete after (days)', 'Exports to R2 first, folds totals into the withdrawal rollup, then deletes from D1. Minimum 60. Never deletes pending rows.', '90', 'number'),

  ('retention_streak_checkins_days', 'Daily streak check-ins (claimed) — delete after (days)', 'Deletes claimed check-in rows. Streak state itself lives in daily_streaks and is never touched. Unclaimed rows are kept.', '90', 'number'),
  ('retention_cookie_consents_days', 'Cookie consent records — delete after (days)', 'Deletes cookie_consents rows older than this.', '180', 'number'),
  ('retention_cashback_awards_days', 'Cashback awards (claimed) — delete after (days)', 'Deletes CLAIMED cashback_awards rows. Unclaimed awards are never deleted. Lifetime cashback is read from wallets, so this is safe.', '90', 'number'),
  ('retention_weekend_bonus_days', 'Weekend bonus payout records — delete after (days)', 'Deletes weekend_bonus_payouts rows. Minimum 30 (these rows stop a period being paid twice).', '180', 'number'),
  ('retention_audit_log_days', 'Admin audit log — archive to R2 & delete after (days)', 'Exports to R2 first, then deletes. Minimum 30.', '180', 'number'),
  ('retention_order_attempts_days', 'VTU order provider-attempt logs — blank after (days)', 'Empties only the provider_attempts JSON blob on SUCCESS/REFUNDED orders. The order row itself is never deleted. Minimum 14.', '60', 'number'),
  ('retention_pin_attempts_days', 'Idle PIN-attempt rows — delete after (days)', 'Deletes pin_attempts rows with 0 failed attempts and no active lock. Rows with a lock or failures are kept.', '30', 'number'),

  ('retention_batch_size', 'Retention: rows per batch', 'How many rows each delete statement touches. Lower it if you see D1 timeouts. Range 100 to 5000.', '1000', 'number'),
  ('retention_time_budget_seconds', 'Retention: time budget per run (seconds)', 'A run stops cleanly after this long and continues on the next run. Keep under your host function timeout.', '40', 'number');
