// app/(dashboard)/settings/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { AuthService } from "@/src/services/auth"
import { ThemeToggle } from "@/components/theme-toggle"

export default function SettingsPage() {
  const { user } = useAuth()
  const [fullName, setFullName] = useState(user?.fullName ?? "")
  const [phone, setPhone] = useState(user?.phone ?? "")
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)

  const [currentPin, setCurrentPin] = useState("")
  const [newPin, setNewPin] = useState("")
  const [savingPin, setSavingPin] = useState(false)
  const [pinMessage, setPinMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    setFullName(user.fullName ?? "")
    setPhone(user.phone ?? "")
  }, [user?.id, user?.fullName, user?.phone])

  async function handleSaveProfile() {
    if (!user) return
    if (!fullName.trim()) {
      setProfileMessage("Enter your full name before saving.")
      return
    }
    setSavingProfile(true)
    setProfileMessage(null)
    try {
      await AuthService.updateProfile(user.id, { fullName: fullName.trim(), phone: phone.trim() })
      setProfileMessage("Profile updated successfully.")
    } catch (err) {
      setProfileMessage(err instanceof Error ? err.message : "Update failed")
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleSetPin() {
    if (!/^\d{4}$/.test(newPin) || (user?.hasTransactionPin && !/^\d{4}$/.test(currentPin))) {
      setPinMessage("Enter a valid 4-digit PIN in each required field.")
      return
    }
    setSavingPin(true)
    setPinMessage(null)
    try {
      await AuthService.setTransactionPin(newPin, user?.hasTransactionPin ? currentPin : undefined)
      setPinMessage(user?.hasTransactionPin ? "Transaction PIN updated" : "Transaction PIN set")
      setCurrentPin("")
      setNewPin("")
    } catch (err) {
      setPinMessage(err instanceof Error ? err.message : "Failed to set PIN")
    } finally {
      setSavingPin(false)
    }
  }

  return (
    <div className="container max-w-md space-y-6 py-6 sm:py-8">
      <div>
        <h1 className="mb-6 text-2xl font-heading font-bold text-secondary dark:text-foreground">Settings</h1>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <h2 className="mb-1 font-heading font-semibold text-secondary dark:text-foreground">Appearance</h2>
        <p className="mb-4 text-sm text-muted-foreground">Choose light, dark, or match your device.</p>
        <ThemeToggle variant="full" />
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <h2 className="mb-1 font-heading font-semibold text-secondary dark:text-foreground">Profile</h2>
        <p className="mb-4 text-sm text-muted-foreground">Keep your account details up to date.</p>
        {profileMessage && <p className="mb-3 text-sm text-accent">{profileMessage}</p>}
        <label className="mb-1 block text-sm font-medium text-secondary dark:text-foreground">Full name</label>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <label className="mb-1 block text-sm font-medium text-secondary dark:text-foreground">Phone number</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="08012345678"
          className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <button
          onClick={handleSaveProfile}
          disabled={savingProfile}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {savingProfile ? "Saving..." : "Save profile"}
        </button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <h2 className="mb-1 font-heading font-semibold text-secondary dark:text-foreground">Transaction PIN</h2>
        <p className="mb-4 text-sm text-muted-foreground">Protect purchases with your private transaction PIN.</p>
        <p className="mb-3 text-sm text-muted-foreground">
          {user?.hasTransactionPin
            ? "Enter your current PIN, then choose a new 4-digit PIN."
            : "Set a 4-digit PIN. It is required before you can make a purchase."}
        </p>
        {pinMessage && <p className="mb-3 text-sm text-accent">{pinMessage}</p>}
        {user?.hasTransactionPin && (
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={4}
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="Current 4-digit PIN"
            className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-center text-foreground tracking-widest placeholder:text-muted-foreground"
          />
        )}
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={4}
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="New 4-digit PIN"
          className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-center text-foreground tracking-widest placeholder:text-muted-foreground"
        />
        <button
          onClick={handleSetPin}
          disabled={savingPin || newPin.length !== 4 || (!!user?.hasTransactionPin && currentPin.length !== 4)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {savingPin ? "Saving..." : "Save PIN"}
        </button>
      </section>
    </div>
  )
}
