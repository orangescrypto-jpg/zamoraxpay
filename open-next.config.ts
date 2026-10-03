// open-next.config.ts
// OpenNext adapter config for Cloudflare Workers.
// The ISR/revalidate cache is stored in R2 under the _isr_cache/ prefix of
// the same bucket that holds uploads. Uploads live under banners/, pages/,
// receipts/, etc., so the two never collide.

import { defineCloudflareConfig } from "@opennextjs/cloudflare"
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache"

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
})
