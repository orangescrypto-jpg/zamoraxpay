// store/authStore.ts
import { create } from "zustand"
import type { User } from "@/src/types"
import { AuthService } from "@/src/services/auth"

interface AuthState {
  user: User | null
  loading: boolean
  initialized: boolean
  setUser: (user: User | null) => void
  init: () => () => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  initialized: false,

  setUser: (user) => set({ user, loading: false }),

  init: () => {
    set({ loading: true })
    const unsubscribe = AuthService.onAuthStateChanged((user) => {
      set({ user, loading: false, initialized: true })
    })
    return unsubscribe
  },

  signOut: async () => {
    await AuthService.signOut()
    set({ user: null })
  },
}))
