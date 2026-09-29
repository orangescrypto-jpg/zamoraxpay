// src/services/providers/vtu/safeJson.ts
// Reads a provider response as JSON. When a provider returns an HTML page
// (wrong base URL, firewall challenge, 502/503 page) the thrown error names
// the provider, the HTTP status and the start of the page, so the admin
// "Provider attempts" view shows the real problem instead of
// "Unexpected token '<'".
export async function readJsonOrThrow(res: Response, label: string): Promise<any> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    const snippet = text.slice(0, 120).replace(/\s+/g, " ").trim()
    throw new Error(`${label} returned a non-JSON response (HTTP ${res.status}): ${snippet}`)
  }
}
