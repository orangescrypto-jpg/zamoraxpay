# ZamoraxPay

VTU and bills-payment platform (airtime, data, cable TV, electricity, exam PINs, betting wallet funding) built with Next.js 16, Supabase (own project, separate from Zamorax Marketplace), and Cloudflare D1 (own database, separate from Zamorax Marketplace).

## Getting started

```bash
npm install
cp .env.local.example .env.local
# fill in .env.local with your own values — see comments in that file
npm run dev
```

## Setting up your database

1. Create a new Cloudflare D1 database (separate from any Zamorax Marketplace database):
   ```bash
   wrangler d1 create zamoraxpay-db
   ```
2. Copy the resulting `database_id` into `CF_D1_DATABASE_ID` in `.env.local`.
3. Apply the schema (single file — tables + seed data):
   ```bash
   wrangler d1 execute zamoraxpay-db --file=migrations/schema.sql --remote
   ```

## Setting up Supabase

Create a **new, separate Supabase project** for ZamoraxPay (do not reuse a Zamorax Marketplace project — this app intentionally uses a lighter, faster signup flow than Marketplace's verification-heavy one). Copy the project URL and anon key into `.env.local`.

**Email verification** is controlled entirely by Supabase's own project setting — Authentication > Settings > "Confirm email" — not by any code in this app. Turn it on and Supabase emails users a confirmation link before they can log in; turn it off and accounts are usable immediately after signup. There is no phone OTP step anywhere in this app — phone number is collected as a plain profile field only, never verified.

## Setting up providers (VTU, payment, email)

All provider credentials can be set two ways:

1. **Environment variables** (`.env.local` / your host's env settings) — see `.env.local.example` for every key.
2. **Admin Panel** (`/admin/providers`) — set or rotate keys at runtime with no redeploy. Admin-panel credentials take priority over env vars when both are present.

Ship with all VTU providers (CheapDataHub, Pairgate, VTpass, VTU.ng) and both payment providers (Korapay, Paystack) **disabled by default** — enable each one from the Admin Panel once you have real credentials for it, in whatever priority order you want the fallback chain to try them.

### Sharing one Paystack/Korapay account with Zamorax Marketplace

If ZamoraxPay uses the **same** Paystack/Korapay merchant account as Zamorax Marketplace (same API keys), two things follow:

- **Use the same secret key and webhook secret** on both apps' env vars / admin-panel credential fields — a shared account has one set of keys, not one per site.
- **Register a separate webhook URL for each app** in the Paystack/Korapay dashboard (`https://zamoraxpay.com.ng/api/wallet/webhooks/paystack` in addition to Marketplace's own webhook URL) — most gateways support multiple webhook endpoints per account, and each app should only receive its own copy of every event.
- Every ZamoraxPay transaction is tagged with `metadata.site = NEXT_PUBLIC_SITE_TAG` (defaults to `zamoraxpay.com.ng`) — this lets you filter transactions by platform in the Paystack/Korapay dashboard, and both webhook handlers check this tag before crediting any wallet, so a Marketplace event landing on ZamoraxPay's webhook (or the reverse) is safely ignored instead of mis-processed. Keep `NEXT_PUBLIC_SITE_TAG` set to the same value everywhere and make sure it doesn't collide with whatever tag (if any) Marketplace uses.

## Creating your first admin user

The `admin_users` table is empty by default — no one has admin access out of the box. After creating a normal user account (via signup), promote it manually:

```bash
wrangler d1 execute zamoraxpay-db --remote --command \
  "INSERT INTO admin_users (id, email, role) VALUES ('<supabase-user-uuid>', 'you@example.com', 'super_admin')"
```

`super_admin` can edit provider credentials; `admin` can do everything else (feature flags, pricing, banners, pages, blog, users, fraud review).

## Deployment

This app is intentionally **not locked to any one host** — no Vercel-only APIs are used anywhere. It runs on:

- **Vercel** — standard Next.js deploy, D1 is reached over Cloudflare's HTTP API (`lib/d1.ts` handles this automatically when no native binding is present).
- **Cloudflare Pages/Workers** — D1 can be bound natively for lower latency; pass the binding as the optional `nativeDB` parameter to any service function if you wire up `next-on-pages` or a custom adapter.
- **Any other Node host** — same HTTP API path as Vercel.

## Auto-reload cron

Auto-reload rules need an external scheduler hitting `/api/cron/auto-reload` periodically (hourly is reasonable). Protect it with `CRON_SECRET`. Examples:

- **Vercel Cron** — add to `vercel.json`:
  ```json
  { "crons": [{ "path": "/api/cron/auto-reload", "schedule": "0 * * * *" }] }
  ```
- **Cloudflare Cron Trigger** — configure in `wrangler.toml` to fetch the URL hourly.
- **Any other host** — point any external cron service (GitHub Actions scheduled workflow, cron-job.org, etc.) at the URL with the `Authorization: Bearer <CRON_SECRET>` header.

## Project structure

- `app/` — Next.js App Router pages and API routes, grouped by route group: `(public)`, `(auth)`, `(dashboard)`, `(admin)`.
- `src/services/` — the service abstraction layer. Routes and components never call a database, VTU provider, payment gateway, or email vendor directly — everything goes through a file here.
- `src/services/providers/` — concrete implementations behind each service's interface (Supabase for auth, 4 VTU adapters, 2 payment adapters, Resend for email). Swapping any of these later means editing one file, not hunting through the app.
- `lib/` — low-level, provider-agnostic helpers (D1 query helper, retry-with-backoff fetch wrapper, R2 file storage, auth-server guards, utils).
- `migrations/schema.sql` — the entire database schema and seed data in one file.
- `components/` — UI components, organized by feature area (admin, auth, wallet, services, layout, legal, shared).

## Notes

- Wallet balances are stored in **kobo** (integer) throughout, to avoid floating-point rounding errors. Divide by 100 for display naira amounts — `lib/utils.ts` has a `formatNaira()` helper for this.
- The VTU fallback router (`src/services/vtuRouter.ts`) tries enabled providers **sequentially** in admin-configured priority order — never in parallel — to avoid double-charging float capital on two providers for one purchase.
- BVN verification ships as a stub (`src/services/bvnVerification.ts`) that accepts any well-formed 11-digit number — replace it with a real KYC provider once you have reseller volume that justifies the cost, without touching the reseller-upgrade route.
- The blog and legal-page editors are deliberately plain Markdown textareas with a preview tab — not a rich-text/WYSIWYG editor.
- **Staff roles**: moderator (view users, suspend/reactivate, review fraud, view transactions), admin (+ feature flags, pricing, banners, pages, blog, provider enable/priority, withdrawal approval), super_admin (+ provider credentials, permanent user deletion, staff management). See `/admin/staff`.
- **Cashback** is spend-only — never withdrawable. **Referral bonuses** and **deposited/funded balance** ARE withdrawable. This split is enforced in `src/services/withdrawals.ts` by computing eligible balance from the wallet ledger (funding + referral_bonus credits, minus all debits), not from a separate stored balance.
- **Withdrawal guardrail**: a user can only withdraw to a bank account they've previously funded their wallet from. This is tracked in `funding_source_accounts`, populated automatically from Korapay/Paystack webhook payloads when those payloads expose the paying customer's bank details (not all payment channels do — e.g. card payments typically don't).
- **Withdrawal payout** is admin's choice per request: mark as paid manually (optionally attaching proof), or send automatically via Korapay or Paystack's Transfer API (admin picks which provider account has Transfers enabled). The site-wide `withdrawal_payout_method` setting is just a default suggestion shown in the admin UI — either mode is available on every request regardless.
- All admin-tunable numeric/text settings (homepage post count, related post count, cashback rules, withdrawal minimum/fee, referral bonus amount) live in the `site_settings` table, editable at `/admin/settings`.
