// 1.1.2.5: 🎬 Eğitici Videolar — ana sayfa kartı, kaydırmalı akış, video ekleme, Video Editörü görevi
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

// ---------- Kaydırmalı akış ----------
export function VideosScreen() {
  const s = useVideoSummary();
  const [list, setList] = useState(null);
  const [err, setErr] = useState(null);
  const [active, setActive] = useState(0);
  const [end, setEnd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const feed = useRef(null);

  async function load() {
    try {
      const l = (await api.videosFeed()) || [];
      setList(l); setEnd(l.length < 20); setErr(null); setActive(0);
      if (feed.current) feed.current.scrollTop = 0;
      markSeen(l[0]?.id);
      refreshVideos();
    } catch (e) { setErr(userMessage(e, "Videolar yüklenemedi.")); }
  }
  useEffect(() => { load(); }, []);

  // Hangi video ekranda? (kaydırma bitince)
  function onScroll() {
    const el = feed.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / Math.max(1, el.clientHeight));
    if (i !== active) setActive(i);
    if (!end && list && i >= list.length - 3) {
      const last = list[list.length - 1];
      setEnd(true);
      api.videosFeed(last.id).then((more) => {
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
        <button class="vf-back" aria-label="Geri" onClick=${() => navigate("/menu")}>←</button>
        <b class="grow">🎬 Eğitici Videolar</b>
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
                ${v.can_delete && html`<button class="vbtn" onClick=${() => setDeleting(v)}><span>🗑</span><small>Kaldır</small></button>`}
              </div>
              <div class="vinfo">
                <b>${v.title}</b>
                <span>${[v.added_by_name && "Ekleyen: @" + v.added_by_name, v.created_at && agoText(v.created_at), v.duration_sec && "⏱ " + clock(v.duration_sec)].filter(Boolean).join(" • ")}</span>
              </div>
            </div>`)}
        </div>`}
      ${adding && html`<${AddVideoModal} onClose=${() => setAdding(false)} onAdded=${() => { setAdding(false); toast("🎬 Video yayınlandı"); load(); }} />`}
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
function AddVideoModal({ onClose, onAdded }) {
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
      await api.videoAdd(url, title.trim(), dur, short);
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
