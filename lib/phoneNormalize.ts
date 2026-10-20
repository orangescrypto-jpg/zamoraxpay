/** Normalize Nigerian phone numbers from paste/typing. Frontend only. */
export function normalizeNgPhone(raw: string): string {
  let s = raw.replace(/[\s\-().]/g, "")
  if (s.startsWith("+234")) s = "0" + s.slice(4)
  else if (s.startsWith("234") && s.length >= 13) s = "0" + s.slice(3)
  else if (s.startsWith("2340") && s.length >= 14) s = "0" + s.slice(4)
  // keep digits only after country handling
  s = s.replace(/\D/g, "")
  if (s.length === 10 && s[0] !== "0") s = "0" + s
  return s.slice(0, 11)
}
