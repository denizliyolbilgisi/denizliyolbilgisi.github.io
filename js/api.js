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

// ---------- Profil, puan ve rütbe ----------
export const myProfile = () => rpc("my_profile");
export const publicProfile = (userId) => rpc("public_profile", { p_user: userId });
export const setBio = (text) => rpc("set_bio", { p_text: text });
/** Kullanıcı adını değiştir (ilk değişiklik serbest, sonra 7 günde bir) */
export const changeUsername = (name) => rpc("change_my_username", { p_new: name });
export const leaderboard = async () => (await rpc("leaderboard_month")) || [];

// ---------- Şifre ----------
/** "Şifremi unuttum": talep yönetime gider (giriş yapmadan; cevap hep aynı) */
export const requestPasswordReset = (email, username) =>
  rpc("request_password_reset", { p_email: email, p_username: username });

/** Yönetici geçici şifre verdiyse: önce yeni şifre belirlenmeli */
export function mustChangePassword() {
  return cachedSession?.user?.user_metadata?.must_change_password === true;
}

export async function setNewPassword(password) {
  check(await sb.auth.updateUser({ password, data: { must_change_password: false } }));
}

/** Eski şifreyi doğrulayıp yenisini kaydeder */
export async function changePassword(oldPassword, newPassword) {
  const email = cachedSession?.user?.email || (await session())?.user?.email;
  if (!email) throw new Error("Giriş gerekli");
  const r = await sb.auth.signInWithPassword({ email, password: oldPassword });
  if (r.error) {
    const t = String(r.error.message || "").toLowerCase();
    if (t.includes("fetch") || t.includes("network")) throw r.error;
    throw new Error("Şifre değiştirilemedi: mevcut şifren hatalı.");
  }
  await setNewPassword(newPassword);
}
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
const MSG_COLUMNS = "id, content, created_at, user_id, reply_to_id, photos, photos_expired, room_id, mention_all, edited_at, " +
  "profiles(username, role), message_reactions(emoji, user_id)";

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

// ---------- Düzenleme ve tepki ----------
export const REACTIONS = ["👍", "✅", "❌", "🙏", "😂", "⚠️"];
export const EDIT_MINUTES = 15;

/** Kendi mesajı ve ilk 15 dakika içinde mi? */
export function editable(m, uid) {
  if (!uid || m.user_id !== uid) return false;
  const t = new Date(m.created_at).getTime();
  return !isNaN(t) && Date.now() - t < EDIT_MINUTES * 60000;
}
export const editMessage = (id, text) => rpc("edit_message", { p_id: id, p_content: text });
export const reactMessage = (id, emoji) => rpc("react_message", { p_id: id, p_emoji: emoji });
export const messageReactors = async (id) => (await rpc("message_reactors", { p_id: id })) || [];
export const messageEditHistory = async (id) => (await rpc("message_edit_history", { p_id: id })) || [];

/** Tepki sayıları sabit sırayla: [["👍", 3], ...] */
/** Tepki sayıları, çoktan aza: [["👍", 3], ...] */
export function reactionCounts(m) {
  const list = m.message_reactions || [];
  const order = [];
  const count = {};
  list.forEach((r) => {
    if (!(r.emoji in count)) { order.push(r.emoji); count[r.emoji] = 0; }
    count[r.emoji]++;
  });
  return order.map((e) => [e, count[e]]).sort((a, b) => b[1] - a[1]);
}

/** Mesaj sadece emojiden oluşuyorsa emoji sayısı (değilse null) */
export function emojiOnlyCount(text) {
  const t = (text || "").replace(/\s+/g, "");
  if (!t || t.length > 40) return null;
  try {
    if (!/^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\uFE0F|\u200D|\u20E3)+$/u.test(t)) return null;
    if (!/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(t)) return null;
    if (typeof Intl !== "undefined" && Intl.Segmenter) return [...new Intl.Segmenter().segment(t)].length;
    return [...t].length;
  } catch (_) {
    return null;
  }
}
export const myReaction = (m, uid) => (m.message_reactions || []).find((r) => r.user_id === uid)?.emoji || null;

export async function deleteMessage(id) {
  check(await sb.from("messages").delete().eq("id", id));
}

// ---------- @etiketleme ----------
/** "@ahmet_k" gibi etiketler (kullanıcı adı: harf, rakam, alt çizgi) */
export const MENTION_RE = /(^|[^\w@])@([A-Za-z0-9_]{3,20})/g;
export const MAX_MENTIONS = 5;

/** Mesajdaki etiketler (küçük harf, tekrarsız; "herkes" dahil) */
export function mentionsIn(text) {
  const out = new Set();
  for (const m of (text || "").matchAll(MENTION_RE)) out.add(m[2].toLowerCase());
  return [...out];
}

let candidates = null;
let candidatesAt = 0;
/** Etiketlenebilecek üyeler (10 dakikada bir tazelenir) */
export async function mentionCandidates() {
  if (!candidates || Date.now() - candidatesAt > 600000) {
    candidates = (await rpc("mention_candidates")) || [];
    candidatesAt = Date.now();
  }
  return candidates;
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
export const adminPasswordRequests = async () => (await rpc("admin_password_requests")) || [];
export const adminClosePasswordRequest = (id) => rpc("admin_close_password_request", { p_id: id });

/** Geçici şifre üretir (rütbe kontrolü sunucudaki dyb-sifre fonksiyonunda) */
export async function adminResetPassword(userId) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/dyb-sifre`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken()}`, apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
  } catch (e) {
    throw e;
  }
  let j = {};
  try {
    j = await res.json();
  } catch (_) { /* */ }
  if (j.password) return j.password;
  throw new Error(j.error || "Şifre şu an yenilenemedi. Lütfen tekrar dene.");
}

// ---------------------------------------------------------------------------
// Radarlar
// ---------------------------------------------------------------------------
export const RADAR_TYPES = [
  { key: "radar", label: "Radar", emoji: "🚔", color: "#FB8C00", minutes: 30, beep: true },
  { key: "kaza", label: "Kaza", emoji: "💥", color: "#E53935", minutes: 60, beep: true },
  { key: "yavaslama", label: "Yavaşlama", emoji: "🚗", color: "#E53935", minutes: 30, beep: true },
  { key: "yol_calismasi", label: "Yol çalışması", emoji: "🚧", color: "#F9A825", minutes: 1440, beep: false },
  { key: "kapali_serit", label: "Kapalı şerit", emoji: "🚫", color: "#F9A825", minutes: 180, beep: false },
  { key: "yolda_nesne", label: "Yolda nesne", emoji: "⚠️", color: "#F9A825", minutes: 60, beep: false },
  { key: "buzlanma", label: "Buzlanma / Sis", emoji: "🧊", color: "#4FC3F7", minutes: 180, beep: true },
];
// Eski türler (mobil, sabit, çevirme, kamera) Radar sayılır
export const radarType = (k) => RADAR_TYPES.find((t) => t.key === k) || RADAR_TYPES[0];
/** "30 dk", "3 saat", "1 gün" */
export function durationText(min) {
  if (min % 1440 === 0) return `${min / 1440} gün`;
  if (min % 60 === 0) return `${min / 60} saat`;
  return `${min} dk`;
}

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

// ---------- Güncellemesi gereken davetliler (Android) ----------
export const updateHelps = async () => (await rpc("my_update_helps")) || [];
export const resolveUpdateHelp = (userId) => rpc("resolve_update_help", { p_user: userId });

/** Son Android sürümünü (APK) indirir; paylaşma ya da kaydetme için dosya döner */
export async function latestApk() {
  const rows = check(await sb.from("app_releases").select("version_code, version_name, apk_path")
    .order("version_code", { ascending: false }).limit(1));
  const r = rows && rows[0];
  if (!r) throw new Error("Güncelleme dosyası bulunamadı.");
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/app-releases/${r.apk_path}`, {
    headers: { Authorization: `Bearer ${accessToken()}`, apikey: SUPABASE_KEY },
  });
  if (!res.ok) throw new Error("Güncelleme dosyası indirilemedi. Biraz sonra tekrar dene.");
  const blob = await res.blob();
  return { name: r.apk_path, version: r.version_name,
    file: new File([blob], r.apk_path, { type: "application/vnd.android.package-archive" }) };
}
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
