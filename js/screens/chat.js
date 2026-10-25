// Sohbet odası: mesajlar, yanıt, fotoğraf albümü, şikayet, sabit mesaj, oda yöneticisi araçları
import {
  html, useState, useEffect, useRef, navigate, userMessage, chatTime, remainingText, isStillActive,
  roleRank, roleBadge, toast, copyText, store,
} from "../lib.js";
import * as api from "../api.js";
import { TopBar, Modal, Spinner, PhotoAlbum, PhotoViewer, pickPhotos, longPress, useInterval, useOnResume } from "../ui.js";

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

export function ChatScreen({ roomId }) {
  const [room, setRoom] = useState(api.cachedRoom(roomId));
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [input, setInput] = useState(() => store.get("dyb_taslak_" + roomId, ""));
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(null);
  const [picked, setPicked] = useState([]);           // { file, url }
  const [replyTo, setReplyTo] = useState(null);
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

  const rank = roleRank(me?.role);
  const myPower = Math.max(room.my_power || 2, rank * 2);
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

  // Yeni mesaj gelince en alta in
  const lastId = messages.length ? messages[messages.length - 1].id : 0;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

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
    if ((!text && !picked.length) || sending) return;
    setSending(true);
    const uploaded = [];
    try {
      for (let i = 0; i < picked.length; i++) {
        setProgress(`📷 Fotoğraf yükleniyor ${i + 1}/${picked.length}…`);
        const blob = await api.compressPhoto(picked[i].file);
        uploaded.push(await api.uploadPhoto(blob));
      }
      setProgress(null);
      await api.sendMessage(roomId, text, replyTo?.id, uploaded);
      picked.forEach((p) => URL.revokeObjectURL(p.url));
      setPicked([]);
      setInput("");
      setReplyTo(null);
      setError(null);
      await loadMessages();
    } catch (e) {
      if (uploaded.length) api.deletePhotos(uploaded);
      setError(userMessage(e));
    } finally {
      setSending(false);
      setProgress(null);
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
        <div class="small" style="margin-top:4px;color:#FFD6D6">
          ${globalMuted ? "Bu sürede mesaj yazamazsın, sadece okuyabilirsin." : `Bu sürede ${room.icon} ${room.name} odasına yazamazsın; diğer odalara yazabilirsin.`}
        </div>
      </div>`;
  } else if (room.read_only && !canModerate) {
    bottom = html`<div class="notice" style="background:var(--card-2)">📢 Bu odaya sadece yöneticiler yazabilir.</div>`;
  } else {
    bottom = html`
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
      <div class="composer">
        <button class="cam" disabled=${sending || picked.length >= api.MAX_PHOTOS} onClick=${() => setPhotoSource(true)}>📷</button>
        <textarea class="input" rows="1" maxlength=${MAX_LENGTH} value=${input}
          placeholder=${picked.length ? "Açıklama ekle (isteğe bağlı)" : replyTo ? "Yanıtını yaz..." : "Mesaj yaz..."}
          onInput=${(e) => {
            setInput(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
          }}></textarea>
        <button class="btn" disabled=${sending || (!input.trim() && !picked.length)} onClick=${send}>
          ${sending ? html`<${Spinner} small />` : "Gönder"}
        </button>
      </div>`;
  }

  return html`
    <div class="chat">
      <${TopBar} title=${`${room.icon} ${room.name}`} onBack=${() => navigate("/menu")}
        sub=${(room.description || "Basılı tut: Yanıtla / Sil") + (canModerate ? "  ✏️" : "")}
        onSubClick=${canModerate ? () => setEditDesc(true) : null}
        right=${html`<button class="btn ghost" onClick=${() => setRules({ text: rulesTextFor(room, isTraffic), key: null })}>Kurallar</button>`} />

      ${room.pinned_message_id && room.pinned_text && html`
        <div class="pinned" ...${longPress(() => setShowPinned(true),
               () => { if (!scrollToMessage(room.pinned_message_id)) setShowPinned(true); })}>
          <span style="font-size:18px">📌</span>
          <div class="grow"><div class="pl">Sabitlenmiş mesaj</div><div class="pt">${room.pinned_text}</div></div>
        </div>`}

      <div class="messages" ref=${listRef}>
        ${loading ? html`<${Spinner} />`
          : messages.length === 0 ? html`<div class="center muted" style="flex:1">Henüz mesaj yok. İlk mesajı sen yaz!</div>`
          : messages.map((m) => {
            const mine = m.user_id === myId;
            const replied = m.reply_to_id ? messages.find((x) => x.id === m.reply_to_id) : null;
            return html`
              <div class=${"mwrap" + (mine ? " mine" : "")} id=${"m" + m.id} key=${m.id}>
                ${!mine && html`<div class="sender">${label(m)}</div>`}
                <div class="bubble" ...${longPress(() => setMenuFor(m))}>
                  ${m.reply_to_id && html`
                    <div class="quote" onClick=${(e) => { e.stopPropagation(); scrollToMessage(m.reply_to_id); }}>
                      <div class="bar"></div>
                      <div>
                        <div class="qn">${replied ? label(replied) : "Önceki bir mesaj"}</div>
                        <div class="qt">${replied ? api.previewText(replied) : "Mesaj silinmiş ya da çok eski"}</div>
                      </div>
                    </div>`}
                  <${PhotoAlbum} photos=${m.photos} expired=${m.photos_expired} onOpen=${(i) => setViewer({ msg: m, index: i })} />
                  ${m.content && m.content.trim() && html`<div class="txt">${m.content}</div>`}
                  <div class="time">${m.id === room.pinned_message_id ? "📌 " : ""}${chatTime(m.created_at)}</div>
                </div>
              </div>`;
          })}
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
            <button class="list-btn" onClick=${() => { setReplyTo(m); close(); }}>↩  Yanıtla</button>
            ${m.content && m.content.trim() && html`<button class="list-btn" onClick=${async () => { close(); toast((await copyText(m.content)) ? "Kopyalandı" : "Kopyalanamadı"); }}>📋  Kopyala</button>`}
            ${m.photos && m.photos.length > 0 && !m.photos_expired && html`<button class="list-btn" onClick=${() => { setViewer({ msg: m, index: 0 }); close(); }}>🖼  Fotoğrafları aç</button>`}
            ${m.user_id !== myId && html`<button class="list-btn" style="color:#FFB020" onClick=${() => { setReportFor(m); close(); }}>🚩  Şikayet Et</button>`}
            ${canModerate && html`<button class="list-btn" onClick=${() => { close(); pin(m); }}>${m.id === room.pinned_message_id ? "📌  Sabitlemeyi kaldır" : "📌  Sabitle"}</button>`}
            ${canManage && m.user_id !== myId && html`<button class="list-btn" style="color:#FFB020" onClick=${() => { setMuteFor(m); close(); }}>🔇  Bu odada sustur / aç</button>`}
            ${canDelete && html`<button class="list-btn" style="color:var(--red-soft)" onClick=${() => { setDeleteFor(m); close(); }}>🗑  Sil</button>`}
            <button class="list-btn muted" onClick=${close}>Vazgeç</button>
          </${Modal}>`;
      })()}

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

function rulesTextFor(room, isTraffic) {
  if (isTraffic) return api.cfgText("group_rules", GROUP_RULES);
  return room.rules || `${room.icon} ${room.name}\n\n${room.description || ""}`;
}

// ---------------------------------------------------------------------------
function ReportDialog({ msg, label, onClose, onError }) {
  const [reason, setReason] = useState("kufur");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = reason !== "diger" || note.trim().length >= 3;
  return html`
    <${Modal} title="🚩 Mesajı şikayet et" onClose=${() => !busy && onClose()}
      actions=${[
        html`<button class="btn outline" disabled=${busy} onClick=${onClose}>Vazgeç</button>`,
        html`<button class="btn" disabled=${!ok || busy} onClick=${async () => {
          setBusy(true);
          try {
            await api.reportMessage(msg.id, reason, note.trim());
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
      <div class="muted small" style="margin-top:6px">Şikayetin sadece yönetime gider. Mesajın sahibi kimin şikayet ettiğini görmez.</div>
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
