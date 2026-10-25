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

  async function load() {
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
