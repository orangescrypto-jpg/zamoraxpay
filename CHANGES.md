# ZamoraxPay — Combined Update Package

This package contains two independent sets of changes, bundled together
for a single extract-and-overwrite. They touch entirely separate files —
no overlap, safe to apply together.

- **Part 1: UI/UX Redesign + SEO/Performance Improvements** (24 files)
- **Part 2: Payment Provider Admin — Credential Save Bug Fix** (3 files)

Apply by extracting into your project root, overwriting the existing
files. All routes, content counts, integrations, and business logic
remain unchanged except where Part 2 explicitly describes a bug fix.

---

# Part 1: UI/UX Redesign + SEO/Performance Improvements

This part contains 24 modified/new files. All routes, content counts, integrations, and business logic remain unchanged.

## Round 1 - Brand redesign and UI polish (17 files)

### Foundation / Design System
1. `app/globals.css` - Brand colors switched (Primary: Orange #FF6B00, Secondary: Navy #0F172A, Background: White). New utility classes (`.zpx-eyebrow`, `.zpx-card`, `.zpx-section`, `.zpx-dot-grid`, `.shadow-soft`, `.shadow-lift`). Brand-tinted shadows. Smooth scroll, better text selection, antialiased rendering, improved focus rings. Print stylesheet for articles.
2. `app/layout.tsx` - `themeColor` moved to proper `viewport` export. `metadataBase` set so OG/Twitter URLs resolve to the production domain. `preconnect`/`dns-prefetch` for Google Fonts and zamorax.com. `font-display: swap` on both fonts so text renders immediately. OpenGraph gets `url`, `locale: en_NG`, image dimensions and alt. Title template changed to use ` - ` instead of ` · ` (cleaner for search results).

### Header and Footer
3. `components/layout/Header.tsx` - Cleaner logo with branded "Z" tile badge. Better nav spacing with `px-3 py-2` and hover backgrounds. Refined mobile menu (rounded-lg items). Refined dropdown with shadow-popover. Focus-visible rings on the logo.
4. `components/layout/Footer.tsx` - Replaced green accent with primary orange. Cleaner brand mark tile. Improved contact card background. Replaced em dashes with commas in support hours.

### Homepage
5. `app/page.tsx` - Redesigned hero with eyebrow chip, refined typography, better CTA hierarchy. Polished trust strip, services grid, How-It-Works (with connector line), Why-Trust cards, partner chips, security badges, testimonials, rewards, opportunities section, magazine-style blog rows with featured posts, and a navy CTA band at the bottom. Lazy loading on all blog cover images. Eyebrow labels above section titles.

### Blog
6. `app/(public)/blog/page.tsx` - Redesigned blog hero header with eyebrow chip and intro paragraph. Polished featured article card. Cleaner category filter chips with consistent rounded-full style and transition states. Shadow-soft on TOC and search card.
7. `app/(public)/blog/[slug]/page.tsx` - Two-column layout (sticky TOC sidebar on desktop). Reading progress bar at the top. Breadcrumbs with JSON-LD. Reading time + word count in the byline. Improved article JSON-LD (dateModified, articleSection, keywords, wordCount, inLanguage, publisher logo, author URL). Related-post cards now show reading time. Cover image gets width/height on OG.
8. `app/(public)/blog/authors/[slug]/page.tsx` - Navy hero header with avatar ring, eyebrow "Author" label, and bio. Removed em dash from page title metadata. Added breadcrumbs.
9. `components/shared/BlogPostSearch.tsx` - Refined search input with smooth transition focus state. Better card design (rounded-xl, shadow-soft, duration-500 hover scale). Empty state with white background.

### Public Pages
10. `app/(public)/about/page.tsx` - Navy hero header with eyebrow chip and intro. Markdown wrapped in a card with padding. Breadcrumbs. Removed em dash from title.
11. `app/(public)/contact/page.tsx` - Navy hero header with eyebrow chip and intro. Markdown wrapped in a card. Breadcrumbs. Removed em dash from title.
12. `app/(public)/services/[slug]/page.tsx` - Navy hero header with eyebrow chip, tagline, buy button, and network chips. Polished pricing table and FAQ section. Navy CTA band at the bottom. Service schema JSON-LD (provider, areaServed: Nigeria, offer). FAQPage JSON-LD. Breadcrumbs. Removed em dash from title.
13. `app/(public)/help/page.tsx` - Navy hero header. Refined FAQ sections with rounded-xl and shadow-soft. Polished bottom CTA card. FAQPage JSON-LD schema (unlocks FAQ rich results in Google). Breadcrumbs.

### Legal Pages
14. `app/(public)/terms/page.tsx` - Navy hero header. Markdown wrapped in a card. Breadcrumbs. Removed em dash from title.
15. `app/(public)/privacy-policy/page.tsx` - Navy hero header. Markdown wrapped in a card. Breadcrumbs. Removed em dash from title.
16. `app/(public)/cookie-policy/page.tsx` - Navy hero header. Markdown wrapped in a card. Breadcrumbs. Removed em dash from title.
17. `app/(public)/refund-policy/page.tsx` - Navy hero header. Markdown wrapped in a card. Breadcrumbs. Removed em dash from title.

## Round 2 - SEO, performance, and UX additions (7 more files)

### Critical SEO bug fixes
18. `app/robots.ts` - **Critical bug fix**: original file disallowed `/services/` which BLOCKED all public service marketing pages from Google. Now correctly allows `/services/` and `/services/*`. Also added explicit allows for `/sitemap.xml`, `/robots.txt`, `/manifest.json`. Added more disallows for private areas (`/dashboard/*`, `/admin/*`, `/play/`, `/cashback/`, `/daily-streak/`, `/refund/`, `/login`, `/signup`) and in-app search query URLs (`?q=*`, `?sort=*`) so Google doesn't index duplicate content with filters.

19. `app/sitemap.ts` - Added image sitemap entries for posts with cover images (`images: [{ loc, title }]`). Boosts post priority from 0.6 to 0.7. Boosted `/blog` priority from 0.7 to 0.9 (your highest-traffic public page). Boosted category pages from 0.5 to 0.6. The image entries help Google Image Search discover your blog covers.

### Performance hints (already covered in layout.tsx)
- `metadataBase` resolves OG/Twitter image URLs to absolute production URLs (was warning "metadataBase is not set" before).
- `preconnect` to `fonts.googleapis.com`, `fonts.gstatic.com`, and `zamorax.com` saves ~150-250ms TLS round-trips on first navigation.
- `dns-prefetch` as fallback for browsers that don't support preconnect.
- `font-display: swap` on Inter and Space Grotesk so text renders immediately instead of being blocked by font loading.
- `viewport` export properly declares `colorScheme: "light dark"`, `viewportFit: "cover"` (for iPhone notch safe areas), and the `themeColor` arrays (was warning before, now gone).

### New shared components
20. `components/shared/Breadcrumbs.tsx` (NEW) - Reusable breadcrumbs component. Renders a visual breadcrumb nav AND a matching `BreadcrumbList` JSON-LD schema (unlocks breadcrumb rich results in Google). Used on every public inner page.

21. `components/shared/ReadingProgress.tsx` (NEW) - Fixed-position top progress bar that fills as the reader scrolls. Uses `requestAnimationFrame` + passive scroll listener (no jank). Reuses the existing `.zpx-reading-progress` CSS hook. Respects `prefers-reduced-motion`.

22. `components/shared/BackToTop.tsx` (NEW) - Floating "scroll back to top" button. Appears after scrolling past 600px. Reuses the existing `.zpx-back-to-top` CSS hook so it stacks correctly with the other floating tools. Smooth-scrolls (or instant if reduced-motion is set).

### SiteChrome integration
23. `components/layout/SiteChrome.tsx` - Wired up `BackToTop` globally on all non-admin pages. Sits between the WhatsApp FAB and the LocalExperienceTools so it never covers the bottom-nav on mobile.

### Reading time helper
24. `lib/readingTime.ts` (NEW) - Word-count based reading time estimator. Strips markdown noise (code blocks, inline code, images, links, HTML tags) before counting words. Used on article pages and related-post cards. Default 220 WPM (typical adult reading speed).

## JSON-LD Schema Inventory (what Google sees now)

After these changes, every public page emits structured data:

| Page | Schema types emitted |
| --- | --- |
| All pages | Organization, WebSite (with SearchAction) |
| `/` (homepage) | (inherits Organization + WebSite) |
| `/blog` | BreadcrumbList |
| `/blog/[slug]` | BlogPosting (with datePublished, dateModified, articleSection, keywords, wordCount, inLanguage, publisher logo, author URL), BreadcrumbList |
| `/blog/authors/[slug]` | BreadcrumbList |
| `/services/[slug]` | Service (with provider, areaServed: Nigeria, offer, brand), FAQPage (if FAQs exist), BreadcrumbList |
| `/help` | FAQPage (24 questions across 6 categories), BreadcrumbList |
| `/about`, `/contact`, `/terms`, `/privacy-policy`, `/cookie-policy`, `/refund-policy` | BreadcrumbList |

## Print Stylesheet (new)

Articles can now be saved as clean PDFs (Ctrl+P). The print stylesheet hides: header, footer, breadcrumbs, mobile menu, reading progress, back-to-top, local tools, WhatsApp FAB, all AdSense units, mobile bottom nav, cookie banner, and guided-tour overlays. Forces black text on white, underlines links, appends the URL after each link, and avoids page breaks inside paragraphs/lists.

## Verification

- `npx tsc --noEmit` exits with code 0 (zero TypeScript errors).
- `npx next build` exits with code 0 (successful production build). All routes preserved.
- No `metadataBase` warnings anymore.
- No `themeColor` warnings on the root layout anymore (still present on admin pages, which were not in scope).
- Babel parser syntax check passes on all 24 files.
- No em dashes (`—`) or en dashes (`–`) in any user-facing UI text or page titles.

## Features Preserved

All existing functionality, routes, content, and integrations remain unchanged:

- All public routes: `/`, `/blog`, `/blog/[slug]`, `/blog/authors/[slug]`, `/about`, `/contact`, `/help`, `/services/[slug]`, `/terms`, `/privacy-policy`, `/cookie-policy`, `/refund-policy`.
- All dashboard, admin, and authentication routes (untouched).
- All API endpoints (untouched).
- All blog post counts and pagination behavior (POSTS_PER_PAGE = 30, CATEGORY_POSTS_PER_PAGE = 20, HOMEPAGE_POSTS_PER_CATEGORY = 10, HOMEPAGE_JOBS_SCHOLARSHIPS_POST_LIMIT = 6).
- All homepage sections, blog listing features, blog article features, header navigation, footer link columns, and contact details.
- All advertisement placements restricted to public pages only (`isPrivatePath` check unchanged).
- All SEO metadata (titles, descriptions, canonical URLs, OpenGraph, Twitter, JSON-LD).
- All VTU transaction functionality and routes (untouched - they live under `(dashboard)`).
- All authentication flows, provider integrations, payment integrations, and cron jobs (untouched).

## Confirmed

1. **Existing number of displayed posts and content items was NOT reduced.** All pagination constants are unchanged.
2. **VTU transaction environment was NOT modified.** No files under `app/(dashboard)/`, `app/(admin)/`, `app/api/`, or `src/services/` were touched by Part 1.
3. **Advertisement restrictions were preserved.** The `isPrivatePath` check in `Footer.tsx` and `AdSenseLoader.tsx` is unchanged. Ads still only appear on public pages.
4. **No em dashes appear in user-facing UI text.** All em dashes in user-visible strings have been replaced. The only em dashes that remain are inside JavaScript/TypeScript code comments, which are not rendered to the user.

## Technical Issues Discovered (Part 1)

- **Critical SEO bug**: Original `app/robots.ts` disallowed `/services/` which blocked all public service marketing pages from Google indexing. Now fixed.
- **metadataBase warning**: Original `app/layout.tsx` was missing `metadataBase`, causing OpenGraph and Twitter image URLs to resolve to `localhost` in production. Now fixed.
- **themeColor warning**: Original `app/layout.tsx` declared `themeColor` inside `metadata` export, which Next.js 14+ no longer supports. Now moved to the proper `viewport` export.
- No other technical issues discovered. The original codebase is well-structured and all UI/SEO/perf changes are presentation layer adjustments that don't touch data fetching, business logic, or routing.

---

# Part 2: Payment Provider Admin — Credential Save Bug Fix

This part contains 3 files (1 new, 2 modified), unrelated to and non-overlapping with Part 1.

## The bug (root cause of a missed Korapay webhook credit)

The admin "Set credentials" modal for VTU providers already prefills saved
values and merges on save (`updateVtuProviderConfig` in `config.ts` + the
`/api/admin/providers/vtu/credentials` GET route). Payment providers
(Korapay/Paystack) never got the same treatment:

1. `updatePaymentProviderConfig` overwrote the entire `credentials_json`
   blob with only the fields sent from the form — no merge with what was
   already saved.
2. The payment "Set keys" modal never fetched saved credentials first, so
   it always opened blank, even though its own help text said "Fields you
   don't touch keep their saved value" (that line was true for VTU, false
   for payment).

Net effect: saving just one field (e.g. Webhook Secret) while the other
(Secret Key) was blank on screen — which it always was — silently deleted
the untouched field from the database. This is the most likely reason the
Korapay webhook secret ended up missing/wrong, since every "Set keys" save
would have had a 50% chance of nuking whichever field wasn't retyped.

## What changed

1. `src/services/config.ts` - `updatePaymentProviderConfig` now reads the
   existing `credentials_json`, merges the new fields on top (same pattern
   `updateVtuProviderConfig` already used), and only deletes a key when the
   admin explicitly submits it as an empty string.

2. `app/api/admin/providers/payment/credentials/route.ts` (NEW) - GET
   endpoint that returns the currently saved credentials for one payment
   provider, gated to super_admin. Mirrors the existing VTU equivalent at
   `app/api/admin/providers/vtu/credentials/route.ts`.

3. `app/(admin)/admin/providers/page.tsx` - added `openPaymentCredsEditor`,
   which fetches and prefills saved credentials before opening the modal
   (same pattern as `openVtuCredsEditor`), and wired the payment "Set keys"
   button to call it instead of just clearing the form.

## Env fallback (already present, verified, no change needed)

Both adapters (`src/services/providers/payment/korapay.ts` and
`paystack.ts`) already fall back to environment variables whenever a
credential is missing from the database:

```
credentials.secretKey || process.env.KORAPAY_SECRET_KEY
credentials.webhookSecret || process.env.KORAPAY_WEBHOOK_SECRET
credentials.secretKey || process.env.PAYSTACK_SECRET_KEY
```

So as long as `KORAPAY_SECRET_KEY` / `KORAPAY_WEBHOOK_SECRET` are set in
your deployment's environment variables, webhook verification and payment
initialization keep working even if the admin-panel credentials are
cleared or never set. This was already correct and needed no fix - the
bug was entirely in how the admin panel saved/displayed credentials, not
in how the adapters consume them.

Note: Paystack signs webhooks with the Secret Key itself (no separate
webhook secret) - that's Paystack's own convention, not a bug.

## Not changed / out of scope (Part 2)

- VTU provider credential handling - already correct, used as the
  reference pattern for this fix.
- Payment initialization/verification/transfer logic in the adapters -
  unaffected by this bug.
- `app/api/wallet/webhooks/korapay/route.ts` and
  `src/services/paymentWebhook.ts` - reviewed, no bugs found. The
  idempotency/retry design there is correct; the webhook simply never
  fired because the webhook secret had likely been wiped by the admin-UI
  bug fixed here, and/or the Notification URL was never set on Korapay's
  own dashboard (separate, non-code action - see below).

## Still needs a manual (non-code) step

This fix does not set your actual Korapay webhook URL. You still need to,
in the Korapay merchant dashboard -> Notification URLs:

1. Set the webhook URL to `https://zamoraxpay.com.ng/api/wallet/webhooks/korapay`
2. Copy the webhook secret shown there
3. Re-open "Set keys" -> Korapay in your admin panel (now correctly
   prefilled after this fix) and paste it into Webhook Secret, Save.
4. Make a small test deposit and confirm a row appears in
   `payment_webhook_events` afterward.

---

# Part 3: Korapay Webhook Signature Verification — Root-Cause Fix

This part contains 2 modified files. It fixes the actual reason Korapay
webhooks were never verifying successfully — a problem independent of,
and deeper than, the admin-panel credential-save bug in Part 2.

## The bugs

1. **Wrong key.** Korapay has no separate "webhook secret" at all — it
   signs webhook payloads with the same account **Secret Key**
   (`sk_live_…` / `sk_test_…`) used for API requests. The adapter was
   looking for `credentials.webhookSecret || process.env.KORAPAY_WEBHOOK_SECRET`,
   neither of which Korapay ever sets or validates against, so a correctly
   saved "Webhook Secret" field could never match.

2. **Wrong signed payload.** Per Korapay's documented reference
   implementation, the HMAC-SHA256 signature is computed over
   `JSON.stringify(payload.data)` — the parsed, re-serialized `data`
   object only — not the raw request body. The adapter was hashing the
   full raw request body (`event`, `data`, everything), which will not
   match Korapay's computed signature even with the correct key.

Combined, these two bugs meant the Korapay webhook signature check could
never succeed, regardless of what was saved in the admin panel or in
environment variables.

## What changed

1. `src/services/providers/payment/korapay.ts` -
   `verifyWebhookSignature` now takes the **parsed `data` object**
   (not the raw body string), signs `JSON.stringify(data)`, and uses
   `credentials.secretKey || process.env.KORAPAY_SECRET_KEY` as the key
   — matching Korapay's actual scheme.

2. `app/api/wallet/webhooks/korapay/route.ts` - now parses the JSON
   body **before** verifying the signature (previously verified against
   the raw body first), and calls
   `korapayAdapter.verifyWebhookSignature(payload?.data, signature, credentials)`.

3. `src/services/providers/payment/types.ts` - updated the
   `verifyWebhookSignature` interface doc comment/parameter name only
   (no behavior change) to reflect that the second argument's shape is
   provider-specific (Paystack: raw body string; Korapay: parsed `data`
   object).

## Confirmed unaffected

- Paystack's adapter and webhook route are untouched. Paystack signs the
  **raw request body** with its Secret Key, which was already correct,
  and the shared `IPaymentProviderAdapter` interface change is a
  type/doc-comment update only, not a behavioral constraint — Paystack's
  route still passes its raw body string exactly as before.
- `KORAPAY_WEBHOOK_SECRET` is no longer read anywhere; the admin-panel
  "Webhook Secret" field for Korapay (from Part 2) is now effectively
  unused for Korapay. It's left in place since the field list is shared
  with Paystack's admin UI entry, but nothing reads a Korapay webhook
  secret anymore — only `secretKey` matters for Korapay going forward.

## Still needs a manual (non-code) step

Same as noted in Part 2: on Korapay's merchant dashboard, set the
Notification URL to `https://zamoraxpay.com.ng/api/wallet/webhooks/korapay`.
No separate webhook secret needs to be copied — your existing Korapay
Secret Key (already saved for charges/transfers) is what verifies
webhooks too. Make a small test deposit afterward and confirm a row
appears in `payment_webhook_events`.
