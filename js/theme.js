// Görünüm: 📱 Telefona göre / 🌙 Koyu / ☀️ Açık (bu cihazda saklanır)
const KEY = "dyb_theme";
const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export function themePref() {
  try { return localStorage.getItem(KEY) || "system"; } catch (_) { return "system"; }
}

export function isDark() {
  const p = themePref();
  return p === "dark" || (p === "system" && !!mq?.matches);
}

export function applyTheme() {
  const dark = isDark();
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0B2240" : "#F2F4F7");
  window.dispatchEvent(new CustomEvent("dyb-theme"));
}

export function setThemePref(v) {
  try { localStorage.setItem(KEY, v); } catch (_) { /* */ }
  applyTheme();
}

mq?.addEventListener?.("change", () => { if (themePref() === "system") applyTheme(); });
applyTheme();

// ---------- 🔠 Yazı boyutu (5 seviye, bu cihazda saklanır) ----------
const TKEY = "dyb_text";
export const TEXT_LEVELS = [0.85, 0.92, 1, 1.1, 1.2];
export const TEXT_NAMES = ["Çok küçük", "Küçük", "Normal", "Büyük", "Çok büyük"];

export function textLevel() {
  try {
    const v = parseInt(localStorage.getItem(TKEY) || "", 10);
    return v >= 1 && v <= 5 ? v : 3;
  } catch (_) { return 3; }
}

/** Bütün sayfa orantılı büyür / küçülür (haritada uygulanmaz: harita dokunuşları bozulmasın) */
export function applyText() {
  const onMap = /^#\/(harita|eczane-harita)/.test(location.hash || "");
  const z = onMap ? 1 : TEXT_LEVELS[textLevel() - 1];
  document.documentElement.style.setProperty("--z", String(z));
}

export function setTextLevel(n) {
  try { localStorage.setItem(TKEY, String(n)); } catch (_) { /* */ }
  applyText();
}

window.addEventListener("hashchange", applyText);
applyText();
