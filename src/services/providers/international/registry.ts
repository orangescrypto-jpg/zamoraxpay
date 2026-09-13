// src/services/providers/international/registry.ts
// Single place that lists every available international top-up
// adapter — same pattern as the VTU registry
// (src/services/providers/vtu/registry.ts).
//
// Only VTUGate implements this product today. To add a second provider
// later: write its adapter file (same pattern as vtugate.ts), import it
// below, add it to the map, and add "international_topup" to that
// provider's supports_services in vtu_provider_configs. No other file
// needs to change — internationalTopupService.ts resolves the active
// provider from vtu_provider_configs exactly like the VTU router does
// for every other service.

import type { IInternationalTopupAdapter } from "@/src/services/providers/international/types"
import { vtugateInternationalAdapter } from "@/src/services/providers/international/vtugate"

export const INTERNATIONAL_TOPUP_REGISTRY: Record<string, IInternationalTopupAdapter> = {
  vtugate: vtugateInternationalAdapter,
}

export function getInternationalTopupAdapter(providerKey: string): IInternationalTopupAdapter | null {
  return INTERNATIONAL_TOPUP_REGISTRY[providerKey] ?? null
}
