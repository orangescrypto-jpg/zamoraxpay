-- =====================================================================
-- ZamoraxPay D1 — Full Schema (single file)
-- =====================================================================
-- Everything lives in ONE file: table definitions AND default seed data
-- (feature flags, provider configs, legal page content). Run this once
-- against a fresh D1 database to get a fully working instance:
--
--   wrangler d1 execute ZAMORAXPAY_DB --file=migrations/schema.sql --remote
--
-- If you need to change the schema later, edit this file directly and
-- re-apply the relevant CREATE/INSERT statements (all CREATE statements
-- use IF NOT EXISTS and seed inserts use INSERT OR IGNORE, so re-running
-- this whole file against an existing database is safe).
--
-- This database is entirely separate from Zamorax Marketplace's D1 —
-- no shared tables, no cross-database queries. The only conceptual link
-- is that both use a Supabase UUID as their user identifier convention,
-- but ZamoraxPay uses its OWN Supabase project, so these are independent
-- identity spaces unless a user is manually cross-verified.
--
-- EXCEPTION TO THE "safe to re-run" NOTE ABOVE: adding a column to an
-- existing table is NOT covered by CREATE TABLE IF NOT EXISTS (SQLite
-- only creates it once). If vtu_orders already exists in your deployed
-- D1 and you're picking up the new delivered_data column, run this
-- ONE-TIME statement yourself first (safe to run even if it's already
-- there — D1/SQLite will error harmlessly on a duplicate column, which
-- you can ignore):
--
--   ALTER TABLE vtu_orders ADD COLUMN delivered_data TEXT;
--
-- Same applies to the new vtu_webhook_events table added alongside
-- delivered_data — CREATE TABLE IF NOT EXISTS only takes effect on a
-- database that doesn't already have vtu_orders et al.; on an existing
-- deployed D1, run the CREATE TABLE statement for vtu_webhook_events
-- (copy it from this file) by hand once.
-- =====================================================================


-- =====================================================================
-- SECTION 1: CORE TABLES
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
  id                    TEXT PRIMARY KEY,           -- Supabase auth user UUID
  phone                 TEXT NOT NULL UNIQUE,
  email                 TEXT NOT NULL UNIQUE,
  full_name             TEXT,
  transaction_pin_hash  TEXT,                       -- hashed 4-digit PIN, null until set
  tier                  TEXT NOT NULL DEFAULT 'retail', -- 'retail' | 'reseller'
  status                TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'suspended' | 'frozen'
  referral_code         TEXT UNIQUE,
  referred_by_user_id   TEXT REFERENCES users(id),
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);

CREATE TABLE IF NOT EXISTS wallets (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL UNIQUE REFERENCES users(id),
  balance_kobo      INTEGER NOT NULL DEFAULT 0,      -- TOTAL spendable balance (funded + cashback + referral, all spend the same way)
  cashback_kobo     INTEGER NOT NULL DEFAULT 0,      -- lifetime cashback earned (informational, NOT withdrawable — spend-only)
  funded_withdrawable_kobo   INTEGER NOT NULL DEFAULT 0, -- portion of balance_kobo that came from deposits — withdrawable
  referral_withdrawable_kobo INTEGER NOT NULL DEFAULT 0, -- portion of balance_kobo that came from referral bonuses — withdrawable
  low_balance_alert_threshold_kobo INTEGER NOT NULL DEFAULT 50000, -- ₦500 default
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  type              TEXT NOT NULL,   -- 'funding' | 'purchase' | 'refund' | 'cashback' | 'referral_bonus' | 'reseller_upgrade' | 'admin_adjustment' | 'signup_bonus' | 'weekend_bonus' | 'daily_streak' | 'deposit_bonus'
  direction         TEXT NOT NULL,   -- 'credit' | 'debit'
  amount_kobo       INTEGER NOT NULL,
  balance_after_kobo INTEGER NOT NULL,
  reference         TEXT NOT NULL UNIQUE,   -- our internal reference
  provider_reference TEXT,                   -- Korapay/Paystack/VTU provider reference
  related_order_id  TEXT,                    -- links to vtu_orders.id when applicable
  status            TEXT NOT NULL DEFAULT 'completed', -- 'pending' | 'completed' | 'failed' | 'reversed'
  metadata          TEXT,             -- JSON blob for extra context
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_reference ON wallet_transactions(reference);

-- Records which bank account a user funded their wallet FROM. Captured
-- from the Korapay/Paystack webhook payload when available. This is
-- the guardrail source of truth for withdrawals: a withdrawal's
-- destination account must match an account that appears here for
-- that user — you can only withdraw to a bank account you've actually
-- funded from before.
CREATE TABLE IF NOT EXISTS funding_source_accounts (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  account_number    TEXT NOT NULL,
  account_name      TEXT,
  bank_name         TEXT,
  bank_code         TEXT,
  provider          TEXT NOT NULL,     -- 'korapay' | 'paystack'
  first_seen_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_funding_source_user ON funding_source_accounts(user_id, account_number);

-- Withdrawal requests. Only 'funded' and 'referral_bonus' wallet
-- balance is withdrawable (tracked via wallet_transactions.type, not
-- a separate balance column) — cashback is spend-only and never
-- reaches this table. See src/services/withdrawals.ts for the
-- eligible-balance calculation.
CREATE TABLE IF NOT EXISTS withdrawals (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id),
  amount_kobo           INTEGER NOT NULL,
  fee_kobo              INTEGER NOT NULL DEFAULT 0,
  net_amount_kobo       INTEGER NOT NULL,
  bank_name             TEXT NOT NULL,
  account_number        TEXT NOT NULL,
  account_name          TEXT NOT NULL,
  bank_code             TEXT,
  matched_funding_source_id TEXT REFERENCES funding_source_accounts(id), -- proof the guardrail was satisfied
  payout_method         TEXT,           -- 'manual' | 'korapay' | 'paystack' — set when admin processes it
  provider_transfer_reference TEXT,     -- Korapay/Paystack transfer reference, if automated
  proof_url             TEXT,           -- admin-uploaded proof of manual transfer
  status                TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'paid' | 'rejected' | 'failed'
  rejection_reason      TEXT,
  processed_by          TEXT,           -- admin user id
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at          TEXT
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

-- Idempotency ledger for Korapay/Paystack webhooks. Every incoming
-- webhook event ID is recorded here BEFORE processing; if it already
-- exists, the handler short-circuits and returns success without
-- reprocessing (prevents double wallet credit on provider retries).
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id                TEXT PRIMARY KEY,      -- provider's event/transaction ID
  provider          TEXT NOT NULL,         -- 'korapay' | 'paystack'
  event_type        TEXT NOT NULL,
  payload           TEXT NOT NULL,         -- raw JSON payload, for audit/replay
  processed_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vtu_webhook_events (
  id                TEXT PRIMARY KEY,      -- provider's event/transaction ID (idempotency key)
  provider          TEXT NOT NULL,         -- 'pairgate' (only Pairgate delivers async today)
  order_id          TEXT,                  -- our vtu_orders.id, once resolved from the reference
  event_type        TEXT NOT NULL,
  payload           TEXT NOT NULL,         -- raw JSON payload, for audit/replay
  processed_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vtu_orders (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  service_type      TEXT NOT NULL,   -- 'airtime' | 'data' | 'cable' | 'electricity' | 'exam_pin' | 'betting'
  network_or_biller TEXT NOT NULL,   -- e.g. 'MTN', 'DSTV', 'IKEDC', 'WAEC', 'BET9JA'
  recipient         TEXT NOT NULL,   -- phone / meter / smartcard / betting account ID
  plan_code         TEXT,            -- data bundle code / cable package code, if applicable
  amount_kobo       INTEGER NOT NULL,        -- amount charged to user (incl. convenience fee)
  base_amount_kobo  INTEGER NOT NULL,        -- provider cost before fee/margin
  convenience_fee_kobo INTEGER NOT NULL DEFAULT 0,
  pricing_tier      TEXT NOT NULL DEFAULT 'retail', -- tier active at time of purchase
  provider_used     TEXT,            -- which VTU adapter actually fulfilled it
  provider_attempts TEXT,            -- JSON array log of every provider tried + result
  provider_reference TEXT,
  delivered_data    TEXT,            -- JSON: provider-issued data the customer must be shown/kept
                                      -- (exam PIN + serial, electricity token, etc). NULL if the
                                      -- service type has none, or if delivery is async (webhook)
                                      -- and hasn't arrived yet.
  status            TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'success' | 'failed' | 'refunded'
  failure_reason    TEXT,
  is_auto_reload    INTEGER NOT NULL DEFAULT 0,
  auto_reload_rule_id TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vtu_orders_user ON vtu_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_vtu_orders_status ON vtu_orders(status);

CREATE TABLE IF NOT EXISTS beneficiaries (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  service_type      TEXT NOT NULL,
  network_or_biller TEXT NOT NULL,
  recipient         TEXT NOT NULL,
  nickname          TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_beneficiaries_user ON beneficiaries(user_id);

CREATE TABLE IF NOT EXISTS auto_reload_rules (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  beneficiary_id    TEXT NOT NULL REFERENCES beneficiaries(id),
  service_type      TEXT NOT NULL,
  plan_code         TEXT,
  amount_kobo       INTEGER NOT NULL,
  frequency         TEXT NOT NULL,    -- 'daily' | 'weekly' | 'monthly'
  next_run_at       TEXT NOT NULL,
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auto_reload_next_run ON auto_reload_rules(next_run_at, is_active);

-- Bulk purchase — a user saves a named group of phone numbers once,
-- then reuses it to buy airtime/data for everyone in the group in a
-- single flow, instead of re-entering numbers every time.
CREATE TABLE IF NOT EXISTS contact_batches (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  name              TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contact_batches_user ON contact_batches(user_id);

CREATE TABLE IF NOT EXISTS contact_batch_numbers (
  id                TEXT PRIMARY KEY,
  batch_id          TEXT NOT NULL REFERENCES contact_batches(id),
  phone             TEXT NOT NULL,        -- normalized 11-digit local format (0XXXXXXXXXX)
  label             TEXT,                 -- optional per-number nickname
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contact_batch_numbers_batch ON contact_batch_numbers(batch_id);

-- One row per bulk purchase run — a parent record tying together the
-- individual vtu_orders rows created for each number in the batch, so
-- history/receipts can show "Bulk data — Family Group — 12 numbers"
-- as one entry instead of 12 unrelated orders.
CREATE TABLE IF NOT EXISTS bulk_purchase_runs (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  batch_id          TEXT REFERENCES contact_batches(id), -- NULL if the batch was later deleted
  batch_name_snapshot TEXT NOT NULL, -- captured at run time, survives batch deletion
  service_type      TEXT NOT NULL,   -- 'airtime' | 'data'
  network_or_biller TEXT,            -- data: the single network the whole run was bought on (plans are per-network); NULL for airtime, which auto-detects per number
  plan_code         TEXT,            -- data plan code (airtime runs leave this NULL)
  amount_kobo       INTEGER,         -- per-recipient airtime amount (NULL for data, which uses plan price)
  total_numbers     INTEGER NOT NULL,
  success_count     INTEGER NOT NULL DEFAULT 0,
  failure_count     INTEGER NOT NULL DEFAULT 0,
  total_charged_kobo INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'processing', -- 'processing' | 'completed' | 'completed_with_errors'
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bulk_purchase_runs_user ON bulk_purchase_runs(user_id);

-- Links each per-number result back to its parent run and to the
-- underlying vtu_orders row (when one was created — a pre-flight
-- validation failure, e.g. bad phone number, never reaches vtuOrders).
CREATE TABLE IF NOT EXISTS bulk_purchase_items (
  id                TEXT PRIMARY KEY,
  run_id            TEXT NOT NULL REFERENCES bulk_purchase_runs(id),
  phone             TEXT NOT NULL,
  detected_network  TEXT,             -- network auto-detected for this number, if applicable
  order_id          TEXT REFERENCES vtu_orders(id), -- NULL if it failed before an order could be created
  status            TEXT NOT NULL,    -- 'success' | 'failed'
  failure_reason    TEXT,
  charged_kobo      INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bulk_purchase_items_run ON bulk_purchase_items(run_id);

-- BVN confirmation — in-platform, independent of Zamorax Marketplace.
-- Sensitive fields never stored raw; only a masked reference + result.
CREATE TABLE IF NOT EXISTS reseller_bvn_verifications (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL UNIQUE REFERENCES users(id),
  bvn_masked        TEXT NOT NULL,     -- e.g. '***_****_1234' — never store full BVN in plaintext
  provider_used     TEXT NOT NULL DEFAULT 'stub', -- 'stub' | actual provider name once configured
  status            TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'verified' | 'failed'
  verified_at       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS referrals (
  id                    TEXT PRIMARY KEY,
  referrer_user_id      TEXT NOT NULL REFERENCES users(id),
  referred_user_id      TEXT NOT NULL UNIQUE REFERENCES users(id),
  bonus_awarded         INTEGER NOT NULL DEFAULT 0,
  bonus_kobo            INTEGER NOT NULL DEFAULT 0,
  awarded_at            TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every bank account/card a user has successfully FUNDED their wallet
-- FROM, captured off the Korapay/Paystack webhook payload at funding
-- time. This is the whitelist withdrawal requests are checked against:
-- a user may only withdraw to an account that appears here. We store
-- what each provider actually gives us — for card funding that's
-- typically last4 + bank; for bank-transfer funding it can be a full
-- account number. Never store full card numbers or CVV (Paystack/
-- Korapay never send us those either).
CREATE TABLE IF NOT EXISTS funding_sources (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  provider          TEXT NOT NULL,       -- 'korapay' | 'paystack'
  method            TEXT NOT NULL,       -- 'card' | 'bank_transfer' | 'account'
  bank_name         TEXT,
  account_number_last4 TEXT,             -- last 4 digits only, never the full number
  account_name      TEXT,                -- name on the account, if the provider returns it
  provider_reference TEXT,               -- the funding transaction that first proved this source
  first_used_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_funding_sources_user ON funding_sources(user_id);

-- Withdrawal requests. Admin reviews and approves/rejects; payout is
-- either manual (admin sends the transfer by hand and marks paid) or
-- automated via Korapay/Paystack Transfer API, chosen per-request by
-- whichever mode the admin has enabled platform-wide.
CREATE TABLE IF NOT EXISTS withdrawals (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  source_type       TEXT NOT NULL,       -- 'funded' | 'referral_bonus' — which wallet bucket this draws from
  amount_kobo       INTEGER NOT NULL,
  fee_kobo          INTEGER NOT NULL DEFAULT 0,
  net_amount_kobo   INTEGER NOT NULL,    -- amount_kobo - fee_kobo, what actually gets paid out
  bank_name         TEXT NOT NULL,
  account_number    TEXT NOT NULL,
  account_name      TEXT NOT NULL,
  bank_code         TEXT,
  matched_funding_source_id TEXT REFERENCES funding_sources(id), -- proof this account was verified as a real deposit source
  status            TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'paid' | 'rejected'
  payout_method     TEXT,                 -- 'manual' | 'korapay' | 'paystack' — set when approved
  provider_transfer_reference TEXT,
  proof_url         TEXT,                 -- admin-uploaded proof for manual payouts
  rejection_reason  TEXT,
  reviewed_by       TEXT,
  reviewed_at       TEXT,
  paid_at           TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);


-- =====================================================================
-- SECTION 2: ADMIN-CONTROLLED CONFIGURATION TABLES
-- Feature flags, provider toggles/priority, pricing, banners, pages —
-- everything an admin can change at runtime with no redeploy.
-- =====================================================================

CREATE TABLE IF NOT EXISTS feature_flags (
  key               TEXT PRIMARY KEY,   -- e.g. 'auto_reload', 'cashback', 'referral_program'
  label             TEXT NOT NULL,      -- human-readable name for the admin panel
  description       TEXT,
  is_enabled        INTEGER NOT NULL DEFAULT 1,
  updated_by        TEXT,               -- admin user id
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Generic admin-editable key-value settings — for numeric/text config
-- that isn't a simple on/off flag (feature_flags is for booleans; this
-- is for values like "how many posts to show on the homepage").
-- value_type tells the admin UI how to render/parse the input.
CREATE TABLE IF NOT EXISTS site_settings (
  key               TEXT PRIMARY KEY,
  label             TEXT NOT NULL,
  description       TEXT,
  value             TEXT NOT NULL,
  value_type        TEXT NOT NULL DEFAULT 'number', -- 'number' | 'text' | 'boolean'
  updated_by        TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Admin-controlled enable/disable + priority order + credentials for
-- each of the 4 VTU adapters. Credentials here OVERRIDE env vars when
-- present, so admin can rotate/add keys without a redeploy.
CREATE TABLE IF NOT EXISTS vtu_provider_configs (
  provider_key      TEXT PRIMARY KEY,   -- 'cheapdatahub' | 'pairgate' | 'vtpass' | 'vtung'
  label             TEXT NOT NULL,
  is_enabled        INTEGER NOT NULL DEFAULT 0,
  priority          INTEGER NOT NULL DEFAULT 99,  -- lower = tried first
  credentials_json  TEXT,               -- JSON blob of API keys, set via admin panel
  supports_services TEXT NOT NULL,      -- JSON array, e.g. '["airtime","data"]'
  last_health_check_at TEXT,
  last_health_status TEXT,              -- 'healthy' | 'degraded' | 'down' | 'unknown'
  success_rate_pct  REAL,
  updated_by        TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payment_provider_configs (
  provider_key      TEXT PRIMARY KEY,   -- 'korapay' | 'paystack'
  label             TEXT NOT NULL,
  is_enabled        INTEGER NOT NULL DEFAULT 0,
  priority          INTEGER NOT NULL DEFAULT 99,
  credentials_json  TEXT,
  updated_by        TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Admin-editable retail/wholesale pricing per network/service, so
-- margins can be adjusted without a code deploy.
CREATE TABLE IF NOT EXISTS pricing_rules (
  id                TEXT PRIMARY KEY,
  service_type      TEXT NOT NULL,
  network_or_biller TEXT NOT NULL,
  plan_code         TEXT,               -- null for airtime/flat services
  retail_price_kobo INTEGER NOT NULL,
  wholesale_price_kobo INTEGER NOT NULL,
  convenience_fee_kobo INTEGER NOT NULL DEFAULT 0,
  is_active         INTEGER NOT NULL DEFAULT 1,
  updated_by        TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pricing_service ON pricing_rules(service_type, network_or_biller);

-- Maps ONE of our own retail plans (a pricing_rules row, identified by
-- service_type + network_or_biller + plan_code) to the SAME real-world
-- plan as offered by one or more VTU providers, each with that
-- provider's own plan_id/variation_id and provider-side cost.
--
-- This is what lets the router pick the cheapest provider for a given
-- plan instead of always trying providers in a fixed priority order:
-- e.g. our "MTN 200MB / 1 Day" plan might be Pairgate's plan_id "12"
-- costing ₦92, and CheapDataHub's bundle_id "45" costing ₦100 — the
-- router asks this table for all provider-side options mapped to our
-- plan, sorted by provider_cost_kobo ascending, and tries the
-- cheapest ENABLED provider first, falling through to the next
-- cheapest on failure (still sequential — never parallel).
CREATE TABLE IF NOT EXISTS provider_plan_mappings (
  id                  TEXT PRIMARY KEY,
  service_type        TEXT NOT NULL,          -- 'data' | 'cable' (any plan-coded service)
  network_or_biller   TEXT NOT NULL,           -- 'MTN', 'DSTV', ... — matches pricing_rules
  plan_code           TEXT NOT NULL,           -- OUR plan code — matches pricing_rules.plan_code
  provider_key        TEXT NOT NULL,           -- 'pairgate' | 'cheapdatahub' | 'vtpass' | 'vtung'
  provider_plan_id    TEXT NOT NULL,           -- that provider's own plan_id / variation_id / bundle_id
  provider_cost_kobo  INTEGER NOT NULL,        -- what THIS provider charges us for this plan
  provider_plan_label TEXT,                    -- optional human-readable label from the provider (for admin display/debugging)
  is_active           INTEGER NOT NULL DEFAULT 1,
  updated_by          TEXT,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(service_type, network_or_biller, plan_code, provider_key)
);

CREATE INDEX IF NOT EXISTS idx_provider_plan_lookup
  ON provider_plan_mappings(service_type, network_or_biller, plan_code, is_active);

-- Header (auto+manual slider) and footer promotional banners,
-- including Zamorax Marketplace cross-promotion and any other ads.
CREATE TABLE IF NOT EXISTS banners (
  id                TEXT PRIMARY KEY,
  placement         TEXT NOT NULL,      -- 'header_slider' | 'footer'
  title             TEXT,
  image_url         TEXT NOT NULL,
  link_url          TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  is_active         INTEGER NOT NULL DEFAULT 1,
  starts_at         TEXT,
  ends_at           TEXT,
  created_by        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_banners_placement ON banners(placement, is_active, sort_order);

-- Admin-editable content for legal/static pages. Seeded below with
-- real content at launch, but every field stays editable afterward
-- from the Admin Panel.
CREATE TABLE IF NOT EXISTS site_pages (
  slug              TEXT PRIMARY KEY,   -- 'privacy-policy' | 'terms' | 'cookie-policy' | 'about' | 'contact' | 'refund-policy'
  title             TEXT NOT NULL,
  content_markdown  TEXT NOT NULL,
  meta_description  TEXT,
  updated_by        TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Records each visitor's cookie consent choice (compliance auditing).
-- Not tied to user_id since consent can happen pre-signup.
CREATE TABLE IF NOT EXISTS cookie_consents (
  id                TEXT PRIMARY KEY,
  anonymous_id      TEXT NOT NULL,      -- client-generated ID, stored in a cookie
  user_id           TEXT REFERENCES users(id),
  choice            TEXT NOT NULL,      -- 'accepted_all' | 'rejected_non_essential' | 'custom'
  categories_json   TEXT,               -- which categories were accepted, if 'custom'
  ip_address        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Blog categories — admin-manageable, referenced by blog_posts.category
-- (by slug, kept as free text on blog_posts for simplicity, not a
-- foreign key, so a category can be renamed/removed without touching
-- existing posts).
CREATE TABLE IF NOT EXISTS blog_categories (
  slug              TEXT PRIMARY KEY,
  label             TEXT NOT NULL,
  description       TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Blog — SEO content + Marketplace cross-promotion articles.
-- Admin-authored, admin-editable, publicly readable when published.
CREATE TABLE IF NOT EXISTS blog_posts (
  id                TEXT PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  excerpt           TEXT,
  content_markdown  TEXT NOT NULL,
  cover_image_url   TEXT,
  category          TEXT,             -- e.g. 'guides', 'announcements', 'promotions'
  status            TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'published'
  author_name       TEXT,
  meta_description  TEXT,
  published_at      TEXT,
  created_by        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status, published_at);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);

-- Separate from `users` (customers). Role-based access for the panel.
CREATE TABLE IF NOT EXISTS admin_users (
  id                TEXT PRIMARY KEY,    -- Supabase auth user UUID (same project, elevated role)
  email             TEXT NOT NULL UNIQUE,
  role              TEXT NOT NULL DEFAULT 'admin', -- 'super_admin' | 'admin' | 'moderator'
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fraud_flags (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  related_transaction_id TEXT,
  reason            TEXT NOT NULL,       -- 'rapid_repeated_topup' | 'chargeback' | 'manual_review'
  status            TEXT NOT NULL DEFAULT 'open', -- 'open' | 'reviewed' | 'wallet_frozen' | 'dismissed'
  notes             TEXT,
  reviewed_by       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_fraud_flags_status ON fraud_flags(status);

-- Every admin action that changes config (flags, pricing, providers,
-- banners, pages) is logged here for accountability.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id                TEXT PRIMARY KEY,
  admin_user_id     TEXT NOT NULL,
  action            TEXT NOT NULL,       -- e.g. 'feature_flag.toggle', 'pricing_rule.update'
  target_table      TEXT,
  target_id         TEXT,
  before_json       TEXT,
  after_json        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON admin_audit_log(admin_user_id, created_at);


-- =====================================================================
-- SECTION 3: SEED DATA — default feature flags
-- =====================================================================

INSERT OR IGNORE INTO feature_flags (key, label, description, is_enabled) VALUES
  ('service_airtime',      'Airtime Purchase',        'Allow users to buy airtime',                          1),
  ('service_data',         'Data Purchase',           'Allow users to buy data bundles',                     1),
  ('service_cable',        'Cable TV Subscription',   'Allow users to pay for DSTV/GOtv/StarTimes',          1),
  ('service_electricity',  'Electricity Tokens',      'Allow users to buy prepaid/postpaid electricity',     1),
  ('service_exam_pin',     'Exam PINs',               'Allow users to buy WAEC/NECO/JAMB PINs',              1),
  ('service_betting',      'Betting Wallet Funding',  'Allow users to fund sportsbook wallets',              1),
  ('auto_reload',          'Auto-Reload',             'Allow users to schedule recurring purchases',         1),
  ('cashback',             'Cashback Rewards',        'Credit a % of each successful purchase back to wallet', 1),
  ('deposit_bonus',        'Deposit Bonus',           'Credit a bonus to wallet when a user funds their wallet', 1),
  ('referral_program',     'Referral Program',        'Reward users for referring new signups',              1),
  ('reseller_upgrade',     'Reseller/Wholesale Upgrade', 'Allow users to upgrade to wholesale pricing tier', 1),
  ('bvn_verification',     'BVN Verification',        'Require BVN confirmation for higher reseller limits', 1),
  ('low_balance_alerts',   'Low Balance Alerts',      'Notify users when wallet balance is low',             1),
  ('marketplace_cross_promo', 'Marketplace Cross-Promotion', 'Show banners/prompts promoting Zamorax Marketplace', 1),
  ('airtime_to_cash', 'Airtime to Cash', 'Show the Airtime to Cash info page (off-platform exchange — no wallet transaction)', 1);


-- =====================================================================
-- SECTION 3b: SEED DATA — default site settings (numeric/text config)
-- =====================================================================

INSERT OR IGNORE INTO site_settings (key, label, description, value, value_type) VALUES
  ('homepage_post_count', 'Homepage: Latest Posts to Show', 'How many latest blog posts appear on the homepage', '6', 'number'),
  ('related_post_count',  'Blog: Related Posts to Show', 'How many related posts appear at the bottom of a blog post', '4', 'number'),
  ('cashback_enabled',    'Cashback Enabled', 'Master on/off switch for cashback (also gated by the cashback feature flag)', 'true', 'boolean'),
  ('cashback_min_amount_kobo', 'Cashback: Minimum Purchase Amount', 'Minimum purchase amount (in kobo) required to earn cashback — e.g. 50000 = ₦500', '50000', 'number'),
  ('cashback_type', 'Cashback: Calculation Type', 'Either "percentage" or "flat" — which of the two values below is used', 'percentage', 'text'),
  ('cashback_percentage', 'Cashback: Percentage Rate', 'Percentage of the purchase amount credited back as cashback, when cashback_type is "percentage" (e.g. 2 = 2%)', '2', 'number'),
  ('cashback_flat_amount_kobo', 'Cashback: Flat Amount', 'Flat kobo amount credited back as cashback, when cashback_type is "flat" (e.g. 10000 = ₦100 flat)', '10000', 'number'),
  ('cashback_max_amount_kobo', 'Cashback: Maximum Cap Per Purchase', 'Upper limit on cashback earned from a single purchase, in kobo — prevents runaway percentage cashback on large purchases (0 = no cap)', '50000', 'number'),
  ('deposit_bonus_enabled', 'Deposit Bonus Enabled', 'Master on/off switch for deposit bonus (also gated by the deposit_bonus feature flag)', 'false', 'boolean'),
  ('deposit_bonus_min_amount_kobo', 'Deposit Bonus: Minimum Deposit Amount', 'Minimum wallet funding amount (in kobo) required to earn a deposit bonus', '0', 'number'),
  ('deposit_bonus_type', 'Deposit Bonus: Calculation Type', 'Either "percentage" or "flat" — which of the two values below is used', 'percentage', 'text'),
  ('deposit_bonus_percentage', 'Deposit Bonus: Percentage Rate', 'Percentage of the deposit amount credited as a bonus, when deposit_bonus_type is "percentage" (e.g. 2 = 2%)', '0', 'number'),
  ('deposit_bonus_flat_amount_kobo', 'Deposit Bonus: Flat Amount', 'Flat kobo amount credited as a bonus, when deposit_bonus_type is "flat"', '0', 'number'),
  ('deposit_bonus_max_amount_kobo', 'Deposit Bonus: Maximum Cap Per Deposit', 'Upper limit on the bonus earned from a single deposit, in kobo (0 = no cap)', '0', 'number'),
  ('withdrawal_min_amount_kobo', 'Withdrawal: Minimum Amount', 'Minimum amount a user can request to withdraw, in kobo (e.g. 100000 = ₦1,000)', '100000', 'number'),
  ('withdrawal_fee_kobo', 'Withdrawal: Flat Fee', 'Flat fee deducted from every withdrawal payout, in kobo', '5000', 'number'),
  ('withdrawal_payout_method', 'Withdrawal: Payout Method', 'Either "manual" (admin sends transfer by hand) or "automatic" (admin approval triggers a Korapay/Paystack transfer)', 'manual', 'text'),
  ('referral_bonus_amount_kobo', 'Referral: Bonus Amount', 'Amount credited to both the referrer and the new user when a referral''s first purchase completes, in kobo', '20000', 'number'),
  ('reseller_upgrade_fee_kobo', 'Reseller: Upgrade Fee', 'One-time fee deducted from a user''s wallet when they upgrade from retail to reseller tier, in kobo (e.g. 300000 = ₦3,000)', '300000', 'number'),
  ('airtime_to_cash_discount_percent', 'Airtime to Cash: Discount %', 'Percentage of airtime face value the user is paid in cash, shown on the info page (e.g. 80 = 80%)', '80', 'number'),
  ('airtime_to_cash_contact_phone', 'Airtime to Cash: Contact Phone', 'Phone/WhatsApp number shown to users on the Airtime to Cash page — the exchange happens off-platform via this contact', '', 'text'),
  ('airtime_to_cash_contact_email', 'Airtime to Cash: Contact Email', 'Email address shown to users on the Airtime to Cash page — the exchange happens off-platform via this contact', '', 'text');


-- =====================================================================
-- SECTION 3c: SEED DATA — blog categories
-- =====================================================================

INSERT OR IGNORE INTO blog_categories (slug, label, description, sort_order) VALUES
  ('guides',        'Guides',        'How-to articles — checking exam results, choosing data plans, paying bills',  1),
  ('announcements', 'Announcements', 'Product updates, new features, and platform news',                             2),
  ('promotions',    'Promotions',    'Discounts, cashback campaigns, and limited-time offers',                       3),
  ('network-news',  'Network News',  'Airtime/data price changes, network outages, and provider updates',            4),
  ('reseller-tips', 'Reseller Tips', 'Advice for wholesale resellers on margins, volume, and growing their business', 5);


-- =====================================================================
-- SECTION 4: SEED DATA — VTU provider configs (all 4, disabled by
-- default until admin adds real credentials and toggles them on)
-- =====================================================================

INSERT OR IGNORE INTO vtu_provider_configs (provider_key, label, is_enabled, priority, supports_services) VALUES
  ('cheapdatahub', 'CheapDataHub', 0, 1, '["airtime","data"]'),
  ('pairgate',     'Pairgate',     0, 2, '["cable","electricity","exam_pin"]'),
  ('vtpass',       'VTpass',       0, 3, '["airtime","data","cable","electricity","exam_pin","betting"]'),
  ('vtung',        'VTU.ng',       0, 4, '["airtime","data","cable","electricity"]');


-- =====================================================================
-- SECTION 5: SEED DATA — Payment provider configs
-- =====================================================================

INSERT OR IGNORE INTO payment_provider_configs (provider_key, label, is_enabled, priority) VALUES
  ('korapay',  'Korapay (bank transfer / virtual account)', 0, 1),
  ('paystack', 'Paystack (card fallback)',                  0, 2);


-- =====================================================================
-- SECTION 6: SEED DATA — Legal & informational pages
-- Real, complete starting content — not placeholder text. Every word
-- remains editable from the Admin Panel afterward.
-- =====================================================================

INSERT OR IGNORE INTO site_pages (slug, title, content_markdown, meta_description) VALUES
(
  'privacy-policy',
  'Privacy Policy',
  '# Privacy Policy

**Last updated:** [DATE]

ZamoraxPay ("we", "us", "our") provides an online platform for purchasing airtime, data, cable TV subscriptions, electricity tokens, exam PINs, and sportsbook wallet funding within Nigeria. This Privacy Policy explains what personal information we collect, how we use it, and the choices you have.

## 1. Information We Collect

- **Account information:** phone number, email address, and full name provided at signup.
- **Transaction information:** service purchases, wallet funding history, recipient phone/meter/smartcard numbers you enter, and payment references.
- **Identity verification information (resellers only):** if you choose to upgrade to a reseller account, we collect a Bank Verification Number (BVN) solely to confirm your identity and unlock wholesale pricing limits. We store only a masked reference and verification result — we do not retain your full BVN in plain text.
- **Device and usage information:** IP address, browser type, and general usage patterns, collected automatically to help secure your account and improve the service.
- **Cookies:** see our separate Cookie Policy for details on cookies and similar technologies.

## 2. How We Use Your Information

We use your information to: create and manage your account; process airtime, data, bill, and other purchases; fund and maintain your wallet balance; detect and prevent fraud; communicate with you about your transactions; and improve our services.

## 3. How We Share Information

We share information only where necessary to operate the service:

- **Payment processors** (Korapay, Paystack) to process wallet funding.
- **VTU and billing aggregators** to fulfill airtime, data, cable, electricity, exam PIN, and betting wallet purchases.
- **Email service providers** (Resend) to send transactional emails and receipts.
- We do not sell your personal information to third parties.

## 4. Data Retention

We retain account and transaction records for as long as your account is active and for a reasonable period afterward to meet legal, accounting, and fraud-prevention obligations.

## 5. Your Rights

You may request access to, correction of, or deletion of your personal information, subject to our legal and regulatory recordkeeping obligations, by contacting us using the details on our Contact page.

## 6. Security

We apply reasonable technical and organizational measures to protect your information, including encrypted transmission (HTTPS/SSL) and restricted internal access to sensitive data.

## 7. Changes to This Policy

We may update this Privacy Policy from time to time. Material changes will be reflected with an updated "Last updated" date above.

## 8. Contact Us

If you have questions about this Privacy Policy, please reach out via our Contact page.',
  'How ZamoraxPay collects, uses, and protects your personal information.'
),
(
  'terms',
  'Terms & Conditions',
  '# Terms & Conditions

**Last updated:** [DATE]

Welcome to ZamoraxPay. By creating an account or using our platform, you agree to these Terms & Conditions.

## 1. The Service

ZamoraxPay is an online platform for purchasing airtime, data bundles, cable TV subscriptions, electricity tokens, examination PINs, and sportsbook wallet funding, using a prepaid wallet system.

## 2. Eligibility & Account Registration

You must provide accurate registration information and keep your login credentials and transaction PIN confidential. You are responsible for all activity carried out under your account.

## 3. Wallet & Funding

You may fund your wallet via supported payment processors (currently Korapay and Paystack). A flat payment gateway charge may apply to wallet funding transactions, shown to you before you confirm payment. Wallet balances are non-transferable to other users and, unless otherwise stated, non-refundable to your bank account except where required by law or at our discretion.

## 4. Purchases

All purchase requests (airtime, data, bills, PINs, betting wallet funding) are subject to successful fulfillment by our upstream service providers. If a purchase fails after all available providers have been attempted, the amount debited for that purchase will be refunded to your wallet automatically.

## 5. Reseller / Wholesale Tier

Users may apply to upgrade to a reseller tier for wholesale pricing, subject to payment of the applicable upgrade fee and, where required, identity verification (BVN confirmation). We reserve the right to set, and to change, wholesale pricing, limits, and verification requirements at our discretion.

## 6. Prohibited Use

You agree not to use ZamoraxPay for any unlawful purpose, to commit fraud, to circumvent our fraud-prevention measures, or to use another person''s payment instrument without authorization.

## 7. Fees

Applicable convenience fees for utility, cable, and other bill payments are disclosed to you before you confirm each transaction.

## 8. Suspension & Termination

We may suspend or terminate an account that we reasonably believe is involved in fraud, abuse, or a violation of these Terms.

## 9. Limitation of Liability

To the fullest extent permitted by law, ZamoraxPay is not liable for delays or failures caused by third-party payment processors, VTU/billing aggregators, network operators, or events outside our reasonable control.

## 10. Changes to These Terms

We may update these Terms from time to time. Continued use of ZamoraxPay after changes take effect constitutes acceptance of the revised Terms.

## 11. Governing Law

These Terms are governed by the laws of the Federal Republic of Nigeria.

## 12. Contact Us

Questions about these Terms can be directed to us via our Contact page.',
  'The terms and conditions governing use of the ZamoraxPay platform.'
),
(
  'cookie-policy',
  'Cookie Policy',
  '# Cookie Policy

**Last updated:** [DATE]

This Cookie Policy explains how ZamoraxPay uses cookies and similar technologies when you visit our website.

## 1. What Are Cookies

Cookies are small text files stored on your device that help websites function and remember information about your visit.

## 2. Types of Cookies We Use

- **Essential cookies:** required for core functionality such as keeping you logged in and maintaining your session. These cannot be disabled.
- **Preference cookies:** remember settings such as your cookie consent choice.
- **Analytics cookies:** help us understand how the platform is used so we can improve it.

## 3. Your Choices

When you first visit ZamoraxPay, you will be shown a cookie consent notice where you can accept all cookies, reject non-essential cookies, or customize your preferences. You can update your choice at any time via the cookie settings link in the footer.

## 4. Third-Party Cookies

Some cookies may be set by third-party services we use, such as payment processors, for fraud prevention and transaction processing purposes.

## 5. Changes to This Policy

We may update this Cookie Policy from time to time. Material changes will be reflected with an updated "Last updated" date above.

## 6. Contact Us

Questions about our use of cookies can be directed to us via our Contact page.',
  'How ZamoraxPay uses cookies and how you can manage your preferences.'
),
(
  'about',
  'About ZamoraxPay',
  '# About ZamoraxPay

ZamoraxPay is a fast, reliable platform for everyday digital payments in Nigeria — airtime, data, cable TV, electricity tokens, exam PINs, and sportsbook wallet funding, all from a single wallet.

## Our Approach

We route every transaction through multiple independent service providers, automatically falling back to the next available provider if one is delayed or unavailable — so your purchase goes through even when a single provider has an outage.

## Part of the Zamorax Family

ZamoraxPay operates alongside Zamorax Marketplace, a peer-to-peer marketplace and escrow platform for higher-value transactions such as rentals and classified sales. The two platforms are operated independently but share the same commitment to reliability and fair pricing.',
  'Learn more about ZamoraxPay and how our platform works.'
),
(
  'contact',
  'Contact Us',
  '# Contact Us

We''re here to help with any questions about your account, a transaction, or our services.

## Support

For transaction issues, wallet questions, or general support, please reach out through the support channel listed in your account dashboard, or email our support team.

## Business Enquiries

For partnership, reseller, or business enquiries, please use the contact details provided on this page once configured by our team.

*[Admin: replace this section with your actual support email, phone number, and/or contact form.]*',
  'Get in touch with the ZamoraxPay support team.'
),
(
  'refund-policy',
  'Refund Policy',
  '# Refund Policy

**Last updated:** [DATE]

## 1. Automatic Refunds

If a purchase (airtime, data, cable, electricity, exam PIN, or betting wallet funding) fails after all available service providers have been attempted, the amount charged for that purchase is automatically refunded to your ZamoraxPay wallet. No manual request is needed in this case.

## 2. Wallet Funding

Wallet funding payments are generally non-refundable to your original payment method once your wallet has been credited, since the funds become part of your spendable wallet balance. If you believe you were charged in error, please contact support with your transaction reference.

## 3. Reseller Upgrade Fees

The one-time reseller/wholesale upgrade fee is non-refundable once your account has been upgraded to the reseller tier.

## 4. Disputed Transactions

If you believe a completed purchase was not fulfilled correctly (e.g. data not received despite a "successful" status), contact support with your transaction reference so we can investigate with the relevant service provider.

## 5. Contact Us

For any refund-related question, please reach out via our Contact page with your transaction reference number.',
  'How refunds are handled for failed transactions and wallet funding on ZamoraxPay.'
);


-- =====================================================================
-- SECTION 7: SEED DATA — Starter blog posts
-- =====================================================================

INSERT OR IGNORE INTO blog_posts (id, slug, title, excerpt, content_markdown, category, status, author_name, meta_description, published_at) VALUES
(
  'seed-blog-001',
  'welcome-to-zamoraxpay',
  'Welcome to ZamoraxPay',
  'Airtime, data, bills, and more — all from one fast, reliable wallet.',
  '# Welcome to ZamoraxPay

We built ZamoraxPay to solve one simple frustration: VTU purchases that fail when you need them most. Our platform routes every transaction through multiple independent providers, so if one is slow or down, your purchase still goes through.

## What you can do on ZamoraxPay

- Buy airtime and data for all major Nigerian networks
- Pay DSTV, GOtv, and StarTimes subscriptions
- Recharge prepaid or pay postpaid electricity bills
- Buy WAEC, NECO, and JAMB result checker PINs
- Fund your sportsbook wallet

## Also check out Zamorax Marketplace

If you are looking to buy or sell higher-value items safely, check out Zamorax Marketplace, our escrow-protected peer-to-peer marketplace for classifieds and rentals.',
  'announcements',
  'published',
  'The ZamoraxPay Team',
  'An introduction to ZamoraxPay and everything you can do on the platform.',
  datetime('now')
),
(
  'seed-blog-002',
  'how-to-check-waec-result-with-pin',
  'How to Check Your WAEC Result With a Scratch Card PIN',
  'A simple step-by-step guide to checking your WAEC result online.',
  '# How to Check Your WAEC Result With a Scratch Card PIN

Checking your WAEC result is simple once you have a valid result checker PIN.

## Step 1: Buy a WAEC PIN

Buy your WAEC result checker PIN on the Exam PINs page on ZamoraxPay. Your PIN and serial number will be delivered to your dashboard immediately after a successful purchase.

## Step 2: Visit the WAEC result checker portal

Go to the official WAEC result checker website and enter your examination number, examination year, and the PIN/serial number you purchased.

## Step 3: View and save your result

Once submitted, your result will display on screen. We recommend taking a screenshot or downloading a copy for your records, as checker PINs are typically limited to a small number of uses.',
  'guides',
  'published',
  'The ZamoraxPay Team',
  'Step-by-step guide to checking your WAEC result using a result checker PIN.',
  datetime('now')
);
