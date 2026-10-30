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
