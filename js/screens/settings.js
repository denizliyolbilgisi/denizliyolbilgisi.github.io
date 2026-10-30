// Ayarlar: telefonun kendi ayarları gibi sade liste (Özel mesajlar • Bildirimler); ayrıntılar alt sayfada
import { html, useState, useEffect, navigate, userMessage, isStillActive, remainingText, isStandalone, toast, roleBadge } from "../lib.js";
import * as api from "../api.js";
import { themePref, setThemePref } from "../theme.js";
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
  const [theme, setTheme] = useState(themePref());
  const [prefs, setPrefs] = useState(null);
  const [dm, setDm] = useState(null);
  const [rooms, setRooms] = useState(api.cachedRooms());
  const [page, setPage] = useState(null);              // null | chat | radar | blocks
  const [silenceFor, setSilenceFor] = useState(null);  // "chat" | "radar"
  const [confirmClose, setConfirmClose] = useState(false);
  const [err, setErr] = useState(null);
  const [perm, setPerm] = useState(permission());
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  const loadDm = () => api.myDmSettings().then(setDm).catch((e) => setErr(userMessage(e)));
  useEffect(() => {
    api.myNotificationPrefs().then(setPrefs).catch((e) => {
      setErr("Ayarlar yüklenemedi: " + userMessage(e));
      setPrefs({ chat_muted_until: null, radar_muted_until: null, rooms_off: [] });
    });
    loadDm();
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
  async function dmAction(fn) {
    if (busy) return;
    setBusy(true);
    try { await fn(); await loadDm(); setErr(null); } catch (e) { setErr(userMessage(e)); }
    setBusy(false);
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

  // Bildirim izni satırı
  let permRow = null;
  if (!pushConfigured()) {
    permRow = html`<div class="set-warn">🔔 Bildirim altyapısı henüz kuruluyor.</div>`;
  } else if (!isStandalone() || !pushSupported()) {
    permRow = html`<div class="set-warn">📲 Bildirim için DYB'yi ana ekrana ekle: Safari'de Paylaş ⬆️ → "Ana Ekrana Ekle" (iOS 16.4+).</div>`;
  } else if (perm === "denied") {
    permRow = html`<div class="set-warn red">⚠️ Bildirim izni kapalı. iPhone Ayarlar → Bildirimler → DYB → İzin Ver.</div>`;
  } else if (perm !== "granted") {
    permRow = html`<button class="set-warn blue" disabled=${busy} onClick=${turnOn}>🔔 Bildirimler kapalı — açmak için dokun</button>`;
  }

  const key = (k) => (k === "chat" ? "chat_muted_until" : "radar_muted_until");
  const statusRow = (k) => {
    const until = prefs?.[key(k)];
    return { text: statusText(until), muted: isStillActive(until) };
  };
  const title = page === "chat" ? "💬 Sohbet bildirimleri" : page === "radar" ? "🚔 Harita bildirimleri"
    : page === "blocks" ? "🚫 Engellediklerim" : "Ayarlar";

  let content;
  if (!prefs) {
    content = html`<${Spinner} />`;
  } else if (page === "chat" || page === "radar") {
    const st = statusRow(page);
    content = html`
      <div class="set-sec">SESSİZE AL</div>
      <div class="set-grp">
        ${st.muted
          ? html`<${Row} icon="🔕" color="#B45309" title=${"Şu an: " + st.text} value="Şimdi aç" valueClass="g"
              onClick=${() => save({ ...prefs, [key(page)]: null })} />`
          : html`<${Row} icon="🔕" color="#B45309" title="Sessize al / kapat" sub="15 dakikadan tamamen kapatmaya kadar"
              onClick=${() => setSilenceFor(page)} />`}
      </div>
      ${page === "chat" && html`
        <div class="set-sec">HANGİ ODALARDAN BİLDİRİM GELSİN</div>
        <div class="set-grp">
          ${rooms.map((r) => html`<${Row} key=${r.id} icon=${r.icon} color="#26323F" title=${r.name}
              checked=${!(prefs.rooms_off || []).includes(r.id)}
              onToggle=${(on) => {
                const off = new Set(prefs.rooms_off || []);
                on ? off.delete(r.id) : off.add(r.id);
                save({ ...prefs, rooms_off: [...off] });
              }} />`)}
        </div>
        <div class="set-foot">Kapattığın odanın mesajları uygulamada görünmeye devam eder, sadece bildirim gelmez. @etiket ve yanıtlar her zaman gelir.</div>`}
      <div class="set-foot">Ses ve titreşim: iPhone Ayarlar → Bildirimler → DYB</div>`;
  } else if (page === "blocks") {
    const list = dm?.blocks || [];
    content = list.length === 0
      ? html`<div class="set-foot" style="font-size:15px">Kimseyi engellemedin. Bir üyeyi engellemek için sohbette adına dokun → "Özel mesaj için engelle".</div>`
      : html`
        <div class="set-sec">ÖZEL MESAJ GÖNDEREMEYENLER</div>
        <div class="set-grp">
          ${list.map((b) => html`<${Row} key=${b.user_id} icon=${(b.username || "?").charAt(0).toUpperCase()} color="#475569"
              title=${`@${b.username || ""} ${roleBadge(b.role)}`} value="Engeli kaldır" valueClass="g"
              onClick=${() => dmAction(() => api.blockUser(b.user_id, false))} />`)}
        </div>`;
  } else {
    const chat = statusRow("chat");
    const radar = statusRow("radar");
    const pickTheme = (v) => { setThemePref(v); setTheme(v); };
    content = html`
      <div class="set-sec">GÖRÜNÜM</div>
      <div class="set-grp">
        ${[["system", "📱", "#475569", "Telefona göre", "Telefon gece modundaysa koyu, değilse açık"],
           ["dark", "🌙", "#1E293B", "Koyu", null],
           ["light", "☀️", "#F59E0B", "Açık", null]].map(([v, ic, col, t, sub]) => html`
          <${Row} key=${v} icon=${ic} color=${col} title=${t} sub=${sub}
            value=${theme === v ? "✓" : ""} valueClass="g" onClick=${() => pickTheme(v)} />`)}
      </div>

      <div class="set-sec">ÖZEL MESAJLAR</div>
      <div class="set-grp">
        <${Row} icon="✉️" color="#2563EB" title="Bana özel mesaj yazılabilsin"
          sub=${dm && !dm.dm_open ? "🔒 Kapalı: sadece yönetim yazabilir" : "Kapatırsan sadece yönetim yazabilir"}
          checked=${dm ? dm.dm_open : true}
          onToggle=${(on) => { if (on) dmAction(() => api.setDmOpen(true)); else setConfirmClose(true); }} />
        <${Row} icon="👁" color="#0EA5E9" title="Okundu bilgisi" sub="Kapalıysa mavi tik göstermezsin, başkalarınınkini de görmezsin"
          checked=${dm ? dm.read_receipts !== false : true}
          onToggle=${(on) => dmAction(() => api.setReadReceipts(on))} />
        <${Row} icon="🟢" color="#16A34A" title="Çevrimiçi durumumu göster" sub="Kapatırsan kimse göremez, sen de başkasınınkini göremezsin"
          checked=${dm ? dm.show_online !== false : true}
          onToggle=${(on) => dmAction(() => api.setShowOnline(on))} />
        <${Row} icon="🚫" color="#DC2626" title="Engellediklerim" value=${(dm?.blocks || []).length + " kişi"}
          onClick=${() => setPage("blocks")} />
      </div>

      <div class="set-sec">BİLDİRİMLER</div>
      <div class="set-grp">
        <${Row} icon="💬" color="#F59E0B" title="Sohbet odaları" sub="Sessize alma, oda seçimi"
          value=${chat.text} valueClass=${chat.muted ? "o" : "g"} onClick=${() => setPage("chat")} />
        <${Row} icon="✉️" color="#7C3AED" title="Özel mesaj bildirimleri" checked=${dm ? !dm.dm_notify_off : true}
          onToggle=${(on) => dmAction(() => api.setDmNotify(!on))} />
        <${Row} icon="🚔" color="#EF4444" title="Harita bildirimleri" sub="Radar, kaza, yavaşlama, buzlanma"
          value=${radar.text} valueClass=${radar.muted ? "o" : "g"} onClick=${() => setPage("radar")} />
      </div>
      <div class="set-foot">DYB iPhone ${APP_VERSION} • Ayarlar hesabına kaydedilir. Haritadaki bip sesi bu ayarlardan etkilenmez.</div>`;
  }

  return html`
    <div class="screen">
      <${TopBar} title=${title} backLabel="←" onBack=${() => (page ? setPage(null) : navigate("/menu"))} />
      <div class="set-wrap">
        ${permRow}
        ${err && html`<div class="msg err">${err}</div>`}
        ${content}
      </div>

      ${confirmClose && html`
        <${Modal} title="🔒 Özel mesajlar kapansın mı?" onClose=${() => setConfirmClose(false)}
          actions=${[
            html`<button class="btn outline" onClick=${() => setConfirmClose(false)}>Vazgeç</button>`,
            html`<button class="btn orange" onClick=${() => { setConfirmClose(false); dmAction(() => api.setDmOpen(false)); }}>Kapat</button>`,
          ]}>
          <div style="font-size:16px">Kapatınca üyeler sana özel mesaj yazamaz; yazmaya çalışan "Bu kullanıcı özel mesaj yolunu kapatmıştır" uyarısını görür.
            Kurucu ve yöneticiler yine de yazabilir. Eski konuşmaların silinmez. İstediğin zaman tekrar açabilirsin.</div>
        </${Modal}>`}

      ${silenceFor && html`
        <${Modal} title=${(silenceFor === "chat" ? "Sohbet" : "Harita") + " bildirimleri – sessize al"} center=${false}
          onClose=${() => setSilenceFor(null)}>
          ${SILENCE.map(([label, min]) => html`
            <button class="list-btn" key=${label} style=${min === null ? "color:var(--red-soft);font-weight:700" : ""}
              onClick=${() => {
                const until = min === null ? FOREVER : new Date(Date.now() + min * 60000).toISOString();
                save({ ...prefs, [key(silenceFor)]: until });
                setSilenceFor(null);
              }}>${label}</button>`)}
          <button class="list-btn muted" onClick=${() => setSilenceFor(null)}>Vazgeç</button>
        </${Modal}>`}
    </div>`;
}

/** Tek satır: simge • ad (+ açıklama) • sağda değer + › ya da aç/kapa */
function Row({ icon, color, title, sub, value, valueClass = "", checked, onToggle, onClick }) {
  const toggle = checked !== undefined;
  return html`
    <div class="set-row" onClick=${toggle ? () => onToggle(!checked) : onClick} style=${toggle || onClick ? "cursor:pointer" : ""}>
      <div class="set-ic" style=${`background:${color}`}>${icon}</div>
      <div class="set-t"><b>${title}</b>${sub && html`<small>${sub}</small>`}</div>
      ${value && html`<span class=${"set-v " + valueClass}>${value}</span>`}
      ${toggle
        ? html`<span class="switch" onClick=${(e) => e.stopPropagation()}>
            <input type="checkbox" checked=${checked} onChange=${(e) => onToggle(e.target.checked)} /><span></span></span>`
        : onClick && html`<span class="set-ch">›</span>`}
    </div>`;
}
