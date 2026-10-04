-- Performance indexes for common user history and dashboard queries.
-- Safe to run once on the existing D1 database.

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_created
  ON wallet_transactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vtu_orders_user_created
  ON vtu_orders(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_created
  ON withdrawals(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_beneficiaries_user_created
  ON beneficiaries(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_beneficiaries_user_service_created
  ON beneficiaries(user_id, service_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_streak_checkins_user_created
  ON daily_streak_checkins(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fraud_flags_user_created
  ON fraud_flags(user_id, created_at DESC);

-- cashback_awards is created by an existing deployment migration rather
-- than the base schema, so this index is intentionally kept here too.
CREATE INDEX IF NOT EXISTS idx_cashback_awards_user_created
  ON cashback_awards(user_id, created_at DESC);
