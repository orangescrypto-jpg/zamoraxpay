// lib/privateRoutes.ts
// Single source of truth for "this path is authenticated app UI, not
// public/crawlable marketing or blog content." Used by:
//   - middleware.ts (auth redirect gating)
//   - AdSenseLoader (skip loading the AdSense script entirely)
//   - Footer (skip rendering the footer ad unit)
// Keeping one shared list means adding a new protected page in one
// place automatically keeps ads off it too — no second list to forget
// to update.

export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/wallet",
  "/services",
  "/reseller",
  "/history",
  "/beneficiaries",
  "/settings",
  "/withdraw",
  "/spin",
  "/play",
  "/rewards",
  "/referrals",
  "/refund",
  "/daily-streak",
  "/cashback",
]

export const ADMIN_PREFIX = "/admin"

export const AUTH_PREFIXES = ["/login", "/signup"]

/**
 * True for any authenticated app route (dashboard/wallet/etc.), the
 * admin panel, or the login/signup pages themselves — i.e. any page
 * where showing AdSense is either against policy (sensitive account
 * data on screen), pointless (page is noindex'd, never crawled), or
 * just visually wrong (auth forms).
 */
export function isPrivatePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  if (pathname.startsWith(ADMIN_PREFIX)) return true
  if (AUTH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}
