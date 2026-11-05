// 1.1.2.4: 🎨 Duvar kâğıdı — seçim bu cihazda saklanır; sohbetlerin, özel mesajların ve ana sayfanın arkasında görünür.
// Kendi fotoğrafı sadece bu cihazda durur (IndexedDB), sunucuya yüklenmez.
import { html, useState, useEffect } from "./lib.js";
import * as api from "./api.js";

export const PHOTO = "foto";
export const NONE = "yok";
export const LOGO = "logo";
export const DEFAULT_STRENGTH = 0.55;

export const BUILT_IN = [
  [LOGO, "DYB Logosu"], ["gece_yolu", "Gece Yolu"], ["pamukkale", "Pamukkale"], ["honaz", "Honaz Dağı"],
  ["ay_yildiz", "Ay Yıldız"], ["sehir", "Şehir Işıkları"], ["topografya", "Harita"], ["petek", "Petek"],
  ["gun_batimi", "Gün Batımı"],
].map(([id, name]) => ({ id, name, url: `img/duvar/${id}.jpg` }));

const KEY = "dyb_duvar";
function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (_) { return {}; }
}
let st = load();   // { secim, belirginlik, varsayilan, sunucu: [] }
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_) { /* */ } }

const listeners = new Set();
function emit() { listeners.forEach((l) => l()); }

export const serverList = () => (st.sunucu || []).map((w) => ({ id: w.id, name: w.ad, url: w.url }));
export const currentId = () => st.secim || st.varsayilan || LOGO;
export const strength = () => (typeof st.belirginlik === "number" ? st.belirginlik : DEFAULT_STRENGTH);
export const findItem = (id) => BUILT_IN.find((w) => w.id === id) || serverList().find((w) => w.id === id);

export function choose(id) { st.secim = id; save(); emit(); }
export function setStrength(v) { st.belirginlik = Math.min(1, Math.max(0.15, v)); save(); emit(); }

// ---------- Kendi fotoğrafı (IndexedDB) ----------
let photoUrl = null;
function db() {
  return new Promise((resolve, reject) => {
    try {
      const r = indexedDB.open("dyb", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    } catch (e) { reject(e); }
  });
}
async function idbGet(k) {
  const d = await db();
  return new Promise((res, rej) => { const q = d.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
async function idbSet(k, v) {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
export async function loadPhoto() {
  try {
    const b = await idbGet("duvar_foto");
    if (b) { if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = URL.createObjectURL(b); emit(); }
  } catch (_) { /* özel sekme vb. */ }
}
export const hasPhoto = () => !!photoUrl;
export const photoSrc = () => photoUrl;

export async function setPhoto(file) {
  const blob = await api.compressPhoto(file);
  try { await idbSet("duvar_foto", blob); } catch (_) { throw new Error("Fotoğraf bu cihaza kaydedilemedi."); }
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = URL.createObjectURL(blob);
  choose(PHOTO);
}

/** Sunucudaki varsayılanı ve sonradan eklenen kâğıtları okur */
export async function refresh() {
  try {
    const r = await api.wallpapers();
    if (!r) return;
    st.varsayilan = r.default || LOGO;
    st.sunucu = r.list || [];
    save();
    emit();
  } catch (_) { /* */ }
}

export function urlOf(id) {
  if (id === NONE) return null;
  if (id === PHOTO) return photoUrl || findItem(LOGO).url;
  return (findItem(id) || findItem(LOGO)).url;
}

export function useWall() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  return { id: currentId(), strength: strength() };
}

/** Ekranın en arkasındaki katman (üstünde zemin renginde perde: belirginlik azaldıkça yazılar rahat okunur) */
export function WallLayer() {
  const w = useWall();
  const url = urlOf(w.id);
  // Sayfa zemini kâğıdın üstünü örtmesin
  useEffect(() => {
    if (!url) return undefined;
    document.body.classList.add("walled");
    return () => document.body.classList.remove("walled");
  }, [!!url]);
  if (!url) return null;
  const dim = Math.min(0.9, Math.max(0.1, 1 - w.strength * 0.85));
  return html`<div class="wall" aria-hidden="true" style=${`background-image:url("${url}")`}><i style=${`opacity:${dim}`}></i></div>`;
}

loadPhoto();
