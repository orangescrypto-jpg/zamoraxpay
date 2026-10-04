// app/api/admin/upload-file/route.ts
// Same handler as /api/admin/upload, exposed on a second path. The original
// path answered POST with an empty HTTP 405 on the deployed Worker, so the
// admin UI now posts here. Both paths share one implementation.
export { POST } from "../upload/route"
