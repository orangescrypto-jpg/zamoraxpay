/// <reference lib="webworker" />
const sw = self;

const CACHE_NAME = "zamoraxpay-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/favicon.svg",
];

// ── Install — cache static assets ─────────────────────────────────────────
sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => sw.skipWaiting())
  );
});

// ── Activate — delete old caches ──────────────────────────────────────────
sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => sw.clients.claim())
  );
});

// ── Fetch — network first, cache fallback ─────────────────────────────────
sw.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (!url.protocol.startsWith("http")) return;

  // Never cache API calls, webhooks, or third-party payment/VTU/auth
  // services — these must always hit the network fresh.
  const skipPatterns = [
    "/api/",
    "supabase",
    "korapay",
    "paystack",
    "cheapdatahub",
    "pairgate",
    "vtpass",
    "vtu.ng",
    "r2.cloudflarestorage",
    "cloudflare",
    "googleapis",
  ];
  if (skipPatterns.some((p) => url.href.includes(p))) return;

  // Navigation requests — network first, cache fallback
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && (url.pathname === "/" || url.pathname.startsWith("/blog"))) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => {
            if (cached) return cached;
            if (!navigator.onLine) {
              return caches.match("/") ?? new Response("Offline — please check your connection", {
                status: 503,
                headers: { "Content-Type": "text/plain" },
              });
            }
            return new Response("Unable to load this page — please try again.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            });
          })
        )
    );
    return;
  }

  // Static assets — stale-while-revalidate
  if (url.pathname.match(/\.(js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const networkFetch = fetch(event.request)
            .then((response) => {
              if (response.ok) cache.put(event.request, response.clone());
              return response;
            })
            .catch(() => cached);

          return cached || networkFetch;
        })
      )
    );
    return;
  }
});

// ── Push notifications (wallet funded, purchase status, low balance) ──────
sw.addEventListener("push", (event) => {
  if (!event.data) return;

  let data = { title: "ZamoraxPay", body: "You have a new notification", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    data.body = event.data.text();
  }

  event.waitUntil(
    sw.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag ?? "zamoraxpay-notification",
      data: { url: data.url ?? "/" },
      vibrate: [200, 100, 200],
    })
  );
});

// ── Notification click ─────────────────────────────────────────────────────
sw.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/";

  event.waitUntil(
    sw.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find(
          (c) => new URL(c.url).pathname === new URL(targetUrl, sw.location.origin).pathname
        );
        if (existing) return existing.focus();
        return sw.clients.openWindow(targetUrl);
      })
  );
});
