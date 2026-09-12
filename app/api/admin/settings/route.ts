// app/api/admin/settings/route.ts
import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-server"
import { getAllSettings, updateSetting } from "@/src/services/siteSettings"

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const settings = await getAllSettings()
  return NextResponse.json({ settings })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const { key, value } = await req.json()
    if (!key || value === undefined) {
      return NextResponse.json({ error: "key and value are required" }, { status: 400 })
    }

    await updateSetting(key, String(value), auth.uid)

    // The homepage is ISR-cached (revalidate = 900s) and reads settings
    // like homepage_post_count at render time, so without this the
    // admin's change wouldn't show up until the cache naturally expired.
    revalidatePath("/")

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}
