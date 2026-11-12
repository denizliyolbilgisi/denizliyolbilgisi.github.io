// 1.1.2.5: 🎬 Eğitici Videolar — ana sayfa kartı, kaydırmalı akış, video ekleme, Video Editörü görevi
// 1.1.2.7: kategoriler (kategori ekranı, kategoriye göre akış, eklerken kategori seçimi, kategorileri yönet)
import { html, useState, useEffect, useRef, navigate, toast, userMessage, agoText, store } from "../lib.js";
import * as api from "../api.js";
import { Modal, Spinner } from "../ui.js";

// ---------- Özet (kart, yetki, bildirim ayarı) ----------
let summary = null;
const subs = new Set();
function emit() { subs.forEach((f) => f()); }
export async function refreshVideos() {
  try { summary = await api.videosSummary(); emit(); } catch (_) { /* */ }
  return summary;
}
export function useVideoSummary() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); subs.add(f); if (!summary) refreshVideos(); return () => subs.delete(f); }, []);
  return summary;
}
const seenKey = () => "dyb_video_gorulen_" + (api.myId() || "");
const markSeen = (id) => { if (id && id > (store.get(seenKey(), 0) || 0)) store.set(seenKey(), id); };

export const clock = (s) => {
  if (!s && s !== 0) return "";
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`;
};
const count = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(".0", "") + " Mn" : n >= 1000 ? (n / 1000).toFixed(1).replace(".0", "") + " B" : String(n || 0));
const errText = (c) => (c === 100 ? "Bu video YouTube'dan kaldırılmış."
  : [101, 150, 152, 153].includes(c) ? "Bu videonun sahibi başka uygulamalarda oynatılmasını kapatmış."
  : c === 5 ? "Bu video bu cihazda oynatılamıyor." : "Video oynatılamadı.");

// ---------- YouTube oynatıcısı (resmî iframe API) ----------
let ytReady = null;
function loadYT() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (!ytReady) {
    ytReady = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    });
  }
  return ytReady;
}

/** Tek video. iPhone sesli videonun kendiliğinden başlamasına izin vermez: sessiz başlar, "🔊 Sesi aç" görünür. */
export function YouTubePlayer({ youtubeId, autoplay, onReady, onViewed, onError }) {
  const box = useRef(null);
  const cb = useRef({});
  cb.current = { onReady, onViewed, onError };
  const [muted, setMuted] = useState(false);
  const playerRef = useRef(null);
  useEffect(() => {
    let player, timer, viewed = false, dead = false;
    loadYT().then((YT) => {
      if (dead || !box.current) return;
      const el = document.createElement("div");
      box.current.innerHTML = "";
      box.current.appendChild(el);
      const info = (p) => {
        try {
          const d = p.getVideoData() || {};
          const du = Math.round(p.getDuration() || 0);
          if (du > 0 || d.title) cb.current.onReady?.(du, d.title || "");
        } catch (_) { /* */ }
      };
      player = new YT.Player(el, {
        width: "100%", height: "100%", videoId: youtubeId,
        playerVars: { autoplay: autoplay ? 1 : 0, mute: autoplay ? 1 : 0, playsinline: 1, rel: 0, modestbranding: 1, controls: 1, fs: 1, iv_load_policy: 3 },
        events: {
          onReady: (e) => {
            info(e.target);
            if (autoplay) {
              e.target.playVideo();
              try { setMuted(e.target.isMuted()); } catch (_) { /* */ }
            }
          },
          onStateChange: (e) => {
            if (e.data === 1) {
              info(e.target);
              if (!viewed && !timer) timer = setTimeout(() => { viewed = true; cb.current.onViewed?.(); }, 3000);
            } else if (timer && !viewed) { clearTimeout(timer); timer = null; }
          },
          onError: (e) => cb.current.onError?.(e.data),
        },
      });
      playerRef.current = player;
    });
    return () => { dead = true; clearTimeout(timer); try { player && player.destroy(); } catch (_) { /* */ } playerRef.current = null; };
  }, [youtubeId]);
  return html`
    <div class="yt-wrap">
      <div class="yt-box" ref=${box}></div>
      ${muted && html`<button class="yt-unmute" onClick=${() => { try { playerRef.current.unMute(); playerRef.current.playVideo(); } catch (_) { /* */ } setMuted(false); }}>🔊 Sesi aç</button>`}
    </div>`;
}

// ---------- Ana sayfa kartı ----------
/** 1.1.2.8: ☰ menü için: video var mı, yeni mi */
export function useVideoMenu() {
  const s = useVideoSummary();
  if (!s || (!s.count && !s.can_manage)) return null;
  return { count: s.count || 0, isNew: (s.latest_id || 0) > (store.get(seenKey(), 0) || 0), title: s.latest_title };
}

export function VideoHomeCard() {
  const s = useVideoSummary();
  if (!s || (!s.count && !s.can_manage)) return null;
  const isNew = (s.latest_id || 0) > (store.get(seenKey(), 0) || 0);
  return html`
    <button class="video-hero" onClick=${() => navigate("/videolar")}>
      <span class="vh-th" style=${s.latest_youtube_id ? `background-image:url("https://i.ytimg.com/vi/${s.latest_youtube_id}/mqdefault.jpg")` : ""}><i>▶</i></span>
      <span class="grow" style="min-width:0">
        <span class="vh-t">🎬 Eğitici Videolar ${isNew && html`<b class="vh-new">YENİ</b>`}</span>
        <span class="vh-d">${s.count ? `${s.count} video • ${s.latest_title || ""}` : "Henüz video yok. + ile ilk videoyu ekle."}</span>
      </span>
      <span class="hh-c">›</span>
    </button>`;
}

// ---------- 1.1.2.7: Kategoriler ----------
const katSeenKey = () => "dyb_video_kat_gorulen_" + (api.myId() || "");
const katSeen = () => store.get(katSeenKey(), {}) || {};
function markKatSeen(kat, id) {
  if (!kat || !id) return;
  const m = katSeen();
  if (id > (m[kat] || 0)) { m[kat] = id; store.set(katSeenKey(), m); }
}
/** #RRGGBB → koyusu (kart degradesi için) */
export function koyu(hex, oran = 0.45) {
  const n = parseInt(String(hex || "#334155").slice(1), 16);
  const f = (v) => Math.round(v * (1 - oran));
  return "#" + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
export const KAT_RENKLER = ["#475569", "#2563EB", "#EA580C", "#16A34A", "#7C3AED", "#E11D48", "#0891B2", "#CA8A04", "#DB2777", "#334155"];
const KAT_IKONLAR = ["🚛", "🚗", "🏍", "🚦", "🛠", "🆘", "🚌", "🚲", "⛽", "🛞", "❄️", "🌧", "🅿️", "🚑", "📁", "🎬"];

let katCache = null;
async function loadCats() { katCache = await api.videoCategories(); return katCache; }

/** Kategori ekranı (Eğitici Videolar ana ekranı) */
export function VideoCategoriesScreen() {
  const s = useVideoSummary();
  const [cats, setCats] = useState(katCache);
  const [err, setErr] = useState(null);
  async function load() {
    try { setCats(await loadCats()); setErr(null); } catch (e) { setErr(userMessage(e, "Kategoriler yüklenemedi.")); }
  }
  useEffect(() => { load(); refreshVideos().then((x) => markSeen(x?.latest_id)); }, []);
  const seen = katSeen();
  const gorunen = (cats || []).filter((c) => c.sayi > 0 || s?.can_manage);
  const toplam = (cats || []).filter((c) => c.aktif).reduce((a, c) => a + (c.sayi || 0), 0);
  const son = s?.latest_title;
  const sonKat = (cats || []).find((c) => c.latest_id && c.latest_id === s?.latest_id);
  return html`
    <div class="screen vkat-screen">
      <div class="vk-top">
        <button class="vk-back" aria-label="Geri" onClick=${() => navigate("/menu")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18 9 12l6-6"></path></svg>
        </button>
        <div class="grow">
          <div class="vk-title">Eğitici Videolar</div>
          <div class="vk-sub">${cats ? `${gorunen.filter((c) => c.aktif && c.sayi > 0).length} kategori • ${toplam} video` : "Yükleniyor…"}</div>
        </div>
        ${s?.can_manage && html`<button class="vk-gear" aria-label="Video ekle" onClick=${() => navigate("/videolar?k=tum&ekle=1")}>＋</button>`}
        ${s?.can_manage && html`<button class="vk-gear" aria-label="Kategorileri yönet" onClick=${() => navigate("/videolar/yonet")}>⚙️</button>`}
      </div>
      ${!cats ? html`<div class="vf-center" style="position:static;padding:60px 0">${err ? html`<div>${err}<br /><button class="btn small" style="margin-top:12px" onClick=${load}>Tekrar dene</button></div>` : html`<${Spinner} />`}</div>`
        : !gorunen.length ? html`<div class="vk-empty"><div style="font-size:48px">🎬</div><b>Henüz eğitici video yok.</b></div>`
        : html`
        <div class="vk-grid">
          ${gorunen.map((c) => {
            const yeni = c.latest_id && c.latest_id > (seen[c.id] || 0) && c.sayi > 0;
            return html`
              <button key=${c.id} class=${"vk-card" + (!c.aktif ? " off" : "")} style=${`background:linear-gradient(135deg,${c.renk},${koyu(c.renk)})`}
                onClick=${() => navigate("/videolar?k=" + c.id)}>
                ${c.latest_youtube_id && html`<span class="vk-thumb" style=${`background-image:url("https://i.ytimg.com/vi/${c.latest_youtube_id}/mqdefault.jpg")`}></span>`}
                <span class="vk-shade"></span>
                <span class="vk-in">
                  <span class="vk-row"><span class="vk-ic">${c.ikon}</span>${yeni && html`<b class="vk-new" style=${"color:" + koyu(c.renk)}>YENİ</b>`}</span>
                  <span class="grow"></span>
                  <span class="vk-ad">${c.ad}</span>
                  <span class="vk-say">${c.sayi} video${!c.aktif ? " • gizli" : ""}</span>
                </span>
              </button>`;
          })}
        </div>
        <div style="padding:16px 16px 0">
          <button class="vk-all" onClick=${() => navigate("/videolar?k=tum")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>
            Tümünü izle <span>${toplam} video</span>
          </button>
        </div>
        ${son && html`<div class="vk-last"><i></i><div class="grow">Son eklenen: <b>${son}</b>${sonKat ? " • " + sonKat.ad : ""}</div></div>`}`}
      <div style="height:30px"></div>
    </div>`;
}

/** Kategorileri yönet (Video Editörü, Administrator ve üstü) */
export function VideoCategoryManageScreen() {
  const s = useVideoSummary();
  const [cats, setCats] = useState(null);
  const [edit, setEdit] = useState(null);       // {id?, ad, ikon, renk, aktif, genel}
  const [busy, setBusy] = useState(false);
  async function load() { try { setCats(await loadCats()); } catch (e) { toast(userMessage(e, "Kategoriler yüklenemedi.")); } }
  useEffect(() => { load(); }, []);
  async function run(fn, ok) {
    if (busy) return;
    setBusy(true);
    try { await fn(); await load(); if (ok) toast(ok); } catch (e) { toast(userMessage(e), 3500); }
    setBusy(false);
  }
  if (s && !s.can_manage) {
    return html`<div class="screen"><div class="content center"><b>Bu işlem için yetkin yok.</b>
      <button class="btn" style="margin-top:14px" onClick=${() => navigate("/videolar")}>Geri</button></div></div>`;
  }
  return html`
    <div class="screen vkat-screen">
      <div class="vk-top">
        <button class="vk-back" aria-label="Geri" onClick=${() => navigate("/videolar")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18 9 12l6-6"></path></svg>
        </button>
        <div class="grow"><div class="vk-title">Kategorileri yönet</div><div class="vk-sub">Video Editörü • Administrator ve üstü</div></div>
      </div>
      ${!cats ? html`<div style="padding:60px 0;text-align:center"><${Spinner} /></div>` : html`
        <div class="vk-list">
          ${cats.map((c, i) => html`
            <div key=${c.id} class=${"vk-li" + (!c.aktif ? " off" : "")}>
              <div class="vk-arrows">
                <button aria-label="Yukarı taşı" disabled=${busy || i === 0} onClick=${() => run(() => api.videoCategoryMove(c.id, -1))}>▲</button>
                <button aria-label="Aşağı taşı" disabled=${busy || i === cats.length - 1} onClick=${() => run(() => api.videoCategoryMove(c.id, 1))}>▼</button>
              </div>
              <div class="vk-lic" style=${"background:" + c.renk}>${c.ikon}</div>
              <div class="grow" style="min-width:0"><b>${c.ad}</b><small>${c.sayi} video${!c.aktif ? " • gizli" : ""}${c.genel ? " • silinen kategorilerin videoları buraya" : ""}</small></div>
              <button class="vk-edit" aria-label="Düzenle" onClick=${() => setEdit({ ...c })}>✏️</button>
              <span class="switch" onClick=${() => !busy && run(() => api.videoCategoryToggle(c.id, !c.aktif), c.aktif ? "Kategori gizlendi" : "Kategori görünür")}>
                <input type="checkbox" checked=${c.aktif} tabindex="-1" aria-label="Görünür" /><span></span>
              </span>
            </div>`)}
        </div>
        <div style="padding:14px 16px 0">
          <button class="vk-newcat" onClick=${() => setEdit({ id: null, ad: "", ikon: "🎬", renk: KAT_RENKLER[1], aktif: true })}>＋ Yeni kategori</button>
        </div>
        <div class="vk-note">Gizlenen kategori kullanıcılara görünmez, videoları silinmez. Silinen kategorinin videoları "Genel"e taşınır. Kullanıcılar yalnız içinde video olan kategorileri görür.</div>`}
      ${edit && html`<${CategoryEditModal} c=${edit} busy=${busy} onClose=${() => setEdit(null)}
        onSave=${(x) => run(() => api.videoCategorySave(x.id, x.ad.trim(), x.ikon.trim(), x.renk, x.aktif), x.id ? "Kategori kaydedildi" : "Kategori eklendi").then(() => setEdit(null))}
        onDelete=${(x) => run(() => api.videoCategoryDelete(x.id), "Kategori silindi").then(() => setEdit(null))} />`}
    </div>`;
}

function CategoryEditModal({ c, busy, onClose, onSave, onDelete }) {
  const [x, setX] = useState(c);
  const [sor, setSor] = useState(false);
  const set = (k, v) => setX({ ...x, [k]: v });
  if (sor) {
    return html`
      <${Modal} title="Kategori silinsin mi?" onClose=${() => setSor(false)}
        actions=${html`<button class="btn outline" onClick=${() => setSor(false)}>Vazgeç</button>
          <button class="btn red" disabled=${busy} onClick=${() => onDelete(x)}>Sil</button>`}>
        <p>"${c.ad}" silinecek. İçindeki ${c.sayi || 0} video "Genel" kategorisine taşınır.</p>
      </${Modal}>`;
  }
  return html`
    <${Modal} title=${c.id ? "Kategoriyi düzenle" : "Yeni kategori"} onClose=${() => !busy && onClose()}
      actions=${html`
        ${c.id && !c.genel && html`<button class="btn red" style="margin-right:auto" disabled=${busy} onClick=${() => setSor(true)}>Sil</button>`}
        <button class="btn outline" disabled=${busy} onClick=${onClose}>Vazgeç</button>
        <button class="btn" disabled=${busy || !x.ad.trim()} onClick=${() => onSave(x)}>Kaydet</button>`}>
      <div class="vk-prev" style=${`background:linear-gradient(135deg,${x.renk},${koyu(x.renk)})`}><span class="vk-ic">${x.ikon || "🎬"}</span><b>${x.ad || "Kategori adı"}</b></div>
      <label class="vk-lbl">AD</label>
      <input class="input" maxlength="40" value=${x.ad} placeholder="Örn. Kış sürüşü" onInput=${(e) => set("ad", e.target.value)} />
      <label class="vk-lbl">SİMGE</label>
      <div class="vk-icons">${KAT_IKONLAR.map((i) => html`<button key=${i} class=${x.ikon === i ? "on" : ""} onClick=${() => set("ikon", i)}>${i}</button>`)}</div>
      <input class="input" style="margin-top:8px" maxlength="8" value=${x.ikon} placeholder="Ya da bir emoji yaz" onInput=${(e) => set("ikon", e.target.value)} />
      <label class="vk-lbl">RENK</label>
      <div class="vk-colors">${KAT_RENKLER.map((r) => html`<button key=${r} aria-label=${r} class=${x.renk === r ? "on" : ""} style=${"background:" + r} onClick=${() => set("renk", r)}></button>`)}</div>
    </${Modal}>`;
}

/** Eklerken / taşırken kategori seçimi */
function CategoryChips({ cats, value, onChange }) {
  return html`<div class="vk-chips">
    ${(cats || []).map((c) => html`<button key=${c.id} class=${value === c.id ? "on" : ""} onClick=${() => onChange(c.id)}>${c.ikon} ${c.ad}${!c.aktif ? " (gizli)" : ""}</button>`)}
  </div>`;
}

function MoveCategoryModal({ v, onClose, onMoved }) {
  const [cats, setCats] = useState(katCache);
  const [k, setK] = useState(v.kategori_id);
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadCats().then(setCats).catch(() => {}); }, []);
  async function save() {
    setBusy(true);
    try { await api.videoSetCategory(v.id, k); onMoved(k, (cats || []).find((c) => c.id === k)); } catch (e) { toast(userMessage(e), 3500); }
    setBusy(false);
  }
  return html`
    <${Modal} title="📁 Kategoriyi değiştir" onClose=${() => !busy && onClose()}
      actions=${html`<button class="btn outline" disabled=${busy} onClick=${onClose}>Vazgeç</button>
        <button class="btn" disabled=${busy || !k || k === v.kategori_id} onClick=${save}>Taşı</button>`}>
      <p class="muted" style="margin-top:0">"${v.title}"</p>
      ${!cats ? html`<${Spinner} />` : html`<${CategoryChips} cats=${cats} value=${k} onChange=${setK} />`}
    </${Modal}>`;
}

// ---------- Kaydırmalı akış ----------
export function VideosScreen({ kategori = null, openAdd = false }) {
  const s = useVideoSummary();
  const [list, setList] = useState(null);
  const [err, setErr] = useState(null);
  const [active, setActive] = useState(0);
  const [end, setEnd] = useState(false);
  const [adding, setAdding] = useState(openAdd);
  const [deleting, setDeleting] = useState(null);
  const [moving, setMoving] = useState(null);
  const [kat, setKat] = useState(() => (kategori ? (katCache || []).find((c) => c.id === kategori) || null : null));
  const feed = useRef(null);

  async function load() {
    try {
      const l = (await api.videosFeed(null, kategori)) || [];
      setList(l); setEnd(l.length < 20); setErr(null); setActive(0);
      if (feed.current) feed.current.scrollTop = 0;
      requestAnimationFrame(() => { if (feed.current) feed.current.scrollTop = 0; });
      if (kategori) markKatSeen(kategori, l[0]?.id);
      else { markSeen(l[0]?.id); l.forEach((v) => markKatSeen(v.kategori_id, v.id)); }
      refreshVideos();
    } catch (e) { setErr(userMessage(e, "Videolar yüklenemedi.")); }
  }
  useEffect(() => {
    load();
    if (kategori) loadCats().then((cs) => setKat(cs.find((c) => c.id === kategori) || null)).catch(() => {});
  }, [kategori]);
  const geri = () => navigate("/videolar");
  const baslik = kategori ? (kat ? `${kat.ikon} ${kat.ad}` : "🎬 Videolar") : "🎬 Tüm videolar";
  const toplam = kategori ? kat?.sayi : null;

  // Hangi video ekranda? (kaydırma bitince)
  function onScroll() {
    const el = feed.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / Math.max(1, el.clientHeight));
    if (i !== active) setActive(i);
    if (!end && list && i >= list.length - 3) {
      const last = list[list.length - 1];
      setEnd(true);
      api.videosFeed(last.id, kategori).then((more) => {
        if (more && more.length) { setList((l) => [...l, ...more.filter((m) => !l.some((x) => x.id === m.id))]); setEnd(more.length < 20); }
      }).catch(() => setEnd(false));
    }
  }

  async function like(v) {
    try {
      const r = await api.videoLike(v.id);
      setList((l) => l.map((x) => (x.id === v.id ? { ...x, liked: r.liked, like_count: r.like_count } : x)));
    } catch (e) { toast(userMessage(e)); }
  }
  async function remove(v) {
    setDeleting(null);
    try {
      await api.videoDelete(v.id);
      setList((l) => l.filter((x) => x.id !== v.id));
      refreshVideos();
      toast("Video kaldırıldı");
    } catch (e) { toast(userMessage(e), 3500); }
  }

  return html`
    <div class="vfeed-screen">
      <div class="vf-top">
        <button class="vf-back" aria-label="Kategorilere dön" onClick=${geri}>←</button>
        <div class="grow" style="min-width:0">
          <b class="vf-title">${baslik}</b>
          ${list && list.length > 0 && html`<span class="vf-count">${active + 1} / ${toplam || list.length} video</span>`}
        </div>
        ${s?.can_manage && html`<button class="vf-add" aria-label="Video ekle" onClick=${() => setAdding(true)}>＋</button>`}
      </div>
      ${!list ? html`<div class="vf-center">${err ? html`<div>${err}<br /><button class="btn small" style="margin-top:12px" onClick=${load}>Tekrar dene</button></div>` : html`<${Spinner} />`}</div>`
        : !list.length ? html`<div class="vf-center"><div style="font-size:48px">🎬</div><b>Henüz eğitici video yok.</b>${s?.can_manage && html`<div class="muted">Sağ üstteki ＋ ile ilk videoyu ekle.</div>`}</div>`
        : html`
        <div class="vfeed" ref=${feed} onScroll=${onScroll}>
          ${list.map((v, i) => html`
            <div key=${v.id} class="vitem">
              <div class=${"vplayer" + (v.is_short ? " short" : "")}>
                ${i === active && !adding
                  ? html`<${VideoSlot} v=${v} />`
                  : html`<div class="vthumb" style=${`background-image:url("https://i.ytimg.com/vi/${v.youtube_id}/hqdefault.jpg")`}></div>`}
              </div>
              <div class="vside">
                <button class=${"vbtn" + (v.liked ? " on" : "")} onClick=${() => like(v)}><span>👍</span><small>${count(v.like_count)}</small></button>
                <div class="vbtn"><span>👁</span><small>${count(v.view_count)}</small></div>
                ${s?.can_manage && html`<button class="vbtn" onClick=${() => setMoving(v)}><span>📁</span><small>Kategori</small></button>`}
                ${v.can_delete && html`<button class="vbtn" onClick=${() => setDeleting(v)}><span>🗑</span><small>Kaldır</small></button>`}
              </div>
              <div class="vinfo">
                ${v.kategori_ad && html`<span class="vk-pill" style=${"background:" + (v.kategori_renk || "#334155") + "DD"}>${v.kategori_ikon} ${v.kategori_ad}</span>`}
                <b>${v.title}</b>
                <span>${[v.added_by_name && "Ekleyen: @" + v.added_by_name, v.created_at && agoText(v.created_at), v.duration_sec && "⏱ " + clock(v.duration_sec)].filter(Boolean).join(" • ")}</span>
              </div>
            </div>`)}
        </div>`}
      ${adding && html`<${AddVideoModal} kategori=${kategori} onClose=${() => setAdding(false)} onAdded=${() => { setAdding(false); toast("🎬 Video yayınlandı"); load(); }} />`}
      ${moving && html`<${MoveCategoryModal} v=${moving} onClose=${() => setMoving(null)}
        onMoved=${(k, c) => {
          setMoving(null);
          toast("📁 Video taşındı" + (c ? ": " + c.ad : ""));
          setList((l) => (kategori && k !== kategori ? l.filter((x) => x.id !== moving.id)
            : l.map((x) => (x.id === moving.id ? { ...x, kategori_id: k, kategori_ad: c?.ad, kategori_ikon: c?.ikon, kategori_renk: c?.renk } : x))));
        }} />`}
      ${deleting && html`
        <${Modal} title="Video kaldırılsın mı?" onClose=${() => setDeleting(null)}
          actions=${html`<button class="btn outline" onClick=${() => setDeleting(null)}>Vazgeç</button>
            <button class="btn red" onClick=${() => remove(deleting)}>Kaldır</button>`}>
          <p>"${deleting.title}" herkesin listesinden kaldırılacak.</p>
        </${Modal}>`}
    </div>`;
}

function VideoSlot({ v }) {
  const [fail, setFail] = useState(null);
  if (fail != null) {
    return html`<div class="vfail"><div>${errText(fail)}</div>
      <a class="btn small" style="margin-top:10px" href=${"https://www.youtube.com/watch?v=" + v.youtube_id} target="_blank" rel="noopener">▶ YouTube'da izle</a></div>`;
  }
  return html`<${YouTubePlayer} youtubeId=${v.youtube_id} autoplay=${true}
    onViewed=${() => api.videoView(v.id)} onError=${(c) => setFail(c)} />`;
}

// ---------- Video ekle (Video Editörü / Administrator ve üstü) ----------
function AddVideoModal({ kategori = null, onClose, onAdded }) {
  const [cats, setCats] = useState(katCache);
  const [kat, setKat] = useState(kategori);
  useEffect(() => { loadCats().then(setCats).catch(() => {}); }, []);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const touched = useRef(false);
  const [dur, setDur] = useState(null);
  const [short, setShort] = useState(false);
  const [ok, setOk] = useState(null);
  const [fail, setFail] = useState("");
  const [busy, setBusy] = useState(false);
  const yid = api.youtubeId(url);
  useEffect(() => { setOk(null); setFail(""); setDur(null); if (yid) setShort(/\/shorts\//.test(url)); }, [yid]);

  async function save() {
    setBusy(true);
    try {
      await api.videoAdd(url, title.trim(), dur, short, kat);
      onAdded();
    } catch (e) { toast(userMessage(e, "Video eklenemedi."), 4000); }
    setBusy(false);
  }
  return html`
    <${Modal} title="🎬 Video ekle" onClose=${() => !busy && onClose()}
      actions=${html`<button class="btn outline" disabled=${busy} onClick=${onClose}>Vazgeç</button>
        <button class="btn" disabled=${busy || !yid || ok !== true || !title.trim()} onClick=${save}>${busy ? "…" : "Yayınla"}</button>`}>
      <input class="input" placeholder="YouTube linkini yapıştır" value=${url} inputmode="url" autocapitalize="off"
        onInput=${(e) => setUrl(e.target.value.trim())} />
      ${url && !yid && html`<div class="msg err" style="margin-top:6px">Geçerli bir YouTube linki değil.</div>`}
      ${yid && html`
        <div class="vadd-prev"><${YouTubePlayer} youtubeId=${yid} autoplay=${false}
          onReady=${(sec, t) => { setOk(true); if (sec > 0) setDur(sec); if (!touched.current && t) setTitle((x) => x || t.slice(0, 120)); }}
          onError=${(c) => { setOk(false); setFail(errText(c)); }} /></div>
        <div class=${"small " + (ok === false ? "v-bad" : ok ? "v-ok" : "muted")} style="margin:6px 0">
          ${ok === null ? "Video kontrol ediliyor…" : ok ? "✅ Uygulamada oynatılabiliyor" + (dur ? " • " + clock(dur) : "") : "❌ " + fail + " Başka bir video seç."}</div>
        <input class="input" placeholder="Başlık" maxlength="120" value=${title} onInput=${(e) => { touched.current = true; setTitle(e.target.value); }} />
        <div class="vk-lbl">KATEGORİ</div>
        ${cats ? html`<${CategoryChips} cats=${cats} value=${kat} onChange=${setKat} />` : html`<${Spinner} small />`}
        ${!kat && html`<div class="muted small" style="margin-top:4px">Seçmezsen "Genel"e eklenir.</div>`}
        <label class="row" style="gap:10px;margin-top:10px;align-items:center">
          <input type="checkbox" checked=${short} onChange=${(e) => setShort(e.target.checked)} /> Dikey video (Shorts)
        </label>`}
    </${Modal}>`;
}

/** Kişi kartı / üye penceresi: 🎬 Video Editörü görevi */
export function VideoEditorToggle({ userId, on, onChange }) {
  const [busy, setBusy] = useState(false);
  async function flip() {
    setBusy(true);
    try {
      await api.setVideoEditor(userId, !on);
      onChange(!on);
      toast(!on ? "🎬 Video Editörü yapıldı" : "Video Editörü görevi alındı");
    } catch (e) { toast(userMessage(e), 3500); }
    setBusy(false);
  }
  return html`
    <div class="ved-row" onClick=${() => !busy && flip()}>
      <div class="grow"><b>🎬 Video Editörü</b><div class="muted small">Eğitici video ekler ve kaldırır</div></div>
      <span class="switch"><input type="checkbox" checked=${on} disabled=${busy} tabindex="-1" /><span></span></span>
    </div>`;
}

/** Üye penceresinde: kişi kartından görev bilgisini okuyup düğmeyi gösterir */
export function VideoEditorRowFor({ userId }) {
  const [w, setW] = useState(null);
  useEffect(() => { api.whois(userId).then(setW).catch(() => {}); }, [userId]);
  if (!w || !w.can_set_video_editor) return null;
  return html`<${VideoEditorToggle} userId=${userId} on=${!!w.video_editor} onChange=${(v) => setW({ ...w, video_editor: v })} />`;
}

export { markSeen as markVideoSeen };
