// Sohbet odası: mesajlar, yanıt, fotoğraf albümü, şikayet, sabit mesaj, oda yöneticisi araçları
import {
  html, useState, useEffect, useRef, useLayoutEffect, navigate, userMessage, chatTime, remainingText, isStillActive,
  roleRank, roleBadge, toast, copyText, store, dayKey, dayLabel, typingText,
} from "../lib.js";
import * as api from "../api.js";
import { TopBar, Modal, Spinner, PhotoAlbum, PhotoViewer, pickPhotos, longPress, useInterval, useOnResume } from "../ui.js";
import { MemberProfileModal } from "./profile.js";

const MAX_LENGTH = 500;

const GROUP_RULES = `📍 Yol Durumu, Trafik ve Hava

1️⃣ Yalnızca yol, trafik, kaza, yol çalışması, radar, denetim ve hava durumu bilgileri paylaşılır.

2️⃣ Mümkün olduğunca konum ve güzergâh belirtin.

3️⃣ Yanlış, eski veya teyitsiz bilgileri güncelmiş gibi paylaşmayın.

4️⃣ Hakaret, tartışma, reklam ve konu dışı mesaj yasaktır.

5️⃣ Sürüş sırasında telefon kullanmayın. Önce güvenlik!

6️⃣ Kurallara uymayan mesajları basılı tutup "🚩 Şikayet Et" ile yönetime bildirin.

🤝 DYB | Denizli Yol Bilgisi`;

const ROOM_MUTE_OPTIONS = [[60, "1 saat"], [300, "5 saat"], [720, "12 saat"], [1440, "24 saat"]];

function senderLabel(m, adminIds) {
  const name = m.profiles?.username;
  if (!name) return "Üye";
  const badge = roleBadge(m.profiles?.role) || ((adminIds || []).includes(m.user_id) ? "🔰" : "");
  return badge ? `@${name} ${badge}` : `@${name}`;
}

/** Mesajdaki @etiketleri mavi ve kalın gösterir */
function withMentions(text, color) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(api.MENTION_RE)) {
    const start = m.index + m[1].length;
    parts.push(text.slice(last, start));
    parts.push(html`<b style=${`color:${color}`}>${text.slice(start, m.index + m[0].length)}</b>`);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

/** Bu odanın bekleyen bildirimlerini kapatır */
function clearRoomNotifications(roomId) {
  try {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.getNotifications({ tag: "oda-" + roomId }))
      .then((list) => list.forEach((n) => n.close()))
      .catch(() => {});
  } catch (_) { /* */ }
}

export function ChatScreen({ roomId, focusId }) {
  const [room, setRoom] = useState(api.cachedRoom(roomId));
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [input, setInput] = useState(() => store.get("dyb_taslak_" + roomId, ""));
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(null);
  const [picked, setPicked] = useState([]);           // { file, url }
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);         // düzenlenen mesaj
  const [reactorsFor, setReactorsFor] = useState(null); // tepki listesi
  const [historyFor, setHistoryFor] = useState(null);   // düzenleme geçmişi
  const [showEmoji, setShowEmoji] = useState(false);     // 😊 paneli
  const [pickReactionFor, setPickReactionFor] = useState(null); // ➕ tüm emojiler
  const inputRef = useRef(null);
  const caretRef = useRef(null);   // imlecin son yeri (emoji buraya eklenir)
  const [menuFor, setMenuFor] = useState(null);
  const [reportFor, setReportFor] = useState(null);
  const [deleteFor, setDeleteFor] = useState(null);
  const [muteFor, setMuteFor] = useState(null);
  const [editDesc, setEditDesc] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const [photoSource, setPhotoSource] = useState(false);
  const [viewer, setViewer] = useState(null);         // { msg, index }
  const [me, setMe] = useState(null);
  const [rules, setRules] = useState(null);           // { text, key }
  const listRef = useRef(null);
  const myId = api.myId();
  const [profileFor, setProfileFor] = useState(null);   // isme dokununca açılan profil
  const [candidates, setCandidates] = useState([]);     // @ önerileri
  const [newCount, setNewCount] = useState(0);          // aşağıdaki okunmamış yeni mesaj
  const [atBottom, setAtBottom] = useState(true);
  const [highlight, setHighlight] = useState(null);     // bildirimden gelinen mesaj
  const atBottomRef = useRef(true);
  const lastShownRef = useRef(null);

  const rank = roleRank(me?.role);
  // 🛡 Gizli odada sadece kurucu yönetir (gücü sunucu belirler)
  const myPower = room.min_rank > 0 ? (room.my_power || 2) : Math.max(room.my_power || 2, rank * 2);
  const secret = room.min_rank > 0;

  // ---------- "Yazıyor…" ----------
  const [typers, setTypers] = useState([]);
  const lastTypingRef = useRef(0);
  useInterval(() => { api.typingList("oda:" + roomId).then(setTypers).catch(() => {}); }, 3000, [roomId]);
  function typingPing() {
    const now = Date.now();
    if (now - lastTypingRef.current < 3000) return;
    lastTypingRef.current = now;
    api.setTyping("oda:" + roomId).catch(() => {});
  }
  const powerOf = (m) => roleRank(m.profiles?.role) * 2 + ((room.admin_ids || []).includes(m.user_id) ? 1 : 0);
  const label = (m) => senderLabel(m, room.admin_ids);
  const canModerate = myPower >= 3;
  const isTraffic = roomId === "trafik";

  async function loadMessages() {
    try {
      const list = await api.latestMessages(roomId);
      setMessages(list);
      if (list.length) api.markSeen(roomId, list[list.length - 1].id);
      setError(null);
    } catch (e) {
      setError("Mesajlar yüklenemedi: " + userMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadRoom() {
    try {
      const list = await api.roomsOverview();
      const r = list.find((x) => x.id === roomId);
      if (r) setRoom(r);
      return r;
    } catch (_) {
      return null;
    }
  }

  async function loadMe() {
    try {
      setMe(await api.me());
    } catch (_) { /* */ }
  }

  // Açılış: ayarlar, oda, kurallar
  useEffect(() => {
    loadMessages();
    loadMe();
    (async () => {
      try {
        await api.refreshConfig();
      } catch (_) { /* */ }
      const r = (await loadRoom()) || room;
      const ver = isTraffic ? api.cfgInt("rules_version", 2) : (r.rules_version || 1);
      const text = isTraffic ? api.cfgText("group_rules", GROUP_RULES)
        : (r.rules || `${r.icon} ${r.name}\n\n${r.description || ""}\n\nHakaret, tartışma, reklam ve konu dışı mesaj yasaktır.`);
      const key = `dyb_kurallar_${myId}_${roomId}_v${ver}`;
      if (!store.get(key, false)) setRules({ text, key });
    })();
  }, [roomId]);

  // Mesajlar birkaç saniyede bir, oda ve profil 30 sn'de bir yenilenir
  const refreshSec = Math.min(Math.max(api.cfgInt("chat_refresh_seconds", 3), 2), 60);
  useInterval(loadMessages, refreshSec * 1000, [roomId]);
  useInterval(() => { loadRoom(); loadMe(); }, 30000, [roomId]);
  useOnResume(() => { loadMessages(); loadRoom(); });

  // ---------- Kaydırma ----------
  // İlk açılışta animasyonsuz en alta (ya da bildirimdeki mesaja) gider.
  // Sonra: en alttaysan ya da mesajı sen yazdıysan aşağı kayar; eski mesajları okuyorsan
  // yerinden oynamaz, "⬇ N yeni mesaj" düğmesi çıkar.
  const lastId = messages.length ? messages[messages.length - 1].id : 0;
  useEffect(() => {
    const el = listRef.current;
    if (!el || !lastId) return;
    const prev = lastShownRef.current;
    lastShownRef.current = lastId;
    if (prev === null) {
      const target = focusId && document.getElementById("m" + focusId);
      if (target) {
        target.scrollIntoView({ block: "center" });
        setHighlight(focusId);
        setTimeout(() => setHighlight(null), 4000);
      } else {
        el.scrollTop = el.scrollHeight;
      }
      return;
    }
    const fresh = messages.filter((m) => m.id > prev);
    if (!fresh.length) return;
    if (atBottomRef.current || fresh.some((m) => m.user_id === myId)) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      setNewCount(0);
    } else {
      setNewCount((n) => n + fresh.length);
    }
  }, [lastId]);

  function onListScroll() {
    const el = listRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    atBottomRef.current = bottom;
    setAtBottom(bottom);
    if (bottom) setNewCount(0);
  }

  // @ önerileri ve bu odanın bildirimlerini kapatma
  useEffect(() => {
    api.mentionCandidates().then(setCandidates).catch(() => {});
    clearRoomNotifications(roomId);
  }, [roomId]);
  useOnResume(() => clearRoomNotifications(roomId));

  // Yazılan taslak saklanır (uygulama kapansa bile)
  useEffect(() => { store.set("dyb_taslak_" + roomId, input); }, [input]);

  function scrollToMessage(id) {
    const el = document.getElementById("m" + id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    return !!el;
  }

  function addFiles(files) {
    const space = api.MAX_PHOTOS - picked.length;
    const add = files.slice(0, space).map((file) => ({ file, url: URL.createObjectURL(file) }));
    if (files.length > space) toast(`En fazla ${api.MAX_PHOTOS} fotoğraf seçebilirsin`);
    setPicked([...picked, ...add]);
  }

  async function send() {
    const text = input.trim();
    const editPhotos = editing?.photos?.length || 0;
    if ((!text && !picked.length && !editPhotos) || sending) return;
    if (api.mentionsIn(text).filter((x) => x !== "herkes").length > api.MAX_MENTIONS) {
      return setError(`Bir mesajda en fazla ${api.MAX_MENTIONS} kişi etiketlenebilir.`);
    }
    setSending(true);
    if (editing) {
      try {
        await api.editMessage(editing.id, text);
        setEditing(null);
        setInput(""); caretRef.current = null;
        setError(null);
        await loadMessages();
      } catch (e) {
        setError(userMessage(e));
      } finally {
        setSending(false);
      }
      return;
    }
    const uploaded = [];
    try {
      for (let i = 0; i < picked.length; i++) {
        setProgress(`📷 Fotoğraf yükleniyor ${i + 1}/${picked.length}…`);
        const blob = await api.compressPhoto(picked[i].file);
        uploaded.push(await api.uploadPhoto(blob));
      }
      setProgress("🕓 Gönderiliyor…");
      await api.sendMessage(roomId, text, replyTo?.id, uploaded);
      picked.forEach((p) => URL.revokeObjectURL(p.url));
      setPicked([]);
      setInput(""); caretRef.current = null;
      setReplyTo(null);
      setError(null);
      await loadMessages();
    } catch (e) {
      if (uploaded.length) api.deletePhotos(uploaded);
      // Yazdığın silinmez: Gönder'e tekrar basman yeterli
      setError("❗ Gönderilemedi: " + userMessage(e) + " Tekrar denemek için Gönder'e bas.");
    } finally {
      setSending(false);
      setProgress(null);
    }
  }

  /** Seçilen emojiyi imlecin olduğu yere ekler */
  function insertEmoji(emoji) {
    const c = caretRef.current;
    const start = c ? Math.min(c[0], input.length) : input.length;
    const end = c ? Math.min(c[1], input.length) : input.length;
    const next = input.slice(0, start) + emoji + input.slice(end);
    if (next.length > MAX_LENGTH) return;
    setInput(next);
    const pos = start + emoji.length;
    caretRef.current = [pos, pos];
  }

  async function react(m, emoji) {
    try {
      await api.reactMessage(m.id, emoji);
      await loadMessages();
    } catch (e) {
      setError(userMessage(e));
    }
  }

  async function pin(msg) {
    const isPinned = msg && msg.id === room.pinned_message_id;
    try {
      await api.roomPin(roomId, isPinned ? null : msg?.id ?? null);
      await loadRoom();
      toast(isPinned || !msg ? "Sabitleme kaldırıldı" : "📌 Mesaj sabitlendi");
    } catch (e) {
      setError(userMessage(e));
    }
  }

  // ---------- @ önerileri (yazının sonunda "@ah" yazılıyorsa) ----------
  const myName = (me?.username || "").toLowerCase();
  const typing = /(?:^|\s)@([A-Za-z0-9_]{0,20})$/.exec(input);
  let mentionBox = null;
  if (typing) {
    const q = typing[1].toLowerCase();
    const all = [...(rank >= 3 ? [{ username: "herkes", role: null }] : []),
      ...candidates.filter((c) => c.username !== myName)];
    const matches = all.filter((c) => c.username.startsWith(q)).slice(0, 5);
    if (matches.length) {
      mentionBox = html`
        <div style="background:var(--card-2);padding:4px 0">
          ${matches.map((c) => html`
            <button key=${c.username} class="mention-btn"
              onClick=${() => {
                const start = input.length - typing[1].length - 1;
                setInput((input.slice(0, start) + "@" + c.username + " ").slice(0, MAX_LENGTH)); caretRef.current = null;
              }}>
              ${c.username === "herkes" ? "📣 @herkes  (odadaki herkese duyuru)" : `@${c.username} ${roleBadge(c.role)}`}
            </button>`)}
        </div>`;
    }
  }

  // ---------- Yazma alanı yerine uyarılar ----------
  const globalMuted = me && me.role !== "kurucu" && isStillActive(me.muted_until);
  const roomMuted = isStillActive(room.muted_until) && rank < 4;
  let bottom;
  if (globalMuted || roomMuted) {
    const until = globalMuted ? me.muted_until : room.muted_until;
    const reason = globalMuted ? me.mute_reason : room.mute_reason;
    bottom = html`
      <div class="notice muted-red">
        <div class="bold" style="font-size:17px">${globalMuted ? "🔇 Susturuldun" : "🔇 Bu odada susturuldun"} • Kalan: ${remainingText(until)}</div>
        ${reason && html`<div style="margin-top:4px">Sebep: ${reason}</div>`}
        <div class="small" style="margin-top:4px;color:var(--red-text-soft)">
          ${globalMuted ? "Bu sürede mesaj yazamazsın, sadece okuyabilirsin." : `Bu sürede ${room.icon} ${room.name} odasına yazamazsın; diğer odalara yazabilirsin.`}
        </div>
      </div>`;
  } else if (room.read_only && !canModerate) {
    bottom = html`<div class="notice" style="background:var(--card-2)">📢 Bu odaya sadece yöneticiler yazabilir.</div>`;
  } else {
    bottom = html`
      ${editing && html`
        <div class="replybar" style="background:var(--yellow-box)">
          <div class="bar" style="background:var(--yellow)"></div>
          <div class="grow">
            <div class="small bold" style="color:var(--yellow)">✏️ Mesajını düzenliyorsun</div>
            <div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${api.previewText(editing)}</div>
          </div>
          <button class="btn ghost" onClick=${() => { setEditing(null); setInput(""); caretRef.current = null; }}>✕</button>
        </div>`}
      ${replyTo && html`
        <div class="replybar">
          <div class="bar"></div>
          <div class="grow">
            <div class="small bold" style="color:var(--blue-2)">↩ ${label(replyTo)} kişisine yanıt</div>
            <div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${api.previewText(replyTo)}</div>
          </div>
          <button class="btn ghost" onClick=${() => setReplyTo(null)}>✕</button>
        </div>`}
      ${picked.length > 0 && html`
        <div class="picked">
          ${picked.map((p) => html`
            <div class="p" key=${p.url}>
              <img src=${p.url} />
              ${!sending && html`<button class="x" onClick=${() => { URL.revokeObjectURL(p.url); setPicked(picked.filter((x) => x !== p)); }}>✕</button>`}
            </div>`)}
        </div>`}
      ${progress && html`<div class="small" style="padding:4px 16px;color:var(--blue-2)">${progress}</div>`}
      ${mentionBox}
      <div class="composer">
        <button class="cam" disabled=${sending || !!editing || picked.length >= api.MAX_PHOTOS} onClick=${() => setPhotoSource(true)}>📷</button>
        <button class="emo" disabled=${sending} onClick=${() => {
          if (showEmoji) { setShowEmoji(false); inputRef.current && inputRef.current.focus(); }
          else { inputRef.current && inputRef.current.blur(); setShowEmoji(true); }
        }}>${showEmoji ? "⌨️" : "😊"}</button>
        <textarea class="input" rows="1" maxlength=${MAX_LENGTH} value=${input} ref=${inputRef}
          onFocus=${() => setShowEmoji(false)}
          onSelect=${(e) => { caretRef.current = [e.target.selectionStart, e.target.selectionEnd]; }}
          onKeyUp=${(e) => { caretRef.current = [e.target.selectionStart, e.target.selectionEnd]; }}
          placeholder=${editing ? "Mesajını düzelt..." : picked.length ? "Açıklama ekle (isteğe bağlı)" : replyTo ? "Yanıtını yaz..." : "Mesaj yaz..."}
          onInput=${(e) => {
            if (e.target.value.length > input.length) typingPing();
            setInput(e.target.value);
            caretRef.current = [e.target.selectionStart, e.target.selectionEnd];
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
          }}></textarea>
        <button class="btn" disabled=${sending || (!input.trim() && !picked.length && !(editing?.photos?.length))} onClick=${send}>
          ${sending ? html`<${Spinner} small />` : editing ? "Kaydet" : "Gönder"}
        </button>
      </div>
      ${showEmoji && html`<${EmojiPanel} onPick=${insertEmoji} />`}`;
  }

  return html`
    <div class="chat">
      <${TopBar} title=${`${room.icon} ${room.name}`} onBack=${() => navigate("/menu")}
        sub=${typingText(typers)
          || [room.member_count ? `👥 ${room.member_count} üye` : null,
              room.online_count ? `🟢 ${room.online_count} çevrimiçi` : null].filter(Boolean).join(" • ")
          || ((room.description || "Basılı tut: Yanıtla / Sil") + (canModerate ? "  ✏️" : ""))}
        onSubClick=${canModerate ? () => setEditDesc(true) : null}
        right=${html`<button class="btn ghost" onClick=${() => setRules({ text: rulesTextFor(room, isTraffic), key: null })}>Kurallar</button>`} />

      ${room.pinned_message_id && room.pinned_text && html`
        <div class="pinned" ...${longPress(() => setShowPinned(true),
               () => { if (!scrollToMessage(room.pinned_message_id)) setShowPinned(true); })}>
          <span style="font-size:18px">📌</span>
          <div class="grow"><div class="pl">Sabitlenmiş mesaj</div><div class="pt">${room.pinned_text}</div></div>
        </div>`}

      <div style="flex:1;position:relative;display:flex;flex-direction:column;min-height:0">
      ${secret && html`<div class="watermark" aria-hidden="true">${Array.from({ length: 48 }, (_, i) => html`<span key=${i}>@${me?.username || ""} • ${new Date().toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>`)}</div>`}
      <div class="messages" ref=${listRef} onScroll=${onListScroll}>
        ${loading ? html`<${Spinner} />`
          : messages.length === 0 ? html`<div class="center muted" style="flex:1">Henüz mesaj yok. İlk mesajı sen yaz!</div>`
          : messages.map((m, i) => {
            const mine = m.user_id === myId;
            const newDay = dayKey(m.created_at) !== dayKey(messages[i - 1]?.created_at);
            const mentionsMe = !mine && (m.mention_all || (myName && api.mentionsIn(m.content).includes(myName)));
            const replied = m.reply_to_id ? messages.find((x) => x.id === m.reply_to_id) : null;
            return html`
              ${newDay && html`<div class="day-chip" key=${"g" + m.id}><span>${dayLabel(m.created_at)}</span></div>`}
              <div class=${"mwrap" + (mine ? " mine" : "")} id=${"m" + m.id} key=${m.id}>
                ${!mine && html`<div class="sender" style=${`cursor:pointer;font-weight:700;${mentionsMe ? "color:var(--yellow)" : ""}`}
                  onClick=${() => setProfileFor(m.user_id)}>${label(m)}${mentionsMe ? "  📣" : ""}</div>`}
                <div class="bubble" ...${longPress(() => setMenuFor(m))}
                  style=${mentionsMe ? `background:var(--mention-bg);border:${highlight === m.id ? 3 : 1}px solid var(--yellow)`
                    : highlight === m.id ? "box-shadow:0 0 0 3px var(--yellow)" : ""}>
                  ${m.reply_to_id && html`
                    <div class="quote" onClick=${(e) => { e.stopPropagation(); scrollToMessage(m.reply_to_id); }}>
                      <div class="bar"></div>
                      <div>
                        <div class="qn">${replied ? label(replied) : "Önceki bir mesaj"}</div>
                        <div class="qt">${replied ? api.previewText(replied) : "Mesaj silinmiş ya da çok eski"}</div>
                      </div>
                    </div>`}
                  <${PhotoAlbum} photos=${m.photos} expired=${m.photos_expired} onOpen=${(i) => setViewer({ msg: m, index: i })} />
                  ${m.content && m.content.trim() && html`<${ClampText} text=${m.content} color=${mine ? "#FFE082" : mentionsMe ? "var(--mention-link)" : "var(--link)"} />`}
                  <div class="time">${m.id === room.pinned_message_id ? "📌 " : ""}${m.edited_at ? "düzenlendi • " : ""}${chatTime(m.created_at)}${mine ? "  ✓" : ""}</div>
                </div>
                ${api.reactionCounts(m).length > 0 && html`
                  <button class="reacts" style=${api.myReaction(m, myId) ? "border-color:#3D8BFF" : ""}
                    onClick=${() => setReactorsFor(m)}>
                    ${api.reactionCounts(m).slice(0, 4).map(([e, n]) => html`<span key=${e}>${e}${n > 1 ? " " + n : ""}</span>`)}
                    ${(() => { const rest = api.reactionCounts(m).slice(4).reduce((a, [, n]) => a + n, 0); return rest > 0 && html`<span>+${rest}</span>`; })()}
                  </button>`}
              </div>`;
          })}
      </div>
      ${!loading && messages.length > 0 && !atBottom && html`
        <button class="btn" style="position:absolute;left:50%;bottom:10px;transform:translateX(-50%);border-radius:24px;box-shadow:0 4px 14px rgba(0,0,0,.4)"
          onClick=${() => { const el = listRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); setNewCount(0); }}>
          ${newCount > 0 ? `⬇ ${newCount} yeni mesaj` : "⬇ En alta in"}
        </button>`}
      </div>

      ${error && html`<div class="small" style="color:var(--red-soft);padding:4px 16px">${error}</div>`}
      ${bottom}

      ${menuFor && (() => {
        const m = menuFor;
        const canManage = myPower >= 3 && myPower > powerOf(m);
        const canDelete = m.user_id === myId || canManage;
        const close = () => setMenuFor(null);
        return html`
          <${Modal} title=${label(m)} center=${false} onClose=${close}>
            <div class="muted" style="margin-bottom:6px;max-height:4.5em;overflow:hidden">${api.previewText(m)}</div>
            <div class="emoji-row">
              ${(() => {
                const mine = api.myReaction(m, myId);
                // Benim tepkim hızlı listede yoksa başta görünsün
                return [...(mine && !api.REACTIONS.includes(mine) ? [mine] : []), ...api.REACTIONS].slice(0, 6).map((e) => html`
                  <button key=${e} class=${mine === e ? "on" : ""} onClick=${() => { close(); react(m, e); }}>${e}</button>`);
              })()}
              <button class="plus" title="Tüm emojiler" onClick=${() => { close(); setPickReactionFor(m); }}>➕</button>
            </div>
            <button class="list-btn" onClick=${() => { setReplyTo(m); setEditing(null); close(); }}>↩  Yanıtla</button>
            ${api.editable(m, myId) && !(room.read_only && !canModerate) && html`<button class="list-btn"
              onClick=${() => { setEditing(m); setReplyTo(null); setPicked([]); setInput(m.content || ""); caretRef.current = null; close(); }}>✏️  Düzenle</button>`}
            ${m.edited_at && rank >= 2 && html`<button class="list-btn" onClick=${() => { setHistoryFor(m); close(); }}>📝  Düzenleme geçmişi</button>`}
            ${m.content && m.content.trim() && html`<button class="list-btn" onClick=${async () => { close(); toast((await copyText(m.content)) ? "Kopyalandı" : "Kopyalanamadı"); }}>📋  Kopyala</button>`}
            ${m.photos && m.photos.length > 0 && !m.photos_expired && html`<button class="list-btn" onClick=${() => { setViewer({ msg: m, index: 0 }); close(); }}>🖼  Fotoğrafları aç</button>`}
            ${m.user_id !== myId && html`<button class="list-btn" style="color:var(--amber)" onClick=${() => { setReportFor(m); close(); }}>🚩  Şikayet Et</button>`}
            ${canModerate && html`<button class="list-btn" onClick=${() => { close(); pin(m); }}>${m.id === room.pinned_message_id ? "📌  Sabitlemeyi kaldır" : "📌  Sabitle"}</button>`}
            ${canManage && m.user_id !== myId && html`<button class="list-btn" style="color:var(--amber)" onClick=${() => { setMuteFor(m); close(); }}>🔇  Bu odada sustur / aç</button>`}
            ${canDelete && html`<button class="list-btn" style="color:var(--red-soft)" onClick=${() => { setDeleteFor(m); close(); }}>🗑  Sil</button>`}
            <button class="list-btn muted" onClick=${close}>Vazgeç</button>
          </${Modal}>`;
      })()}

      ${pickReactionFor && html`
        <${Modal} title="Tepki seç" onClose=${() => setPickReactionFor(null)}>
          <${EmojiPanel} height=${360} onPick=${(e) => { const m = pickReactionFor; setPickReactionFor(null); react(m, e); }} />
        </${Modal}>`}

      ${reactorsFor && html`<${ReactorsModal} msg=${reactorsFor} myId=${myId} onClose=${() => setReactorsFor(null)}
          onRemove=${(e) => { const m = reactorsFor; setReactorsFor(null); react(m, e); }} />`}
      ${historyFor && html`<${EditHistoryModal} msg=${historyFor} onClose=${() => setHistoryFor(null)} />`}

      ${profileFor && html`<${MemberProfileModal} userId=${profileFor} onClose=${() => setProfileFor(null)} />`}

      ${reportFor && html`<${ReportDialog} msg=${reportFor} label=${label(reportFor)} onClose=${() => setReportFor(null)}
          onError=${setError} />`}

      ${deleteFor && html`
        <${Modal} title="Mesajı sil" onClose=${() => setDeleteFor(null)}
          actions=${[
            html`<button class="btn outline" onClick=${() => setDeleteFor(null)}>Vazgeç</button>`,
            html`<button class="btn red" onClick=${async () => {
              const m = deleteFor;
              setDeleteFor(null);
              if (replyTo?.id === m.id) setReplyTo(null);
              try {
                await api.deleteMessage(m.id);
                await loadMessages();
              } catch (e) {
                setError("Silinemedi: " + userMessage(e));
              }
            }}>Sil</button>`,
          ]}>
          <p style="margin:0">"${api.previewText(deleteFor).slice(0, 80)}" silinsin mi?</p>
        </${Modal}>`}

      ${muteFor && html`<${RoomMuteDialog} label=${label(muteFor)} room=${room} onClose=${() => setMuteFor(null)}
          onMute=${async (minutes, reason) => {
            const m = muteFor;
            setMuteFor(null);
            try {
              await api.roomMute(roomId, m.user_id, minutes, reason);
              toast(`🔇 ${label(m)} bu odada susturuldu`);
            } catch (e) {
              setError(userMessage(e));
            }
          }}
          onUnmute=${async () => {
            const m = muteFor;
            setMuteFor(null);
            try {
              await api.roomUnmute(roomId, m.user_id);
              toast(`${label(m)} bu odada tekrar yazabilir`);
            } catch (e) {
              setError(userMessage(e));
            }
          }} />`}

      ${editDesc && html`<${DescriptionDialog} room=${room} onClose=${() => setEditDesc(false)}
          onSave=${async (text) => {
            try {
              await api.roomSetDescription(roomId, text);
              await loadRoom();
              setEditDesc(false);
            } catch (e) {
              setError(userMessage(e));
              setEditDesc(false);
            }
          }} />`}

      ${showPinned && html`
        <${Modal} title="📌 Sabitlenmiş mesaj" onClose=${() => setShowPinned(false)}
          actions=${[
            canModerate && html`<button class="btn outline" style="color:var(--red-soft)" onClick=${() => { setShowPinned(false); pin(null); }}>Sabitlemeyi kaldır</button>`,
            html`<button class="btn" onClick=${() => setShowPinned(false)}>Kapat</button>`,
          ]}>
          <div style="font-size:17px;white-space:pre-wrap">${room.pinned_text}</div>
          ${room.pinned_by_name && html`<div class="muted small" style="margin-top:8px">Sabitleyen: @${room.pinned_by_name}</div>`}
        </${Modal}>`}

      ${photoSource && html`
        <${Modal} title="Fotoğraf ekle" center=${false} onClose=${() => setPhotoSource(false)}>
          <button class="list-btn" onClick=${() => { setPhotoSource(false); pickPhotos({ camera: true, onPicked: addFiles }); }}>📸  Kamera ile çek</button>
          <button class="list-btn" onClick=${() => { setPhotoSource(false); pickPhotos({ multiple: true, onPicked: addFiles }); }}>🖼  Galeriden seç (en fazla ${api.MAX_PHOTOS})</button>
          <button class="list-btn muted" onClick=${() => setPhotoSource(false)}>Vazgeç</button>
        </${Modal}>`}

      ${viewer && html`<${PhotoViewer} photos=${viewer.msg.photos} start=${viewer.index}
          title=${`${label(viewer.msg)} • ${chatTime(viewer.msg.created_at)}`} onClose=${() => setViewer(null)} />`}

      ${rules && html`
        <${Modal} title=${`${room.icon} ${room.name.toLocaleUpperCase("tr-TR")} | GRUP KURALLARI`} closeOnBackdrop=${!rules.key}
          onClose=${() => !rules.key && setRules(null)}
          actions=${html`<button class="btn" onClick=${() => { if (rules.key) store.set(rules.key, true); setRules(null); }}>
            ${rules.key ? "Okudum, kabul ediyorum" : "Kapat"}</button>`}>
          <div style="white-space:pre-wrap;font-size:16px">${rules.text}</div>
        </${Modal}>`}
    </div>`;
}

/** Uzun mesaj 5 satırdan sonra kesilir: "Devamını gör" */
function ClampText({ text, color }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [overflow, setOverflow] = useState(false);
  // Sadece 1-3 emojiden oluşan mesaj büyük görünür (WhatsApp gibi)
  const n = api.emojiOnlyCount(text);
  const big = n !== null && n >= 1 && n <= 3;
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setOverflow(el.scrollHeight > el.clientHeight + 2);
  }, [text, open]);
  return html`
    <div class=${"txt" + (open ? "" : " clamp") + (big ? " big" : "")} ref=${ref}>${withMentions(text, color)}</div>
    ${(overflow || open) && html`<button class="more" style=${`color:${color}`}
      onClick=${(e) => { e.stopPropagation(); setOpen(!open); }}>${open ? "Daha az göster ▲" : "Devamını gör ▼"}</button>`}`;
}

/** Emoji paneli (kategoriler, arama, son kullanılanlar, ten rengi). Dosyalar vendor/emoji içinde. */
export function EmojiPanel({ onPick, height = 300 }) {
  const ref = useRef(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  useEffect(() => {
    let el = null;
    let dead = false;
    Promise.all([import("../../vendor/emoji/picker.js"), import("../../vendor/emoji/tr.js")])
      .then(([m, tr]) => {
        if (dead || !ref.current) return;
        const Picker = m.default;
        el = new Picker({
          locale: "en",
          dataSource: new URL("../../vendor/emoji/data.json", import.meta.url).href,
          i18n: tr.default,
        });
        el.classList.add("dark");
        el.addEventListener("emoji-click", (e) => pickRef.current(e.detail.unicode));
        ref.current.appendChild(el);
      })
      .catch(() => { if (ref.current) ref.current.textContent = "Emoji paneli yüklenemedi. İnterneti kontrol et."; });
    return () => { dead = true; if (el) el.remove(); };
  }, []);
  return html`<div class="emoji-panel" ref=${ref} style=${`height:${height}px`}></div>`;
}

/** Tepki bırakanlar */
function ReactorsModal({ msg, myId, onClose, onRemove }) {
  const [list, setList] = useState(null);
  useEffect(() => { api.messageReactors(msg.id).then(setList).catch(() => setList([])); }, [msg.id]);
  const mine = api.myReaction(msg, myId);
  return html`
    <${Modal} title="Tepkiler" onClose=${onClose}
      actions=${[
        mine && html`<button class="btn outline" style="color:var(--red-soft)" onClick=${() => onRemove(mine)}>Tepkimi geri al</button>`,
        html`<button class="btn" onClick=${onClose}>Kapat</button>`,
      ]}>
      ${!list ? html`<${Spinner} />` : list.length === 0 ? html`<div class="soft">Henüz tepki yok</div>`
        : list.map((r) => html`
          <div class="row" key=${r.user_id} style="padding:6px 0">
            <span style="font-size:22px;width:40px">${r.emoji}</span>
            <span style="font-size:17px">${r.username ? "@" + r.username : "Üye"} ${roleBadge(r.role)}${r.user_id === myId ? "  (sen)" : ""}</span>
          </div>`)}
    </${Modal}>`;
}

/** Düzenlemeden önceki haller (moderatör ve üstü) */
function EditHistoryModal({ msg, onClose }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.messageEditHistory(msg.id).then(setList).catch((e) => setErr(userMessage(e))); }, [msg.id]);
  return html`
    <${Modal} title="📝 Düzenleme geçmişi" onClose=${onClose}
      actions=${html`<button class="btn" onClick=${onClose}>Kapat</button>`}>
      <div class="bold">Şimdiki hali:</div>
      <div style="white-space:pre-wrap;margin-bottom:10px">${msg.content}</div>
      ${err ? html`<div class="msg err">${err}</div>` : !list ? html`<${Spinner} />`
        : [...list].reverse().map((h, i) => html`
          <div key=${i} style="margin-top:8px">
            <div class="bold">Önceki hali (${chatTime(h.edited_at)} öncesi):</div>
            <div class="soft" style="white-space:pre-wrap">${h.old_content || ""}</div>
          </div>`)}
    </${Modal}>`;
}

function rulesTextFor(room, isTraffic) {
  if (isTraffic) return api.cfgText("group_rules", GROUP_RULES);
  return room.rules || `${room.icon} ${room.name}\n\n${room.description || ""}`;
}

// ---------------------------------------------------------------------------
export function ReportDialog({ msg, label, onClose, onError, send = api.reportMessage, title = "🚩 Mesajı şikayet et", note: hint }) {
  const [reason, setReason] = useState("kufur");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = reason !== "diger" || note.trim().length >= 3;
  return html`
    <${Modal} title=${title} onClose=${() => !busy && onClose()}
      actions=${[
        html`<button class="btn outline" disabled=${busy} onClick=${onClose}>Vazgeç</button>`,
        html`<button class="btn" disabled=${!ok || busy} onClick=${async () => {
          setBusy(true);
          try {
            await send(msg.id, reason, note.trim());
            toast("Şikayetin yönetime iletildi. Teşekkürler!", 4000);
          } catch (e) {
            onError(userMessage(e));
          }
          setBusy(false);
          onClose();
        }}>Gönder</button>`,
      ]}>
      <div class="muted">${label}: "${api.previewText(msg).slice(0, 120)}"</div>
      <div class="bold" style="margin-top:10px">Sebep:</div>
      ${api.REPORT_REASONS.map(([code, text]) => html`
        <label class="choice" key=${code}>
          <input type="radio" name="sebep" checked=${reason === code} onChange=${() => setReason(code)} />${text}
        </label>`)}
      <textarea class="input" rows="2" maxlength="300" placeholder=${reason === "diger" ? "Açıklama (zorunlu)" : "Açıklama (isteğe bağlı)"}
        value=${note} onInput=${(e) => setNote(e.target.value)}></textarea>
      <div class="muted small" style="margin-top:6px">${hint || "Şikayetin sadece yönetime gider. Mesajın sahibi kimin şikayet ettiğini görmez."}</div>
    </${Modal}>`;
}

function RoomMuteDialog({ label, room, onClose, onMute, onUnmute }) {
  const [minutes, setMinutes] = useState(60);
  const [reason, setReason] = useState("");
  return html`
    <${Modal} title="🔇 Bu odada sustur" onClose=${onClose}
      actions=${[
        html`<button class="btn outline" onClick=${onUnmute}>Susturmayı kaldır</button>`,
        html`<button class="btn orange" disabled=${reason.trim().length < 3} onClick=${() => onMute(minutes, reason.trim())}>Sustur</button>`,
      ]}>
      <div class="soft">${label}, ${room.icon} ${room.name} odasına seçilen süre boyunca yazamaz. Diğer odalara yazabilir.</div>
      <div class="bold" style="margin-top:10px">Süre:</div>
      ${ROOM_MUTE_OPTIONS.map(([v, t]) => html`
        <label class="choice" key=${v}><input type="radio" name="sure" checked=${minutes === v} onChange=${() => setMinutes(v)} />${t}</label>`)}
      <input class="input" maxlength="200" placeholder="Sebep (zorunlu)" value=${reason} onInput=${(e) => setReason(e.target.value)} />
    </${Modal}>`;
}

function DescriptionDialog({ room, onClose, onSave }) {
  const [text, setText] = useState(room.description || "");
  const [busy, setBusy] = useState(false);
  return html`
    <${Modal} title="✏️ Oda açıklaması" onClose=${() => !busy && onClose()}
      actions=${[
        html`<button class="btn outline" disabled=${busy} onClick=${onClose}>Vazgeç</button>`,
        html`<button class="btn" disabled=${busy} onClick=${async () => { setBusy(true); await onSave(text.trim()); }}>Kaydet</button>`,
      ]}>
      <textarea class="input" rows="3" maxlength="200" value=${text} onInput=${(e) => setText(e.target.value)}></textarea>
      <div class="muted small">En fazla 200 karakter</div>
    </${Modal}>`;
}
