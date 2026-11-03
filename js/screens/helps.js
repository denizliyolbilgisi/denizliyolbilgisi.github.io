// 1.1.2.1: Profilim → 🆘 Güncelleme Bekleyenler (eskiden Davetlerim'in üstündeydi)
import { html, useState, useEffect, userMessage, toast } from "../lib.js";
import * as api from "../api.js";
import { Modal, Spinner } from "../ui.js";

export function UpdateHelpsModal({ onClose, onChanged }) {
  const [helps, setHelps] = useState(null);
  const [sendingApk, setSendingApk] = useState(null);
  const [err, setErr] = useState(null);

  async function load() {
    try {
      const list = await api.updateHelps();
      setHelps(list);
      if (onChanged) onChanged(list.length);
    } catch (e) {
      setHelps((h) => h || []);
      setErr(userMessage(e));
    }
  }
  useEffect(() => { load(); }, []);

  /** Son Android sürümünü indirip WhatsApp vb. ile gönderir */
  async function sendApp(h) {
    if (sendingApk) return;
    setSendingApk(h.user_id);
    setErr(null);
    try {
      const apk = await api.latestApk();
      if (navigator.canShare && navigator.canShare({ files: [apk.file] })) {
        try {
          await navigator.share({ files: [apk.file], text: `DYB ${apk.version} – dosyayı açıp "Güncelle"ye bas.` });
        } catch (_) { /* vazgeçildi */ }
      } else {
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
      setErr(userMessage(e, "Güncelleme dosyası indirilemedi. Biraz sonra tekrar dene."));
    }
    setSendingApk(null);
  }

  return html`
    <${Modal} title="🆘 Güncelleme Bekleyenler" onClose=${onClose} center=${false}
      actions=${html`<button class="btn" onClick=${onClose}>Kapat</button>`}>
      <div class="small soft" style="margin-bottom:8px">Davet ettiğin ve Android uygulamasını güncellemeyen üyeler. "📤 Gönder" ile yeni sürümü WhatsApp'tan gönderebilirsin; dosyayı açıp "Güncelle"ye basması yeterli.</div>
      ${err && html`<div class="msg err">${err}</div>`}
      ${helps === null ? html`<${Spinner} />` : helps.length === 0
        ? html`<div class="center muted" style="padding:20px">🎉 Herkes güncel. Bekleyen kimse yok.</div>`
        : helps.map((h) => html`
          <div class="card" key=${h.user_id} style="background:var(--amber-box);border-color:var(--amber);margin-top:8px">
            <div class="row">
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
                  setErr(userMessage(e));
                }
              }}>✓</button>`}
            </div>
          </div>`)}
    </${Modal}>`;
}
