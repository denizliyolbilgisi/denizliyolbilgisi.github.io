// Oyun Salonu 2.0 — 🃏 Pişti (1'e 1, 2 sabit masa, rakip gelmezse bot)
import { html, useState, useEffect, useRef } from "../../vendor/preact-htm.js";
import { hataMetni, useToast, Bildirim, Avatar, Pencere, useSigdir, avRenk, harf } from "./okey.js";
import { cal, sesAcikMi, sesAyarla } from "./ses.js";

const RENK = ["♠", "♥", "♦", "♣"];
const SAYI = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const kirmizi = (c) => c != null && (Math.floor(c / 13) === 1 || Math.floor(c / 13) === 2);
const deger = (c) => (c % 13 === 0 || c % 13 === 10 ? 1 : c === 3 * 13 + 1 ? 2 : c === 2 * 13 + 9 ? 3 : 0);

export function Kart({ c, kucuk, ters, cls = "", ...rest }) {
  if (ters) return html`<div class=${"pk-kart ters " + (kucuk ? "kucuk " : "") + cls} ...${rest}><span>DYB</span></div>`;
  if (c == null) return html`<div class=${"pk-kart bos " + (kucuk ? "kucuk " : "") + cls} ...${rest}></div>`;
  const s = SAYI[c % 13], r = RENK[Math.floor(c / 13)];
  const p = deger(c);
  return html`<div class=${"pk-kart " + (kirmizi(c) ? "kirmizi " : "") + (kucuk ? "kucuk " : "") + cls} aria-label=${r + s} ...${rest}>
    <span class="ks">${s}<i>${r}</i></span>
    <span class="kr">${r}</span>
    ${p > 0 && !kucuk && html`<span class="kp">+${p}</span>`}
  </div>`;
}

// ---------------------------------------------------------------------------
// Pişti salonu (2 masa)
// ---------------------------------------------------------------------------
export function PistiSalon({ rpc, onMasa }) {
  const [liste, setListe] = useState(null);
  const [alinma, setAlinma] = useState(Date.now());
  const [, saniye] = useState(0);
  const [mesgul, setMesgul] = useState(false);
  const [toast, goster] = useToast();
  async function yukle() {
    try { setListe((await rpc("pisti_masalar_listesi")) || []); setAlinma(Date.now()); }
    catch (e) { goster(hataMetni(e, "Masalar yüklenemedi."), 3500); }
  }
  useEffect(() => {
    yukle();
    const t = setInterval(() => { if (!document.hidden) yukle(); }, 10000);
    const s = setInterval(() => saniye((x) => x + 1), 1000);
    return () => { clearInterval(t); clearInterval(s); };
  }, []);
  async function otur(m) {
    if (mesgul) return;
    setMesgul(true);
    try { if (!m.benim) await rpc("pisti_katil", { p_masa: m.id }); onMasa(m.id); } catch (e) { goster(hataMetni(e), 3500); }
    setMesgul(false);
  }
  const gecen = (Date.now() - alinma) / 1000;
  return html`
    <div class="ok-bilgi-kart">
      <div class="pk-ornek"><${Kart} c=${10} kucuk /><${Kart} c=${23} kucuk /><${Kart} c=${40} kucuk /></div>
      <div><b>🃏 Pişti • 1'e 1</b><span>Yerdeki kartla aynı sayıyı ya da Vale'yi (J) atan yeri alır. Tek kartı aynı sayıyla almak PİŞTİ: 10 puan.</span></div>
    </div>
    <div class="ok-bolum">PİŞTİ MASALARI</div>
    <div class="ok-masalar">
      ${!liste && html`<div class="ok-bos">Yükleniyor…</div>`}
      ${(liste || []).map((m) => {
        const ks = m.koltuklar || [];
        const bos = 2 - ks.length, bot = ks.some((k) => k.bot);
        const bekle = m.bekleme_sn != null ? Math.max(0, Math.ceil(m.bekleme_sn - gecen)) : null;
        const [et, bg, fg] = m.durum === "bekliyor"
          ? (!ks.length ? ["Boş • otur, rakip bekle", "rgba(34,197,94,0.18)", "#86EFAC"]
            : [`${bekle != null ? `Başlıyor ${bekle} sn • ` : ""}1 yer boş`, "rgba(250,204,21,0.16)", "#FDE68A"])
          : m.durum === "bitti" ? [`El ${m.el_no} bitti`, "rgba(250,204,21,0.16)", "#FDE68A"] : [`Oynanıyor • El ${m.el_no}`, "rgba(148,163,184,0.18)", "#CBD5E1"];
        const yerVar = m.durum === "bekliyor" ? bos > 0 : bot;
        const [btn, bbg] = m.benim ? ["Dön", "#1F6FEB"] : yerVar ? ["Otur", "#16A34A"] : ["İzle", "#334155"];
        return html`
          <div key=${m.id} class="ok-mkart">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <div class="ok-mad">${m.ad}</div>
                <div class="ok-etiket" style=${`background:${bg};color:${fg}`}>${et}</div>
              </div>
              <div class="ok-koltuklar">
                ${[0, 1].map((i) => {
                  const k = ks.find((x) => x.koltuk === i);
                  return k ? html`<div key=${i} class="ok-kc" style=${`background:${k.bot ? "#475569" : avRenk(k.ad)}`}>${k.bot ? "🤖" : harf(k.ad)}</div>`
                    : html`<div key=${i} class="ok-kc bos">+</div>`;
                })}
              </div>
            </div>
            <button class="ok-mbtn" disabled=${mesgul} style=${`background:${bbg}`} onClick=${() => (btn === "İzle" ? onMasa(m.id) : otur(m))}>${btn}</button>
          </div>`;
      })}
    </div>
    <${Bildirim} metin=${toast} />`;
}

// ---------------------------------------------------------------------------
// Pişti masası (yatay)
// ---------------------------------------------------------------------------
export function PistiMasa({ rpc, masaId, onLobi }) {
  const [d, setD] = useState(null);
  const [alinma, setAlinma] = useState(0);
  const [, tik] = useState(0);
  const [mesgul, setMesgul] = useState(false);
  const [kalkSor, setKalkSor] = useState(false);
  const [sesOn, setSesOn] = useState(sesAcikMi());
  const [ucan, setUcan] = useState(null);       // atılan kart animasyonu
  const [toast, goster] = useToast();
  const dis = useRef(null);
  const fit = useSigdir(dis, !!d);
  const dRef = useRef(null), istek = useRef(false), sayac = useRef(0), onceki = useRef(null), sonTik = useRef(null);

  async function getir(tam = false) {
    if (istek.current) return;
    istek.current = true;
    try {
      const o = dRef.current;
      sayac.current++;
      const kisa = !tam && o && sayac.current % 10 !== 0;
      const x = await rpc("pisti_durum", kisa ? { p_masa: masaId, p_surum: o.surum } : { p_masa: masaId });
      const yeni = x.ayni ? { ...o, kalan_sn: x.kalan_sn, bekleme_sn: x.bekleme_sn } : x;
      dRef.current = yeni; setD(yeni); setAlinma(Date.now());
    } catch (e) {
      const m = hataMetni(e, "Masaya bağlanılamadı.");
      if (/bulunamadı/.test(m)) setTimeout(onLobi, 1000); else goster(m, 3000);
    }
    istek.current = false;
  }
  useEffect(() => {
    let dur = false, zaman = 0;
    const dongu = async () => {
      if (dur) return;
      if (!document.hidden) await getir();
      const x = dRef.current;
      const hizli = !x || x.durum === "bekliyor" || (x.durum === "oynaniyor" && x.sira === x.benim_koltuk);
      zaman = setTimeout(dongu, hizli ? 1000 : 1500);
    };
    dongu();
    const s = setInterval(() => tik((x) => x + 1), 250);
    return () => { dur = true; clearTimeout(zaman); clearInterval(s); };
  }, [masaId]);

  // sesler (rakip / durum)
  useEffect(() => {
    if (!d || d.ayni) return;
    const o = onceki.current; onceki.current = d;
    if (!o || o.id !== d.id) return;
    const ben = d.benim_koltuk;
    if (d.durum === "oynaniyor" && (o.durum !== "oynaniyor" || d.el_no !== o.el_no)) { cal("karis"); return; }
    if (d.durum === "bitti" && o.durum === "oynaniyor") { cal(d.kazanan === ben ? "kazan" : "bitti"); return; }
    if (d.son_kart != null && d.son_kart !== o.son_kart && o.sira !== ben) {
      if (/PİŞTİ/.test(d.son_olay || "")) cal("okey", 0.7); else cal(/yeri aldı/.test(d.son_olay || "") ? "cek" : "at", 0.5);
    }
    if (ben != null && d.durum === "oynaniyor" && d.sira === ben && o.sira !== ben) setTimeout(() => cal("sira", 0.8), 250);
  }, [d?.surum, d?.durum]);

  async function oyna(c) {
    if (mesgul || !d || d.sira !== d.benim_koltuk || d.durum !== "oynaniyor") return;
    setMesgul(true);
    setUcan(c);
    try {
      const r = await rpc("pisti_oyna", { p_masa: masaId, p_kart: c });
      cal(r.sonuc === "pisti" ? "okey" : r.sonuc === "aldi" ? "cek" : "at", r.sonuc === "pisti" ? 0.9 : 1);
      if (r.sonuc === "pisti") goster("🎉 PİŞTİ!", 1800);
      istek.current = false; await getir(true);
    } catch (e) { cal("hata", 0.5); goster(hataMetni(e), 3000); }
    setUcan(null);
    setMesgul(false);
  }
  async function cagir(ad, arg, sonra) {
    if (mesgul) return;
    setMesgul(true);
    try { await rpc(ad, arg); if (sonra) sonra(); istek.current = false; await getir(true); } catch (e) { goster(hataMetni(e), 3500); }
    setMesgul(false);
  }

  if (!d) return html`<div class="ok-masa-dis pk-masa" ref=${dis}><div class="ok-yukleniyor">Masaya bağlanılıyor…</div></div>`;
  const ben = d.benim_koltuk;
  const oturuyor = ben != null;
  const rakip = (d.koltuklar || []).find((k) => k.koltuk !== ben) || (oturuyor ? null : (d.koltuklar || [])[0]);
  const benK = (d.koltuklar || []).find((k) => k.koltuk === (oturuyor ? ben : 1));
  const sirada = d.durum === "oynaniyor" && oturuyor && d.sira === ben;
  const kalan = d.kalan_sn == null ? null : Math.max(0, d.kalan_sn - (Date.now() - alinma) / 1000);
  const oran = kalan == null ? null : Math.min(1, kalan / (d.hamle_sn || 20));
  const sn = sirada && kalan != null ? Math.ceil(kalan) : null;
  if (sn != null && sn <= 5 && sn >= 1 && sonTik.current !== sn) { sonTik.current = sn; cal("sure", 0.5); }
  const bekle = d.bekleme_sn != null ? Math.max(0, Math.ceil(d.bekleme_sn - (Date.now() - alinma) / 1000)) : null;

  return html`
    <div class="ok-masa-dis pk-masa" ref=${dis}>
      <div class="ok-sahne" style=${`transform:${fit.rot ? "rotate(90deg) " : ""}scale(${fit.s})`}>
        <div class="ok-cubuk">
          <button class="ok-cgeri" aria-label="Salona dön" onClick=${onLobi}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18 9 12l6-6"></path></svg>
          </button>
          <div class="ok-logo">DYB</div>
          <div class="ok-cad">🃏 ${d.ad}</div>
          ${d.el_no > 0 && html`<div class="ok-cel">El ${d.el_no}</div>`}
          <div style="flex:1"></div>
          <button class="ok-cses" aria-label=${sesOn ? "Sesi kapat" : "Sesi aç"} onClick=${() => { const y = !sesOn; setSesOn(y); sesAyarla(y); }}>${sesOn ? "🔊" : "🔇"}</button>
          ${oturuyor ? html`<button class="ok-ckalk" onClick=${() => setKalkSor(true)}>Kalk</button>`
            : d.durum !== "bekliyor" && (d.koltuklar || []).some((k) => k.bot) && html`<button class="ok-ckalk yesil" onClick=${() => cagir("pisti_katil", { p_masa: masaId })}>Otur</button>`}
        </div>

        <!-- rakip -->
        ${rakip && html`
          <div class="pk-rakip">
            ${d.durum === "oynaniyor" && d.sira === rakip.koltuk && oran != null ? html`<${Avatar} ad=${rakip.ad} bot=${rakip.bot} size=${34} halka=${oran} />` : html`<${Avatar} ad=${rakip.ad} bot=${rakip.bot} size=${34} />`}
            <div><div class="ok-oad">${rakip.ad}${!rakip.bot && !rakip.cevrimici ? " • çevrimdışı" : ""}</div><div class="ok-oalt">${rakip.alinan} kart aldı${rakip.pisti ? ` • ${rakip.pisti} pişti puanı` : ""} • toplam ${rakip.skor}</div></div>
            <div class="pk-rakip-el">${Array.from({ length: rakip.kart }, (_, i) => html`<${Kart} key=${i} ters kucuk />`)}</div>
          </div>`}

        <!-- orta: deste + yer -->
        ${d.durum !== "bekliyor" && html`
          <div class="pk-orta">
            <div class="pk-deste">
              ${d.deste > 0 ? html`<${Kart} ters /><span>${d.deste}</span>` : html`<div class="pk-deste-bos">Deste bitti</div>`}
            </div>
            <div class="pk-yer">
              ${d.yer_sayi > 1 && html`<div class="pk-yer-alt"></div>`}
              ${d.yer_ust != null ? html`<${Kart} c=${d.yer_ust} cls="pk-yer-ust" />` : html`<div class="pk-yer-bos">Yer boş</div>`}
              ${d.yer_sayi > 0 && html`<span class="pk-yer-sayi">${d.yer_sayi} kart</span>`}
            </div>
          </div>`}
        ${d.son_olay && d.durum === "oynaniyor" && html`<div class="pk-olay">${d.son_olay}</div>`}
        ${d.durum === "oynaniyor" && html`<div class=${"ok-durum pk-durum" + (sirada ? "" : " soluk")}>
          ${sirada ? `Sıra sende • bir kart seç${d.yer_ust != null ? " (aynı sayı ya da J yeri alır)" : ""}` : `Sıra ${(d.koltuklar || []).find((k) => k.koltuk === d.sira)?.ad || ""}'de`}</div>`}

        <!-- ben -->
        ${benK && html`
          <div class="pk-ben">
            ${sirada && oran != null ? html`<${Avatar} ad=${benK.ad} halka=${oran} />` : html`<${Avatar} ad=${benK.ad} bot=${benK.bot} />`}
            <div class="ok-oad">${benK.ad}</div>
            <div class="ok-oalt" style=${sirada ? "color:#FDE68A" : ""}>${sn != null ? `0:${String(sn).padStart(2, "0")}` : `${benK.alinan} kart • ${benK.skor} puan`}</div>
          </div>`}
        ${oturuyor && d.el && html`
          <div class="pk-elim">
            ${d.el.map((c) => html`<button key=${c} class=${"pk-elkart" + (sirada ? " oynanir" : "") + (ucan === c ? " ucuyor" : "")}
              disabled=${!sirada || mesgul} onClick=${() => oyna(c)}><${Kart} c=${c} /></button>`)}
          </div>`}
        ${!oturuyor && d.durum !== "bekliyor" && html`<div class="ok-izleyici pk-izleyici">👀 İzliyorsun</div>`}

        <!-- puan paneli -->
        ${oturuyor && benK && d.durum !== "bekliyor" && html`
          <div class="pk-panel">
            <div><span>Aldığın</span><b>${benK.alinan}</b></div>
            <div><span>Pişti</span><b>${benK.pisti}</b></div>
            <div><span>Toplam</span><b>${benK.skor}</b></div>
          </div>`}

        ${d.durum === "bekliyor" && html`
          <div class="ok-kaplama"><div class="ok-kutu">
            <div class="ok-kbas">🃏 ${d.ad}</div>
            <div class="ok-kalt">${bekle != null ? html`Rakip oturursa hemen başlar • <b class="ok-sayac">${bekle} sn</b> sonra bot oturup başlar` : "1'e 1 Pişti • rakip bekleniyor"}</div>
            <div class="ok-bkolt" style="grid-template-columns:repeat(2,1fr)">
              ${[0, 1].map((i) => { const k = (d.koltuklar || []).find((x) => x.koltuk === i);
                return html`<div key=${i} class="ok-bk">${k ? html`<${Avatar} ad=${k.ad} bot=${k.bot} size=${44} />` : html`<div class="ok-av bosav">🤖</div>`}
                  <div class="ok-oad">${k ? k.ad : "Bekleniyor"}</div></div>`; })}
            </div>
            <div class="ok-pbtn" style="justify-content:center">
              ${!oturuyor && html`<button class="ok-kbtn yesil" disabled=${mesgul} onClick=${() => cagir("pisti_katil", { p_masa: masaId })}>Otur</button>`}
              ${d.kuran_benim && html`<button class="ok-kbtn yesil buyuk" disabled=${mesgul} onClick=${() => cagir("pisti_baslat", { p_masa: masaId })}>▶ Botla hemen başla</button>`}
              <button class="ok-kbtn gri" onClick=${onLobi}>Salona dön</button>
            </div>
          </div></div>`}

        ${d.durum === "bitti" && html`
          <div class="ok-kaplama"><div class="ok-kutu">
            <div class="ok-kbas">${d.kazanan == null ? "🤝 Berabere" : d.kazanan === ben ? "🎉 Eli kazandın!" : `🏁 ${(d.koltuklar || []).find((k) => k.koltuk === d.kazanan)?.ad || ""} kazandı`}</div>
            <div class="pk-skor">
              ${(d.koltuklar || []).map((k) => html`
                <div key=${k.koltuk} class=${"pk-skor-s" + (k.koltuk === d.kazanan ? " kazanan" : "")}>
                  <${Avatar} ad=${k.ad} bot=${k.bot} size=${32} />
                  <b>${k.ad}</b>
                  <span>${k.alinan} kart • pişti ${k.pisti}</span>
                  <em>+${k.el_puani}</em>
                  <small>Toplam ${k.skor}</small>
                </div>`)}
            </div>
            <div class="ok-kalt" style="margin-top:8px">Puan: As 1 • Vale 1 • ♣2 = 2 • ♦10 = 3 • en çok kart 3 • pişti 10 (Vale ile 20)</div>
            <div class="ok-pbtn" style="justify-content:center">
              ${oturuyor && html`<button class="ok-kbtn yesil buyuk" disabled=${mesgul} onClick=${() => cagir("pisti_baslat", { p_masa: masaId })}>Yeni el</button>`}
              <button class="ok-kbtn gri" onClick=${onLobi}>Salona dön</button>
            </div>
          </div></div>`}

        ${kalkSor && html`
          <${Pencere} baslik="Masadan kalkılsın mı?" onClose=${() => setKalkSor(false)}
            butonlar=${html`<button class="ok-kbtn gri" onClick=${() => setKalkSor(false)}>Vazgeç</button>
              <button class="ok-kbtn" onClick=${() => { setKalkSor(false); cagir("pisti_ayril", { p_masa: masaId }, onLobi); }}>Kalk</button>`}>
            <p>${d.durum === "oynaniyor" ? "Oyun sürüyor: kalkarsan yerine bot oturur." : "Masadaki yerin boşalır."}</p>
          </${Pencere}>`}
        <${Bildirim} metin=${toast} />
      </div>
    </div>`;
}
