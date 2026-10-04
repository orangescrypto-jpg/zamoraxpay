export interface Env {
  PRIMARY_APP: Fetcher
  PRIMARY_HEALTH_PATH?: string
  BACKUP_ORIGINS?: string
}

const SAFE_FAILOVER_METHODS = new Set(["GET", "HEAD", "OPTIONS"])
const RETRYABLE_STATUS = new Set([502, 503, 504])
const HEALTH_TIMEOUT_MS = 2500

function backupOrigins(env: Env): string[] {
  return (env.BACKUP_ORIGINS || "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("origin timeout")), ms),
    ),
  ])
}

function backupRequest(request: Request, origin: string): Request {
  const incoming = new URL(request.url)
  const target = new URL(origin)
  target.pathname = incoming.pathname
  target.search = incoming.search
  return new Request(target.toString(), request)
}

async function fetchBackup(request: Request, origin: string): Promise<Response> {
  return fetch(backupRequest(request, origin), {
    redirect: "manual",
  })
}

async function primaryFetch(request: Request, env: Env): Promise<Response> {
  return env.PRIMARY_APP.fetch(request)
}

async function isBackupHealthy(origin: string, healthPath: string): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
  try {
    const response = await fetch(`${origin}${healthPath}`, {
      method: "GET",
      headers: { "x-zamorax-health-check": "1" },
      signal: controller.signal,
      cf: { cacheTtl: 0, cacheEverything: false },
    })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function route(request: Request, env: Env): Promise<Response> {
  const method = request.method.toUpperCase()
  const backups = backupOrigins(env)

  try {
    const response = await primaryFetch(request, env)

    if (!RETRYABLE_STATUS.has(response.status) || !SAFE_FAILOVER_METHODS.has(method)) {
      return response
    }
  } catch {
    if (!SAFE_FAILOVER_METHODS.has(method)) {
      return new Response("Primary application unavailable. Please retry the request.", {
        status: 503,
        headers: { "cache-control": "no-store" },
      })
    }
  }

  for (const origin of backups) {
    if (!(await isBackupHealthy(origin, env.PRIMARY_HEALTH_PATH || "/api/health"))) continue

    try {
      const response = await fetchBackup(request, origin)
      if (response.status < 500) return response
    } catch {
      // Try the next configured backup origin.
    }
  }

  return new Response("ZamoraxPay is temporarily unavailable. Please try again shortly.", {
    status: 503,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/__failover/health") {
      return Response.json({ status: "ok", service: "zamoraxpay-failover" })
    }

    return route(request, env)
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const healthPath = env.PRIMARY_HEALTH_PATH || "/api/health"
    const results = await Promise.all(
      backupOrigins(env).map(async (origin) => ({
        origin,
        healthy: await isBackupHealthy(origin, healthPath),
      })),
    )

    console.log(JSON.stringify({ type: "backup-health", results }))
  },
}
