// src/services/analytics.ts
// Service abstraction layer — admin dashboard analytics.
// Aggregates computed in SQL (not by pulling full lists into the
// browser and reducing them client-side), so this stays fast and
// accurate as the user/order tables grow.

import { d1Query } from "@/lib/d1"

export interface DashboardOverview {
  totalUsers: number
  activeUsers: number
  suspendedUsers: number
  resellerUsers: number
  totalWalletBalanceKobo: number
  totalOrders: number
  successfulOrders: number
  failedOrders: number
  pendingOrders: number
  successfulVolumeKobo: number
  ordersToday: number
  volumeTodayKobo: number
  newUsersToday: number
  newUsersThisWeek: number
  openFraudFlags: number
}

export interface ServiceBreakdown {
  serviceType: string
  orderCount: number
  successCount: number
  volumeKobo: number
}

export interface DailyVolumePoint {
  date: string
  orderCount: number
  volumeKobo: number
}

export interface ProviderPerformance {
  providerKey: string
  fulfilledCount: number
}

export async function getDashboardOverview(nativeDB?: any): Promise<DashboardOverview> {
  const [
    userCounts,
    walletTotal,
    orderCounts,
    volumeTotal,
    todayOrders,
    todayVolume,
    newUsersToday,
    newUsersWeek,
    openFraud,
  ] = await Promise.all([
    d1Query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status IN ('suspended','frozen') THEN 1 ELSE 0 END) AS suspended,
         SUM(CASE WHEN tier = 'reseller' THEN 1 ELSE 0 END) AS resellers
       FROM users`,
      [],
      nativeDB,
    ),
    d1Query(`SELECT COALESCE(SUM(balance_kobo), 0) AS total FROM wallets`, [], nativeDB),
    d1Query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
       FROM vtu_orders`,
      [],
      nativeDB,
    ),
    d1Query(
      `SELECT COALESCE(SUM(amount_kobo), 0) AS total FROM vtu_orders WHERE status = 'success'`,
      [],
      nativeDB,
    ),
    d1Query(
      `SELECT COUNT(*) AS count FROM vtu_orders WHERE date(created_at) = date('now')`,
      [],
      nativeDB,
    ),
    d1Query(
      `SELECT COALESCE(SUM(amount_kobo), 0) AS total FROM vtu_orders WHERE status = 'success' AND date(created_at) = date('now')`,
      [],
      nativeDB,
    ),
    d1Query(`SELECT COUNT(*) AS count FROM users WHERE date(created_at) = date('now')`, [], nativeDB),
    d1Query(`SELECT COUNT(*) AS count FROM users WHERE created_at >= datetime('now', '-7 days')`, [], nativeDB),
    d1Query(`SELECT COUNT(*) AS count FROM fraud_flags WHERE status = 'open'`, [], nativeDB),
  ])

  const u = userCounts.results?.[0] ?? {}
  const o = orderCounts.results?.[0] ?? {}

  return {
    totalUsers: u.total ?? 0,
    activeUsers: u.active ?? 0,
    suspendedUsers: u.suspended ?? 0,
    resellerUsers: u.resellers ?? 0,
    totalWalletBalanceKobo: walletTotal.results?.[0]?.total ?? 0,
    totalOrders: o.total ?? 0,
    successfulOrders: o.success ?? 0,
    failedOrders: o.failed ?? 0,
    pendingOrders: o.pending ?? 0,
    successfulVolumeKobo: volumeTotal.results?.[0]?.total ?? 0,
    ordersToday: todayOrders.results?.[0]?.count ?? 0,
    volumeTodayKobo: todayVolume.results?.[0]?.total ?? 0,
    newUsersToday: newUsersToday.results?.[0]?.count ?? 0,
    newUsersThisWeek: newUsersWeek.results?.[0]?.count ?? 0,
    openFraudFlags: openFraud.results?.[0]?.count ?? 0,
  }
}

export async function getServiceBreakdown(nativeDB?: any): Promise<ServiceBreakdown[]> {
  const result = await d1Query(
    `SELECT
       service_type,
       COUNT(*) AS order_count,
       SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_count,
       COALESCE(SUM(CASE WHEN status = 'success' THEN amount_kobo ELSE 0 END), 0) AS volume_kobo
     FROM vtu_orders
     GROUP BY service_type
     ORDER BY volume_kobo DESC`,
    [],
    nativeDB,
  )
  return (result.results ?? []).map((r: any) => ({
    serviceType: r.service_type,
    orderCount: r.order_count,
    successCount: r.success_count,
    volumeKobo: r.volume_kobo,
  }))
}

export async function getDailyVolume(days = 14, nativeDB?: any): Promise<DailyVolumePoint[]> {
  const result = await d1Query(
    `SELECT
       date(created_at) AS date,
       COUNT(*) AS order_count,
       COALESCE(SUM(CASE WHEN status = 'success' THEN amount_kobo ELSE 0 END), 0) AS volume_kobo
     FROM vtu_orders
     WHERE created_at >= datetime('now', '-' || ? || ' days')
     GROUP BY date(created_at)
     ORDER BY date ASC`,
    [days],
    nativeDB,
  )
  return (result.results ?? []).map((r: any) => ({
    date: r.date,
    orderCount: r.order_count,
    volumeKobo: r.volume_kobo,
  }))
}

export async function getProviderPerformance(nativeDB?: any): Promise<ProviderPerformance[]> {
  const result = await d1Query(
    `SELECT provider_used AS provider_key, COUNT(*) AS fulfilled_count
     FROM vtu_orders
     WHERE status = 'success' AND provider_used IS NOT NULL
     GROUP BY provider_used
     ORDER BY fulfilled_count DESC`,
    [],
    nativeDB,
  )
  return (result.results ?? []).map((r: any) => ({
    providerKey: r.provider_key,
    fulfilledCount: r.fulfilled_count,
  }))
}
