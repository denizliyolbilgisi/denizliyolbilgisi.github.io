// DYB – arka plan görevlisi: bildirimleri gösterir ve uygulama dosyalarını saklar.
// Yeni sürüm yüklerken aşağıdaki sürüm numarasını artırın.
const VERSION = "dyb-1.1.5";

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/app.js",
  "./js/config.js",
  "./js/lib.js",
  "./js/api.js",
  "./js/ui.js",
  "./js/push.js",
  "./js/usage.js",
  "./js/screens/auth.js",
  "./js/screens/menu.js",
  "./js/screens/chat.js",
  "./js/screens/dm.js",
  "./js/screens/map.js",
  "./js/screens/invites.js",
  "./js/screens/settings.js",
  "./js/screens/admin.js",
  "./js/screens/profile.js",
  "./vendor/preact-htm.js",
  "./vendor/supabase.js",
  "./vendor/emoji/picker.js",
  "./vendor/emoji/database.js",
  "./vendor/emoji/tr.js",
  "./vendor/emoji/data.json",
  "./vendor/leaflet/leaflet.js",
  "./vendor/leaflet/leaflet.css",
  "./icons/icon-192.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Önce internetten (her zaman en yeni sürüm), internet yoksa saklanandan
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase, harita vb. karışmaz
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});

// ---------- Bildirim geldi ----------
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { data: { title: "DYB", body: event.data ? event.data.text() : "" } };
  }
  const d = payload.data || payload.notification || payload;
  const type = d.type || "chat";
  const title = d.title || "DYB";
  let body = d.body || "";
  let url = "./#/menu";
  let tag = "dyb";

  if (type === "radar") {
    url = d.radar_id ? `./#/harita?radar=${encodeURIComponent(d.radar_id)}` : "./#/harita";
    tag = "radar-" + (d.radar_id || Date.now());
  } else if (type === "yardim") {
    url = "./#/davetler";                       // güncelleme yapamayan davetli
    tag = "yardim";
  } else if (type === "dm") {
    url = d.sender_id ? `./#/mesaj/${encodeURIComponent(d.sender_id)}` : "./#/mesajlar";   // özel mesaj
    tag = "dm-" + (d.sender_id || "");
  } else if (type === "sifre") {
    url = "./#/yonetim?tab=sifre";              // şifre yenileme talebi
    tag = "sifre";
  } else {
    // Sohbet ve etiket ("mention"): o odayı ve mesajı açar
    const room = d.room || "trafik";
    url = `./#/oda/${encodeURIComponent(room)}` + (d.message_id ? `?m=${encodeURIComponent(d.message_id)}` : "");
    tag = "oda-" + room;
  }

  // Uygulama açıksa ekranı hemen yenilet (rozet, oda listesi, sohbet)
  const tellClients = self.clients.matchAll({ type: "window", includeUncontrolled: true })
    .then((all) => all.forEach((c) => { try { c.postMessage({ type: "dyb-live", kind: type }); } catch (_) { /* */ } }))
    .catch(() => {});

  event.waitUntil(Promise.all([tellClients,
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      icon: "./icons/icon-192.png",
      badge: "./icons/badge-96.png",
      data: { url },
    })]));
});

// ---------- Bildirime dokunuldu ----------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.location.href).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of all) {
      try {
        await client.focus();
        client.postMessage({ type: "dyb-open", url: target });
        return;
      } catch (_) { /* */ }
    }
    await self.clients.openWindow(target);
  })());
});
