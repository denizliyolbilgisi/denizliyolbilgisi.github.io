// Davetlerim: davet kodu üret, paylaş, kopyala, sil
import { html, useState, useEffect, navigate, userMessage, agoText, roleRank, toast, copyText, parseTime } from "../lib.js";
import * as api from "../api.js";
import { TopBar, Modal, Spinner, useInterval } from "../ui.js";

const SITE = "https://denizliyolbilgisi.github.io";

function waitText(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} saat ${m % 60} dk` : `${m} dk`;
}

export function InvitesScreen() {
  const [codes, setCodes] = useState(null);
  const [me, setMe] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [, setTick] = useState(0);
  const [helps, setHelps] = useState([]);         // güncellemesi gereken Android davetliler
  const [sendingApk, setSendingApk] = useState(null);

  async function load() {
    api.updateHelps().then(setHelps).catch(() => {});
    try {
      const [list, p] = await Promise.all([api.myInviteCodes(), api.me()]);
      setCodes(list || []);
      setMe(p);
    } catch (e) {
      setMsg({ err: true, text: "Kodlar yüklenemedi: " + userMessage(e) });
      setCodes([]);
    }
  }
  useEffect(() => {
    load();
    api.refreshConfig().catch(() => {});
  }, []);
  useInterval(() => setTick((t) => t + 1), 30000);

  const rank = roleRank(me?.role);
  const newH = api.cfgInt("invite_new_member_hours", 3);
  const waitH = api.cfgInt("invite_wait_hours", 3);
  let nextAllowed = null;
  if (me && rank < 2) {
    const joined = parseTime(me.created_at);
    const last = parseTime(me.last_invite_at);
    const a = joined ? joined.getTime() + newH * 3600000 : 0;
    const b = last ? last.getTime() + waitH * 3600000 : 0;
    const t = Math.max(a, b);
    if (t > Date.now()) nextAllowed = t;
  }

  async function create() {
    setBusy(true);
    setMsg(null);
    try {
      const code = await api.createInvite();
      setMsg({ err: false, text: `Yeni kod: ${code}` });
      await load();
    } catch (e) {
      setMsg({ err: true, text: userMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  /** Son Android sürümünü indirip WhatsApp vb. ile gönderir */
  async function sendApp(h) {
    if (sendingApk) return;
    setSendingApk(h.user_id);
    try {
      const apk = await api.latestApk();
      if (navigator.canShare && navigator.canShare({ files: [apk.file] })) {
        try {
          await navigator.share({ files: [apk.file], text: `DYB ${apk.version} – dosyayı açıp "Güncelle"ye bas.` });
        } catch (_) { /* vazgeçildi */ }
      } else {
        // Paylaşma desteklenmiyorsa dosya indirilir
        const url = URL.createObjectURL(apk.file);
        const a = document.createElement("a");
        a.href = url;
        a.download = apk.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        toast("Dosya indirildi. Dosyalar uygulamasından WhatsApp ile gönderebilirsin.", 5000);
      }
    } catch (e) {
      setMsg({ err: true, text: userMessage(e, "Güncelleme dosyası indirilemedi. Biraz sonra tekrar dene.") });
    }
    setSendingApk(null);
  }

  async function share(code) {
    const text = "DYB - Denizli Yol Bilgisi'ne davetlisin!\n\n" +
      `Davet kodun: ${code}\n\n` +
      "📱 Android: Uygulamada \"Davet kodum var\" ekranına bu kodu gir.\n" +
      `🍏 iPhone: Safari'de ${SITE} adresini aç, "Kayıt ol"a dokun ve bu kodu gir.`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (_) { /* vazgeçildi */ return; }
    }
    toast((await copyText(text)) ? "Davet metni kopyalandı" : "Kopyalanamadı");
  }

  return html`
    <div class="screen">
      <${TopBar} title="👥 Davetlerim" onBack=${() => navigate("/menu")} />
      <div class="content">
        <div class="card soft">
          ${rank >= 2
            ? "Yetkili (moderatör / yönetici) olarak beklemeden sınırsız davet kodu üretebilirsin. Her kod tek kullanımlıktır."
            : `DYB'ye yalnızca davetle üye olunur. Güvendiğin kişilere kod oluştur. Her kod tek kullanımlıktır ve ${waitH} saatte bir yeni kod üretebilirsin. Yeni üyeler kayıttan sonraki ilk ${newH} saat kod üretemez.`}
        </div>
        <button class="btn block big green" disabled=${busy || !me || !!nextAllowed} onClick=${create}>
          ${busy ? html`<${Spinner} small />` : !me ? "Yükleniyor…" : nextAllowed ? `Sonraki kod: ${waitText(nextAllowed - Date.now())} sonra` : "＋ Yeni Davet Kodu Oluştur"}
        </button>
        ${msg && html`<div class=${"msg " + (msg.err ? "err" : "ok")}>${msg.text}</div>`}
        ${helps.length > 0 && html`
          <div class="card" style="background:var(--amber-box);border-color:var(--amber)">
            <div class="bold" style="font-size:19px">🆘 Güncellemesi gerekenler (Android)</div>
            <div class="small" style="color:var(--amber-text-soft);margin-bottom:6px">"Gönder" ile yeni Android sürümünü WhatsApp'tan gönderebilirsin. Dosyayı açıp "Güncelle"ye basması yeterli.</div>
            ${helps.slice(0, 6).map((h) => html`
              <div class="row" key=${h.user_id} style="margin-top:8px">
                <div class="grow">
                  <div class="bold" style="font-size:18px">@${h.username || ""}</div>
                  <div class="small" style="color:var(--amber-text-soft)">${h.app_version_name ? "Sürüm " + h.app_version_name : "Eski sürüm"}${h.request_id ? " • yardım istedi" : ""}</div>
                </div>
                <button class="btn small" disabled=${!!sendingApk} onClick=${() => sendApp(h)}>${sendingApk === h.user_id ? "İndiriliyor…" : "📤 Gönder"}</button>
                ${h.request_id && html`<button class="btn small ghost" disabled=${!!sendingApk} onClick=${async () => {
                  try {
                    await api.resolveUpdateHelp(h.user_id);
                    toast("@" + (h.username || "") + " işaretlendi");
                    load();
                  } catch (e) {
                    setMsg({ err: true, text: userMessage(e) });
                  }
                }}>✓</button>`}
              </div>`)}
          </div>`}
        ${codes === null ? html`<${Spinner} />` : codes.length === 0
          ? html`<div class="center muted" style="padding:30px">Henüz davet kodun yok.<br />Yukarıdaki butonla ilk kodunu oluştur.</div>`
          : codes.map((c) => html`
            <div class="card" key=${c.code}>
              <div class="row">
                <div class="grow" style="font-size:22px;font-weight:800;letter-spacing:1px">${c.code}</div>
                <span class="pill" style=${`background:${c.used_at ? "#555" : "#2E9E5B"}`}>${c.used_at ? "Kullanıldı" : "Bekliyor"}</span>
              </div>
              <div class="muted small" style="margin:6px 0 10px">
                ${c.used_at ? `${c.used_name || "Bir üye"} kullandı • ${agoText(c.used_at)}` : `Oluşturuldu: ${agoText(c.created_at)}`}
              </div>
              ${!c.used_at && html`
                <div class="row wrap">
                  <button class="btn small" onClick=${() => share(c.code)}>Paylaş</button>
                  <button class="btn small outline" onClick=${async () => toast((await copyText(c.code)) ? "Kod kopyalandı" : "Kopyalanamadı")}>Kopyala</button>
                  <button class="btn small ghost" style="color:var(--red-soft)" onClick=${() => setToDelete(c.code)}>Sil</button>
                </div>`}
            </div>`)}
      </div>
      ${toDelete && html`
        <${Modal} title="Kodu sil" onClose=${() => setToDelete(null)}
          actions=${[
            html`<button class="btn outline" onClick=${() => setToDelete(null)}>Vazgeç</button>`,
            html`<button class="btn red" onClick=${async () => {
              const code = toDelete;
              setToDelete(null);
              try {
                await api.deleteInvite(code);
                await load();
              } catch (e) {
                setMsg({ err: true, text: "Silinemedi: " + userMessage(e) });
              }
            }}>Sil</button>`,
          ]}>
          <p style="margin:0">${toDelete} kodu silinsin mi? Bu kodu verdiğin kişi artık kayıt olamaz.</p>
        </${Modal}>`}
    </div>`;
}
