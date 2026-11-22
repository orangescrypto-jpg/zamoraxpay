// app/api/spin/guest-window/route.ts
// Public, UNAUTHENTICATED status check for the floating guest spin badge.
// Logged-out visitors can't call /api/spin (it requires a session), so the
// floating button needs its own tiny endpoint to know whether to show itself.
//
// Deliberately leaks nothing about odds/prizes/budgets — just whether the
// window is open right now, reusing the SAME source row (and therefore the
// SAME admin on/off switch and schedule) the signed-in flow already uses.
// No DB write happens here; guests never consume a ticket until they log in.

import { NextResponse } from "next/server"
import { getSource, isSpinEnabled, isWithinWindow } from "@/src/services/spinConfig"

// Which source's schedule governs the guest badge. "anytime" is the
// always-eligible lazy source, so its startsAt/endsAt is the natural
// "promo window" for an unauthenticated visitor.
const GUEST_SOURCE_KEY = "anytime"

export async function GET() {
  try {
    const enabled = await isSpinEnabled()
    if (!enabled) {
      return NextResponse.json({ open: false, nextChangeAt: null })
    }

    const source = await getSource(GUEST_SOURCE_KEY)
    if (!source || !source.isEnabled) {
      return NextResponse.json({ open: false, nextChangeAt: null })
    }

    const open = isWithinWindow(source)
    // The next clock-driven change: either the end of the current window
    // (if open) or the start of the next one (if not open yet).
    const nextChangeAt = open ? source.endsAt : source.startsAt

    return NextResponse.json({ open, nextChangeAt })
  } catch (err) {
    // Same philosophy as /api/spin: a bonus feature never breaks the page.
    console.error("[api/spin/guest-window] failed:", err)
    return NextResponse.json({ open: false, nextChangeAt: null })
  }
}
