// Bildirimler: Firebase üzerinden iPhone'a bildirim adresi alınır ve Supabase'e kaydedilir.
import { FIREBASE_CONFIG, VAPID_KEY } from "./config.js";
import { store } from "./lib.js";
import * as api from "./api.js";

const TOKEN_KEY = "dyb_push_token";

/** Firebase bilgileri girildi mi? */
export const pushConfigured = () => !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.appId && VAPID_KEY);

/** Bu cihaz/tarayıcı bildirim alabilir mi? (iPhone'da sadece ana ekrana eklenmiş uygulamada) */
export const pushSupported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const permission = () => ("Notification" in window ? Notification.permission : "unsupported");

let messagingPromise = null;
function messaging() {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const { initializeApp } = await import("../vendor/firebase-app.js");
      const m = await import("../vendor/firebase-messaging.js");
      const app = initializeApp(FIREBASE_CONFIG);
      return { mod: m, messaging: m.getMessaging(app) };
    })();
  }
  return messagingPromise;
}

async function currentToken() {
  const reg = await navigator.serviceWorker.ready;
  const { mod, messaging: msg } = await messaging();
  return mod.getToken(msg, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
}

/** "Bildirimleri Aç" düğmesinden çağrılır (iPhone izni sadece dokunuşla sorar). */
export async function enablePush() {
  if (!pushConfigured()) throw new Error("Bildirim ayarları henüz yapılmadı.");
  if (!pushSupported()) throw new Error("Bildirim için uygulamayı ana ekrana ekleyip oradan açmalısın.");
  const p = await Notification.requestPermission();
  if (p !== "granted") throw new Error("Bildirim izni verilmedi. iPhone Ayarlar → Bildirimler → DYB'den açabilirsin.");
  const token = await currentToken();
  if (!token) throw new Error("Bildirim adresi alınamadı. Biraz sonra tekrar dene.");
  await api.registerDevice(token);
  store.set(TOKEN_KEY, token);
  return token;
}

/** Uygulama açılınca: izin zaten verildiyse adresi sessizce tazele */
export async function refreshPush() {
  try {
    if (!pushConfigured() || !pushSupported() || permission() !== "granted") return;
    const token = await currentToken();
    if (!token) return;
    await api.registerDevice(token);
    store.set(TOKEN_KEY, token);
  } catch (_) { /* bir sonraki açılışta tekrar denenir */ }
}

/** Çıkış yaparken: bu cihaza artık bildirim gitmesin */
export async function disablePush() {
  const token = store.get(TOKEN_KEY);
  if (token) {
    try {
      await api.unregisterDevice(token);
    } catch (_) { /* */ }
  }
  store.remove(TOKEN_KEY);
  try {
    if (pushConfigured() && pushSupported()) {
      const { mod, messaging: msg } = await messaging();
      await mod.deleteToken(msg);
    }
  } catch (_) { /* */ }
}
