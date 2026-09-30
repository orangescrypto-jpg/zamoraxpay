-- migrations/2026-09-add-service-pages.sql
-- Public, unauthenticated marketing pages for each VTU service — e.g. a
-- real /services/airtime page (separate from the gated buy form, which
-- now lives at /dashboard/services/airtime). Admin-editable via the same
-- pattern as site_pages, extended with pricing/networks/FAQ as JSON and
-- a buy_button_href pointing at the gated dashboard page.
--
-- Apply with:
--   npx wrangler d1 execute <ZAMORAXPAY_DB> --remote --file=migrations/2026-09-add-service-pages.sql
--
-- Run once. CREATE TABLE is not idempotent on purpose (matches the other
-- migrations in this project) — a double apply fails loudly instead of
-- silently doing nothing.

INSERT OR IGNORE INTO feature_flags (key, label, description, is_enabled) VALUES
  ('public_service_pages', 'Public Service Marketing Pages', 'Show public, unauthenticated marketing pages at /services/* (how it works, pricing, FAQs) with a Buy Now button. When off, /services/* redirects straight to the gated dashboard page.', 1);

CREATE TABLE IF NOT EXISTS service_pages (
  slug              TEXT PRIMARY KEY,   -- 'airtime' | 'data' | 'cable' | 'electricity' | 'exam-pin' |
                                         -- 'airtime-to-cash' | 'epin' | 'bulk-airtime' | 'bulk-data' | 'international-topup'
  title             TEXT NOT NULL,
  tagline           TEXT,               -- short subhead shown under the title
  content_markdown  TEXT NOT NULL,      -- "How it works" body copy
  networks_json     TEXT,               -- JSON array of supported network/provider names, e.g. ["MTN","Airtel","Glo","9mobile"]
  pricing_json      TEXT,               -- JSON array of {label, value} rows for a simple pricing/fees table
  faqs_json         TEXT,               -- JSON array of {question, answer}
  buy_button_label  TEXT NOT NULL DEFAULT 'Buy Now',
  buy_button_href   TEXT NOT NULL,      -- gated /dashboard/services/... route the button sends logged-in users to
  meta_description  TEXT,
  updated_by        TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO service_pages
  (slug, title, tagline, content_markdown, networks_json, pricing_json, faqs_json, buy_button_href, meta_description)
VALUES
(
  'airtime',
  'Buy Airtime Online',
  'All networks, instant delivery, no fees.',
  '## How It Works

1. Enter the phone number you want to recharge.
2. Select the network (or let us detect it automatically).
3. Enter the amount and confirm with your transaction PIN.
4. Airtime lands in seconds — no waiting, no manual approval.

Recharge your own number or any number in Nigeria, funded straight from your ZamoraxPay wallet.',
  '["MTN","Airtel","Glo","9mobile"]',
  '[{"label":"Delivery fee","value":"₦0 — no extra charge"},{"label":"Minimum amount","value":"₦50"},{"label":"Delivery time","value":"Instant"}]',
  '[{"question":"Do you charge a fee on airtime top-ups?","answer":"No. You pay exactly the amount you top up — no hidden charges."},{"question":"What if I select the wrong network?","answer":"We detect the network from the phone number automatically and warn you before you pay if there is a mismatch."},{"question":"Can I recharge someone else''s number?","answer":"Yes, enter any Nigerian mobile number — it does not have to be the one on your account."}]',
  '/dashboard/services/airtime',
  'Buy airtime online instantly for MTN, Airtel, Glo and 9mobile with ZamoraxPay — no fees, no delays.'
),
(
  'data',
  'Buy Data Bundles Online',
  'Cheap data plans, all networks, delivered instantly.',
  '## How It Works

1. Choose your network.
2. Pick a data plan from the live, admin-updated price list.
3. Enter the phone number to receive the data.
4. Confirm with your transaction PIN — data is delivered instantly.

Plans and prices are pulled live from our providers, so you always see current, accurate pricing before you pay.',
  '["MTN","Airtel","Glo","9mobile"]',
  '[{"label":"Delivery time","value":"Instant"},{"label":"Plan prices","value":"Shown live before checkout"}]',
  '[{"question":"Why do prices vary by network?","answer":"Each network sets its own wholesale data pricing, which we pass on directly with no markup added at checkout."},{"question":"What happens if a data plan fails to deliver?","answer":"Failed orders are automatically flagged and refunded to your wallet — no need to contact support."}]',
  '/dashboard/services/data',
  'Buy cheap data bundles online for all Nigerian networks with ZamoraxPay — instant delivery, live pricing.'
),
(
  'cable',
  'Pay Cable TV Subscriptions Online',
  'DSTV, GOtv and StarTimes — renew in seconds.',
  '## How It Works

1. Select your provider — DSTV, GOtv, or StarTimes.
2. Enter your smart card / IUC number — we verify the account name instantly.
3. Choose your bouquet.
4. Confirm with your transaction PIN and your subscription is renewed immediately.',
  '["DSTV","GOtv","StarTimes"]',
  '[{"label":"Verification","value":"Instant smart card name check"},{"label":"Delivery time","value":"Instant"}]',
  '[{"question":"How do I know I entered the right smart card number?","answer":"We verify and display the account name tied to the smart card before you confirm payment."},{"question":"Can I renew before my subscription expires?","answer":"Yes, renewing early simply adds to your remaining subscription period."}]',
  '/dashboard/services/cable',
  'Pay your DSTV, GOtv or StarTimes subscription online instantly with ZamoraxPay.'
),
(
  'electricity',
  'Buy Electricity Tokens Online',
  'Prepaid and postpaid tokens for major Nigerian discos.',
  '## How It Works

1. Select your electricity distribution company (disco).
2. Choose prepaid or postpaid, and enter your meter number — we verify the customer name.
3. Enter the amount.
4. Confirm with your transaction PIN and get your token instantly.

You can also schedule recurring electricity payments so your token is bought automatically.',
  '["Prepaid","Postpaid"]',
  '[{"label":"Verification","value":"Instant meter name check"},{"label":"Delivery time","value":"Instant"},{"label":"Scheduled bills","value":"Supported"}]',
  '[{"question":"What if my meter number is wrong?","answer":"We verify and show the customer name on the meter before you pay, so you can catch mistakes first."},{"question":"Can I automate my electricity payments?","answer":"Yes — set up a scheduled bill from your dashboard and we will buy your token automatically."}]',
  '/dashboard/services/electricity',
  'Buy prepaid or postpaid electricity tokens online instantly with ZamoraxPay.'
),
(
  'exam-pin',
  'Buy Exam PINs Online',
  'WAEC, NECO and JAMB PINs, delivered instantly.',
  '## How It Works

1. Select the exam board — WAEC, NECO, or JAMB.
2. Choose the PIN type (result checker, registration, etc.).
3. Confirm with your transaction PIN.
4. Your exam PIN and serial number are delivered instantly and saved to your order history.',
  '["WAEC","NECO","JAMB"]',
  '[{"label":"Delivery time","value":"Instant"},{"label":"Order history","value":"PINs saved for later reference"}]',
  '[{"question":"Where can I find my PIN after buying?","answer":"Every exam PIN purchase is saved to your order history, so you can retrieve it any time."},{"question":"Are the PINs genuine?","answer":"Yes, all PINs are sourced directly from official exam board provider channels."}]',
  '/dashboard/services/exam-pin',
  'Buy WAEC, NECO and JAMB exam PINs online instantly with ZamoraxPay.'
),
(
  'airtime-to-cash',
  'Convert Airtime to Cash',
  'Turn unused airtime into wallet funds.',
  '## How It Works

1. Select your network and enter the airtime amount to convert.
2. Follow the on-screen USSD/transfer instructions to send the airtime.
3. Once confirmed, the cash value is credited to your ZamoraxPay wallet.

Conversion rates vary by network and are shown upfront before you confirm.',
  '["MTN","Airtel","Glo","9mobile"]',
  '[{"label":"Conversion rate","value":"Shown upfront before you confirm"},{"label":"Credit time","value":"Within minutes of confirmation"}]',
  '[{"question":"Why is the cash value less than the airtime amount?","answer":"Airtime-to-cash conversion is done at a discounted rate, which is displayed clearly before you proceed."},{"question":"How long does it take to receive my funds?","answer":"Wallet credit typically lands within minutes of your airtime being confirmed."}]',
  '/dashboard/services/airtime-to-cash',
  'Convert unused airtime to cash in your ZamoraxPay wallet — fast, transparent rates.'
),
(
  'epin',
  'Buy ePINs Online',
  'Instant PINs for redemption, delivered in seconds.',
  '## How It Works

1. Choose the ePIN product you need.
2. Select the quantity.
3. Confirm with your transaction PIN.
4. Your ePINs are generated and delivered instantly, ready to redeem.',
  '[]',
  '[{"label":"Delivery time","value":"Instant"}]',
  '[{"question":"Can I buy ePINs in bulk?","answer":"Yes, select the quantity you need at checkout and all PINs are generated at once."}]',
  '/dashboard/services/epin',
  'Buy instant ePINs online with ZamoraxPay — delivered in seconds, ready to redeem.'
),
(
  'bulk-airtime',
  'Send Bulk Airtime',
  'Recharge many numbers at once from one wallet.',
  '## How It Works

1. Create or select a contact group with the numbers you want to recharge.
2. Set the amount per number (same amount for all, or customized per contact).
3. Confirm with your transaction PIN.
4. Airtime is sent to every number in the group instantly, with a delivery report per contact.

Perfect for teams, families, or businesses distributing airtime regularly.',
  '["MTN","Airtel","Glo","9mobile"]',
  '[{"label":"Delivery time","value":"Instant, per contact"},{"label":"Delivery report","value":"Per-number success/failure status"}]',
  '[{"question":"What happens if one number in my group fails?","answer":"Each number is processed independently — a failed delivery is refunded to your wallet without affecting the rest of the batch."},{"question":"How many numbers can I send to at once?","answer":"You can build contact groups of any size and reuse them for future bulk sends."}]',
  '/dashboard/services/bulk-airtime',
  'Send bulk airtime to multiple numbers at once with ZamoraxPay — fast, reliable, with delivery reports.'
),
(
  'bulk-data',
  'Send Bulk Data',
  'Data bundles to many numbers at once from one wallet.',
  '## How It Works

1. Create or select a contact group.
2. Choose the network and data plan to send.
3. Confirm with your transaction PIN.
4. Data is delivered to every number in the group instantly, with a delivery report per contact.',
  '["MTN","Airtel","Glo","9mobile"]',
  '[{"label":"Delivery time","value":"Instant, per contact"},{"label":"Delivery report","value":"Per-number success/failure status"}]',
  '[{"question":"Can I reuse a contact group I already created?","answer":"Yes, contact groups created for bulk data or bulk airtime can be reused across both services."},{"question":"What if a delivery fails?","answer":"Failed deliveries in a batch are automatically refunded to your wallet."}]',
  '/dashboard/services/bulk-data',
  'Send bulk data bundles to multiple numbers at once with ZamoraxPay.'
),
(
  'international-topup',
  'International Airtime & Data',
  'Top up phone numbers in other countries, instantly.',
  '## How It Works

1. Enter the international phone number — we detect the country and operator automatically.
2. Choose airtime or a data bundle.
3. Confirm with your transaction PIN.
4. The recharge is delivered directly to the recipient''s phone abroad.',
  '[]',
  '[{"label":"Coverage","value":"Multiple countries and operators"},{"label":"Delivery time","value":"Instant"}]',
  '[{"question":"Which countries are supported?","answer":"Supported countries and operators are detected automatically when you enter a number — coverage is continually expanding."},{"question":"Does the recipient need to do anything?","answer":"No, the top-up is delivered directly — no action needed on their end."}]',
  '/dashboard/services/international-topup',
  'Send international airtime and data top-ups to phone numbers abroad with ZamoraxPay.'
);
