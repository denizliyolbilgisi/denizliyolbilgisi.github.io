// Uygulamada geçirilen süre: sadece ekran açıkken sayılır (kurucu ve yönetici görür)
import * as api from "./api.js";

const INTERVAL_MS = 3 * 60 * 1000;
const MAX = 900;

let visibleSince = 0;
let pending = 0;
let timer = null;

function flush(stillVisible) {
  const now = Date.now();
  const elapsed = visibleSince ? Math.floor((now - visibleSince) / 1000) : 0;
  visibleSince = stillVisible ? now : 0;
  const seconds = Math.min(elapsed + pending, MAX);
  pending = 0;
  if (seconds < 5) {
    pending = seconds;
    return;
  }
  if (!api.myId()) return;
  api.usagePing(seconds).catch(() => {
    pending = Math.min(pending + seconds, MAX);
  });
}

function onVisible() {
  if (!visibleSince) visibleSince = Date.now();
  clearInterval(timer);
  timer = setInterval(() => flush(true), INTERVAL_MS);
}

function onHidden() {
  clearInterval(timer);
  timer = null;
  flush(false);
}

export function startUsageTracking() {
  document.addEventListener("visibilitychange", () => {
    document.visibilityState === "visible" ? onVisible() : onHidden();
  });
  window.addEventListener("pagehide", onHidden);
  if (document.visibilityState === "visible") onVisible();
}
