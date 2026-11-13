// Oyun sohbetleri (Beta). Sunucuda kapalıyken yalnız bilgi gösterilir, kimse yazamaz.
// Okey masa sohbeti okey_sohbet_*, salon + Pişti + Bilardo masaları oyun_sohbet_* kullanır.
import { html, useState, useEffect, useRef } from "../../vendor/preact-htm.js";
import { hataMetni } from "./okey.js";

export const HAZIR = ["İyi oyunlar 👋", "Tebrikler 👏", "Hadi 😄", "Bol şans 🍀", "Çok iyiydi!"];

export function SohbetGovde({ acik, mesajlar, yazabilir, yazamazNeden, gonder, mesgul }) {
  const [metin, setMetin] = useState("");
  const liste = useRef(null);
  useEffect(() => { if (liste.current) liste.current.scrollTop = liste.current.scrollHeight; }, [mesajlar && mesajlar.length]);
  if (!acik) {
    return html`<div class="ok-sh-kapali">
      <div class="ok-sh-ikon">💬</div>
      <b>Sohbet şimdilik kapalı</b>
      <span>Oyun Salonu deneme (Beta) aşamasında. Sohbet yakında açılacak.</span>
      <div class="ok-sh-hazir">${HAZIR.map((h) => html`<button key=${h} disabled>${h}</button>`)}</div>
    </div>`;
  }
  const yolla = async (m) => { const t = (m || "").trim(); if (!t || mesgul) return; if (await gonder(t)) setMetin(""); };
  return html`<div class="ok-sh-acik">
    <div class="ok-sh-liste" ref=${liste}>
      ${!(mesajlar || []).length && html`<div class="ok-sh-bos">Henüz mesaj yok.</div>`}
      ${(mesajlar || []).map((x) => html`<div key=${x.id} class=${"ok-sh-msj" + (x.benim ? " benim" : "")}><b>${x.ad}</b> ${x.metin}</div>`)}
    </div>
    ${yazabilir ? html`
      <div class="ok-sh-hazir">${HAZIR.map((h) => html`<button key=${h} disabled=${mesgul} onClick=${() => yolla(h)}>${h}</button>`)}</div>
      <form class="ok-sh-yaz" onSubmit=${(e) => { e.preventDefault(); yolla(metin); }}>
        <input maxlength="120" placeholder="Mesaj yaz…" value=${metin} onInput=${(e) => setMetin(e.target.value)} />
        <button type="submit" disabled=${mesgul || !metin.trim()}>Gönder</button>
      </form>` : html`<div class="ok-sh-bos">${yazamazNeden}</div>`}
  </div>`;
}

/** Sohbeti sunucudan okur (açıksa 3 sn'de bir). oyun: "salon" | "pisti" | "bilardo" */
function useOyunSohbet(rpc, oyun, masa, aktif) {
  const [d, setD] = useState({ acik: false, mesajlar: [] });
  const [yuklendi, setYuklendi] = useState(false);
  const al = async () => {
    try { setD((await rpc("oyun_sohbet_oku", { p_oyun: oyun, p_masa: masa ?? null })) || { acik: false, mesajlar: [] }); } catch (_) { /* */ }
    setYuklendi(true);
  };
  useEffect(() => {
    if (!aktif) return;
    al();
    const t = setInterval(() => { if (!document.hidden) al(); }, d.acik ? 3000 : 30000);
    return () => clearInterval(t);
  }, [aktif, d.acik, masa]);
  return [d, al, yuklendi];
}

/** Oyun Salonları giriş ekranının altındaki salon sohbeti kutusu */
export function SalonSohbetKutusu({ rpc, goster }) {
  const [d, al] = useOyunSohbet(rpc, "salon", null, true);
  const [mesgul, setMesgul] = useState(false);
  const gonder = async (t) => {
    setMesgul(true);
    try { await rpc("oyun_sohbet_yaz", { p_oyun: "salon", p_masa: null, p_metin: t }); await al(); setMesgul(false); return true; }
    catch (e) { goster && goster(hataMetni(e), 3500); setMesgul(false); return false; }
  };
  return html`<div class="ok-salon-sohbet">
    <div class="ok-sh-bas">💬 Salon sohbeti <span class=${"os-durum " + (d.acik ? "acik" : "")}>${d.acik ? "Açık" : "Kapalı • Beta"}</span></div>
    <${SohbetGovde} acik=${!!d.acik} mesajlar=${d.mesajlar} yazabilir=${true} gonder=${gonder} mesgul=${mesgul} />
  </div>`;
}

/** Masa sohbeti: 💬 düğmesi + yan panel (Pişti / Bilardo) */
export function MasaSohbet({ rpc, oyun, masaId, oturuyor, goster }) {
  const [acikPanel, setAcikPanel] = useState(false);
  const [d, al] = useOyunSohbet(rpc, oyun, masaId, true);
  const [okunan, setOkunan] = useState(0);
  const [mesgul, setMesgul] = useState(false);
  const mesajlar = d.mesajlar || [];
  const son = mesajlar.length ? mesajlar[mesajlar.length - 1].id : 0;
  const okunmamis = acikPanel ? 0 : mesajlar.filter((x) => x.id > okunan && !x.benim).length;
  const gonder = async (t) => {
    setMesgul(true);
    try { await rpc("oyun_sohbet_yaz", { p_oyun: oyun, p_masa: masaId, p_metin: t }); await al(); setMesgul(false); return true; }
    catch (e) { goster && goster(hataMetni(e), 3500); setMesgul(false); return false; }
  };
  return html`
    <button class="ok-csohbet" aria-label="Masa sohbeti" onClick=${() => { if (!acikPanel) al(); setAcikPanel(!acikPanel); setOkunan(son); }}>💬${okunmamis > 0 && html`<i>${okunmamis}</i>`}</button>
    ${acikPanel && html`
      <div class="ok-sh-panel">
        <div class="ok-sh-bas">💬 Masa sohbeti <span class="ok-beta">BETA</span>
          <button aria-label="Kapat" onClick=${() => { setAcikPanel(false); setOkunan(son); }}>✕</button></div>
        <${SohbetGovde} acik=${!!d.acik} mesajlar=${mesajlar} yazabilir=${oturuyor}
          yazamazNeden="Masayı izliyorsun; yalnız oturanlar yazabilir." gonder=${gonder} mesgul=${mesgul} />
      </div>`}`;
}
