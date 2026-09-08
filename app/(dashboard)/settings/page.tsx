// app/(dashboard)/settings/page.tsx
"use client"

import { useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { AuthService } from "@/src/services/auth"

export default function SettingsPage() {
  const { user } = useAuth()
  const [fullName, setFullName] = useState(user?.fullName ?? "")
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)

  const [newPin, setNewPin] = useState("")
  const [savingPin, setSavingPin] = useState(false)
  const [pinMessage, setPinMessage] = useState<string | null>(null)

  async function handleSaveProfile() {
    if (!user) return
    setSavingProfile(true)
    setProfileMessage(null)
    try {
      await AuthService.updateProfile(user.id, { fullName })
      setProfileMessage("Profile updated")
    } catch (err) {
      setProfileMessage(err instanceof Error ? err.message : "Update failed")
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleSetPin() {
    setSavingPin(true)
    setPinMessage(null)
    try {
      await AuthService.setTransactionPin(newPin)
      setPinMessage(user?.hasTransactionPin ? "Transaction PIN updated" : "Transaction PIN set")
      setNewPin("")
    } catch (err) {
      setPinMessage(err instanceof Error ? err.message : "Failed to set PIN")
    } finally {
      setSavingPin(false)
    }
  }

  return (
    <div className="container max-w-md space-y-8 py-8">
      <div>
        <h1 className="mb-6 text-2xl font-heading font-bold text-secondary">Settings</h1>
      </div>

      <div>
        <h2 className="mb-3 font-heading font-semibold text-secondary">Profile</h2>
        {profileMessage && <p className="mb-3 text-sm text-accent">{profileMessage}</p>}
        <label className="mb-1 block text-sm font-medium text-secondary">Full name</label>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="mb-3 w-full rounded-md border border-border px-3 py-2 text-sm"
        />
        <p className="mb-3 text-xs text-muted-foreground">Phone: {user?.phone}</p>
        <button
          onClick={handleSaveProfile}
          disabled={savingProfile}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {savingProfile ? "Saving..." : "Save profile"}
        </button>
      </div>

      <div className="border-t border-border pt-6">
        <h2 className="mb-3 font-heading font-semibold text-secondary">Transaction PIN</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {user?.hasTransactionPin
            ? "Set a new 4-digit PIN used to confirm purchases."
            : "Set a 4-digit PIN — required before you can make any purchase."}
        </p>
        {pinMessage && <p className="mb-3 text-sm text-accent">{pinMessage}</p>}
        <input
          type="password"
          maxLength={4}
          value={newPin}
          onChange={(e) => setNewPin(e.target.value)}
          placeholder="New 4-digit PIN"
          className="mb-3 w-full rounded-md border border-border px-3 py-2 text-center tracking-widest"
        />
        <button
          onClick={handleSetPin}
          disabled={savingPin || newPin.length !== 4}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {savingPin ? "Saving..." : "Save PIN"}
        </button>
      </div>
    </div>
  )
}
