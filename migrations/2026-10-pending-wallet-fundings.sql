-- Reconciliation safety net for wallet funding.
--
-- Problem: a user can initialize a funding payment, leave Korapay's
-- checkout tab (close it, background the app, or just never return)
-- before Korapay's page redirects back to /wallet?funding=complete.
-- When that happens, nothing on our side ever learns the payment
-- succeeded except the Korapay webhook — the client-side verify-on-
-- return flow in app/(dashboard)/wallet/page.tsx only runs when the
-- user actually lands back on that URL with the right query params.
-- If the webhook is ever delayed, dropped, or misconfigured (as it
-- was before the Korapay webhook signature fix), the user is paid but
-- never credited, with no way to self-recover.
--
-- Fix: record every funding attempt here at initialization time (not
-- just on success), so a normal /wallet page load (no query params at
-- all) can look up the user's own unresolved references and actively
-- re-verify them against Korapay/Paystack — independent of both the
-- webhook and the redirect-based flow.
CREATE TABLE IF NOT EXISTS pending_wallet_fundings (
  reference         TEXT PRIMARY KEY,      -- our internal reference, e.g. ZPWF-<uuid>
  user_id           TEXT NOT NULL REFERENCES users(id),
  provider          TEXT NOT NULL,         -- 'korapay' | 'paystack'
  amount_kobo       INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'resolved' | 'abandoned'
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_wallet_fundings_user
  ON pending_wallet_fundings(user_id, status);
