// 1.1.2.4: 🎤 Sesli mesaj — bas-konuş (basılı tut: kayıt, bırak: gönder, sola kaydır: iptal), ses balonu, beyan penceresi
import { html, useState, useEffect, useRef, toast, userMessage } from "../lib.js";
import * as api from "../api.js";
import { Modal, Spinner } from "../ui.js";

// ---------- Ayarlar (sunucudan; APK/site güncellemesi gerekmez) ----------
const DEF = { enabled: true, max_sec: 20, keep_days: 3, per_min: 3, notice: null, accepted: false };
let settings = (() => {
  try { return { ...DEF, ...(JSON.parse(localStorage.getItem("dyb_ses") || "{}") || {}) }; } catch (_) { return { ...DEF }; }
})();
const subs = new Set();
function setSettings(s) {
  settings = { ...settings, ...s };
  try { localStorage.setItem("dyb_ses", JSON.stringify(settings)); } catch (_) { /* */ }
  subs.forEach((f) => f());
}
export async function refreshVoiceSettings() {
  try { const s = await api.voiceSettings(); if (s) setSettings(s); } catch (_) { /* */ }
}
export function useVoiceSettings() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); subs.add(f); return () => subs.delete(f); }, []);
  return settings;
}
export const DEFAULT_NOTICE = "🎤 Sesli mesajlar en fazla 20 saniyedir ve 3 gün sonra otomatik olarak silinir. Gönderdiğin seslerden sen sorumlusun.";
export const voiceClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of ["audio/mp4", "audio/mp4;codecs=mp4a.40.2", "audio/aac"]) {
    try { if (MediaRecorder.isTypeSupported(t)) return t; } catch (_) { /* */ }
  }
  return null;
}

/**
 * Bas-konuş. onRecorded(blob, saniye) kayıt bitince çağrılır.
 * Döner: { recording, elapsed, cancelArmed, maxSec, handlers, notice } — notice: beyan penceresi (ekrana koy)
 */
export function useVoiceInput(onRecorded) {
  const s = useVoiceSettings();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [showNotice, setShowNotice] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const r = useRef({});
  const cb = useRef(onRecorded);
  cb.current = onRecorded;
  const maxSec = Math.min(120, Math.max(5, s.max_sec || 20));

  useEffect(() => { refreshVoiceSettings(); return () => stopAll(true); }, []);

  function stopAll(discard) {
    const x = r.current;
    clearInterval(x.timer);
    x.discard = discard;
    try { if (x.rec && x.rec.state !== "inactive") x.rec.stop(); } catch (_) { /* */ }
    if (!x.rec && x.stream) x.stream.getTracks().forEach((t) => t.stop());
  }

  async function begin(e) {
    const x = r.current;
    if (x.active) return;
    if (!settings.accepted) { setShowNotice(true); return; }
    const mime = pickMime();
    if (!mime || !navigator.mediaDevices?.getUserMedia) { toast("Bu cihaz ses kaydını desteklemiyor.", 3500); return; }
    x.active = true;
    x.down = true;
    x.startX = e.clientX;
    const t0 = Date.now();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (_) {
      x.active = false;
      toast("Sesli mesaj için mikrofon izni gerekli. Ayarlar → Safari → Mikrofon.", 4500);
      return;
    }
    // İzin penceresi çıktıysa ya da parmak çoktan kalktıysa: kayda başlama
    if (!x.down || Date.now() - t0 > 900) {
      stream.getTracks().forEach((t) => t.stop());
      x.active = false;
      if (Date.now() - t0 > 900) toast("🎤 Mikrofon açıldı. Şimdi basılı tutarak konuş.", 3500);
      return;
    }
    const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 });
    const chunks = [];
    x.stream = stream; x.rec = rec; x.discard = false; x.started = Date.now();
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const ms = Date.now() - x.started;
      const discard = x.discard;
      r.current = {};
      setRecording(false);
      setCancelArmed(false);
      if (discard) return;
      if (ms < 800 || !chunks.length) { toast("Çok kısa. Basılı tutarak konuş."); return; }
      const sec = Math.min(maxSec, Math.max(1, Math.ceil(ms / 1000)));
      cb.current(new Blob(chunks, { type: "audio/mp4" }), sec);
    };
    rec.start(250);
    try { navigator.vibrate?.(30); } catch (_) { /* */ }
    setRecording(true);
    setElapsed(0);
    x.timer = setInterval(() => {
      const ms = Date.now() - x.started;
      setElapsed(ms);
      if (ms >= maxSec * 1000) stopAll(false);
    }, 100);
  }

  function move(e) {
    const x = r.current;
    if (!x.rec) return;
    const armed = e.clientX - x.startX < -80;
    if (armed !== x.armed) { x.armed = armed; setCancelArmed(armed); }
  }

  function end() {
    const x = r.current;
    x.down = false;
    if (!x.rec) return;
    if (x.armed) toast("Ses kaydı iptal edildi");
    stopAll(!!x.armed);
  }

  const handlers = {
    onPointerDown: (e) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* */ } begin(e); },
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
    onContextMenu: (e) => e.preventDefault(),
  };

  async function accept() {
    setAccepting(true);
    try {
      await api.acceptVoiceNotice();
      setSettings({ accepted: true });
      setShowNotice(false);
      toast("Artık 🎤'ye basılı tutarak konuşabilirsin.", 3500);
    } catch (e) {
      toast(userMessage(e), 4000);
    }
    setAccepting(false);
  }

  const notice = showNotice && html`
    <${Modal} title="🎤 Sesli mesaj" onClose=${() => !accepting && setShowNotice(false)}
      actions=${html`
        <button class="btn outline" onClick=${() => setShowNotice(false)}>Vazgeç</button>
        <button class="btn" disabled=${accepting} onClick=${accept}>${accepting ? "…" : "Anladım, kabul ediyorum"}</button>`}>
      <p style="margin:0 0 10px;font-size:17px">${s.notice || DEFAULT_NOTICE}</p>
      <p class="muted" style="margin:0;font-size:15px;line-height:1.5">
        • En fazla ${maxSec} saniye<br />• ${s.keep_days || 3} gün sonra otomatik silinir<br />
        • Dakikada en fazla ${s.per_min || 3} ses<br />• Göndermek için 🎤'ye basılı tut, iptal için sola kaydır</p>
    </${Modal}>`;

  return { recording, elapsed, cancelArmed, maxSec, handlers, notice, enabled: s.enabled !== false };
}

export function MicButton({ voice, disabled }) {
  return html`<button type="button" class=${"mic" + (voice.recording ? " rec" : "")} aria-label="Basılı tut, konuş"
    disabled=${disabled} ...${voice.handlers}>🎤</button>`;
}

export function RecordingIndicator({ voice }) {
  const sec = Math.floor(voice.elapsed / 1000);
  return html`
    <div class="rec-bar">
      <i class="rec-dot"></i>
      <b class=${voice.maxSec - sec <= 5 ? "warn" : ""}>${voiceClock(sec)} / ${voiceClock(voice.maxSec)}</b>
      <span class=${"grow rec-hint" + (voice.cancelArmed ? " on" : "")}>${voice.cancelArmed ? "Bırak: iptal" : "‹ iptal için kaydır"}</span>
    </div>`;
}

// ---------- Çalma: aynı anda tek ses ----------
const player = { audio: null, path: null, subs: new Set() };
function notify() { player.subs.forEach((f) => f()); }
export function stopVoice() {
  if (player.audio) { try { player.audio.pause(); } catch (_) { /* */ } }
  player.audio = null; player.path = null; notify();
}
async function toggle(path) {
  if (player.path === path && player.audio) {
    if (player.audio.paused) player.audio.play().catch(() => {}); else player.audio.pause();
    notify();
    return;
  }
  stopVoice();
  player.path = path; player.loading = true; player.error = null; notify();
  try {
    const url = await api.voiceUrl(path);
    if (player.path !== path) return;
    const a = new Audio(url);
    a.ontimeupdate = notify; a.onpause = notify; a.onplay = notify; a.onloadedmetadata = notify;
    a.onended = () => { a.currentTime = 0; notify(); };
    player.audio = a; player.loading = false;
    await a.play();
  } catch (e) {
    player.loading = false; player.audio = null; player.error = userMessage(e, "Ses çalınamadı");
  }
  notify();
}

export function VoiceBubble({ path, sec, expired }) {
  const s = useVoiceSettings();
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); player.subs.add(f); return () => player.subs.delete(f); }, []);
  if (!path || expired) return html`<div class="vb-expired">🎤 Sesli mesajın süresi doldu</div>`;
  const me = player.path === path;
  const a = me ? player.audio : null;
  const dur = a && isFinite(a.duration) && a.duration > 0 ? a.duration : (sec || 1);
  const pos = a ? a.currentTime : 0;
  const playing = a && !a.paused;
  return html`
    <div class="vb" onClick=${(e) => e.stopPropagation()}>
      <div class="row" style="gap:10px;align-items:center">
        <button type="button" class="vb-play" aria-label=${playing ? "Durdur" : "Dinle"} onClick=${() => toggle(path)}>
          ${me && player.loading ? html`<${Spinner} small />` : playing ? "❚❚" : "▶"}</button>
        <div class="grow">
          <div class="vb-track"><i style=${`width:${Math.min(100, (pos / dur) * 100)}%`}></i></div>
          <div class="vb-time">${a && (playing || pos > 0) ? `${voiceClock(pos)} / ${voiceClock(dur)}` : `🎤 ${voiceClock(sec || dur)}`}</div>
        </div>
      </div>
      ${me && player.error && html`<div class="vb-time">${player.error}</div>`}
      <div class="vb-keep">⏳ ${s.keep_days || 3} gün sonra silinir</div>
    </div>`;
}

/** Şikayetler: sesli mesajı dinle (yetkili) */
export function ReportVoice({ reportId }) {
  const [v, setV] = useState(undefined);
  useEffect(() => { api.reportVoice(reportId).then((x) => setV(x || null)).catch(() => setV(null)); }, [reportId]);
  if (v === undefined) return null;
  return html`<div class="vb-report">${v && v.voice
    ? html`<${VoiceBubble} path=${v.voice} sec=${v.voice_sec} expired=${v.voice_expired} />`
    : "🎤 Ses bulunamadı (silinmiş olabilir)"}</div>`;
}
