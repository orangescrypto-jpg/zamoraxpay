// app/api/spin/guest-window/route.ts
// Public, UNAUTHENTICATED status check for the floating guest spin badge.
// Logged-out visitors can't call /api/spin (it requires a session), so the
// floating button needs its own tiny endpoint to know whether to show itself
// AND what the wheel looks like — so the guest sees the EXACT SAME wheel
// (same segments, same colors, same labels) they'll get on /dashboard after
// logging in, not a generic placeholder.
//
// Deliberately leaks nothing about odds/prizes/budgets: segments are built
// with the SAME toSegment() mapper spinEngine.ts uses for the real, authed
// wheel, which already strips weight/costKobo/caps — only label, type,
// color and isJackpot ever reach the browser, logged in or not.
// No DB write happens here; guests never consume a ticket until they log in.

import { NextResponse } from "next/server"
import { getSource, isSpinEnabled, isWithinWindow, listPrizes } from "@/src/services/spinConfig"
import { toSegment } from "@/src/services/spinEngine"

// Which source's schedule AND wheel govern the guest badge. "anytime" is the
// always-eligible lazy source, so it's the natural "promo window" + wheel
// layout for an unauthenticated visitor — it's also the first source a
// freshly logged-in user gets a ticket for, so the wheel the guest just
// looked at IS the wheel SpinPopup opens for them a moment later.
const GUEST_SOURCE_KEY = "anytime"

export async function GET() {
  try {
    const enabled = await isSpinEnabled()
    if (!enabled) {
      return NextResponse.json({ open: false, nextChangeAt: null, segments: [] })
    }

    const source = await getSource(GUEST_SOURCE_KEY)
    if (!source || !source.isEnabled) {
      return NextResponse.json({ open: false, nextChangeAt: null, segments: [] })
    }

    const open = isWithinWindow(source)
    // The next clock-driven change: either the end of the current window
    // (if open) or the start of the next one (if not open yet).
    const nextChangeAt = open ? source.endsAt : source.startsAt

    // Same prize table, same mapper the signed-in wheel uses — so the guest
    // wheel and the post-login wheel are pixel-for-pixel the same segments.
    const prizes = await listPrizes(GUEST_SOURCE_KEY, { activeOnly: true })
    const segments = prizes.map(toSegment)

    return NextResponse.json({ open, nextChangeAt, segments })
  } catch (err) {
    // Same philosophy as /api/spin: a bonus feature never breaks the page.
    console.error("[api/spin/guest-window] failed:", err)
    return NextResponse.json({ open: false, nextChangeAt: null, segments: [] })
  }
}
