// Profilim, üye profili, ayın ilk 10'u, şifre değiştir, rütbe kutlaması
import {
  html, useState, useEffect, navigate, userMessage, dateText, roleBadge, roleLabel, toast, cleanUsername, usernameLocalError,
} from "../lib.js";
import * as api from "../api.js";
import { TopBar, Modal, Spinner, useOnResume } from "../ui.js";
import { disablePush } from "../push.js";

const GOLD = "#FFC94D";
export const PASSWORD_MIN = 8;

const POINT_RULES = [
  ["💬 Mesaj yazmak", "+1 (günde en fazla 20)"],
  ["📍 Radar bildirmek", "+3"],
  ["✅ Bildirdiğin radar onaylanınca", "+10"],
  ["👍 Radara oy vermek", "+1"],
  ["📅 Uygulamayı kullandığın her gün", "+2"],
  ["🔥 7 gün üst üste kullanmak", "+10"],
  ["🤝 Davet ettiğin kişi uygulamayı kullanırsa", "+20"],
  ["🗑 Mesajın kural dışı diye silinirse", "−10"],
  ["🔇 Susturulursan", "−30"],
];
const RANKS = [["🚶 Yolcu", 0], ["🚗 Sürücü", 100], ["🧭 Kılavuz", 300], ["🛣 Yol Ustası", 700],
  ["🦅 Yol Kartalı", 1500], ["🏆 DYB Efsanesi", 3000]];

const rankOf = (p) => p?.rank || { level: 1, name: "Yolcu", icon: "🚶", min: 0 };
function progress(p) {
  const r = rankOf(p);
  if (!r.next_min || r.next_min <= r.min) return 1;
  return Math.min(1, Math.max(0, (p.points - r.min) / (r.next_min - r.min)));
}
const roomTitle = (id) => {
  const r = api.cachedRoom(id);
  return `${r.icon} ${r.name}`;
};

/** Yeni şifre kontrolü: uygunsa null */
export function newPasswordError(p1, p2) {
  if (p1.length < PASSWORD_MIN) return `Şifre en az ${PASSWORD_MIN} karakter olmalı.`;
  if (p1 !== p2) return "İki şifre aynı değil.";
  return null;
}

// ---------------------------------------------------------------------------
// Profilim
// ---------------------------------------------------------------------------
export function ProfileScreen() {
  const [p, setP] = useState(null);
  const [err, setErr] = useState(null);
  const [reload, setReload] = useState(0);
  const [modal, setModal] = useState(null);   // bio | password | leaders | rules | logout
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.myProfile().then((x) => { setP(x); setErr(null); }).catch((e) => setErr(userMessage(e, "Profil yüklenemedi.")));
  }, [reload]);
  useOnResume(() => setReload((x) => x + 1));   // uygulamaya dönünce yenile

  const r = rankOf(p);
  const invited = (p?.invited || []).filter(Boolean);
  const roomsAdmin = (p?.room_admin_of || []).filter(Boolean);

  return html`
    <div class="screen">
      <${TopBar} title="👤 Profilim" onBack=${() => navigate("/menu")} />
      <div class="content">
        ${!p ? (err
          ? html`<div class="center" style="padding:40px;gap:10px"><div class="msg err">${err}</div>
              <button class="btn outline" onClick=${() => setReload((x) => x + 1)}>Tekrar dene</button></div>`
          : html`<${Spinner} />`) : html`
          <div class="pr-head">
            <div class="pr-av">${(p.username || "?").charAt(0).toUpperCase()}</div>
            <div class="grow" style="min-width:0">
              <div class="pr-name">@${p.username || ""} ${roleBadge(p.role)}</div>
              <div class="pr-sub">${roleLabel(p.role)} • ${dateText(p.created_at)}'dan beri üye</div>
              ${roomsAdmin.length > 0 && html`<div class="pr-sub">🔰 ${roomsAdmin.map(roomTitle).join(", ")}</div>`}
              ${p.bio && html`<div class="pr-bio">${p.bio}</div>`}
            </div>
          </div>

          <button class="pr-rank" onClick=${() => setModal("leaders")}>
            <div class="row" style="gap:8px">
              <b class="grow" style="font-size:16px">${r.icon} ${r.name} • ${p.points} puan</b>
              <span class="pr-rs">${p.month_position ? `Bu ay ${p.month_position}. sıradasın ›` : "Ayın ilk 10'u ›"}</span>
            </div>
            ${r.next_min && r.next_name ? html`
              <div class="pr-bar"><div style=${`width:${Math.round(progress(p) * 100)}%`}></div></div>
              <div class="pr-rs" style="margin-top:6px">${r.next_icon || ""} ${r.next_name}'na ${Math.max(0, r.next_min - p.points)} puan kaldı • Bu ay ${p.month_points} puan</div>`
              : html`<div class="pr-rs" style="margin-top:6px">🏆 En yüksek rütbedesin! • Bu ay ${p.month_points} puan</div>`}
          </button>

          <div class="pr-stats">
            ${[["Mesaj", p.message_count], ["Radar", p.radar_count], ["Onaylı", p.confirmed_count], ["Davet", invited.length]].map(([l, v]) => html`
              <div class="pr-st" key=${l}><b>${v ?? 0}</b><span>${l}</span></div>`)}
          </div>

          <div class="set-sec">HESAP</div>
          <div class="set-grp">
            ${[
              ["👥", "#7C3AED", "Davetlerim", invited.length ? invited.length + " kişi" : "Davet kodu oluştur", () => navigate("/davetler")],
              ["📝", "#2563EB", "Hakkımda", p.bio ? "" : "Yaz", () => setModal("bio")],
              ["✏️", "#0EA5E9", "Kullanıcı adını değiştir", "", () => setModal("rename")],
              ["🔑", "#0D9488", "Şifremi değiştir", "", () => setModal("password")],
              ["ℹ️", "#D69E2E", "Puan nasıl kazanılır?", "", () => setModal("rules")],
            ].map(([ic, col, t, v, fn]) => html`
              <div class="set-row" key=${t} style="cursor:pointer" onClick=${fn}>
                <div class="set-ic" style=${`background:${col}`}>${ic}</div>
                <div class="set-t"><b>${t}</b></div>
                ${v && html`<span class="set-v">${v}</span>`}
                <span class="set-ch">›</span>
              </div>`)}
            ${p.email && html`
              <div class="set-row">
                <div class="set-ic" style="background:#475569">📧</div>
                <div class="set-t"><b>E-posta</b><small>Sadece sen ve yönetim görür</small></div>
                <span class="set-v" style="max-width:48%;overflow:hidden;text-overflow:ellipsis">${p.email}</span>
              </div>`}
          </div>

          <div class="set-grp" style="margin-top:14px">
            <div class="set-row pr-out" style="cursor:pointer" onClick=${() => setModal("logout")}>Çıkış yap</div>
          </div>
        `}
      </div>

      ${modal === "bio" && html`<${BioModal} initial=${p?.bio || ""} onClose=${() => setModal(null)}
          onSaved=${(t) => { setP({ ...p, bio: t || null }); setModal(null); toast("Kaydedildi"); }} />`}
      ${modal === "password" && html`<${ChangePasswordModal} onClose=${() => setModal(null)}
          onDone=${() => { setModal(null); toast("✅ Şifren değiştirildi", 4000); }} />`}
      ${modal === "rename" && html`<${RenameModal} current=${p?.username || ""} nextChange=${p?.username_next_change}
          onClose=${() => setModal(null)}
          onDone=${(n) => { setModal(null); setReload((x) => x + 1); toast("✅ Yeni kullanıcı adın: @" + n, 4000); }} />`}
      ${modal === "leaders" && html`<${LeaderboardModal} onClose=${() => setModal(null)} />`}
      ${modal === "rules" && html`<${PointRulesModal} onClose=${() => setModal(null)} />`}
      ${modal === "logout" && html`
        <${Modal} title="Çıkış Yap" onClose=${() => !busy && setModal(null)}
          actions=${[
            html`<button class="btn outline" disabled=${busy} onClick=${() => setModal(null)}>Vazgeç</button>`,
            html`<button class="btn red" disabled=${busy} onClick=${async () => {
              setBusy(true);
              try {
                await disablePush();
                await api.signOut();
              } catch (e) {
                toast(userMessage(e));
              }
              setBusy(false);
              setModal(null);
              navigate("/giris", true);
            }}>${busy ? "Çıkılıyor…" : "Çıkış Yap"}</button>`,
          ]}>
          <p style="font-size:18px;margin:0">Hesabından çıkış yapılsın mı? Tekrar girmek için e-posta ve şifren gerekir.</p>
        </${Modal}>`}
    </div>`;
}

function BioModal({ initial, onClose, onSaved }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  return html`
    <${Modal} title="📝 Hakkımda" onClose=${() => !busy && onClose()}
      actions=${[
        html`<button class="btn outline" disabled=${busy} onClick=${onClose}>Vazgeç</button>`,
        html`<button class="btn" disabled=${busy} onClick=${async () => {
          setBusy(true);
          try {
            await api.setBio(text.trim());
            onSaved(text.trim());
          } catch (e) {
            setErr(userMessage(e));
          }
          setBusy(false);
        }}>Kaydet</button>`,
      ]}>
      <textarea class="input" rows="3" maxlength="100" value=${text}
        onInput=${(e) => setText(e.target.value.replace(/\n/g, " "))}></textarea>
      <div class="muted small">${text.length}/100 • Örnek: Servis şoförüyüm, her sabah Çamlık – Merkez arasındayım.</div>
      ${err && html`<div class="msg err">${err}</div>`}
    </${Modal}>`;
}

/** Kullanıcı adını değiştir: ilk değişiklik serbest, sonra 7 günde bir (sunucu kontrol eder) */
function RenameModal({ current, nextChange, onClose, onDone }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const wait = nextChange && new Date(nextChange).getTime() > Date.now() ? new Date(nextChange) : null;
  const pad = (n) => String(n).padStart(2, "0");
  return html`
    <${Modal} title="✏️ Kullanıcı adını değiştir" onClose=${() => !busy && onClose()}
      actions=${wait ? html`<button class="btn" onClick=${onClose}>Tamam</button>` : [
        html`<button class="btn outline" disabled=${busy} onClick=${onClose}>Vazgeç</button>`,
        html`<button class="btn" disabled=${busy || !text} onClick=${async () => {
          const local = usernameLocalError(text);
          if (local) return setErr(local);
          setBusy(true);
          setErr(null);
          try {
            onDone(await api.changeUsername(text));
          } catch (e) {
            setErr(userMessage(e));
          }
          setBusy(false);
        }}>${busy ? "Kaydediliyor…" : "Kaydet"}</button>`,
      ]}>
      <div style="font-size:17px">Şu anki adın: <b>@${current}</b></div>
      ${wait ? html`<div style="color:var(--yellow);margin-top:8px">Kullanıcı adını 7 günde bir değiştirebilirsin.<br />
          Sonraki hak: ${pad(wait.getDate())}.${pad(wait.getMonth() + 1)}.${wait.getFullYear()} ${pad(wait.getHours())}:${pad(wait.getMinutes())}</div>` : html`
        <input class="input" autocapitalize="none" placeholder="Yeni kullanıcı adı" style="margin-top:8px"
          value=${text} onInput=${(e) => setText(cleanUsername(e.target.value.replace(/^@/, "")))} />
        <div class="muted small" style="margin-top:6px">3–20 karakter; harf, rakam ve _ kullanılabilir. Değiştirdikten sonra 7 gün yeniden değiştiremezsin. Eski adın 30 gün boyunca başkasına verilmez.</div>`}
      ${err && html`<div class="msg err">${err}</div>`}
    </${Modal}>`;
}

/** Şifre alanı (göster / gizle ortak) */
function PassInput({ value, onInput, placeholder, show }) {
  return html`<input class="input" type=${show ? "text" : "password"} autocomplete="new-password" placeholder=${placeholder}
    value=${value} onInput=${(e) => onInput(e.target.value)} style="margin-top:8px" />`;
}

export function ChangePasswordModal({ onClose, onDone }) {
  const [old, setOld] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  return html`
    <${Modal} title="🔑 Şifremi değiştir" onClose=${() => !busy && onClose()}
      actions=${[
        html`<button class="btn outline" disabled=${busy} onClick=${onClose}>Vazgeç</button>`,
        html`<button class="btn" disabled=${busy} onClick=${async () => {
          const problem = !old ? "Şu anki şifreni yaz." : newPasswordError(p1, p2);
          if (problem) return setErr(problem);
          setBusy(true);
          setErr(null);
          try {
            await api.changePassword(old, p1);
            onDone();
          } catch (e) {
            setErr(userMessage(e, "Şifre değiştirilemedi. Lütfen tekrar dene."));
          }
          setBusy(false);
        }}>${busy ? "Kaydediliyor…" : "Kaydet"}</button>`,
      ]}>
      <${PassInput} value=${old} onInput=${setOld} placeholder="Şu anki şifren" show=${show} />
      <${PassInput} value=${p1} onInput=${setP1} placeholder=${`Yeni şifre (en az ${PASSWORD_MIN} karakter)`} show=${show} />
      <${PassInput} value=${p2} onInput=${setP2} placeholder="Yeni şifre (tekrar)" show=${show} />
      <button class="btn ghost" onClick=${() => setShow(!show)}>${show ? "🙈 Şifreleri gizle" : "👁 Şifreleri göster"}</button>
      ${err && html`<div class="msg err">${err}</div>`}
    </${Modal}>`;
}

function PointRulesModal({ onClose }) {
  return html`
    <${Modal} title="ℹ DYB Puanı" onClose=${onClose}
      actions=${html`<button class="btn" onClick=${onClose}>Tamam</button>`}>
      ${POINT_RULES.map(([w, v]) => html`
        <div class="row" key=${w} style="margin:4px 0">
          <span class="grow">${w}</span>
          <b style=${`color:${v.startsWith("−") ? "var(--red-soft)" : "var(--ok)"}`}>${v}</b>
        </div>`)}
      <div class="bold" style="margin-top:10px">Rütbeler</div>
      ${RANKS.map(([n, m]) => html`<div key=${n}>${n} – ${m} puan</div>`)}
      <div class="muted small" style="margin-top:8px">Rütbe sadece profilde görünür; sohbette yetki rozetleri (👑 🛡 ⭐) aynen kalır.</div>
    </${Modal}>`;
}

export function LeaderboardModal({ onClose }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const myId = api.myId();
  useEffect(() => { api.leaderboard().then(setRows).catch((e) => setErr(userMessage(e))); }, []);
  return html`
    <${Modal} title="🏆 Bu ayın ilk 10'u" onClose=${onClose}
      actions=${html`<button class="btn" onClick=${onClose}>Kapat</button>`}>
      ${err ? html`<div class="msg err">${err}</div>` : !rows ? html`<${Spinner} />`
        : rows.length === 0 ? html`<div class="soft">Bu ay henüz puan kazanan yok.</div>`
        : rows.map((r) => html`
          <div class="row" key=${r.user_id}
            style=${`padding:7px 6px;border-radius:10px;${r.user_id === myId ? `background:${GOLD}2e` : ""}`}>
            <span style="width:40px;font-size:18px">${{ 1: "🥇", 2: "🥈", 3: "🥉" }[r.pos] || r.pos + "."}</span>
            <div class="grow">
              <div class="bold">@${r.username || ""}</div>
              <div class="muted small">${r.rank_icon || ""} ${r.rank_name || ""}</div>
            </div>
            <b style=${`font-size:18px;color:var(--gold)`}>${r.points}</b>
          </div>`)}
    </${Modal}>`;
}

/** Sohbette isme dokununca açılan üye profili (e-posta görünmez) */
export function MemberProfileModal({ userId, onClose, onMessage }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState(null);
  const [dm, setDm] = useState(null);          // özel mesaj durumu
  const [dmBusy, setDmBusy] = useState(false);
  const isMe = userId === api.myId();
  useEffect(() => { api.publicProfile(userId).then(setP).catch((e) => setErr(userMessage(e))); }, [userId]);
  useEffect(() => { if (!isMe) api.dmStatus(userId).then(setDm).catch(() => {}); }, [userId]);
  const openDm = () => { if (onMessage) onMessage(userId); else { onClose(); navigate("/mesaj/" + userId); } };
  async function toggleBlock() {
    setDmBusy(true);
    try {
      await api.blockUser(userId, !dm.blocked_by_me);
      toast(dm.blocked_by_me ? "Engel kaldırıldı" : "Engellendi. Artık sana özel mesaj yazamaz.", 3500);
      setDm(await api.dmStatus(userId));
    } catch (e) {
      toast(userMessage(e), 4000);
    }
    setDmBusy(false);
  }
  const r = rankOf(p);
  const roomsAdmin = (p?.room_admin_of || []).filter(Boolean);
  return html`
    <${Modal} title=${p ? `@${p.username || ""} ${roleBadge(p.role)}` : "Profil"} onClose=${onClose}
      actions=${html`<button class="btn" onClick=${onClose}>Kapat</button>`}>
      ${err ? html`<div class="msg err">${err}</div>` : !p ? html`<${Spinner} />` : html`
        <div class="soft">${roleLabel(p.role)}</div>
        ${p.is_banned && html`<div style="color:var(--red-soft)">⛔ Hesabı askıda</div>`}
        <div class="row" style="background:var(--gold-box);border-radius:12px;padding:10px;margin-top:8px">
          <span style="font-size:32px">${r.icon}</span>
          <div><div class="bold" style=${`font-size:19px;color:var(--gold)`}>${r.name}</div><div class="small">${p.points} DYB Puanı</div></div>
        </div>
        ${p.bio && html`<div style="margin-top:8px;font-size:17px">📝 ${p.bio}</div>`}
        <div class="soft small" style="margin-top:8px">Üyelik: ${dateText(p.created_at)}</div>
        ${roomsAdmin.length > 0 && html`<div class="soft small">🔰 Oda yöneticisi: ${roomsAdmin.map(roomTitle).join(", ")}</div>`}
        <div class="soft small">💬 ${p.message_count} mesaj • 📍 ${p.radar_count} radar • ✅ ${p.confirmed_count} onaylı</div>
        ${dm && html`
          <div style="margin-top:12px">
            ${(!dm.reason || dm.conversation_id) && html`<button class="btn block big" onClick=${openDm}>
              ${dm.conversation_id ? "✉️ Özel sohbeti aç" : "✉️ Mesaj gönder"}</button>`}
            ${dm.reason && html`<div style="color:var(--amber);margin-top:8px;font-size:16px">🔒 ${dm.reason}</div>`}
            ${!dm.is_staff && html`<button class="btn block ghost" disabled=${dmBusy} onClick=${toggleBlock}
              style=${`margin-top:6px;color:${dm.blocked_by_me ? "var(--green-text)" : "var(--red-soft)"}`}>
              ${dm.blocked_by_me ? "✅ Engeli kaldır" : "🚫 Özel mesaj için engelle"}</button>`}
          </div>`}`}
    </${Modal}>`;
}

/** Rütbe atladı */
export function RankUpModal({ icon, name, onClose }) {
  return html`
    <${Modal} title="🎉 Tebrikler!" onClose=${onClose}
      actions=${html`<button class="btn" onClick=${onClose}>Süper!</button>`}>
      <div class="center" style="gap:4px">
        <div style="font-size:64px">${icon}</div>
        <div>Yeni rütben:</div>
        <div class="bold" style=${`font-size:28px;color:var(--gold)`}>${name}</div>
        <div class="soft small" style="margin-top:8px;text-align:center">Yola katkın için teşekkürler! Rütbeni Profil'de görebilirsin.</div>
      </div>
    </${Modal}>`;
}
