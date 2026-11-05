// 1.1.2.3: sade yönetim pencereleri — üye penceresi, 👥 Üyeler satırı, kişi kartı (/whois), mesaj menüsü
import { html, useState, useEffect, userMessage, dateText, can, perms, roleInfo, roleRank, agoText } from "../lib.js";
import * as api from "../api.js";
import { Spinner } from "../ui.js";

const AVATAR = ["#0D9488", "#2563EB", "#7C3AED", "#DB2777", "#EA580C", "#0891B2"];
export function avatarColor(key) {
  let h = 0;
  for (const c of String(key || "")) h = (h * 31 + c.charCodeAt(0)) | 0;
  return AVATAR[Math.abs(h) % AVATAR.length];
}

export function Avatar({ name, id, size = 46 }) {
  return html`<div class="st-av" style=${`width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px;background:${avatarColor(id || name)}`}>
    ${(name || "?").slice(0, 1).toLocaleUpperCase("tr-TR")}</div>`;
}

export function RoleChip({ role }) {
  const r = roleInfo(role);
  if (r.role === "uye") return null;
  return html`<span class="st-chip" style=${`--c:${r.renk}`}>${`${r.rozet} ${r.ad}`.trim()}</span>`;
}

/** Alttan açılan sade pencere */
export function Sheet({ onClose, children }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return html`
    <div class="st-back" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="st-sheet" role="dialog">
        <div class="st-handle"></div>
        ${children}
      </div>
    </div>`;
}

function Row({ icon, title, color, onClick }) {
  return html`<button class="st-row" style=${color ? `color:${color}` : ""} onClick=${onClick}>
    <span class="st-ri">${icon}</span><span class="grow">${title}</span><span class="st-ch">›</span></button>`;
}

const DAY = ["Pz", "Pt", "Sa", "Ça", "Pe", "Cu", "Ct"];
const shortDur = (s) => { const m = Math.floor((s || 0) / 60); return m < 1 ? "<1 dk" : m < 60 ? `${m} dk` : `${Math.floor(m / 60)} sa ${m % 60} dk`; };

function CompactUsage({ userId }) {
  const [days, setDays] = useState(null);
  useEffect(() => { api.adminUsageDetail(userId).then(setDays).catch(() => setDays([])); }, [userId]);
  if (!days || !days.length) return null;
  const max = Math.max(1, ...days.map((d) => d.seconds || 0));
  const total = days.reduce((a, d) => a + (d.seconds || 0), 0);
  return html`
    <div class="st-box">
      <div class="row"><b class="grow st-small">Son 7 gün</b><span class="st-muted st-xs">bugün ${shortDur(days[days.length - 1].seconds)} • toplam ${shortDur(total)}</span></div>
      <div class="st-bars">
        ${days.map((d, i) => html`<div key=${d.day} class="st-bar">
          <i style=${`height:${4 + Math.round(34 * (d.seconds || 0) / max)}px;${i === days.length - 1 ? "background:#2563EB" : ""}`}></i>
          <span>${DAY[new Date(d.day + "T12:00:00").getDay()]}</span></div>`)}
      </div>
    </div>`;
}

/** Yönetim → üyeye dokununca */
export function MemberSheet({ m, myRank, working, onClose, onActivity, onMute, onUnmute, onBan, onUnban, onReset, onRole, onMessage }) {
  const canAct = myRank > roleRank(m.role) && m.role !== "kurucu";
  const muted = m.role !== "kurucu" && m.muted_until && new Date(m.muted_until) > new Date();
  const banned = m.role !== "kurucu" && !!m.banned_at;
  const choices = perms.atanabilir.map((r) => roleInfo(r));
  return html`
    <${Sheet} onClose=${onClose}>
      <div class="row" style="gap:12px;align-items:center">
        <${Avatar} name=${m.username} id=${m.id} />
        <div class="grow" style="min-width:0">
          <div class="st-title">@${m.username || "?"} <${RoleChip} role=${m.role} /></div>
          <div class="st-muted st-small">${[m.created_at && `${dateText(m.created_at)}'dan beri`, m.invited_by && `Davet: @${m.invited_by}`].filter(Boolean).join(" • ")}</div>
        </div>
        <button class="st-x" aria-label="Kapat" onClick=${onClose}>✕</button>
      </div>
      <div class="st-stats">
        <div><b>${m.message_count ?? 0}</b><span>mesaj</span></div>
        <div><b>${m.points ?? 0}</b><span>puan</span></div>
        <div><b class="st-green">${m.app_version_name || "—"}</b><span>sürüm</span></div>
      </div>
      ${can("kullanim_gor") && html`<${CompactUsage} userId=${m.id} />`}
      ${m.email && html`<div class="st-soft st-small">✉️ ${m.email}</div>`}
      ${muted && html`<div class="st-warn">🔇 Susturulmuş</div>`}
      ${banned && html`<div class="st-bad">⛔ Yasaklı</div>`}
      <div class="st-group">
        <${Row} icon="✉️" title="Mesaj gönder" onClick=${onMessage} />
        ${can("son_islemler") && html`<${Row} icon="📋" title="İşlemlerini gör" onClick=${onActivity} />`}
        ${canAct && can("sustur") && (muted
          ? html`<${Row} icon="🔊" title="Susturmayı kaldır" onClick=${() => !working && onUnmute()} />`
          : html`<${Row} icon="🔇" title="Sustur" onClick=${() => !working && onMute()} />`)}
        ${canAct && can("sifre_yenile") && html`<${Row} icon="🔑" title="Şifreyi yenile" onClick=${() => !working && onReset()} />`}
      </div>
      ${canAct && choices.length > 0 && html`
        <div>
          <div class="st-label">ROL</div>
          <div class="st-seg">
            ${choices.map((r) => html`<button key=${r.role} class=${(m.role || "uye") === r.role ? "on" : ""}
              disabled=${working || (m.role || "uye") === r.role} onClick=${() => onRole(r.role)}>${r.ad}</button>`)}
          </div>
          <div class="st-muted st-xs" style="margin-top:6px">Sadece kendi rütbenin altındakileri atayabilirsin.</div>
        </div>`}
      ${!canAct && html`<div class="st-muted st-small">Bu üyeye işlem yapma yetkin yok.</div>`}
      ${canAct && can("yasakla") && html`
        <button class=${"st-danger" + (banned ? " ok" : "")} disabled=${working} onClick=${banned ? onUnban : onBan}>
          ${banned ? "✅  Yasağı kaldır" : "⛔  Yasakla"}</button>`}
    </${Sheet}>`;
}

/** 👥 Üyeler: sade satır */
export function SimpleMemberRow({ m, onClick, onMessage }) {
  return html`
    <div class="st-simple" onClick=${onClick}>
      <${Avatar} name=${m.username} id=${m.id} size=${36} />
      <b class="grow">@${m.username || "?"} ${roleInfo(m.role).rozet}</b>
      <button class="st-msg" onClick=${(e) => { e.stopPropagation(); onMessage(); }}>✉️ Mesaj</button>
    </div>`;
}

/** Kişi kartı (/whois): satırları sunucu hazırlar; room verilirse o odada görev verilebilir */
export function WhoisModal({ userId, room, onClose, onMessage }) {
  const [w, setW] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => { api.whois(userId, room).then(setW).catch((e) => setErr(userMessage(e, "Profil yüklenemedi."))); }, [userId, reload]);
  async function setLevel(lv) {
    setBusy(true);
    setErr(null);
    try {
      await api.adminSetRoomLevel(room, userId, lv);
      setReload((r) => r + 1);
    } catch (e) {
      setErr(userMessage(e));
    }
    setBusy(false);
  }
  return html`
    <${Sheet} onClose=${onClose}>
      ${!w ? html`<div class="center" style="min-height:140px">${err ? html`<div class="msg err">${err}</div>` : html`<${Spinner} />`}</div>` : html`
        <div class="st-who">
          <div class="st-avwrap"><${Avatar} name=${w.username} id=${w.id} size=${72} />${w.online && html`<i class="st-on"></i>`}</div>
          <div class="st-name">@${w.username || "?"}</div>
          ${w.online ? html`<div class="st-green st-small">çevrimiçi</div>` : w.last_seen && html`<div class="st-muted st-small">son görülme: ${agoText(w.last_seen)}</div>`}
          <div style="margin-top:6px"><${RoleChip} role=${w.role} /></div>
        </div>
        ${(w.rooms || []).length > 0 && html`
          <div class="st-group">
            <div class="st-label" style="padding:10px 14px 2px">ODA GÖREVLERİ</div>
            ${w.rooms.map((r) => html`<div key=${r.room_id} class="st-line"><b class="grow">${r.room || r.room_id}</b><span>${r.level_ad || r.level}</span></div>`)}
          </div>`}
        ${(w.lines || []).length > 0 && html`
          <div class="st-group">
            ${w.lines.map((l, i) => html`<div key=${i} class="st-line"><span class="grow st-muted">${l.l}</span><b>${l.v}</b></div>`)}
          </div>`}
        ${room && (w.can_set_levels || []).length > 0 && html`
          <div>
            <div class="st-label">BU ODADA GÖREV</div>
            <div class="st-seg wrap">
              ${[...w.can_set_levels, ""].map((lv) => html`<button key=${lv || "yok"} class=${(w.room_level || "") === lv ? "on" : ""}
                disabled=${busy || (w.room_level || "") === lv} onClick=${() => setLevel(lv)}>${lv ? api.LEVELS[lv].slice(0, 2).join(" ") : "Görev yok"}</button>`)}
            </div>
          </div>`}
        ${err && html`<div class="msg err">${err}</div>`}
        <div class="st-actions">
          ${!w.is_me && onMessage && html`<button class="btn" onClick=${() => onMessage(w.id)}>✉️  Mesaj gönder</button>`}
          <button class="btn outline" onClick=${onClose}>Kapat</button>
        </div>`}
    </${Sheet}>`;
}

/** Mesaja basılı tutunca: tepki çubuğu + mesaj + küçük menü (gruplar: 0 temel, 1 dikkat, 2 silme) */
export function MessageMenu({ sender, preview, reactions, mine, onReact, onMore, actions, onClose }) {
  return html`
    <div class="mm-back" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="mm-wrap">
        ${reactions.length > 0 && html`
          <div class="mm-reacts">
            ${reactions.map((e) => html`<button key=${e} class=${mine === e ? "on" : ""} onClick=${() => onReact(e)}>${e}</button>`)}
            <button class="plus" aria-label="Diğer tepkiler" onClick=${onMore}>＋</button>
          </div>`}
        <div class="mm-bubble">${sender && html`<b>${sender}</b>`}<div>${preview}</div></div>
        <div class="mm-menu">
          ${actions.map((a, i) => html`<button key=${a.title} class=${i > 0 && a.group !== actions[i - 1].group ? "gap" : ""}
            style=${a.color ? `color:${a.color}` : ""} onClick=${a.onClick}><span class="grow">${a.title}</span><span>${a.icon}</span></button>`)}
        </div>
      </div>
    </div>`;
}
