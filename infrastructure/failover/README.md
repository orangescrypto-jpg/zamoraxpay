# ZamoraxPay Failover Gateway

This is an independent Cloudflare Worker that sits in front of the ZamoraxPay application. It keeps failover logic out of the main Next.js application.

## Routing model

1. Cloudflare routes the production hostname to this gateway.
2. The gateway sends normal traffic to the `zamoraxpay` Worker service binding.
3. If the primary Worker fails or returns 502/503/504 for a safe read request, the gateway checks the configured backup origins in priority order.
4. The first healthy backup receives the request.
5. When the primary becomes healthy again, new traffic automatically goes back to it.

## Important payment safety rule

Automatic failover is intentionally limited to `GET`, `HEAD`, and `OPTIONS` requests. Financial mutations such as payment initiation, wallet debits, withdrawals, refunds, and purchases are never blindly replayed against a backup after a primary failure. This avoids accidental duplicate transactions.

For mutation failover in the future, add application-level idempotency keys and provider-side transaction verification before enabling it.

## Adding another backup server

Set `BACKUP_ORIGINS` to a comma-separated priority list, for example:

`https://zamoraxpay.vercel.app,https://backup-2.example.com,https://backup-3.example.com`

No main application files need to be changed.

## Deployment

Deploy the main application Worker first with its existing configuration. Then deploy this gateway separately:

`cd infrastructure/failover`

`npm install`

`npx wrangler deploy`

After deployment, attach the production hostname to the failover Worker using Cloudflare Routes. Do not point the production hostname directly at Vercel if this gateway is intended to be the primary entry point.

The Vercel project can keep the environment variables you already configured. Make sure its public URL is included in `BACKUP_ORIGINS`.

## Health endpoint

The gateway exposes `/__failover/health`. The configured backup origins are expected to expose the application health endpoint at `PRIMARY_HEALTH_PATH`.

The main application should provide a lightweight `/api/health` endpoint that does not query the database. If that endpoint is not present in the current application, add it separately before production failover testing.
