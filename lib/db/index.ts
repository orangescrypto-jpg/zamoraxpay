// lib/db/index.ts
// Barrel re-export so routes can `import { d1Query } from "@/lib/db"`.
// The actual implementation lives in lib/d1.ts.

export { d1Query } from "@/lib/d1"
