// Ortak parçalar: arayüz kütüphanesi, Supabase bağlantısı ve yardımcılar
export {
  html, render, useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect
} from "../vendor/preact-htm.js";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

// Supabase (vendor/supabase.js sayfada önceden yüklenir)
export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// ---------------------------------------------------------------------------
// Cihaz
// ---------------------------------------------------------------------------

/** iPhone / iPad mi? (iPadOS kendini Mac gibi tanıtır, dokunmatik ekrandan anlaşılır) */
export function isAppleMobile() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1;
}

/** Ana ekrana eklenmiş uygulama olarak mı açıldı? */
export function isStandalone() {
  return window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
}

/** Gizli deneme modu (#deneme ile bilgisayardan açılır) */
export function isTestMode() {
  try {
    if (location.hash.replace(/^#\/?/, "").startsWith("deneme")) localStorage.setItem("dyb_deneme", "1");
    return localStorage.getItem("dyb_deneme") === "1";
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Yerel kayıt (hata olursa sessizce geçer)
// ---------------------------------------------------------------------------
export const store = {
  get(key, def = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? def : JSON.parse(v);
    } catch (_) {
      return def;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) { /* yer yok / gizli mod */ }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (_) { /* */ }
  },
};

// ---------------------------------------------------------------------------
// Hata mesajları (teknik ayrıntı asla gösterilmez)
// ---------------------------------------------------------------------------
const SAFE_PREFIXES = [
  "Bu kullanıcı özel", "Bu kullanıcıya özel", "Özel mesajların kapalı", "Bu kişiyi engelledin", "Bu üyeye mesaj",
  "Kendine mesaj", "Kendini engelleyemezsin", "Kurucu ve yöneticiler", "Konuşma bulunamadı", "Bugün çok fazla",
  "Sadece kendi mesajını", "Geçersiz bildirim", "Bildirim bulunamadı",
  "Yeni kod için", "Çok hızlı yazıyorsun", "Çok fazla bildirim", "Geçersiz radar", "Radar bulunamadı",
  "Giriş gerekli", "Davet kodu", "Geçersiz veya kullanılmış", "Kullanıcı adı", "Bu kullanıcı adı",
  "Susturuldun", "Hesabın askıya alındı", "Yöneticiler", "Sebep yazmalısın", "Bu işlem için yetkin yok",
  "Üye bulunamadı", "Geçersiz süre", "Geçersiz rol", "Kurucu", "Şikayet", "Kendi mesajını",
  "Bu mesajı zaten", "Mesaj bulunamadı", "Fotoğraf", "En fazla 5 fotoğraf", "Geçersiz fotoğraf",
  "Boş mesaj", "Bu odada susturuldun", "Bu odaya sadece", "Sohbet odası", "Odada en fazla",
  "Açıklama en fazla", "Hakkımda", "Kurucunun şifresi", "Şifre şu an", "Şifre değiştirilemedi",
  "Oturumun sona erdi", "Güncelleme dosyası", "Bir mesajda en fazla", "Mesaj sadece", "Mesaj en fazla",
  "Geçersiz tepki",
];

export function userMessage(err, fallback = "İşlem şu an tamamlanamadı. Lütfen tekrar dene.") {
  if (!err) return fallback;
  const raw = String(err.message || err.error_description || err.msg || err || "");
  const head = raw.split("\n")[0].trim();
  const t = head.toLowerCase();
  if (err.name === "TypeError" || t.includes("failed to fetch") || t.includes("load failed") ||
      t.includes("network") || !navigator.onLine) {
    return "İnternet bağlantını kontrol edip tekrar dene.";
  }
  if (t.includes("invalid login credentials") || t.includes("invalid_credentials") || t.includes("invalid_grant")) {
    return "E-posta veya şifre hatalı.";
  }
  if (t.includes("email not confirmed")) return "E-posta adresin henüz onaylanmamış. Gelen kutunu kontrol et.";
  if (t.includes("already registered") || t.includes("already exists") || t.includes("already been registered")) {
    return "Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.";
  }
  if (t.includes("rate limit") || t.includes("too many")) return "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar dene.";
  if (t.includes("password") && (t.includes("weak") || t.includes("at least") || t.includes("short"))) {
    return "Şifre yeterince güçlü değil. Daha uzun bir şifre seç.";
  }
  if (t.includes("different from the old password") || t.includes("same_password")) {
    return "Yeni şifre eskisiyle aynı olamaz.";
  }
  if (t.includes("invalid") && t.includes("email")) return "Geçerli bir e-posta adresi gir.";
  if (t.includes("jwt") || t.includes("refresh token")) return "Oturumun sona erdi. Çıkış yapıp tekrar giriş yap.";
  if (SAFE_PREFIXES.some((p) => head.startsWith(p))) return head;
  return fallback;
}

// ---------------------------------------------------------------------------
// Zaman
// ---------------------------------------------------------------------------
export function parseTime(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function isStillActive(until) {
  const d = parseTime(until);
  return !!d && d.getTime() > Date.now();
}

const pad = (n) => String(n).padStart(2, "0");

export function agoText(s) {
  const d = parseTime(s);
  if (!d) return "";
  const min = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  if (min < 1440) return `${Math.floor(min / 60)} saat önce`;
  return `${Math.floor(min / 1440)} gün önce`;
}

export function clock(s) {
  const d = parseTime(s);
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
}

/** Bugünse "14:05", değilse "24.10 14:05" */
export function chatTime(s) {
  const d = parseTime(s);
  if (!d) return "";
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  return same ? clock(s) : `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${clock(s)}`;
}

export function dateText(s) {
  const d = parseTime(s);
  return d ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}` : "-";
}

/** "3 saat 20 dk", "15 gün 4 saat", "süresiz" */
export function remainingText(until) {
  const d = parseTime(until);
  if (!d) return "";
  if (d.getFullYear() >= 9999) return "süresiz";
  const m = Math.max(1, Math.ceil((d.getTime() - Date.now()) / 60000));
  if (m >= 1440) return `${Math.floor(m / 1440)} gün ${Math.floor((m % 1440) / 60)} saat`;
  if (m >= 60) return `${Math.floor(m / 60)} saat ${m % 60} dk`;
  return `${m} dk`;
}

/** Saniye -> "0 dk", "12 dk", "2 sa 5 dk" */
export function durationText(sec) {
  if (sec === null || sec === undefined) return "-";
  const min = Math.floor(sec / 60);
  if (min < 1) return sec > 0 ? "<1 dk" : "0 dk";
  if (min < 60) return `${min} dk`;
  return `${Math.floor(min / 60)} sa ${min % 60} dk`;
}

// ---------------------------------------------------------------------------
// Roller
// ---------------------------------------------------------------------------
export function roleRank(role) {
  return { kurucu: 4, yonetici: 3, moderator: 2 }[role] || 1;
}
export function roleBadge(role) {
  return { kurucu: "👑", yonetici: "🛡", moderator: "⭐" }[role] || "";
}
export function roleLabel(role) {
  return { kurucu: "Kurucu", yonetici: "Yönetici", moderator: "Moderatör" }[role] || "Üye";
}

// ---------------------------------------------------------------------------
// Kullanıcı adı kuralları (asıl kontrol sunucuda)
// ---------------------------------------------------------------------------
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

export function cleanUsername(input) {
  const map = { ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", I: "i", İ: "i", ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
    " ": "_", "-": "_", ".": "_" };
  let out = "";
  for (const ch of input) {
    const c = map[ch] ?? ch.toLowerCase();
    if (/^[a-z0-9_]$/.test(c)) out += c;
  }
  return out.slice(0, USERNAME_MAX);
}

export function usernameLocalError(name) {
  if (name.length < USERNAME_MIN) return `Kullanıcı adı en az ${USERNAME_MIN} karakter olmalı.`;
  if (!/[a-z]/.test(name)) return "Kullanıcı adı en az bir harf içermeli.";
  if (name.startsWith("_") || name.endsWith("_") || name.includes("__")) {
    return "Kullanıcı adı _ ile başlayıp bitemez ve yan yana iki _ içeremez.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Gezinme (adres çubuğundaki # kısmı)
// ---------------------------------------------------------------------------
export function navigate(path, replace = false) {
  const target = "#" + path;
  if (replace) location.replace(target);
  else location.hash = path;
}

export function currentPath() {
  const h = location.hash.replace(/^#/, "");
  if (!h || h === "deneme" || h === "/deneme") return "/";
  return h.startsWith("/") ? h : "/" + h;
}

// ---------------------------------------------------------------------------
// Kısa bildirim (toast)
// ---------------------------------------------------------------------------
export function toast(text, ms = 3000) {
  window.dispatchEvent(new CustomEvent("dyb-toast", { detail: { text, ms } }));
}

/** Panoya kopyala */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (_) { /* */ }
    ta.remove();
    return ok;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
