// Sunucu (Supabase) işlemleri – Android'deki Repository dosyalarının karşılığı
import { sb } from "./lib.js";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

/** Hata varsa fırlat, yoksa veriyi döndür */
function check({ data, error }) {
  if (error) throw error;
  return data;
}
const rpc = async (name, args = {}) => check(await sb.rpc(name, args));

// ---------------------------------------------------------------------------
// Oturum
// ---------------------------------------------------------------------------
let cachedSession = null;
sb.auth.onAuthStateChange((_e, s) => { cachedSession = s; });

export async function session() {
  const { data } = await sb.auth.getSession();
  cachedSession = data.session;
  return data.session;
}
export const myId = () => cachedSession?.user?.id ?? null;
export const accessToken = () => cachedSession?.access_token ?? null;

export async function signIn(email, password) {
  check(await sb.auth.signInWithPassword({ email, password }));
}

/** Kayıt. Oturum açıldıysa true; e-posta onayı gerekiyorsa false */
export async function signUp(email, password, inviteCode, username) {
  const data = check(await sb.auth.signUp({
    email, password,
    options: {
      data: { invite_code: inviteCode, username },
      emailRedirectTo: location.origin + location.pathname,
    },
  }));
  return !!data.session;
}

export async function signOut() {
  try {
    await sb.auth.signOut();
  } catch (_) { /* yine de yerelden çıkılır */ }
}

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------
export async function me() {
  const uid = myId() ?? (await session())?.user?.id;
  if (!uid) return null;
  return check(await sb.from("profiles").select("*").eq("id", uid).maybeSingle());
}

/** Uygunsa null, değilse sebep */
export async function checkUsername(name) {
  const r = await rpc("check_username", { p_username: name });
  return r === "ok" ? null : r;
}
export const setUsername = (name) => rpc("set_username", { p_username: name });
export const ackRoleNotice = () => rpc("ack_role_notice");
export const checkInvite = (code) => rpc("check_invite", { p_code: code });

// ---------------------------------------------------------------------------
// Uygulama ayarları (app_config)
// ---------------------------------------------------------------------------
let config = {};
export async function refreshConfig() {
  const rows = check(await sb.from("app_config").select("key,value"));
  config = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
  return config;
}
export const cfgText = (k, d = "") => (config[k] && String(config[k]).trim()) ? config[k] : d;
export const cfgInt = (k, d) => {
  const n = parseInt(config[k], 10);
  return isNaN(n) ? d : n;
};

// ---------------------------------------------------------------------------
// Odalar
// ---------------------------------------------------------------------------
export const FALLBACK_ROOMS = [
  { id: "trafik", name: "DYB-Trafik", icon: "🚦", description: "Yol, trafik, kaza, radar ve hava durumu bilgileri", sort_order: 1 },
  { id: "is_ilanlari", name: "DYB İş İlanları", icon: "💼", description: "İş arayanlar ve iş verenler için ilanlar", sort_order: 2 },
  { id: "alim_satim", name: "DYB Alım-Satım", icon: "🛒", description: "Alım, satım, kiralama ve takas ilanları", sort_order: 3 },
].map((r) => ({ rules: null, rules_version: 1, read_only: false, admin_ids: [], admin_names: [], my_power: 2, last_photos: 0, ...r }));

let roomsCache = FALLBACK_ROOMS;
export const cachedRooms = () => roomsCache;
export const cachedRoom = (id) => roomsCache.find((r) => r.id === id) ?? FALLBACK_ROOMS.find((r) => r.id === id) ?? FALLBACK_ROOMS[0];

export async function roomsOverview() {
  const list = await rpc("rooms_overview");
  if (list && list.length) roomsCache = list;
  return list || [];
}
export const roomMute = (room, user, minutes, reason) =>
  rpc("room_mute", { p_room: room, p_user: user, p_minutes: minutes, p_reason: reason });
export const roomUnmute = (room, user) => rpc("room_unmute", { p_room: room, p_user: user });
export const roomPin = (room, messageId) => rpc("room_pin", { p_room: room, p_message: messageId });
export const roomSetDescription = (room, text) => rpc("room_set_description", { p_room: room, p_text: text });
export const setRoomAdmin = (room, user, on) => rpc("admin_set_room_admin", { p_room: room, p_user: user, p_on: on });

/** Menüdeki "YENİ" işareti (sadece bu telefonda tutulur) */
export function lastSeenId(roomId) {
  try {
    return parseInt(localStorage.getItem("dyb_okundu_" + roomId) ?? "", 10);
  } catch (_) {
    return NaN;
  }
}
export function markSeen(roomId, id) {
  const cur = lastSeenId(roomId);
  if (isNaN(cur) || id > cur) {
    try {
      localStorage.setItem("dyb_okundu_" + roomId, String(id));
    } catch (_) { /* */ }
  }
}
export function hasUnread(room, myName) {
  if (!room.last_message_id) return false;
  const seen = lastSeenId(room.id);
  if (isNaN(seen)) {
    markSeen(room.id, room.last_message_id);   // ilk kez: eski mesajlar "yeni" sayılmasın
    return false;
  }
  if (myName && room.last_user === myName) return false;
  return room.last_message_id > seen;
}

// ---------------------------------------------------------------------------
// Mesajlar
// ---------------------------------------------------------------------------
const MSG_COLUMNS = "id, content, created_at, user_id, reply_to_id, photos, photos_expired, room_id, profiles(username, role)";

export async function latestMessages(roomId, count = 100) {
  const rows = check(await sb.from("messages").select(MSG_COLUMNS)
    .eq("room_id", roomId).order("id", { ascending: false }).limit(count));
  return rows.reverse();
}

export async function sendMessage(roomId, text, replyToId, photos) {
  const row = { content: text, room_id: roomId };
  if (replyToId) row.reply_to_id = replyToId;
  if (photos && photos.length) row.photos = photos;
  check(await sb.from("messages").insert(row));
}

export async function deleteMessage(id) {
  check(await sb.from("messages").delete().eq("id", id));
}

export function previewText(m) {
  const n = m.photos ? m.photos.length : 0;
  const photo = n > 1 ? `📷 ${n} fotoğraf` : n === 1 ? "📷 Fotoğraf" : null;
  const text = (m.content || "").trim() || null;
  return [photo, text].filter(Boolean).join(" ") || "Mesaj";
}

// ---------------------------------------------------------------------------
// Fotoğraflar (gizli depo: giriş anahtarıyla okunur)
// ---------------------------------------------------------------------------
const BUCKET = "chat-photos";
export const MAX_PHOTOS = 5;
const photoUrls = new Map();   // yol -> bellekteki adres

export async function photoUrl(path) {
  if (photoUrls.has(path)) return photoUrls.get(path);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${BUCKET}/${path}`, {
    headers: { Authorization: `Bearer ${accessToken()}`, apikey: SUPABASE_KEY },
  });
  if (!res.ok) throw new Error("Fotoğraf açılamadı");
  const url = URL.createObjectURL(await res.blob());
  photoUrls.set(path, url);
  return url;
}

/** Fotoğrafı küçültür (uzun kenar 1280), yönünü düzeltir, JPEG'e çevirir (konum bilgisi silinir) */
export function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const max = 1280;
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        c.toBlob((b) => {
          URL.revokeObjectURL(url);
          b ? resolve(b) : reject(new Error("Fotoğraf hazırlanamadı"));
        }, "image/jpeg", 0.75);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(new Error("Fotoğraf çok büyük, açılamadı. Başka bir fotoğraf dene."));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Fotoğraf açılamadı"));
    };
    img.src = url;
  });
}

export async function uploadPhoto(blob) {
  const uid = myId();
  if (!uid) throw new Error("Giriş gerekli");
  const path = `${uid}/${crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2)}.jpg`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken()}`, apikey: SUPABASE_KEY,
      "Content-Type": "image/jpeg", "x-upsert": "false",
    },
    body: blob,
  });
  if (!res.ok) throw new Error("Fotoğraf yüklenemedi. Lütfen tekrar dene.");
  return path;
}

export async function deletePhotos(paths) {
  if (!paths.length) return;
  try {
    await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken()}`, apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: paths }),
    });
  } catch (_) { /* */ }
}

// ---------------------------------------------------------------------------
// Şikayet ve Son İşlemler
// ---------------------------------------------------------------------------
export const REPORT_REASONS = [
  ["kufur", "Küfür / hakaret"], ["spam", "Spam"], ["yanlis", "Yanlış bilgi"], ["diger", "Diğer"],
];
export const reasonLabel = (c) => (REPORT_REASONS.find((r) => r[0] === c) || [0, "Diğer"])[1];

export const reportMessage = (id, reason, note) =>
  rpc("report_message", { p_message_id: id, p_reason: reason, p_note: note });
export const adminReports = (status) => rpc("admin_reports", { p_status: status });
export const openReportCount = () => rpc("admin_open_report_count");
export const resolveReport = (id, resolution) => rpc("admin_resolve_report", { p_id: id, p_resolution: resolution });
export const adminActivity = (category, userId, search, before) => rpc("admin_activity", {
  p_category: category || null, p_user: userId || null, p_search: search || null, p_before: before || null, p_limit: 100,
});

// ---------------------------------------------------------------------------
// Yönetim
// ---------------------------------------------------------------------------
export const adminMembers = () => rpc("admin_members");
export const adminMute = (user, minutes, reason) => rpc("admin_mute", { p_user: user, p_minutes: minutes, p_reason: reason });
export const adminUnmute = (user) => rpc("admin_unmute", { p_user: user });
export const adminBan = (user, reason) => rpc("admin_ban", { p_user: user, p_reason: reason });
export const adminUnban = (user) => rpc("admin_unban", { p_user: user });
export const adminSetRole = (user, role) => rpc("admin_set_role", { p_user: user, p_role: role });
export const adminUsageDetail = (user) => rpc("admin_usage_detail", { p_user: user });

// ---------------------------------------------------------------------------
// Radarlar
// ---------------------------------------------------------------------------
export const RADAR_TYPES = [
  { key: "sabit", label: "Sabit Radar", letter: "S", color: "#E53935" },
  { key: "mobil", label: "Mobil Radar", letter: "M", color: "#FB8C00" },
  { key: "cevirme", label: "Çevirme", letter: "Ç", color: "#8E24AA" },
  { key: "kamera", label: "Hız Kamerası", letter: "K", color: "#1E88E5" },
];
export const radarType = (k) => RADAR_TYPES.find((t) => t.key === k) || RADAR_TYPES[1];

export const nearbyRadars = (lat, lng, radius) =>
  rpc("nearby_radars", { p_lat: lat, p_lng: lng, p_radius_m: radius });
export const reportRadar = (type, lat, lng, place) =>
  rpc("report_radar", { p_type: type, p_lat: lat, p_lng: lng, p_place: place || null });
export const voteRadar = (id, stillThere) => rpc("vote_radar", { p_radar_id: id, p_still_there: stillThere });

/** Konumu "Cadde, Mahalle" adına çevirir (OpenStreetMap, ücretsiz). 3 sn'de cevap yoksa boş. */
export async function placeName(lat, lng) {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&accept-language=tr`,
      { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const a = (await res.json()).address || {};
    const parts = [a.road, a.suburb || a.neighbourhood || a.quarter || a.town || a.city_district || a.city]
      .filter((x) => x && String(x).trim());
    return [...new Set(parts)].join(", ") || null;
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Davetler
// ---------------------------------------------------------------------------
export async function myInviteCodes() {
  return check(await sb.from("invite_codes").select("code, created_at, used_at, used_name")
    .eq("created_by", myId()).order("created_at", { ascending: false }));
}
export const createInvite = () => rpc("create_invite");
export async function deleteInvite(code) {
  check(await sb.from("invite_codes").delete().eq("code", code));
}

// ---------------------------------------------------------------------------
// Bildirim adresi ve ayarları
// ---------------------------------------------------------------------------
export const registerDevice = (token) => rpc("register_device", { p_token: token, p_platform: "web" });
export const unregisterDevice = (token) => rpc("unregister_device", { p_token: token });

export async function myNotificationPrefs() {
  const rows = await rpc("my_notification_prefs");
  return (rows && rows[0]) || { chat_muted_until: null, radar_muted_until: null, rooms_off: [] };
}
export const setNotificationPrefs = (p) => rpc("set_notification_prefs", {
  p_chat_muted_until: p.chat_muted_until || null,
  p_radar_muted_until: p.radar_muted_until || null,
  p_rooms_off: p.rooms_off || [],
});

export const usagePing = (seconds) => rpc("usage_ping", { p_seconds: seconds });
