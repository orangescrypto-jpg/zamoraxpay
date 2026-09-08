// src/services/providers/vtu/registry.ts
// Single place that lists every available VTU adapter.
//
// To add a 5th provider later: write its adapter file (same pattern as
// cheapdatahub.ts / pairgate.ts / vtpass.ts / vtung.ts), import it
// below, add it to the map, and add a matching row to
// vtu_provider_configs in the database (or seed it in migrations). No
// other file in the app needs to change — the router, checkout flows,
// and admin panel all read from this registry + the DB config.

import type { IVtuProviderAdapter } from "@/src/services/providers/vtu/types"
import { cheapdatahubAdapter } from "@/src/services/providers/vtu/cheapdatahub"
import { pairgateAdapter } from "@/src/services/providers/vtu/pairgate"
import { vtpassAdapter } from "@/src/services/providers/vtu/vtpass"
import { vtungAdapter } from "@/src/services/providers/vtu/vtung"

export const VTU_PROVIDER_REGISTRY: Record<string, IVtuProviderAdapter> = {
  cheapdatahub: cheapdatahubAdapter,
  pairgate: pairgateAdapter,
  vtpass: vtpassAdapter,
  vtung: vtungAdapter,
}

export function getVtuAdapter(providerKey: string): IVtuProviderAdapter | null {
  return VTU_PROVIDER_REGISTRY[providerKey] ?? null
}
