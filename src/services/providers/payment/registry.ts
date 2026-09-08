// src/services/providers/payment/registry.ts
// Single place that lists every available payment adapter.
// Same pattern as the VTU registry — add a new gateway by writing its
// adapter file and registering it here + in payment_provider_configs.

import type { IPaymentProviderAdapter } from "@/src/services/providers/payment/types"
import { korapayAdapter } from "@/src/services/providers/payment/korapay"
import { paystackAdapter } from "@/src/services/providers/payment/paystack"

export const PAYMENT_PROVIDER_REGISTRY: Record<string, IPaymentProviderAdapter> = {
  korapay: korapayAdapter,
  paystack: paystackAdapter,
}

export function getPaymentAdapter(providerKey: string): IPaymentProviderAdapter | null {
  return PAYMENT_PROVIDER_REGISTRY[providerKey] ?? null
}
