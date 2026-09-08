// middleware.ts
// Refreshes the Supabase session cookie on every request and protects
// authenticated route groups. Admin route protection here is a
// convenience redirect only — the actual admin_users check happens
// server-side in every /api/admin/* route via requireAdmin(), which
// is the real security boundary.

import { NextResponse, type NextRequest } from "next/server"
import { createMiddlewareClient } from "@/src/services/providers/supabase/middleware"

const PROTECTED_PREFIXES = ["/dashboard", "/wallet", "/services", "/reseller", "/history", "/beneficiaries", "/settings", "/withdraw"]
const ADMIN_PREFIX = "/admin"

export async function middleware(request: NextRequest) {
  const { supabase, supabaseResponse } = createMiddlewareClient(request)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
  const isAdmin = pathname.startsWith(ADMIN_PREFIX)

  if ((isProtected || isAdmin) && !user) {
    const redirectUrl = new URL("/login", request.url)
    redirectUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Logged-in visitors hitting the marketing homepage should land on
  // their dashboard instead of seeing the logged-out hero/CTA again.
  if (pathname === "/" && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/wallet/:path*",
    "/services/:path*",
    "/reseller/:path*",
    "/history/:path*",
    "/beneficiaries/:path*",
    "/settings/:path*",
    "/withdraw/:path*",
    "/admin/:path*",
  ],
}
