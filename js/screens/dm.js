// Özel mesajlar: gelen kutusu ve birebir sohbet
import { html, useState, useEffect, useRef, navigate, userMessage, chatTime, roleBadge, toast, copyText, dayKey, dayLabel, typingText, presenceText } from "../lib.js";
import * as api from "../api.js";
import { TopBar, Modal, Spinner, longPress, useInterval, useOnResume, useLive } from "../ui.js";
import { MemberProfileModal } from "./profile.js";
import { EmojiPanel, ReportDialog } from "./chat.js";

const MAX_LENGTH = 500;
const AVATAR_COLORS = ["#E57373", "#64B5F6", "#81C784", "#FFB74D", "#BA68C8", "#4DB6AC", "#F06292", "#7986CB"];

function avatarColor(key) {
  let h = 0;
  for (const c of String(key || "")) h = (h * 31 + c.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function Avatar({ name, id }) {
  return html`<div class="dm-avatar" style=${`background:${avatarColor(id)}`}>${(name || "?").charAt(0).toUpperCase()}</div>`;
}

// =====================================================================
// Gelen kutusu
// =====================================================================
export function DmInboxScreen() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState(null);
  const [hideFor, setHideFor] = useState(null);   // "sohbeti benden sil"
  const [q, setQ] = useState("");
  const [hits, setHits] = useState(null);         // üye arama sonuçları

  useEffect(() => {
    const t = q.replace(/^@/, "").trim();
    if (t.length < 2) { setHits(null); return; }
    let iptal = false;
    const id = setTimeout(() => {
      api.searchMembers(t).then((r) => { if (!iptal) setHits(r); }).catch(() => { if (!iptal) setHits([]); });
    }, 300);
    return () => { iptal = true; clearTimeout(id); };
  }, [q]);

  async function load() {
    try {
      setList(await api.myConversations());
      setErr(null);
      api.markDmDelivered().catch(() => {});   // gönderenlere ✓✓
    } catch (e) {
      setErr(userMessage(e));
      setList((l) => l || []);
    }
  }
  useEffect(() => { load(); }, []);
  useInterval(load, 10000);
  useOnResume(load);
  useLive((kind) => { if (kind === "dm") load(); });

  return html`
    <div class="screen">
      <${TopBar} title="✉️ Mesajlar" sub="Özel sohbetlerin" onBack=${() => navigate("/menu")} />
      <div class="dm-search">
        <input class="input" type="search" placeholder="🔍 Üye ara (en az 2 harf)" value=${q}
          autocapitalize="off" autocomplete="off" onInput=${(e) => setQ(e.target.value)} />
      </div>
      ${hits !== null ? html`
        <div class="dm-list">
          ${hits.length === 0 ? html`<div class="soft" style="padding:16px">Üye bulunamadı.</div>`
            : hits.map((h) => html`
              <button class="dm-row" key=${h.user_id} onClick=${() => navigate("/mesaj/" + h.user_id)}>
                <${Avatar} name=${h.username} id=${h.user_id} />
                <div class="grow" style="min-width:0">
                  <b class="dm-name">@${h.username} ${roleBadge(h.role)}</b>
                  <div class="muted small">${h.online ? "🟢 çevrimiçi" : ""}${h.dm_open === false ? (h.online ? " • " : "") + "🔒 Özel mesajları kapalı" : ""}</div>
                </div>
              </button>`)}
        </div>`
      : list === null ? html`<${Spinner} />`
        : list.length === 0 ? html`
          <div class="content" style="text-align:center">
            <div style="font-size:56px">✉️</div>
            <h2>${err || "Henüz özel mesajın yok."}</h2>
            <div class="soft">Birine yazmak için sohbet odasında adına dokun → "✉️ Mesaj gönder".</div>
            <div class="soft" style="margin-top:10px">Özel mesajlarını açıp kapatmak ve engellediklerini görmek için: ⚙️ Ayarlar.</div>
          </div>`
        : html`
          <div class="dm-list">
            ${list.map((c) => html`
              <button class="dm-row" key=${c.id} ...${longPress(() => setHideFor(c), () => navigate("/mesaj/" + c.other_id))}>
                <${Avatar} name=${c.other_username} id=${c.other_id} />
                <div class="grow" style="min-width:0">
                  <div class="row" style="gap:6px">
                    <b class="grow dm-name">@${c.other_username || ""} ${roleBadge(c.other_role)}</b>
                    <span class=${"small " + (c.unread > 0 ? "dm-new" : "muted")}>${chatTime(c.last_message_at)}</span>
                  </div>
                  <div class="row" style="gap:6px">
                    <span class=${"grow dm-prev" + (c.unread > 0 ? " unread" : "")}>
                      ${c.reason ? "🔒 " : ""}${c.last_from_me ? "Sen: " : ""}${c.last_preview || "Mesaj silindi"}
                    </span>
                    ${c.unread > 0 && html`<span class="dm-badge">${c.unread > 99 ? "99+" : c.unread}</span>`}
                  </div>
                </div>
              </button>`)}
            <div class="muted small" style="padding:16px">Özel mesajlar 30 gün sonra silinir. Sohbeti silmek için üzerine basılı tut. Açma / kapama ve engelleme: ⚙️ Ayarlar</div>
          </div>`}
      ${hideFor && html`<${HideModal} name=${"@" + (hideFor.other_username || "")} onClose=${() => setHideFor(null)}
          onConfirm=${async () => {
            const c = hideFor;
            setHideFor(null);
            try { await api.hideDmConversation(c.id); load(); } catch (e) { setErr(userMessage(e)); }
          }} />`}
    </div>`;
}

/** "Sohbeti benden sil" uyarısı (Instagram gibi) */
function HideModal({ name, onClose, onConfirm }) {
  return html`
    <${Modal} title="🗑 Sohbet silinsin mi?" onClose=${onClose}
      actions=${[
        html`<button class="btn outline" onClick=${onClose}>Vazgeç</button>`,
        html`<button class="btn red" onClick=${onConfirm}>Benden sil</button>`,
      ]}>
      <div style="font-size:16px">${name} ile olan sohbet sadece <b>senden</b> silinir; karşı taraf görmeye devam eder.</div>
      <div class="soft" style="margin-top:10px">Bir şikayet olursa yönetim bu konuşmayı 30 gün boyunca inceleyebilir.</div>
    </${Modal}>`;
}

/** ✓ gönderildi • ✓✓ iletildi • mavi ✓✓ okundu */
function Ticks({ status }) {
  if (!status) return null;
  return html`<span class=${"ticks" + (status === "read" ? " read" : "")}>${status === "sent" ? "✓" : "✓✓"}</span>`;
}

// =====================================================================
// Birebir sohbet
// =====================================================================
export function DmChatScreen({ userId }) {
  const myId = api.myId();
  const [status, setStatus] = useState(null);
  const [convId, setConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [menuFor, setMenuFor] = useState(null);
  const [pickReactionFor, setPickReactionFor] = useState(null);
  const [reportFor, setReportFor] = useState(null);
  const [deleteFor, setDeleteFor] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showHide, setShowHide] = useState(false);
  const [pending, setPending] = useState([]);   // { id, text, failed } — 🕓 / ❗
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const caretRef = useRef(null);
  const lastIdRef = useRef(null);
  const lastTypingRef = useRef(0);
  const [typers, setTypers] = useState([]);

  async function loadStatus() {
    try {
      const s = await api.dmStatus(userId);
      setStatus(s);
      if (s.conversation_id) setConvId(s.conversation_id);
      else setLoading(false);
      return s;
    } catch (e) {
      setErr(userMessage(e));
      setLoading(false);
      return null;
    }
  }

  async function loadMessages(id = convId) {
    if (!id) return;
    try {
      const list = await api.dmMessages(id);
      setMessages(list || []);
      setLoading(false);
      const last = list && list.length ? list[list.length - 1].id : null;
      if (last !== lastIdRef.current) {
        lastIdRef.current = last;
        requestAnimationFrame(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; });
      }
      api.markDmRead(id).catch(() => {});
    } catch (e) {
      setErr(userMessage(e));
      setLoading(false);
    }
  }

  useEffect(() => { loadStatus(); }, [userId]);
  useEffect(() => { loadMessages(); }, [convId]);
  useInterval(() => loadMessages(), 4000, [convId]);
  useOnResume(() => { loadStatus(); loadMessages(); });
  useLive((kind) => { if (kind === "dm") loadMessages(); });
  // "yazıyor…" (3 sn) ve çevrimiçi durumu (30 sn)
  useInterval(() => { if (convId) api.typingList("dm:" + convId).then(setTypers).catch(() => {}); }, 3000, [convId]);
  useInterval(() => { loadStatus(); }, 30000, [userId]);
  function typingPing() {
    if (!convId) return;
    const now = Date.now();
    if (now - lastTypingRef.current < 3000) return;
    lastTypingRef.current = now;
    api.setTyping("dm:" + convId).catch(() => {});
  }

  const scrollDown = () => requestAnimationFrame(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; });

  /** Bekleyen mesajı gönderir: 🕓 → (başarılı) listeye düşer, (hata) ❗ "Tekrar dene" */
  async function deliver(p) {
    setPending((l) => l.map((x) => (x.id === p.id ? { ...x, failed: false } : x)));
    try {
      const r = await api.sendDm(userId, p.text);
      setPending((l) => l.filter((x) => x.id !== p.id));
      setErr(null);
      if (r && r.conversation_id && r.conversation_id !== convId) setConvId(r.conversation_id);
      await loadMessages(r?.conversation_id || convId);
    } catch (e) {
      setPending((l) => l.map((x) => (x.id === p.id ? { ...x, failed: true } : x)));
      setErr(userMessage(e));
      scrollDown();
      loadStatus();
    }
  }

  function insertEmoji(emoji) {
    const c = caretRef.current;
    const start = c ? Math.min(c[0], input.length) : input.length;
    const end = c ? Math.min(c[1], input.length) : input.length;
    const next = input.slice(0, start) + emoji + input.slice(end);
    if (next.length > MAX_LENGTH) return;
    setInput(next);
    caretRef.current = [start + emoji.length, start + emoji.length];
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setErr(null);
    if (!editing) {
      // Mesaj hemen 🕓 ile görünür, yazma alanı boşalır
      const p = { id: Date.now() + Math.random(), text, failed: false };
      setPending((l) => [...l, p]);
      setInput("");
      caretRef.current = null;
      scrollDown();
      deliver(p);
      return;
    }
    setSending(true);
    try {
      await api.editDm(editing.id, text);
      setEditing(null);
      setInput("");
      caretRef.current = null;
      await loadMessages(convId);
    } catch (e) {
      setErr(userMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function react(m, emoji) {
    try {
      await api.reactDm(m.id, emoji);
      loadMessages();
    } catch (e) {
      setErr(userMessage(e));
    }
  }

  const s = status;
  const name = s ? `@${s.username || ""} ${roleBadge(s.role)}`.trim() : "Özel mesaj";

  let bottom = null;
  if (s && s.reason) {
    bottom = html`
      <div class="notice" style="background:var(--amber-box)">
        <div class="bold" style="color:var(--amber);font-size:17px">🔒 ${s.reason}</div>
        ${s.blocked_by_me && html`<div class="small soft">Engeli kaldırmak için yukarıdaki ada dokun.</div>`}
      </div>`;
  } else if (s) {
    bottom = html`
      ${editing && html`
        <div class="replybar" style="background:var(--yellow-box)">
          <div class="bar" style="background:var(--yellow)"></div>
          <div class="grow small bold" style="color:var(--yellow)">✏️ Mesajını düzenliyorsun</div>
          <button class="btn ghost" onClick=${() => { setEditing(null); setInput(""); caretRef.current = null; }}>✕</button>
        </div>`}
      <div class="composer">
        <button class="emo" disabled=${sending} onClick=${() => {
          if (showEmoji) { setShowEmoji(false); inputRef.current && inputRef.current.focus(); }
          else { inputRef.current && inputRef.current.blur(); setShowEmoji(true); }
        }}>${showEmoji ? "⌨️" : "😊"}</button>
        <textarea class="input" rows="1" maxlength=${MAX_LENGTH} value=${input} ref=${inputRef}
          placeholder=${editing ? "Mesajını düzelt..." : "Mesaj yaz..."}
          onFocus=${() => setShowEmoji(false)}
          onSelect=${(e) => { caretRef.current = [e.target.selectionStart, e.target.selectionEnd]; }}
          onKeyUp=${(e) => { caretRef.current = [e.target.selectionStart, e.target.selectionEnd]; }}
          onInput=${(e) => {
            if (e.target.value.length > input.length) typingPing();
            setInput(e.target.value);
            caretRef.current = [e.target.selectionStart, e.target.selectionEnd];
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
          }}></textarea>
        <button class="btn" disabled=${sending || !input.trim()} onClick=${send}>
          ${sending ? html`<${Spinner} small />` : editing ? "Kaydet" : "Gönder"}
        </button>
      </div>
      ${showEmoji && html`<${EmojiPanel} onPick=${insertEmoji} />`}`;
  }

  return html`
    <div class="chat">
      <${TopBar} title=${"✉️ " + name} backLabel="←" onBack=${() => navigate("/mesajlar")}
        sub=${s ? ((typers.length ? "✍️ yazıyor…" : presenceText(s.online, s.last_seen))
          || (s.is_staff ? "Yönetim • Profil için dokun" : "Profil ve engelleme için dokun")) : ""}
        onSubClick=${() => setShowProfile(true)}
        right=${convId && html`<button class="btn ghost" style="font-size:24px;font-weight:800" onClick=${() => setShowHide(true)}>⋮</button>`} />

      <div class="messages" ref=${listRef}>
        ${loading ? html`<${Spinner} />`
          : messages.length === 0 && pending.length === 0 ? html`<div class="center muted" style="flex:1">${s && !s.reason ? "Henüz mesaj yok. İlk mesajı sen yaz! 👋" : "Henüz mesaj yok."}</div>`
          : messages.map((m, i) => {
            const mine = m.sender_id === myId;
            const newDay = dayKey(m.created_at) !== dayKey(messages[i - 1]?.created_at);
            const counts = api.dmReactionCounts(m);
            const n = api.emojiOnlyCount(m.content);
            const big = n !== null && n >= 1 && n <= 3;
            return html`
              ${newDay && html`<div class="day-chip" key=${"g" + m.id}><span>${dayLabel(m.created_at)}</span></div>`}
              <div class=${"mwrap" + (mine ? " mine" : "")} id=${"d" + m.id} key=${m.id}>
                <div class="bubble" ...${longPress(() => { if (!(m.deleted && mine)) setMenuFor(m); })}>
                  <div class=${"txt" + (big && !m.deleted ? " big" : "") + (m.deleted ? " deleted" : "")}>${m.content}</div>
                  <div class="time">${m.edited_at && !m.deleted ? "düzenlendi • " : ""}${chatTime(m.created_at)}
                    ${mine && !m.deleted && html` <${Ticks} status=${m.status} />`}</div>
                </div>
                ${counts.length > 0 && html`
                  <div class="reacts" style=${(m.reactions || []).some((r) => r.user_id === myId) ? "border-color:#3D8BFF" : ""}>
                    ${counts.map(([e, c]) => html`<span key=${e}>${e}${c > 1 ? " " + c : ""}</span>`)}
                  </div>`}
              </div>`;
          })}
        ${pending.map((p) => html`
          <div class="mwrap mine" key=${"p" + p.id}>
            <div class=${"bubble pending" + (p.failed ? " failed" : "")} onClick=${() => p.failed && deliver(p)}>
              <div class="txt">${p.text}</div>
              <div class="time">${p.failed ? "❗ Gönderilemedi • Tekrar denemek için dokun" : "🕓 Gönderiliyor…"}</div>
            </div>
            ${p.failed && html`<button class="btn ghost small" onClick=${() => setPending((l) => l.filter((x) => x.id !== p.id))}>Vazgeç</button>`}
          </div>`)}
      </div>

      ${err && html`<div class="small" style="color:var(--red-soft);padding:4px 16px">${err}</div>`}
      ${bottom}

      ${menuFor && (() => {
        const m = menuFor;
        const mine = m.sender_id === myId;
        const my = (m.reactions || []).find((r) => r.user_id === myId)?.emoji || null;
        const close = () => setMenuFor(null);
        return html`
          <${Modal} title=${mine ? "Mesajın" : name} center=${false} onClose=${close}>
            <div class="muted" style="margin-bottom:6px;max-height:4.5em;overflow:hidden">${m.content}</div>
            ${m.deleted ? html`
              <div class="soft small" style="margin-bottom:6px">Gönderen bu mesajı sildi. Uygunsuz bir şey yazdıysa şikayet edebilirsin; yönetim silinen mesajın aslını görebilir.</div>
              <button class="list-btn" style="color:var(--amber)" onClick=${() => { setReportFor(m); close(); }}>🚩  Şikayet et</button>
              <button class="list-btn muted" onClick=${close}>Vazgeç</button>` : html`
            <div class="emoji-row">
              ${[...(my && !api.REACTIONS.includes(my) ? [my] : []), ...api.REACTIONS].slice(0, 6).map((e) => html`
                <button key=${e} class=${my === e ? "on" : ""} onClick=${() => { close(); react(m, e); }}>${e}</button>`)}
              <button class="plus" onClick=${() => { close(); setPickReactionFor(m); }}>➕</button>
            </div>
            ${mine && api.editable({ user_id: m.sender_id, created_at: m.created_at }, myId) && !(s && s.reason) && html`
              <button class="list-btn" onClick=${() => { setEditing(m); setInput(m.content); caretRef.current = null; close(); }}>✏️  Düzenle</button>`}
            <button class="list-btn" onClick=${async () => { close(); toast((await copyText(m.content)) ? "Kopyalandı" : "Kopyalanamadı"); }}>📋  Kopyala</button>
            ${mine
              ? html`<button class="list-btn" style="color:var(--red-soft)" onClick=${() => { setDeleteFor(m); close(); }}>🗑  Sil</button>`
              : html`<button class="list-btn" style="color:var(--amber)" onClick=${() => { setReportFor(m); close(); }}>🚩  Şikayet et</button>`}
            <button class="list-btn muted" onClick=${close}>Vazgeç</button>`}
          </${Modal}>`;
      })()}

      ${pickReactionFor && html`
        <${Modal} title="Tepki seç" onClose=${() => setPickReactionFor(null)}>
          <${EmojiPanel} height=${360} onPick=${(e) => { const m = pickReactionFor; setPickReactionFor(null); react(m, e); }} />
        </${Modal}>`}

      ${deleteFor && html`
        <${Modal} title="🗑 Mesaj silinsin mi?" onClose=${() => setDeleteFor(null)}
          actions=${[
            html`<button class="btn outline" onClick=${() => setDeleteFor(null)}>Vazgeç</button>`,
            html`<button class="btn red" onClick=${async () => {
              const m = deleteFor;
              setDeleteFor(null);
              try { await api.deleteDm(m.id); loadMessages(); } catch (e) { setErr(userMessage(e)); }
            }}>Sil</button>`,
          ]}>
          <div style="font-size:16px">Mesaj iki taraftan da kaldırılacak; yerinde "🚫 Bu mesaj silindi" yazacak.</div>
          <div class="soft" style="margin-top:10px">Bir şikayet olursa yönetim, silinen mesajı 30 gün boyunca inceleyebilir.</div>
        </${Modal}>`}

      ${reportFor && html`<${ReportDialog} msg=${reportFor} label=${name} title="🚩 Özel mesajı şikayet et"
          send=${api.reportDm} note="Sadece bu mesaj yönetime gönderilir; konuşmanın geri kalanını kimse göremez."
          onClose=${() => setReportFor(null)} onError=${setErr} />`}

      ${showHide && html`<${HideModal} name=${name} onClose=${() => setShowHide(false)}
          onConfirm=${async () => {
            setShowHide(false);
            try { await api.hideDmConversation(convId); navigate("/mesajlar"); } catch (e) { setErr(userMessage(e)); }
          }} />`}

      ${showProfile && html`<${MemberProfileModal} userId=${userId}
          onClose=${() => { setShowProfile(false); loadStatus(); }}
          onMessage=${() => { setShowProfile(false); loadStatus(); }} />`}
    </div>`;
}
