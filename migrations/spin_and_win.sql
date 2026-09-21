-- =====================================================================
-- SPIN & WIN — spin tickets, per-source prize tables, spin log, prize
-- vouchers / discount coupons, streak shields and loyalty-tier bonuses.
--
-- Every knob here is admin-editable from /admin/spin with no redeploy.
-- All timestamps in these tables are UTC, stored as 'YYYY-MM-DD HH:MM:SS'
-- (same shape as datetime('now')) so string comparison is always safe.
-- Safe to run more than once (IF NOT EXISTS / INSERT OR IGNORE).
-- =====================================================================

-- The daily-streak tables were used by src/services/dailyStreak.ts but
-- were never in this file. Added here (IF NOT EXISTS, so a live database
-- that already has them is untouched).
CREATE TABLE IF NOT EXISTS daily_streaks (
  user_id            TEXT PRIMARY KEY REFERENCES users(id),
  current_streak     INTEGER NOT NULL DEFAULT 0,
  last_checkin_date  TEXT,
  grace_used_on_date TEXT,
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_streak_checkins (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  period_key  TEXT NOT NULL,            -- YYYY-MM-DD (UTC)
  streak_day  INTEGER NOT NULL,
  amount_kobo INTEGER NOT NULL,
  claimed     INTEGER NOT NULL DEFAULT 0,
  claimed_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, period_key)
);

CREATE TABLE IF NOT EXISTS daily_streak_tiers (
  id               TEXT PRIMARY KEY,
  day_from         INTEGER NOT NULL,
  day_to           INTEGER,             -- NULL = open-ended
  base_amount_kobo INTEGER NOT NULL,
  step_amount_kobo INTEGER NOT NULL DEFAULT 0,
  is_active        INTEGER NOT NULL DEFAULT 1,
  updated_by       TEXT,
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per ticket source. config_json holds the source-specific knobs
-- (milestone days, minimum amounts, weekdays...) — see spinConfig.ts.
CREATE TABLE IF NOT EXISTS spin_sources (
  source_key             TEXT PRIMARY KEY,   -- 'streak_milestone' | 'anytime' | 'purchase' | 'deposit' | 'referral' | 'first_purchase_of_day' | 'spend_milestone' | 'weekend' | 'admin_gift'
  label                  TEXT NOT NULL,
  description            TEXT,
  is_enabled             INTEGER NOT NULL DEFAULT 0,
  starts_at              TEXT,               -- optional availability window (UTC)
  ends_at                TEXT,
  tickets_per_award      INTEGER NOT NULL DEFAULT 1,
  spins_per_day          INTEGER NOT NULL DEFAULT 1, -- max tickets one user can receive from this source per UTC day (0 = unlimited; lazy daily sources treat 0 as 1)
  expiry_mode            TEXT NOT NULL DEFAULT 'end_of_day', -- 'end_of_day' (UTC) | 'hours'
  expiry_hours           INTEGER NOT NULL DEFAULT 24,
  daily_budget_kobo      INTEGER NOT NULL DEFAULT 0, -- max total prize cost per UTC day for this source (0 = no cap)
  guarantee_after_losses INTEGER NOT NULL DEFAULT 0, -- after N losses in a row the next spin is guaranteed a small win (0 = off)
  config_json            TEXT NOT NULL DEFAULT '{}',
  updated_by             TEXT,
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A separate prize table per source (streak spins can pay more than the
-- free daily spin). weight = relative chance; cost_kobo = what a win costs
-- us, used for the daily budget cap and the expected-cost readout.
CREATE TABLE IF NOT EXISTS spin_prizes (
  id                         TEXT PRIMARY KEY,
  source_key                 TEXT NOT NULL REFERENCES spin_sources(source_key),
  label                      TEXT NOT NULL,
  prize_type                 TEXT NOT NULL, -- 'nothing' | 'wallet_credit' | 'discount' | 'airtime_voucher' | 'data_voucher' | 'streak_protection'
  amount_kobo                INTEGER NOT NULL DEFAULT 0, -- wallet_credit value / airtime voucher face value
  discount_percent           INTEGER NOT NULL DEFAULT 0,
  max_discount_kobo          INTEGER NOT NULL DEFAULT 0,
  discount_services          TEXT,          -- comma list; NULL = every service except betting
  discount_min_purchase_kobo INTEGER NOT NULL DEFAULT 0,
  voucher_network            TEXT,          -- data voucher: network; airtime voucher: optional locked network
  voucher_plan_code          TEXT,          -- data voucher: pricing_rules plan_code
  token_count                INTEGER NOT NULL DEFAULT 0, -- streak_protection: free missed days granted
  reward_valid_days          INTEGER NOT NULL DEFAULT 7, -- how long a voucher/coupon stays usable after winning
  weight                     INTEGER NOT NULL DEFAULT 1,
  cost_kobo                  INTEGER NOT NULL DEFAULT 0,
  max_wins_per_day           INTEGER NOT NULL DEFAULT 0, -- jackpot cap (0 = unlimited)
  max_wins_per_week          INTEGER NOT NULL DEFAULT 0, -- rolling 7 days (0 = unlimited)
  is_guarantee_prize         INTEGER NOT NULL DEFAULT 0,
  is_jackpot                 INTEGER NOT NULL DEFAULT 0,
  color                      TEXT,
  sort_order                 INTEGER NOT NULL DEFAULT 0,
  is_active                  INTEGER NOT NULL DEFAULT 1,
  updated_by                 TEXT,
  created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                 TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_spin_prizes_source ON spin_prizes(source_key, is_active);

-- One row per ticket. issue_key is the idempotency key (e.g.
-- 'purchase:<orderId>#0'): re-running a hook can never mint a second ticket.
CREATE TABLE IF NOT EXISTS spin_tickets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  source_key TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'available', -- 'available' | 'used' | 'expired'
  issue_key  TEXT NOT NULL UNIQUE,
  day_key    TEXT NOT NULL,          -- UTC day it was issued (YYYY-MM-DD)
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_spin_tickets_user ON spin_tickets(user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_spin_tickets_source_day ON spin_tickets(user_id, source_key, day_key);

-- One row per spin. UNIQUE(ticket_id) means a ticket can never be spun twice.
CREATE TABLE IF NOT EXISTS spin_spins (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  ticket_id         TEXT NOT NULL UNIQUE,
  source_key        TEXT NOT NULL,
  prize_id          TEXT,
  prize_label       TEXT NOT NULL,
  prize_type        TEXT NOT NULL,
  prize_amount_kobo INTEGER NOT NULL DEFAULT 0,
  cost_kobo         INTEGER NOT NULL DEFAULT 0,
  was_guarantee     INTEGER NOT NULL DEFAULT 0,
  fulfilled         INTEGER NOT NULL DEFAULT 0, -- 1 once the prize has been credited / voucher created
  prize_snapshot    TEXT,                        -- prize settings at the moment of the spin (later edits never change a past win)
  ip_hash           TEXT,
  device_hash       TEXT,
  day_key           TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_spin_spins_user_day ON spin_spins(user_id, day_key);
CREATE INDEX IF NOT EXISTS idx_spin_spins_prize ON spin_spins(prize_id, day_key);
CREATE INDEX IF NOT EXISTS idx_spin_spins_source_day ON spin_spins(source_key, day_key);
CREATE INDEX IF NOT EXISTS idx_spin_spins_device ON spin_spins(device_hash, day_key);
CREATE INDEX IF NOT EXISTS idx_spin_spins_created ON spin_spins(created_at);

-- Prizes that are not wallet credit: free airtime / data vouchers and
-- next-purchase discount coupons. Never withdrawable, never spendable
-- on anything except what they are for.
CREATE TABLE IF NOT EXISTS spin_vouchers (
  id                TEXT PRIMARY KEY,           -- 'v-<spinId>' (deterministic = idempotent)
  user_id           TEXT NOT NULL REFERENCES users(id),
  spin_id           TEXT NOT NULL,
  kind              TEXT NOT NULL,              -- 'airtime' | 'data' | 'discount'
  label             TEXT NOT NULL,
  value_kobo        INTEGER NOT NULL DEFAULT 0, -- airtime face value
  network           TEXT,
  plan_code         TEXT,
  discount_percent  INTEGER NOT NULL DEFAULT 0,
  max_discount_kobo INTEGER NOT NULL DEFAULT 0,
  discount_services TEXT,
  min_purchase_kobo INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'active', -- 'active' | 'used' | 'expired'
  expires_at        TEXT NOT NULL,
  used_at           TEXT,
  used_order_id     TEXT,
  recipient         TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_spin_vouchers_user ON spin_vouchers(user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_spin_vouchers_order ON spin_vouchers(used_order_id);

-- Consecutive non-wins per user per source, for "guaranteed prize after N spins".
CREATE TABLE IF NOT EXISTS spin_loss_streaks (
  user_id            TEXT NOT NULL,
  source_key         TEXT NOT NULL,
  consecutive_losses INTEGER NOT NULL DEFAULT 0,
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, source_key)
);

-- Free missed days won from the spin. One shield forgives one missed day
-- on the daily check-in streak.
CREATE TABLE IF NOT EXISTS streak_protections (
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  tokens     INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Loyalty-tier bonus: extra tickets and/or better odds for a tier.
-- tier_key matches users.tier today ('retail' | 'reseller') and any
-- future loyalty tier key. source_key '*' = every source.
CREATE TABLE IF NOT EXISTS spin_tier_bonuses (
  tier_key             TEXT NOT NULL,
  source_key           TEXT NOT NULL,
  extra_tickets        INTEGER NOT NULL DEFAULT 0,
  weight_boost_percent INTEGER NOT NULL DEFAULT 0, -- raises the weight of every real prize by this % (nothing stays put)
  is_active            INTEGER NOT NULL DEFAULT 1,
  updated_by           TEXT,
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tier_key, source_key)
);

-- Seed data (defaults are deliberately small; edit everything in /admin/spin)

INSERT OR IGNORE INTO feature_flags (key, label, description, is_enabled) VALUES
  ('spin', 'Spin & Win', 'Master switch for spin tickets, the spin wheel and spin prizes.', 1);

INSERT OR IGNORE INTO spin_sources
  (source_key, label, description, is_enabled, starts_at, ends_at, tickets_per_award, spins_per_day, expiry_mode, expiry_hours, daily_budget_kobo, guarantee_after_losses, config_json) VALUES
  ('streak_milestone', 'Streak milestone', 'Bonus spin when a user reaches a milestone day on their daily check-in streak.', 1, NULL, NULL, 1, 1, 'end_of_day', 24, 500000, 5, '{"milestone_days":"7","milestone_interval":0}'),
  ('anytime', 'Anytime spin (daily free spin)', 'A free spin every day with no purchase or streak needed. Reappears the next day while switched on.', 0, NULL, NULL, 1, 1, 'end_of_day', 24, 200000, 8, '{}'),
  ('purchase', 'Purchase spin', 'A spin for each successful purchase at or above the minimum amount.', 0, NULL, NULL, 1, 2, 'end_of_day', 24, 300000, 6, '{"min_amount_kobo":100000}'),
  ('deposit', 'Deposit spin', 'A spin when a user funds their wallet at or above the minimum amount.', 0, NULL, NULL, 1, 1, 'end_of_day', 24, 200000, 6, '{"min_amount_kobo":200000}'),
  ('referral', 'Referral spin', 'A spin for the referrer when the person they referred completes a first purchase.', 0, NULL, NULL, 1, 3, 'end_of_day', 24, 300000, 0, '{}'),
  ('first_purchase_of_day', 'First purchase of the day', 'One spin for the first qualifying purchase each day.', 0, NULL, NULL, 1, 1, 'end_of_day', 24, 200000, 6, '{"min_amount_kobo":50000}'),
  ('spend_milestone', 'Monthly spend milestone', 'A spin each time a user''s spending this month reaches one of the targets you set.', 0, NULL, NULL, 1, 3, 'end_of_day', 24, 300000, 0, '{"targets_kobo":"2000000,5000000"}'),
  ('weekend', 'Weekend spin', 'A free daily spin that only appears on the days you choose (default Saturday and Sunday).', 0, NULL, NULL, 1, 1, 'end_of_day', 24, 200000, 8, '{"active_weekdays":"Saturday,Sunday"}'),
  ('admin_gift', 'Admin gift tickets', 'Tickets you send by hand to one user, a tier, or everyone (competitions, apologies, promos).', 1, NULL, NULL, 1, 0, 'hours', 24, 0, 0, '{}');

-- Default prizes are seeded ONCE (guarded by the spin_prizes_seeded marker below) so a prize you delete
-- in /admin/spin stays deleted even if this file is run again.
INSERT OR IGNORE INTO spin_prizes
  (id, source_key, label, prize_type, amount_kobo, discount_percent, max_discount_kobo, discount_services, discount_min_purchase_kobo, voucher_network, voucher_plan_code, token_count, reward_valid_days, weight, cost_kobo, max_wins_per_day, max_wins_per_week, is_guarantee_prize, is_jackpot, color, sort_order)
SELECT * FROM (VALUES
  ('seed-streak_milestone-1', 'streak_milestone', 'Better luck next time', 'nothing', 0, 0, 0, NULL, 0, NULL, NULL, 0, 7, 40, 0, 0, 0, 0, 0, '#0F1E4D', 1),
  ('seed-streak_milestone-2', 'streak_milestone', '₦20 credit', 'wallet_credit', 2000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 30, 2000, 0, 0, 1, 0, '#2563EB', 2),
  ('seed-streak_milestone-3', 'streak_milestone', '₦50 credit', 'wallet_credit', 5000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 15, 5000, 0, 0, 0, 0, '#7C3AED', 3),
  ('seed-streak_milestone-4', 'streak_milestone', '₦100 credit', 'wallet_credit', 10000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 8, 10000, 0, 0, 0, 0, '#0891B2', 4),
  ('seed-streak_milestone-5', 'streak_milestone', '5% off next purchase', 'discount', 0, 5, 5000, NULL, 0, NULL, NULL, 0, 7, 6, 5000, 0, 0, 0, 0, '#059669', 5),
  ('seed-streak_milestone-6', 'streak_milestone', '₦500 JACKPOT', 'wallet_credit', 50000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 1, 50000, 1, 0, 0, 1, '#D97706', 6),
  ('seed-anytime-1', 'anytime', 'Better luck next time', 'nothing', 0, 0, 0, NULL, 0, NULL, NULL, 0, 7, 60, 0, 0, 0, 0, 0, '#0F1E4D', 1),
  ('seed-anytime-2', 'anytime', '₦10 credit', 'wallet_credit', 1000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 28, 1000, 0, 0, 1, 0, '#2563EB', 2),
  ('seed-anytime-3', 'anytime', '₦20 credit', 'wallet_credit', 2000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 10, 2000, 0, 0, 0, 0, '#7C3AED', 3),
  ('seed-anytime-4', 'anytime', '₦50 credit', 'wallet_credit', 5000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 2, 5000, 5, 0, 0, 0, '#0891B2', 4),
  ('seed-purchase-1', 'purchase', 'Better luck next time', 'nothing', 0, 0, 0, NULL, 0, NULL, NULL, 0, 7, 55, 0, 0, 0, 0, 0, '#0F1E4D', 1),
  ('seed-purchase-2', 'purchase', '₦10 credit', 'wallet_credit', 1000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 30, 1000, 0, 0, 1, 0, '#2563EB', 2),
  ('seed-purchase-3', 'purchase', '₦30 credit', 'wallet_credit', 3000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 12, 3000, 0, 0, 0, 0, '#7C3AED', 3),
  ('seed-purchase-4', 'purchase', '₦100 credit', 'wallet_credit', 10000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 3, 10000, 3, 0, 0, 0, '#0891B2', 4),
  ('seed-deposit-1', 'deposit', 'Better luck next time', 'nothing', 0, 0, 0, NULL, 0, NULL, NULL, 0, 7, 50, 0, 0, 0, 0, 0, '#0F1E4D', 1),
  ('seed-deposit-2', 'deposit', '₦20 credit', 'wallet_credit', 2000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 32, 2000, 0, 0, 1, 0, '#2563EB', 2),
  ('seed-deposit-3', 'deposit', '₦50 credit', 'wallet_credit', 5000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 14, 5000, 0, 0, 0, 0, '#7C3AED', 3),
  ('seed-deposit-4', 'deposit', '₦200 credit', 'wallet_credit', 20000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 4, 20000, 2, 0, 0, 0, '#0891B2', 4),
  ('seed-referral-1', 'referral', 'Better luck next time', 'nothing', 0, 0, 0, NULL, 0, NULL, NULL, 0, 7, 30, 0, 0, 0, 0, 0, '#0F1E4D', 1),
  ('seed-referral-2', 'referral', '₦50 credit', 'wallet_credit', 5000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 40, 5000, 0, 0, 1, 0, '#2563EB', 2),
  ('seed-referral-3', 'referral', '₦100 credit', 'wallet_credit', 10000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 22, 10000, 0, 0, 0, 0, '#7C3AED', 3),
  ('seed-referral-4', 'referral', '₦300 credit', 'wallet_credit', 30000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 8, 30000, 3, 0, 0, 0, '#0891B2', 4),
  ('seed-first_purchase_of_day-1', 'first_purchase_of_day', 'Better luck next time', 'nothing', 0, 0, 0, NULL, 0, NULL, NULL, 0, 7, 50, 0, 0, 0, 0, 0, '#0F1E4D', 1),
  ('seed-first_purchase_of_day-2', 'first_purchase_of_day', '₦10 credit', 'wallet_credit', 1000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 34, 1000, 0, 0, 1, 0, '#2563EB', 2),
  ('seed-first_purchase_of_day-3', 'first_purchase_of_day', '₦30 credit', 'wallet_credit', 3000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 14, 3000, 0, 0, 0, 0, '#7C3AED', 3),
  ('seed-first_purchase_of_day-4', 'first_purchase_of_day', '₦100 credit', 'wallet_credit', 10000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 2, 10000, 3, 0, 0, 0, '#0891B2', 4),
  ('seed-spend_milestone-1', 'spend_milestone', 'Better luck next time', 'nothing', 0, 0, 0, NULL, 0, NULL, NULL, 0, 7, 20, 0, 0, 0, 0, 0, '#0F1E4D', 1),
  ('seed-spend_milestone-2', 'spend_milestone', '₦50 credit', 'wallet_credit', 5000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 40, 5000, 0, 0, 1, 0, '#2563EB', 2),
  ('seed-spend_milestone-3', 'spend_milestone', '₦100 credit', 'wallet_credit', 10000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 25, 10000, 0, 0, 0, 0, '#7C3AED', 3),
  ('seed-spend_milestone-4', 'spend_milestone', '₦200 credit', 'wallet_credit', 20000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 12, 20000, 0, 0, 0, 0, '#0891B2', 4),
  ('seed-spend_milestone-5', 'spend_milestone', '₦500 JACKPOT', 'wallet_credit', 50000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 3, 50000, 0, 5, 0, 1, '#059669', 5),
  ('seed-weekend-1', 'weekend', 'Better luck next time', 'nothing', 0, 0, 0, NULL, 0, NULL, NULL, 0, 7, 45, 0, 0, 0, 0, 0, '#0F1E4D', 1),
  ('seed-weekend-2', 'weekend', '₦10 credit', 'wallet_credit', 1000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 30, 1000, 0, 0, 1, 0, '#2563EB', 2),
  ('seed-weekend-3', 'weekend', '₦25 credit', 'wallet_credit', 2500, 0, 0, NULL, 0, NULL, NULL, 0, 7, 18, 2500, 0, 0, 0, 0, '#7C3AED', 3),
  ('seed-weekend-4', 'weekend', '₦100 credit', 'wallet_credit', 10000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 6, 10000, 0, 0, 0, 0, '#0891B2', 4),
  ('seed-weekend-5', 'weekend', '₦200 credit', 'wallet_credit', 20000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 1, 20000, 3, 0, 0, 1, '#059669', 5),
  ('seed-admin_gift-1', 'admin_gift', 'Better luck next time', 'nothing', 0, 0, 0, NULL, 0, NULL, NULL, 0, 7, 10, 0, 0, 0, 0, 0, '#0F1E4D', 1),
  ('seed-admin_gift-2', 'admin_gift', '₦20 credit', 'wallet_credit', 2000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 40, 2000, 0, 0, 1, 0, '#2563EB', 2),
  ('seed-admin_gift-3', 'admin_gift', '₦50 credit', 'wallet_credit', 5000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 30, 5000, 0, 0, 0, 0, '#7C3AED', 3),
  ('seed-admin_gift-4', 'admin_gift', '₦100 credit', 'wallet_credit', 10000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 15, 10000, 0, 0, 0, 0, '#0891B2', 4),
  ('seed-admin_gift-5', 'admin_gift', '₦200 credit', 'wallet_credit', 20000, 0, 0, NULL, 0, NULL, NULL, 0, 7, 5, 20000, 0, 0, 0, 0, '#059669', 5)
)
WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE key = 'spin_prizes_seeded');

INSERT OR IGNORE INTO site_settings (key, label, description, value, value_type) VALUES
  ('spin_prizes_seeded', 'Spin default prizes seeded', 'Internal marker: default spin prizes were inserted once. Do not edit.', 'true', 'text');

INSERT OR IGNORE INTO site_settings (key, label, description, value, value_type) VALUES
  ('spin_popup_enabled', 'Spin popup on dashboard', 'Show the spin popup as soon as a user with a ticket opens the dashboard. The inline card below the banner always shows regardless.', 'true', 'boolean'),
  ('spin_global_daily_cap_per_user', 'Max spins per user per day (all sources)', 'Anti-abuse cap across every source. 0 = no cap.', '5', 'number'),
  ('spin_global_daily_budget_kobo', 'Global daily prize budget (kobo)', 'Total prize cost allowed per UTC day across every source. 0 = no cap.', '0', 'number'),
  ('spin_max_accounts_per_device_per_day', 'Max accounts spinning from one device per day', 'Blocks ticket farming from one device. 0 = off.', '10', 'number'),
  ('spin_max_spins_per_ip_per_day', 'Max spins per IP address per day', 'Blocks farming from one IP. 0 = off (note: mobile networks share IPs, keep generous).', '0', 'number'),
  ('spin_winner_feed_enabled', 'Show winner announcements', 'Show ''A user just won ...'' messages (names masked) on the dashboard.', 'true', 'boolean'),
  ('spin_winner_feed_min_kobo', 'Winner feed minimum prize (kobo)', 'Only prizes worth at least this much appear in the winner feed.', '10000', 'number'),
  ('spin_winner_feed_limit', 'Winner feed size', 'How many recent winners to show.', '10', 'number'),
  ('spin_push_ticket_earned', 'Push when a spin is earned', 'Send a push notification the moment a user earns a spin ticket.', 'true', 'boolean'),
  ('spin_push_expiry_nudge', 'Push before a ticket expires', 'Remind users who still hold an unused spin close to its expiry.', 'true', 'boolean'),
  ('spin_push_expiry_window_hours', 'Expiry reminder window (hours)', 'Send the reminder when a ticket will expire within this many hours.', '3', 'number'),
  ('spin_push_anytime_ready', 'Push daily free spin reminder', 'Remind subscribed users each day that their anytime/weekend spin is ready.', 'false', 'boolean');
