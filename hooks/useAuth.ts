// hooks/useAuth.ts
"use client"

import { useEffect } from "react"
import { useAuthStore } from "@/store/authStore"

export function useAuth() {
  const { user, loading, init, signOut } = useAuthStore()

  useEffect(() => {
    const unsubscribe = init()
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { user, loading, signOut, isAuthenticated: !!user }
}
