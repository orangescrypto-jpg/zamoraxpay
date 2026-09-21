// src/services/spinDefaults.ts
// GENERATED from the same definitions as the seed block in migrations/schema.sql — keep the two in sync.
// Used by the admin "reset to safe defaults" button and as fallbacks when a setting row is missing.

export interface SpinSourceDefault {
  key: string
  label: string
  description: string
  isEnabled: boolean
  ticketsPerAward: number
  spinsPerDay: number
  expiryMode: "end_of_day" | "hours"
  expiryHours: number
  dailyBudgetKobo: number
  guaranteeAfterLosses: number
  config: Record<string, string | number>
}

export interface SpinDefaultPrize {
  id: string
  sourceKey: string
  label: string
  prizeType: string
  amountKobo: number
  discountPercent: number
  maxDiscountKobo: number
  weight: number
  costKobo: number
  maxWinsPerDay: number
  maxWinsPerWeek: number
  isGuaranteePrize: boolean
  isJackpot: boolean
  color: string
  sortOrder: number
}

export interface SpinSettingDef {
  key: string
  label: string
  description: string
  defaultValue: string
  type: "number" | "boolean"
}

export const SPIN_SOURCE_DEFAULTS: SpinSourceDefault[] = [
  { key: "streak_milestone", label: "Streak milestone", description: "Bonus spin when a user reaches a milestone day on their daily check-in streak.", isEnabled: true, ticketsPerAward: 1, spinsPerDay: 1, expiryMode: "end_of_day", expiryHours: 24, dailyBudgetKobo: 500000, guaranteeAfterLosses: 5, config: {"milestone_days": "7", "milestone_interval": 0} },
  { key: "anytime", label: "Anytime spin (daily free spin)", description: "A free spin every day with no purchase or streak needed. Reappears the next day while switched on.", isEnabled: false, ticketsPerAward: 1, spinsPerDay: 1, expiryMode: "end_of_day", expiryHours: 24, dailyBudgetKobo: 200000, guaranteeAfterLosses: 8, config: {} },
  { key: "purchase", label: "Purchase spin", description: "A spin for each successful purchase at or above the minimum amount.", isEnabled: false, ticketsPerAward: 1, spinsPerDay: 2, expiryMode: "end_of_day", expiryHours: 24, dailyBudgetKobo: 300000, guaranteeAfterLosses: 6, config: {"min_amount_kobo": 100000} },
  { key: "deposit", label: "Deposit spin", description: "A spin when a user funds their wallet at or above the minimum amount.", isEnabled: false, ticketsPerAward: 1, spinsPerDay: 1, expiryMode: "end_of_day", expiryHours: 24, dailyBudgetKobo: 200000, guaranteeAfterLosses: 6, config: {"min_amount_kobo": 200000} },
  { key: "referral", label: "Referral spin", description: "A spin for the referrer when the person they referred completes a first purchase.", isEnabled: false, ticketsPerAward: 1, spinsPerDay: 3, expiryMode: "end_of_day", expiryHours: 24, dailyBudgetKobo: 300000, guaranteeAfterLosses: 0, config: {} },
  { key: "first_purchase_of_day", label: "First purchase of the day", description: "One spin for the first qualifying purchase each day.", isEnabled: false, ticketsPerAward: 1, spinsPerDay: 1, expiryMode: "end_of_day", expiryHours: 24, dailyBudgetKobo: 200000, guaranteeAfterLosses: 6, config: {"min_amount_kobo": 50000} },
  { key: "spend_milestone", label: "Monthly spend milestone", description: "A spin each time a user's spending this month reaches one of the targets you set.", isEnabled: false, ticketsPerAward: 1, spinsPerDay: 3, expiryMode: "end_of_day", expiryHours: 24, dailyBudgetKobo: 300000, guaranteeAfterLosses: 0, config: {"targets_kobo": "2000000,5000000"} },
  { key: "weekend", label: "Weekend spin", description: "A free daily spin that only appears on the days you choose (default Saturday and Sunday).", isEnabled: false, ticketsPerAward: 1, spinsPerDay: 1, expiryMode: "end_of_day", expiryHours: 24, dailyBudgetKobo: 200000, guaranteeAfterLosses: 8, config: {"active_weekdays": "Saturday,Sunday"} },
  { key: "admin_gift", label: "Admin gift tickets", description: "Tickets you send by hand to one user, a tier, or everyone (competitions, apologies, promos).", isEnabled: true, ticketsPerAward: 1, spinsPerDay: 0, expiryMode: "hours", expiryHours: 24, dailyBudgetKobo: 0, guaranteeAfterLosses: 0, config: {} },
]

export const SPIN_DEFAULT_PRIZES: SpinDefaultPrize[] = [
  { id: "seed-streak_milestone-1", sourceKey: "streak_milestone", label: "Better luck next time", prizeType: "nothing", amountKobo: 0, discountPercent: 0, maxDiscountKobo: 0, weight: 40, costKobo: 0, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#0F1E4D", sortOrder: 1 },
  { id: "seed-streak_milestone-2", sourceKey: "streak_milestone", label: "₦20 credit", prizeType: "wallet_credit", amountKobo: 2000, discountPercent: 0, maxDiscountKobo: 0, weight: 30, costKobo: 2000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: true, isJackpot: false, color: "#2563EB", sortOrder: 2 },
  { id: "seed-streak_milestone-3", sourceKey: "streak_milestone", label: "₦50 credit", prizeType: "wallet_credit", amountKobo: 5000, discountPercent: 0, maxDiscountKobo: 0, weight: 15, costKobo: 5000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#7C3AED", sortOrder: 3 },
  { id: "seed-streak_milestone-4", sourceKey: "streak_milestone", label: "₦100 credit", prizeType: "wallet_credit", amountKobo: 10000, discountPercent: 0, maxDiscountKobo: 0, weight: 8, costKobo: 10000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#0891B2", sortOrder: 4 },
  { id: "seed-streak_milestone-5", sourceKey: "streak_milestone", label: "5% off next purchase", prizeType: "discount", amountKobo: 0, discountPercent: 5, maxDiscountKobo: 5000, weight: 6, costKobo: 5000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#059669", sortOrder: 5 },
  { id: "seed-streak_milestone-6", sourceKey: "streak_milestone", label: "₦500 JACKPOT", prizeType: "wallet_credit", amountKobo: 50000, discountPercent: 0, maxDiscountKobo: 0, weight: 1, costKobo: 50000, maxWinsPerDay: 1, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: true, color: "#D97706", sortOrder: 6 },
  { id: "seed-anytime-1", sourceKey: "anytime", label: "Better luck next time", prizeType: "nothing", amountKobo: 0, discountPercent: 0, maxDiscountKobo: 0, weight: 60, costKobo: 0, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#0F1E4D", sortOrder: 1 },
  { id: "seed-anytime-2", sourceKey: "anytime", label: "₦10 credit", prizeType: "wallet_credit", amountKobo: 1000, discountPercent: 0, maxDiscountKobo: 0, weight: 28, costKobo: 1000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: true, isJackpot: false, color: "#2563EB", sortOrder: 2 },
  { id: "seed-anytime-3", sourceKey: "anytime", label: "₦20 credit", prizeType: "wallet_credit", amountKobo: 2000, discountPercent: 0, maxDiscountKobo: 0, weight: 10, costKobo: 2000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#7C3AED", sortOrder: 3 },
  { id: "seed-anytime-4", sourceKey: "anytime", label: "₦50 credit", prizeType: "wallet_credit", amountKobo: 5000, discountPercent: 0, maxDiscountKobo: 0, weight: 2, costKobo: 5000, maxWinsPerDay: 5, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#0891B2", sortOrder: 4 },
  { id: "seed-purchase-1", sourceKey: "purchase", label: "Better luck next time", prizeType: "nothing", amountKobo: 0, discountPercent: 0, maxDiscountKobo: 0, weight: 55, costKobo: 0, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#0F1E4D", sortOrder: 1 },
  { id: "seed-purchase-2", sourceKey: "purchase", label: "₦10 credit", prizeType: "wallet_credit", amountKobo: 1000, discountPercent: 0, maxDiscountKobo: 0, weight: 30, costKobo: 1000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: true, isJackpot: false, color: "#2563EB", sortOrder: 2 },
  { id: "seed-purchase-3", sourceKey: "purchase", label: "₦30 credit", prizeType: "wallet_credit", amountKobo: 3000, discountPercent: 0, maxDiscountKobo: 0, weight: 12, costKobo: 3000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#7C3AED", sortOrder: 3 },
  { id: "seed-purchase-4", sourceKey: "purchase", label: "₦100 credit", prizeType: "wallet_credit", amountKobo: 10000, discountPercent: 0, maxDiscountKobo: 0, weight: 3, costKobo: 10000, maxWinsPerDay: 3, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#0891B2", sortOrder: 4 },
  { id: "seed-deposit-1", sourceKey: "deposit", label: "Better luck next time", prizeType: "nothing", amountKobo: 0, discountPercent: 0, maxDiscountKobo: 0, weight: 50, costKobo: 0, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#0F1E4D", sortOrder: 1 },
  { id: "seed-deposit-2", sourceKey: "deposit", label: "₦20 credit", prizeType: "wallet_credit", amountKobo: 2000, discountPercent: 0, maxDiscountKobo: 0, weight: 32, costKobo: 2000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: true, isJackpot: false, color: "#2563EB", sortOrder: 2 },
  { id: "seed-deposit-3", sourceKey: "deposit", label: "₦50 credit", prizeType: "wallet_credit", amountKobo: 5000, discountPercent: 0, maxDiscountKobo: 0, weight: 14, costKobo: 5000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#7C3AED", sortOrder: 3 },
  { id: "seed-deposit-4", sourceKey: "deposit", label: "₦200 credit", prizeType: "wallet_credit", amountKobo: 20000, discountPercent: 0, maxDiscountKobo: 0, weight: 4, costKobo: 20000, maxWinsPerDay: 2, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#0891B2", sortOrder: 4 },
  { id: "seed-referral-1", sourceKey: "referral", label: "Better luck next time", prizeType: "nothing", amountKobo: 0, discountPercent: 0, maxDiscountKobo: 0, weight: 30, costKobo: 0, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#0F1E4D", sortOrder: 1 },
  { id: "seed-referral-2", sourceKey: "referral", label: "₦50 credit", prizeType: "wallet_credit", amountKobo: 5000, discountPercent: 0, maxDiscountKobo: 0, weight: 40, costKobo: 5000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: true, isJackpot: false, color: "#2563EB", sortOrder: 2 },
  { id: "seed-referral-3", sourceKey: "referral", label: "₦100 credit", prizeType: "wallet_credit", amountKobo: 10000, discountPercent: 0, maxDiscountKobo: 0, weight: 22, costKobo: 10000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#7C3AED", sortOrder: 3 },
  { id: "seed-referral-4", sourceKey: "referral", label: "₦300 credit", prizeType: "wallet_credit", amountKobo: 30000, discountPercent: 0, maxDiscountKobo: 0, weight: 8, costKobo: 30000, maxWinsPerDay: 3, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#0891B2", sortOrder: 4 },
  { id: "seed-first_purchase_of_day-1", sourceKey: "first_purchase_of_day", label: "Better luck next time", prizeType: "nothing", amountKobo: 0, discountPercent: 0, maxDiscountKobo: 0, weight: 50, costKobo: 0, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#0F1E4D", sortOrder: 1 },
  { id: "seed-first_purchase_of_day-2", sourceKey: "first_purchase_of_day", label: "₦10 credit", prizeType: "wallet_credit", amountKobo: 1000, discountPercent: 0, maxDiscountKobo: 0, weight: 34, costKobo: 1000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: true, isJackpot: false, color: "#2563EB", sortOrder: 2 },
  { id: "seed-first_purchase_of_day-3", sourceKey: "first_purchase_of_day", label: "₦30 credit", prizeType: "wallet_credit", amountKobo: 3000, discountPercent: 0, maxDiscountKobo: 0, weight: 14, costKobo: 3000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#7C3AED", sortOrder: 3 },
  { id: "seed-first_purchase_of_day-4", sourceKey: "first_purchase_of_day", label: "₦100 credit", prizeType: "wallet_credit", amountKobo: 10000, discountPercent: 0, maxDiscountKobo: 0, weight: 2, costKobo: 10000, maxWinsPerDay: 3, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#0891B2", sortOrder: 4 },
  { id: "seed-spend_milestone-1", sourceKey: "spend_milestone", label: "Better luck next time", prizeType: "nothing", amountKobo: 0, discountPercent: 0, maxDiscountKobo: 0, weight: 20, costKobo: 0, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#0F1E4D", sortOrder: 1 },
  { id: "seed-spend_milestone-2", sourceKey: "spend_milestone", label: "₦50 credit", prizeType: "wallet_credit", amountKobo: 5000, discountPercent: 0, maxDiscountKobo: 0, weight: 40, costKobo: 5000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: true, isJackpot: false, color: "#2563EB", sortOrder: 2 },
  { id: "seed-spend_milestone-3", sourceKey: "spend_milestone", label: "₦100 credit", prizeType: "wallet_credit", amountKobo: 10000, discountPercent: 0, maxDiscountKobo: 0, weight: 25, costKobo: 10000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#7C3AED", sortOrder: 3 },
  { id: "seed-spend_milestone-4", sourceKey: "spend_milestone", label: "₦200 credit", prizeType: "wallet_credit", amountKobo: 20000, discountPercent: 0, maxDiscountKobo: 0, weight: 12, costKobo: 20000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#0891B2", sortOrder: 4 },
  { id: "seed-spend_milestone-5", sourceKey: "spend_milestone", label: "₦500 JACKPOT", prizeType: "wallet_credit", amountKobo: 50000, discountPercent: 0, maxDiscountKobo: 0, weight: 3, costKobo: 50000, maxWinsPerDay: 0, maxWinsPerWeek: 5, isGuaranteePrize: false, isJackpot: true, color: "#059669", sortOrder: 5 },
  { id: "seed-weekend-1", sourceKey: "weekend", label: "Better luck next time", prizeType: "nothing", amountKobo: 0, discountPercent: 0, maxDiscountKobo: 0, weight: 45, costKobo: 0, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#0F1E4D", sortOrder: 1 },
  { id: "seed-weekend-2", sourceKey: "weekend", label: "₦10 credit", prizeType: "wallet_credit", amountKobo: 1000, discountPercent: 0, maxDiscountKobo: 0, weight: 30, costKobo: 1000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: true, isJackpot: false, color: "#2563EB", sortOrder: 2 },
  { id: "seed-weekend-3", sourceKey: "weekend", label: "₦25 credit", prizeType: "wallet_credit", amountKobo: 2500, discountPercent: 0, maxDiscountKobo: 0, weight: 18, costKobo: 2500, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#7C3AED", sortOrder: 3 },
  { id: "seed-weekend-4", sourceKey: "weekend", label: "₦100 credit", prizeType: "wallet_credit", amountKobo: 10000, discountPercent: 0, maxDiscountKobo: 0, weight: 6, costKobo: 10000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#0891B2", sortOrder: 4 },
  { id: "seed-weekend-5", sourceKey: "weekend", label: "₦200 credit", prizeType: "wallet_credit", amountKobo: 20000, discountPercent: 0, maxDiscountKobo: 0, weight: 1, costKobo: 20000, maxWinsPerDay: 3, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: true, color: "#059669", sortOrder: 5 },
  { id: "seed-admin_gift-1", sourceKey: "admin_gift", label: "Better luck next time", prizeType: "nothing", amountKobo: 0, discountPercent: 0, maxDiscountKobo: 0, weight: 10, costKobo: 0, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#0F1E4D", sortOrder: 1 },
  { id: "seed-admin_gift-2", sourceKey: "admin_gift", label: "₦20 credit", prizeType: "wallet_credit", amountKobo: 2000, discountPercent: 0, maxDiscountKobo: 0, weight: 40, costKobo: 2000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: true, isJackpot: false, color: "#2563EB", sortOrder: 2 },
  { id: "seed-admin_gift-3", sourceKey: "admin_gift", label: "₦50 credit", prizeType: "wallet_credit", amountKobo: 5000, discountPercent: 0, maxDiscountKobo: 0, weight: 30, costKobo: 5000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#7C3AED", sortOrder: 3 },
  { id: "seed-admin_gift-4", sourceKey: "admin_gift", label: "₦100 credit", prizeType: "wallet_credit", amountKobo: 10000, discountPercent: 0, maxDiscountKobo: 0, weight: 15, costKobo: 10000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#0891B2", sortOrder: 4 },
  { id: "seed-admin_gift-5", sourceKey: "admin_gift", label: "₦200 credit", prizeType: "wallet_credit", amountKobo: 20000, discountPercent: 0, maxDiscountKobo: 0, weight: 5, costKobo: 20000, maxWinsPerDay: 0, maxWinsPerWeek: 0, isGuaranteePrize: false, isJackpot: false, color: "#059669", sortOrder: 5 },
]

export const SPIN_SETTING_DEFS: SpinSettingDef[] = [
  { key: "spin_popup_enabled", label: "Spin popup on dashboard", description: "Show the spin popup as soon as a user with a ticket opens the dashboard. The inline card below the banner always shows regardless.", defaultValue: "true", type: "boolean" },
  { key: "spin_global_daily_cap_per_user", label: "Max spins per user per day (all sources)", description: "Anti-abuse cap across every source. 0 = no cap.", defaultValue: "5", type: "number" },
  { key: "spin_global_daily_budget_kobo", label: "Global daily prize budget (kobo)", description: "Total prize cost allowed per UTC day across every source. 0 = no cap.", defaultValue: "0", type: "number" },
  { key: "spin_max_accounts_per_device_per_day", label: "Max accounts spinning from one device per day", description: "Blocks ticket farming from one device. 0 = off.", defaultValue: "10", type: "number" },
  { key: "spin_max_spins_per_ip_per_day", label: "Max spins per IP address per day", description: "Blocks farming from one IP. 0 = off (note: mobile networks share IPs, keep generous).", defaultValue: "0", type: "number" },
  { key: "spin_winner_feed_enabled", label: "Show winner announcements", description: "Show 'A user just won ...' messages (names masked) on the dashboard.", defaultValue: "true", type: "boolean" },
  { key: "spin_winner_feed_min_kobo", label: "Winner feed minimum prize (kobo)", description: "Only prizes worth at least this much appear in the winner feed.", defaultValue: "10000", type: "number" },
  { key: "spin_winner_feed_limit", label: "Winner feed size", description: "How many recent winners to show.", defaultValue: "10", type: "number" },
  { key: "spin_push_ticket_earned", label: "Push when a spin is earned", description: "Send a push notification the moment a user earns a spin ticket.", defaultValue: "true", type: "boolean" },
  { key: "spin_push_expiry_nudge", label: "Push before a ticket expires", description: "Remind users who still hold an unused spin close to its expiry.", defaultValue: "true", type: "boolean" },
  { key: "spin_push_expiry_window_hours", label: "Expiry reminder window (hours)", description: "Send the reminder when a ticket will expire within this many hours.", defaultValue: "3", type: "number" },
  { key: "spin_push_anytime_ready", label: "Push daily free spin reminder", description: "Remind subscribed users each day that their anytime/weekend spin is ready.", defaultValue: "false", type: "boolean" },
]
