// Ayarlarım: bildirim izni, sohbet / radar sessize alma, oda bazlı bildirim (ayarlar sunucuda tutulur)
import { html, useState, useEffect, navigate, userMessage, isStillActive, remainingText, isStandalone, toast } from "../lib.js";
import * as api from "../api.js";
import { TopBar, Modal, Spinner, Switch, useInterval } from "../ui.js";
import { APP_VERSION } from "../config.js";
import { enablePush, pushConfigured, pushSupported, permission } from "../push.js";

const SILENCE = [
  ["15 dakika", 15], ["1 saat", 60], ["5 saat", 300], ["8 saat", 480], ["16 saat", 960], ["24 saat", 1440], ["Tamamen kapat", null],
];
const FOREVER = "9999-12-31T00:00:00Z";

function statusText(until) {
  if (!isStillActive(until)) return "Açık";
  if (new Date(until).getFullYear() >= 9999) return "Tamamen kapalı";
  return remainingText(until) + " daha sessiz";
}

export function SettingsScreen() {
  const [prefs, setPrefs] = useState(null);
  const [rooms, setRooms] = useState(api.cachedRooms());
  const [silenceFor, setSilenceFor] = useState(null);     // "chat" | "radar"
  const [err, setErr] = useState(null);
  const [perm, setPerm] = useState(permission());
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    api.myNotificationPrefs().then(setPrefs).catch((e) => {
      setErr("Ayarlar yüklenemedi: " + userMessage(e));
      setPrefs({ chat_muted_until: null, radar_muted_until: null, rooms_off: [] });
    });
    api.roomsOverview().then((l) => l.length && setRooms(l)).catch(() => {});
  }, []);
  useInterval(() => setTick((t) => t + 1), 30000);

  async function save(next) {
    const prev = prefs;
    setPrefs(next);
    try {
      await api.setNotificationPrefs(next);
      setErr(null);
    } catch (e) {
      setPrefs(prev);
      setErr("Kaydedilemedi: " + userMessage(e));
    }
  }

  async function turnOn() {
    setBusy(true);
    try {
      await enablePush();
      toast("🔔 Bildirimler açıldı");
    } catch (e) {
      toast(e.message || "Bildirim açılamadı", 5000);
    }
    setPerm(permission());
    setBusy(false);
  }

  // Bildirim izni kartı
  let permCard;
  if (!pushConfigured()) {
    permCard = html`<div class="card" style="border-color:#B26A00"><b>🔔 Bildirimler yakında</b><div class="soft">Bildirim altyapısı henüz kuruluyor.</div></div>`;
  } else if (!isStandalone() || !pushSupported()) {
    permCard = html`
      <div class="card" style="border-color:#B26A00">
        <b>📲 Bildirim için ana ekrana ekle</b>
        <div class="soft">iPhone'da bildirimler sadece ana ekrana eklenmiş DYB'de çalışır (iOS 16.4 ve üstü). Safari'de Paylaş ⬆️ → "Ana Ekrana Ekle".</div>
      </div>`;
  } else if (perm === "granted") {
    permCard = html`<div class="card"><b>🔔 Bildirim izni: Açık ✅</b><div class="soft small">Ses ve titreşim: iPhone Ayarlar → Bildirimler → DYB</div></div>`;
  } else if (perm === "denied") {
    permCard = html`
      <div class="card" style="background:#5A1E1E;border-color:#FF6B6B">
        <b>⚠️ Bildirim izni kapalı</b>
        <div>Hiçbir bildirim gelmez. Açmak için: iPhone <b>Ayarlar → Bildirimler → DYB → Bildirimlere İzin Ver</b>.</div>
      </div>`;
  } else {
    permCard = html`
      <div class="card" style="border-color:var(--blue)">
        <b>🔔 Bildirimler kapalı</b>
        <div class="soft" style="margin-bottom:10px">Yeni radar ve mesajlardan haberdar olmak için aç.</div>
        <button class="btn block big" disabled=${busy} onClick=${turnOn}>${busy ? html`<${Spinner} small />` : "Bildirimleri Aç"}</button>
      </div>`;
  }

  const Category = ({ kind, title, subtitle }) => {
    const until = prefs?.[kind === "chat" ? "chat_muted_until" : "radar_muted_until"];
    const muted = isStillActive(until);
    return html`
      <div class="card" style=${muted ? "border-color:#E07B00" : ""}>
        <h2>${title}</h2>
        <div class="soft">${subtitle}</div>
        <div class="bold" style=${`margin:8px 0 10px;font-size:17px;color:${muted ? "#FFC27A" : "#8BE0A4"}`}>Durum: ${statusText(until)}</div>
        ${muted
          ? html`<button class="btn block big green" onClick=${() => save({ ...prefs, [kind === "chat" ? "chat_muted_until" : "radar_muted_until"]: null })}>🔔 Bildirimleri Şimdi Aç</button>`
          : html`<button class="btn block big orange" onClick=${() => setSilenceFor(kind)}>🔕 Sessize Al / Kapat</button>`}
      </div>`;
  };

  return html`
    <div class="screen">
      <${TopBar} title="⚙️ Ayarlarım" onBack=${() => navigate("/menu")} />
      <div class="content">
        ${permCard}
        ${err && html`<div class="msg err">${err}</div>`}
        ${!prefs ? html`<${Spinner} />` : html`
          <${Category} kind="chat" title="💬 Sohbet bildirimleri" subtitle="Sohbet odalarına yeni mesaj gelince" />
          <div class="card">
            <h2>🗂 Hangi odalardan bildirim gelsin?</h2>
            <div class="soft">Kapattığın odanın mesajları uygulamada görünmeye devam eder, sadece bildirim gelmez.</div>
            ${rooms.map((r) => html`
              <${Switch} key=${r.id} label=${`${r.icon} ${r.name}`} checked=${!(prefs.rooms_off || []).includes(r.id)}
                onChange=${(on) => {
                  const off = new Set(prefs.rooms_off || []);
                  on ? off.delete(r.id) : off.add(r.id);
                  save({ ...prefs, rooms_off: [...off] });
                }} />`)}
            <div class="soft small" style="margin-top:8px">📣 Biri seni @etiketlediğinde ya da mesajına yanıt verdiğinde, oda kapalı olsa bile bildirim gelir.</div>
          </div>
          <${Category} kind="radar" title="🚨 Radar bildirimleri" subtitle="Yeni sabit ya da mobil radar bildirilince" />
        `}
        <div class="soft small">Bu ayarlar hesabına kaydedilir. Haritadaki yaklaşma uyarısı (bip sesi) bu ayarlardan etkilenmez.</div>
        <div class="muted small" style="text-align:center">DYB iPhone sürümü ${APP_VERSION}</div>
      </div>

      ${silenceFor && html`
        <${Modal} title=${(silenceFor === "chat" ? "Sohbet" : "Radar") + " bildirimleri – sessize al"} center=${false}
          onClose=${() => setSilenceFor(null)}>
          ${SILENCE.map(([label, min]) => html`
            <button class="list-btn" key=${label} style=${min === null ? "color:#FF8A80;font-weight:700" : ""}
              onClick=${() => {
                const until = min === null ? FOREVER : new Date(Date.now() + min * 60000).toISOString();
                save({ ...prefs, [silenceFor === "chat" ? "chat_muted_until" : "radar_muted_until"]: until });
                setSilenceFor(null);
              }}>${label}</button>`)}
          <button class="list-btn muted" onClick=${() => setSilenceFor(null)}>Vazgeç</button>
        </${Modal}>`}
    </div>`;
}
