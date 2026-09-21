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
  type              TEXT NOT NULL,   -- 'funding' | 'purchase' | 'refund' | 'cashback' | 'referral_bonus' | 'reseller_upgrade' | 'admin_adjustment' | 'signup_bonus' | 'weekend_bonus' | 'daily_streak' | 'deposit_bonus' | 'spin_reward'
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
  provider          TEXT NOT NULL,         -- 'pairgate' (only Pairgate delivers async today; VTUGate/ConnectBridge are synchronous)
  order_id          TEXT,                  -- our vtu_orders.id, once resolved from the reference
  event_type        TEXT NOT NULL,
  payload           TEXT NOT NULL,         -- raw JSON payload, for audit/replay
  processed_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- International airtime/data top-ups (Reloadly-backed, currently only
-- exposed by VTUGate's /international/* endpoints — ConnectBridge does
-- not offer this service today). Deliberately its own table, not a row
-- in vtu_orders: the shape is fundamentally different (country/operator/
-- FX-rate instead of network_or_biller/recipient/plan_code), and the
-- purchase flow is a multi-step sequence (detect operator -> preview FX
-- -> buy) rather than a single fallback-and-retry call.
--
-- Provider-neutral by design even though only one adapter implements it
-- today: provider_key is a normal column (not hardcoded 'vtugate' in
-- code), and which provider handles a given purchase is resolved the
-- same way as every other service — via vtu_provider_configs rows whose
-- supports_services includes 'international_topup', ordered by
-- priority. Adding a second provider later (e.g. if ConnectBridge adds
-- this) means writing its adapter + seeding its config row; this table
-- and the router logic do not change.
CREATE TABLE IF NOT EXISTS international_topup_orders (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL REFERENCES users(id),
  provider_key            TEXT NOT NULL,
  operator_id             INTEGER NOT NULL,
  operator_name           TEXT,
  country_code            TEXT NOT NULL,
  recipient_number        TEXT NOT NULL,
  requested_amount        REAL NOT NULL,
  requested_amount_currency TEXT NOT NULL,
  delivered_amount        REAL,
  delivered_amount_currency TEXT,
  charged_amount_kobo     INTEGER NOT NULL,
  provider_charge_kobo    INTEGER NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'pending',
  provider_reference      TEXT,
  provider_reference_2    TEXT,
  internal_reference      TEXT NOT NULL UNIQUE,
  failure_reason          TEXT,
  raw_response            TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_intl_topup_user ON international_topup_orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_intl_topup_reference ON international_topup_orders(internal_reference);

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
  actual_provider_cost_kobo INTEGER, -- real cost of whichever provider fulfilled THIS order (null if failed / unmapped fallback) — compare against amount_kobo for real per-order margin
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
  provider_key      TEXT PRIMARY KEY,   -- 'cheapdatahub' | 'pairgate' | 'vtpass' | 'vtung' | 'vtugate' | 'connectbridge'
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
CREATE TABLE IF NOT EXISTS pricing_policies (
  service_type          TEXT PRIMARY KEY,
  retail_fee_type       TEXT NOT NULL DEFAULT 'flat',   -- 'flat' | 'percentage'
  retail_fee_value      INTEGER NOT NULL DEFAULT 0,      -- flat: kobo. percentage: basis points
  wholesale_fee_type    TEXT NOT NULL DEFAULT 'flat',
  wholesale_fee_value   INTEGER NOT NULL DEFAULT 0,
  convenience_fee_type  TEXT NOT NULL DEFAULT 'flat',
  convenience_fee_value INTEGER NOT NULL DEFAULT 0,
  updated_by            TEXT,
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO pricing_policies (service_type) VALUES ('data');
INSERT OR IGNORE INTO pricing_policies (service_type) VALUES ('cable');
INSERT OR IGNORE INTO pricing_policies (service_type) VALUES ('electricity');
INSERT OR IGNORE INTO pricing_policies (service_type) VALUES ('airtime');
INSERT OR IGNORE INTO pricing_policies (service_type) VALUES ('exam_pin');

CREATE TABLE IF NOT EXISTS pricing_rules (
  id                TEXT PRIMARY KEY,
  service_type      TEXT NOT NULL,
  network_or_biller TEXT NOT NULL,
  plan_code         TEXT,               -- null for airtime/flat services
  retail_price_kobo INTEGER NOT NULL,
  wholesale_price_kobo INTEGER NOT NULL,
  convenience_fee_kobo INTEGER NOT NULL DEFAULT 0,
  auto_priced       INTEGER NOT NULL DEFAULT 1, -- 1 = pricingReconcile.ts owns this row; 0 = admin manually overrode it, reconcile skips it
  pricing_basis_provider_key TEXT,    -- which live provider's cost this price was built from
  pricing_basis_cost_kobo    INTEGER, -- that provider's cost at last reconcile
  cheapest_live_cost_kobo    INTEGER, -- true cheapest live cost at last reconcile (normal-case actual cost)
  worst_live_cost_kobo       INTEGER, -- priciest live provider's cost at last reconcile (true worst-case exposure)
  live_provider_count        INTEGER, -- how many live (enabled + active-mapping) providers this plan had at last reconcile
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
  provider_key        TEXT NOT NULL,           -- 'pairgate' | 'cheapdatahub' | 'vtpass' | 'vtung' | 'vtugate' | 'connectbridge'
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
  ('service_international_topup', 'International Airtime/Data', 'Allow users to send international airtime/data top-ups', 1),
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
  ('international_topup_markup_pct', 'International Top-up: Markup %', 'Percentage added on top of the provider''s wholesale NGN quote (which already includes their own fee) to get the amount charged to the user — e.g. 5 = 5%', '5', 'number'),
  ('adsense_enabled', 'Google AdSense Enabled', 'Master on/off switch for Google AdSense ad units', 'false', 'boolean'),
  ('adsense_client_id', 'Google AdSense Publisher ID', 'Your AdSense publisher ID, e.g. ca-pub-8830559839401006 (used for site verification and to load the AdSense script)', '', 'text'),
  ('adsense_homepage_footer_slot', 'AdSense Slot: Homepage Footer', 'Ad unit slot ID shown at the bottom of the homepage, above the footer', '', 'text'),
  ('adsense_blog_post_slot', 'AdSense Slot: Blog Post', 'Ad unit slot ID shown inside blog posts, below the article content', '', 'text'),
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
-- SECTION 4: SEED DATA — VTU provider configs (all 6, disabled by
-- default until admin adds real credentials and toggles them on)
-- =====================================================================

INSERT OR IGNORE INTO vtu_provider_configs (provider_key, label, is_enabled, priority, supports_services) VALUES
  ('cheapdatahub', 'CheapDataHub', 0, 1, '["airtime","data"]'),
  ('pairgate',     'Pairgate',     0, 2, '["cable","electricity","exam_pin"]'),
  ('vtpass',       'VTpass',       0, 3, '["airtime","data","cable","electricity","exam_pin","betting"]'),
  ('vtung',        'VTU.ng',       0, 4, '["airtime","data","cable","electricity"]'),
  ('vtugate',      'VTUGate',      0, 5, '["airtime","data","cable","electricity","exam_pin","international_topup"]'),
  ('connectbridge','ConnectBridge',0, 6, '["airtime","data"]');


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

-- =====================================================================
-- PUSH NOTIFICATIONS
-- Web push subscriptions, per-trigger delivery log (idempotency), and
-- the feature flags / settings that drive the re-engagement cron
-- (see app/api/cron/re-engagement/route.ts and
-- src/services/reEngagementNotifications.ts).
-- =====================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  endpoint          TEXT NOT NULL UNIQUE,
  p256dh            TEXT NOT NULL,
  auth              TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- One row per (user, trigger, day) send — the UNIQUE constraint is what
-- makes claimTriggerSlot() in reEngagementNotifications.ts safe to call
-- repeatedly: a second cron run the same day for the same user/trigger
-- fails the insert and is treated as "already sent, skip".
CREATE TABLE IF NOT EXISTS push_notification_log (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  trigger_key       TEXT NOT NULL,       -- e.g. 'streak_at_risk', 'winback_7'
  period_key        TEXT NOT NULL,       -- YYYY-MM-DD the trigger fired for
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, trigger_key, period_key)
);

CREATE INDEX IF NOT EXISTS idx_push_notification_log_user_id ON push_notification_log(user_id);

INSERT OR IGNORE INTO feature_flags (key, label, description, is_enabled) VALUES
  ('push_streak_at_risk', 'Streak At Risk', 'Notify users whose daily streak will lapse if they don''t check in today.', 1),
  ('push_unclaimed_reward', 'Unclaimed Reward', 'Notify users who have an unclaimed cashback, referral, or streak reward.', 1),
  ('push_wallet_idle', 'Idle Wallet Balance', 'Notify users with a funded wallet who haven''t made a purchase in a while.', 1),
  ('push_weekend_bonus_live', 'Weekend Bonus Live', 'Notify users the moment their weekend bonus is credited.', 1),
  ('push_referral_nudge', 'Referral Nudge', 'Nudge users who have a referral code but haven''t referred anyone yet.', 1),
  ('push_inactivity_winback', 'Inactivity Win-Back', 'Notify users who have gone quiet (7/14/30 days) with a comeback message.', 1);

INSERT OR IGNORE INTO site_settings (key, label, description, value, value_type) VALUES
  ('push_unclaimed_reward_min_age_days', 'Unclaimed Reward Min Age (days)', 'How many days a reward must sit unclaimed before we nudge about it.', '3', 'number'),
  ('push_wallet_idle_min_balance_kobo', 'Idle Wallet Min Balance (kobo)', 'Minimum wallet balance (in kobo) to qualify for the idle-wallet nudge.', '50000', 'number'),
  ('push_wallet_idle_days', 'Idle Wallet Inactivity Window (days)', 'Days with no purchase before a funded wallet is considered idle.', '5', 'number'),
  ('vapid_contact_email', 'VAPID Contact Email', 'Contact email sent to push services (mailto:) alongside VAPID keys.', 'support@zamoraxpay.com', 'text');


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
