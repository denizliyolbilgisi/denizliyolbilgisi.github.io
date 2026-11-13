// Oyun Salonları — 🎱 Bilardo (8 top, 1'e 1, 2 sabit masa, rakip gelmezse bot) + 🎯 Antrenman
// Fizik telefonda (bilardo-fizik.js). Atış başına 1 istek; sunucu kuralları denetler, rakip atışı tekrar izler.
import { html, useState, useEffect, useRef } from "../../vendor/preact-htm.js";
import { hataMetni, useToast, Bildirim, Avatar, Pencere, useSigdir, avRenk, harf } from "./okey.js";
import { cal, sesAcikMi, sesAyarla } from "./ses.js";
import { MasaSohbet } from "./sohbet.js";
import { simule, ucgen, botAtis, nisanIzi, koyulabilir, konumSinirla, grubu, R, MW, MH, BAS_CIZGI } from "./bilardo-fizik.js";

export const TOP_RENK = { 1: "#F5C518", 2: "#1D4ED8", 3: "#DC2626", 4: "#6D28D9", 5: "#EA580C", 6: "#15803D", 7: "#7F1D1D", 8: "#111111" };
const GRUP_AD = { duz: "Düz toplar (1-7)", cizgili: "Çizgili toplar (9-15)" };
const kendiMi = (grup, n) => (grup === "duz" ? n >= 1 && n <= 7 : grup === "cizgili" ? n >= 9 && n <= 15 : false);

// Sahne 844×390; çuha 1000×500 birim → ekranda 616×308
const SW = 844, SH = 390, K = 0.616, FX = 114, FY = 66, FW = MW * K, FH = MH * K, RT = 17;
const ekran = (x, y) => [FX + x * K, FY + y * K];
const birimden = (sx, sy) => [(sx - FX) / K, (sy - FY) / K];

// ---------------------------------------------------------------------------
// SVG top (salon ve giriş ekranı kartları)
// ---------------------------------------------------------------------------
let svgSayac = 0;
export function TopSvg({ n, x, y, r }) {
  const id = useRef("bp" + (++svgSayac)).current;
  const c = n === 0 ? "#F7F5EE" : TOP_RENK[n > 8 ? n - 8 : n];
  return html`<g>
    <defs>
      <radialGradient id=${id + "p"} cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".9" /><stop offset=".28" stop-color="#fff" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity=".42" /></radialGradient>
      <clipPath id=${id + "c"}><circle cx=${x} cy=${y} r=${r} /></clipPath>
    </defs>
    <ellipse cx=${x + r * 0.22} cy=${y + r * 0.32} rx=${r} ry=${r * 0.85} fill="rgba(0,0,0,.35)" />
    ${n > 8 ? html`<circle cx=${x} cy=${y} r=${r} fill="#F7F5EE" /><rect x=${x - r} y=${y - r * 0.55} width=${2 * r} height=${r * 1.1} fill=${c} clip-path=${`url(#${id}c)`} />`
      : html`<circle cx=${x} cy=${y} r=${r} fill=${c} />`}
    ${n > 0 && html`<circle cx=${x} cy=${y} r=${r * 0.48} fill="#F7F5EE" />
      <text x=${x} y=${y + r * 0.22} font-size=${r * 0.62} font-weight="800" text-anchor="middle" fill="#111" font-family="Rubik, Inter, system-ui, sans-serif">${n}</text>`}
    <circle cx=${x} cy=${y} r=${r} fill=${`url(#${id}p)`} />
  </g>`;
}

/** Küçük masa önizlemesi (salon kartı) */
export function MiniMasa({ toplar, w = 300 }) {
  const b = 12, k = (w - 2 * b) / MW;
  const id = useRef("mm" + (++svgSayac)).current;
  const cepler = [[0, 0], [MW / 2, -6], [MW, 0], [0, MH], [MW / 2, MH + 6], [MW, MH]];
  return html`<svg class="bl-mini" viewBox=${`0 0 ${w} ${MH * k + 2 * b}`} width="100%" aria-hidden="true">
    <defs>
      <linearGradient id=${id + "a"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8B5A2B" /><stop offset="1" stop-color="#4A2A12" /></linearGradient>
      <radialGradient id=${id + "c"} cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#1F8A5B" /><stop offset="1" stop-color="#0C4E32" /></radialGradient>
    </defs>
    <rect x="0" y="0" width=${w} height=${MH * k + 2 * b} rx="10" fill=${`url(#${id}a)`} />
    <rect x=${b} y=${b} width=${MW * k} height=${MH * k} rx="3" fill=${`url(#${id}c)`} />
    <line x1=${b + BAS_CIZGI * k} y1=${b} x2=${b + BAS_CIZGI * k} y2=${b + MH * k} stroke="rgba(255,255,255,.15)" />
    ${cepler.map(([x, y], i) => html`<circle key=${i} cx=${b + x * k} cy=${b + y * k} r="7" fill="#050505" />`)}
    ${(toplar || []).map(([n, x, y]) => html`<${TopSvg} key=${n} n=${n} x=${b + x * k} y=${b + y * k} r=${R * k * 1.05} />`)}
  </svg>`;
}

// ---------------------------------------------------------------------------
// Bilardo salonu (2 masa + antrenman)
// ---------------------------------------------------------------------------
export function BilardoSalon({ rpc, onMasa, onAntrenman }) {
  const [liste, setListe] = useState(null);
  const [alinma, setAlinma] = useState(Date.now());
  const [, saniye] = useState(0);
  const [mesgul, setMesgul] = useState(false);
  const [toast, goster] = useToast();
  async function yukle() {
    try { setListe((await rpc("bilardo_masalar_listesi")) || []); setAlinma(Date.now()); }
    catch (e) { goster(hataMetni(e, "Masalar yüklenemedi."), 3500); }
  }
  useEffect(() => {
    yukle();
    const t = setInterval(() => { if (!document.hidden) yukle(); }, 8000);
    const s = setInterval(() => saniye((x) => x + 1), 1000);
    return () => { clearInterval(t); clearInterval(s); };
  }, []);
  async function otur(m) {
    if (mesgul) return;
    setMesgul(true);
    try { if (!m.benim) await rpc("bilardo_katil", { p_masa: m.id }); onMasa(m.id); } catch (e) { goster(hataMetni(e), 3500); }
    setMesgul(false);
  }
  async function hizli() {
    const l = liste || [];
    const benim = l.find((m) => m.benim);
    if (benim) return onMasa(benim.id);
    const bekleyen = l.find((m) => m.durum === "bekliyor" && (m.koltuklar || []).length === 1)
      || l.find((m) => m.durum === "bekliyor" && !(m.koltuklar || []).length)
      || l.find((m) => m.durum !== "bekliyor" && (m.koltuklar || []).some((k) => k.bot));
    if (bekleyen) return otur(bekleyen);
    goster("İki masa da dolu. Antrenman yapabilir ya da bir masayı izleyebilirsin.", 4000);
  }
  const gecen = (Date.now() - alinma) / 1000;
  return html`
    <button class="ok-hizli bl-hizli" disabled=${mesgul} onClick=${hizli}>
      <svg width="58" height="40" viewBox="0 0 58 40" aria-hidden="true"><${TopSvg} n=${8} x=${20} y=${20} r=${15} /><${TopSvg} n=${11} x=${42} y=${24} r=${11} /></svg>
      <div style="flex:1;text-align:left">
        <div class="ok-hb">Hızlı oyna</div>
        <div class="ok-hd">Boş masaya otur • rakip gelmezse ${30} sn sonra bot oynar</div>
      </div>
      <span class="ok-oynat"><svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true"><path d="M7 4v16l13-8z"></path></svg></span>
    </button>
    <div class="ok-bolum">MASALAR</div>
    <div class="bl-masalar">
      ${!liste && html`<div class="ok-bos">Yükleniyor…</div>`}
      ${(liste || []).map((m) => {
        const ks = m.koltuklar || [];
        const bot = ks.some((k) => k.bot);
        const bekle = m.bekleme_sn != null ? Math.max(0, Math.ceil(m.bekleme_sn - gecen)) : null;
        const [et, cls] = m.durum === "bekliyor"
          ? (!ks.length ? ["Boş • hemen otur", "bos"] : [`${bekle != null ? `Başlıyor ${bekle} sn • ` : ""}1 kişi bekliyor`, "bekl"])
          : m.durum === "bitti" ? [`Oyun ${m.oyun_no} bitti`, "bekl"] : [`Oyunda • Oyun ${m.oyun_no}`, "oyun"];
        const yerVar = m.durum === "bekliyor" ? ks.length < 2 : bot;
        const [btn, bcls] = m.benim ? ["Dön", "mavi"] : yerVar ? ["Otur", "yesil"] : ["İzle", "gri"];
        return html`
          <div key=${m.id} class="bl-kart">
            <div class="bl-kbas"><b>${m.ad}</b><span class=${"bl-et " + cls}>${et}</span></div>
            <${MiniMasa} toplar=${m.durum === "bekliyor" ? ucgenOnizleme : m.toplar} />
            <div class="bl-kalt">
              ${[0, 1].map((i) => {
                const k = ks.find((x) => x.koltuk === i);
                return html`${i === 1 && html`<span class="bl-vs">VS</span>`}
                  ${k ? html`<div class="bl-oy"><div class="ok-kc" style=${`background:${k.bot ? "#475569" : avRenk(k.ad)}`}>${k.bot ? "🤖" : harf(k.ad)}</div><span>${k.ad}</span>${k.skor > 0 && html`<em>${k.skor}</em>`}</div>`
                    : html`<div class="bl-oy"><div class="ok-kc bos">+</div><span class="soluk">Boş</span></div>`}`;
              })}
              <button class=${"bl-btn " + bcls} disabled=${mesgul} onClick=${() => (btn === "İzle" ? onMasa(m.id) : otur(m))}>${btn}</button>
            </div>
          </div>`;
      })}
    </div>
    <button class="bl-antrenman" onClick=${onAntrenman}>
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19" fill="none" stroke="#F87171" stroke-width="3" /><circle cx="22" cy="22" r="11" fill="none" stroke="#F87171" stroke-width="3" /><${TopSvg} n=${0} x=${22} y=${22} r=${6} /></svg>
      <div style="flex:1;text-align:left"><b>Antrenman</b><span>Tek başına vuruş çalış • süre yok, puan yok</span></div>
      <span class="bl-btn mavi">Başla</span>
    </button>
    <div class="bl-kural">
      <b>Nasıl oynanır?</b>
      <span>1’e 1, 8 top. İlk soktuğun topa göre düz (1-7) ya da çizgili (9-15) grubunu alırsın. Kendi toplarını bitir, en son 8’i sok.</span>
      <span>Nişan: masaya dokunup sürükle • ince ayar: sağdaki tekerlek • vuruş: soldaki gücü aşağı çekip bırak.</span>
      <span>Faul (beyaz cebe girerse, hiçbir topa değmezse ya da önce rakibin topuna vurursan) rakip beyazı istediği yere koyar. 8’i erken sokan kaybeder. Vuruş süresi 30 sn.</span>
    </div>
    <${Bildirim} metin=${toast} />`;
}
const ucgenOnizleme = (() => { const t = ucgen(); return t; })();

// ---------------------------------------------------------------------------
// Çizim
// ---------------------------------------------------------------------------
function masaCiz(q) {
  const c = document.createElement("canvas");
  c.width = Math.round(SW * q); c.height = Math.round(SH * q);
  const x = c.getContext("2d");
  x.scale(q, q);
  const ox = FX - RT, oy = FY - RT, ow = FW + 2 * RT, oh = FH + 2 * RT;
  // gölge + ahşap bant
  x.fillStyle = "rgba(0,0,0,.45)"; yuvarlak(x, ox + 4, oy + 8, ow, oh, 18); x.fill();
  let g = x.createLinearGradient(0, oy, 0, oy + oh);
  g.addColorStop(0, "#9A6634"); g.addColorStop(0.5, "#6B3F1D"); g.addColorStop(1, "#4A2A12");
  x.fillStyle = g; yuvarlak(x, ox, oy, ow, oh, 18); x.fill();
  x.strokeStyle = "rgba(255,255,255,.16)"; x.lineWidth = 1.2; yuvarlak(x, ox + 2.5, oy + 2.5, ow - 5, oh - 5, 15); x.stroke();
  // bant lastiği
  x.fillStyle = "#0E5A3A"; yuvarlak(x, FX - 6, FY - 6, FW + 12, FH + 12, 6); x.fill();
  // çuha
  g = x.createRadialGradient(FX + FW / 2, FY + FH * 0.45, 10, FX + FW / 2, FY + FH / 2, FW * 0.62);
  g.addColorStop(0, "#21945F"); g.addColorStop(0.7, "#147049"); g.addColorStop(1, "#0D5236");
  x.fillStyle = g; x.fillRect(FX, FY, FW, FH);
  // başlama çizgisi + ayak noktası
  x.strokeStyle = "rgba(255,255,255,.16)"; x.lineWidth = 1;
  x.beginPath(); x.moveTo(FX + BAS_CIZGI * K, FY); x.lineTo(FX + BAS_CIZGI * K, FY + FH); x.stroke();
  x.fillStyle = "rgba(255,255,255,.3)"; x.beginPath(); x.arc(FX + 750 * K, FY + 250 * K, 1.8, 0, 7); x.fill();
  // DYB
  x.fillStyle = "rgba(255,255,255,.055)"; x.font = "900 34px Inter, system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText("D Y B", FX + FW / 2, FY + FH / 2);
  // elmaslar
  x.fillStyle = "#E8D7B5";
  for (let i = 1; i < 8; i++) if (i !== 4) { const dx = FX + (FW * i) / 8; nokta(x, dx, oy + RT / 2 - 1); nokta(x, dx, oy + oh - RT / 2 + 1); }
  for (let i = 1; i < 4; i++) { const dy = FY + (FH * i) / 4; nokta(x, ox + RT / 2 - 1, dy); nokta(x, ox + ow - RT / 2 + 1, dy); }
  // cepler
  const cep = [[FX - 2, FY - 2, 13], [FX + FW / 2, FY - 7, 11.5], [FX + FW + 2, FY - 2, 13], [FX - 2, FY + FH + 2, 13], [FX + FW / 2, FY + FH + 7, 11.5], [FX + FW + 2, FY + FH + 2, 13]];
  for (const [cx, cy, r] of cep) {
    x.fillStyle = "#2B1A0C"; x.beginPath(); x.arc(cx, cy, r + 3, 0, 7); x.fill();
    const pg = x.createRadialGradient(cx, cy, 1, cx, cy, r);
    pg.addColorStop(0, "#000"); pg.addColorStop(1, "#141414");
    x.fillStyle = pg; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  }
  return c;
}
function nokta(x, a, b) { x.beginPath(); x.arc(a, b, 1.7, 0, 7); x.fill(); }
function yuvarlak(x, a, b, w, h, r) {
  x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
}
function topSprite(n, q) {
  const r = R * K, c = document.createElement("canvas");
  const s = Math.ceil((2 * r + 2) * q);
  c.width = s; c.height = s;
  const x = c.getContext("2d");
  x.scale(q, q);
  const m = r + 1;
  const renk = n === 0 ? "#F7F5EE" : TOP_RENK[n > 8 ? n - 8 : n];
  x.save(); x.beginPath(); x.arc(m, m, r, 0, 7); x.clip();
  if (n > 8) { x.fillStyle = "#F7F5EE"; x.fillRect(0, 0, 2 * m, 2 * m); x.fillStyle = renk; x.fillRect(0, m - r * 0.55, 2 * m, r * 1.1); }
  else { x.fillStyle = renk; x.fillRect(0, 0, 2 * m, 2 * m); }
  if (n > 0) {
    x.fillStyle = "#F7F5EE"; x.beginPath(); x.arc(m, m, r * 0.5, 0, 7); x.fill();
    x.fillStyle = "#111"; x.font = `800 ${r * 0.64}px Rubik, Inter, system-ui, sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(String(n), m, m + r * 0.05);
  }
  const g = x.createRadialGradient(m - r * 0.35, m - r * 0.4, r * 0.05, m, m, r * 1.05);
  g.addColorStop(0, "rgba(255,255,255,.9)"); g.addColorStop(0.28, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(0,0,0,.42)");
  x.fillStyle = g; x.fillRect(0, 0, 2 * m, 2 * m);
  x.restore();
  return c;
}

// ---------------------------------------------------------------------------
// Masa (çevrim içi) ve Antrenman
// ---------------------------------------------------------------------------
export function BilardoMasa({ rpc, masaId, onLobi, antrenman = false }) {
  const [d, setD] = useState(antrenman ? yeniAntrenman() : null);
  const [alinma, setAlinma] = useState(Date.now());
  const [, tik] = useState(0);
  const [mesgul, setMesgul] = useState(false);
  const [kalkSor, setKalkSor] = useState(false);
  const [sesOn, setSesOn] = useState(sesAcikMi());
  const [guc, setGuc] = useState(0);
  const [efekt, setEfekt] = useState({ ex: 0, ey: 0 });
  const [efektAc, setEfektAc] = useState(false);
  const [oynuyor, setOynuyor] = useState(false);       // animasyon sürüyor
  const [olay, setOlay] = useState(null);               // masanın üstündeki kısa yazı
  const [bittiGizle, setBittiGizle] = useState(false);
  const [toast, goster] = useToast();
  const dis = useRef(null), sahne = useRef(null), tuval = useRef(null);
  const fit = useSigdir(dis, !!d);
  const dRef = useRef(d), istek = useRef(false), sayac = useRef(0), sonTik = useRef(null);
  const goruntu = useRef(d ? d.toplar : []);           // çizilen toplar [[n,x,y]]
  const nisan = useRef([1, 0]);                         // yön vektörü
  const elde = useRef(null);                            // top eldeyken beyazın yeri [x,y] (birim)
  const anim = useRef(null);
  const kirli = useRef(true);
  const gosterilen = useRef(null);                      // ekranda gösterilen son atış no
  const gucRef = useRef(0);
  const surukle = useRef(null);
  const botZaman = useRef(0), botNisan = useRef(null);
  const sprite = useRef({ q: 0, masa: null, top: {} });
  const sayim = useRef({ atis: 0, giren: 0 });          // antrenman

  // ---------- sunucu ----------
  async function getir(tam = false) {
    if (antrenman || istek.current) return;
    istek.current = true;
    try {
      const o = dRef.current;
      sayac.current++;
      const kisa = !tam && o && sayac.current % 10 !== 0;
      const x = await rpc("bilardo_durum", kisa ? { p_masa: masaId, p_surum: o.surum } : { p_masa: masaId });
      const yeni = x.ayni ? { ...o, kalan_sn: x.kalan_sn, bekleme_sn: x.bekleme_sn } : x;
      dRef.current = yeni; setD(yeni); setAlinma(Date.now());
    } catch (e) {
      const m = hataMetni(e, "Masaya bağlanılamadı.");
      if (/bulunamadı/.test(m)) setTimeout(onLobi, 1000); else goster(m, 3000);
    }
    istek.current = false;
  }
  useEffect(() => {
    if (antrenman) return;
    let dur = false, zaman = 0;
    const dongu = async () => {
      if (dur) return;
      if (!document.hidden) await getir();
      zaman = setTimeout(dongu, 1000);
    };
    dongu();
    return () => { dur = true; clearTimeout(zaman); };
  }, [masaId]);
  useEffect(() => { const s = setInterval(() => tik((x) => x + 1), 250); return () => clearInterval(s); }, []);

  // ---------- yeni durum geldi: atışı tekrar oynat ya da yerleştir ----------
  function isle() {
    const x = dRef.current;
    if (!x || anim.current) return;
    if (gosterilen.current == null) gosterilen.current = x.son_atis ? x.son_atis.no : -1;
    const sa = x.son_atis;
    if (sa && sa.no > gosterilen.current && sa.once && sa.atis && !sa.pas) {
      gosterilen.current = sa.no;
      oynat(sa.once, simule(sa.once, sa.atis), sa.atis, () => { goruntu.current = dRef.current.toplar; elde.current = null; kirli.current = true; isle(); });
      return;
    }
    if (sa && sa.no > gosterilen.current) gosterilen.current = sa.no;
    goruntu.current = x.toplar || [];
    kirli.current = true;
  }
  useEffect(() => { isle(); }, [d?.surum, d?.atis_no, d?.durum]);

  // ---------- olaylar / sesler ----------
  const oncekiD = useRef(null);
  useEffect(() => {
    if (!d || antrenman) return;
    const o = oncekiD.current; oncekiD.current = d;
    if (!o || o.id !== d.id) return;
    if (d.son_olay && d.son_olay !== o.son_olay) { setOlay(d.son_olay); clearTimeout(olayZaman.current); olayZaman.current = setTimeout(() => setOlay(null), 3500); }
    const ben = d.benim_koltuk;
    if (d.durum === "oynaniyor" && o.durum !== "oynaniyor") { cal("karis", 0.6); setBittiGizle(false); }
    if (d.durum === "bitti" && o.durum === "oynaniyor") setTimeout(() => cal(d.kazanan === ben ? "kazan" : "bitti"), 400);
    if (ben != null && d.durum === "oynaniyor" && d.sira === ben && !(o.sira === ben && o.durum === "oynaniyor")) setTimeout(() => cal("sira", 0.7), 300);
  }, [d?.surum]);
  const olayZaman = useRef(0);

  // ---------- durum özetleri ----------
  const ben = d ? d.benim_koltuk : null;
  const oturuyor = ben != null;
  const ks = (d && d.koltuklar) || [];
  const siradaki = d && ks.find((k) => k.koltuk === d.sira);
  const benimSiram = !!d && d.durum === "oynaniyor" && oturuyor && d.sira === ben && !oynuyor && !mesgul;
  const botSirasi = !!d && !antrenman && d.durum === "oynaniyor" && oturuyor && siradaki && siradaki.bot && !oynuyor && !mesgul;
  const eldeMod = benimSiram && d.top_elde;

  // sıra bana geldi: nişanı en yakın uygun topa çevir, beyaz eldeyse yerini hazırla
  const siraAnahtar = d ? `${d.atis_no}-${d.sira}` : "";
  useEffect(() => {
    if (!benimSiram) return;
    const t = goruntu.current;
    const beyaz = t.find(([n]) => n === 0) || [0, 250, 250];
    if (d.top_elde) {
      let [x, y] = [beyaz[1], beyaz[2]];
      if (d.kirilis) { x = Math.min(x, 230); }
      if (!koyulabilir(t, x, y, d.kirilis)) {
        const yer = [[230, 250], [200, 200], [200, 300], [150, 250], [500, 250], [250, 100], [250, 400]].find(([a, b]) => koyulabilir(t, a, b, d.kirilis));
        if (yer) [x, y] = yer;
      }
      elde.current = [x, y];
    } else elde.current = null;
    const [bx, by] = elde.current || [beyaz[1], beyaz[2]];
    const benimGrup = ks.find((k) => k.koltuk === ben)?.grup;
    const kalan = t.filter(([n]) => kendiMi(benimGrup, n)).length;
    const hedefler = t.filter(([n]) => n !== 0 && (d.kirilis ? true : benimGrup ? (kalan ? kendiMi(benimGrup, n) : n === 8) : n !== 8));
    let en = null, ed = Infinity;
    for (const h of hedefler) { const dd = (h[1] - bx) ** 2 + (h[2] - by) ** 2; if (dd < ed) { ed = dd; en = h; } }
    if (d.kirilis) en = [1, 750, 250];
    if (en) { const dx = en[1] - bx, dy = en[2] - by, L = Math.hypot(dx, dy) || 1; nisan.current = [dx / L, dy / L]; }
    setEfekt({ ex: 0, ey: 0 });
    kirli.current = true;
  }, [benimSiram, siraAnahtar]);

  // ---------- 🤖 bot (rakip bot ise atışını bu telefon hesaplar) ----------
  useEffect(() => {
    if (!botSirasi) { botNisan.current = null; return; }
    const no = d.atis_no;
    clearTimeout(botZaman.current);
    botZaman.current = setTimeout(() => {
      const x = dRef.current;
      if (!x || x.atis_no !== no || anim.current) return;
      const k = (x.koltuklar || []).find((y) => y.koltuk === x.sira);
      const a = botAtis(x.toplar, k?.grup || null, x.kirilis, x.top_elde);
      botNisan.current = a; kirli.current = true;
      botZaman.current = setTimeout(() => { botNisan.current = null; vur(a, true); }, 900);
    }, 900);
    return () => clearTimeout(botZaman.current);
  }, [botSirasi, d?.atis_no]);

  // ---------- atış ----------
  function oynat(once, sim, atis, sonra) {
    anim.current = { once, sim, t0: performance.now(), oi: 0, sonra };
    setOynuyor(true);
    cal("b_istaka", 0.25 + 0.75 * (atis.g || 0.5));
    kirli.current = true;
  }
  async function vur(atis, botIcin = false) {
    const x = dRef.current;
    if (!x || anim.current) return;
    const once = (x.toplar || goruntu.current).map((t) => (t[0] === 0 && atis.bx != null ? [0, atis.bx, atis.by] : t));
    const sim = simule(x.toplar || goruntu.current, atis);
    if (antrenman) {
      sayim.current.atis++;
      sayim.current.giren += sim.sonuc.cebe.filter((n) => n !== 0).length;
      oynat(once, sim, atis, () => {
        const s = sim.sonuc;
        let toplar = s.toplar.slice();
        const beyazGirdi = s.cebe.includes(0);
        if (beyazGirdi) toplar.push([0, 250, 250]);
        const sekiz = s.cebe.includes(8);
        if (sekiz && toplar.some(([n]) => n !== 0)) toplar.push([8, 750, 250]);
        const yeni = { ...dRef.current, toplar, top_elde: beyazGirdi, kirilis: false, atis_no: dRef.current.atis_no + 1, surum: dRef.current.surum + 1 };
        if (beyazGirdi) { setOlay("Beyaz cebe girdi • beyazı istediğin yere koy"); setTimeout(() => setOlay(null), 2500); }
        dRef.current = yeni; goruntu.current = toplar; elde.current = null; setD(yeni);
      });
      return;
    }
    gosterilen.current = x.atis_no;
    setMesgul(true);
    // animasyon ve sunucu cevabı ikisi de bitince sunucudaki son dizilişe geç
    let animBitti = false, cevapGeldi = false;
    oynat(once, sim, atis, () => { animBitti = true; kirli.current = true; if (cevapGeldi) isle(); });
    try {
      await rpc("bilardo_atis", { p_masa: masaId, p_atis_no: x.atis_no, p_atis: atis, p_sonuc: sim.sonuc });
    } catch (e) {
      if (!botIcin) { cal("hata", 0.5); goster(hataMetni(e), 3500); }
    }
    istek.current = false;
    await getir(true);
    cevapGeldi = true;
    if (animBitti) isle();
    setMesgul(false);
  }
  function atisYap(g) {
    if (!benimSiram) return;
    const [vx, vy] = nisan.current;
    const atis = { vx, vy, g: Math.round(g * 1000) / 1000, ex: efekt.ex, ey: efekt.ey };
    if (d.top_elde && elde.current) { atis.bx = Math.round(elde.current[0] * 100) / 100; atis.by = Math.round(elde.current[1] * 100) / 100; }
    vur(atis);
  }

  // ---------- çizim döngüsü ----------
  useEffect(() => {
    let dur = false, raf = 0;
    const kare = (simdi) => {
      if (dur) return;
      raf = requestAnimationFrame(kare);
      const c = tuval.current;
      if (!c) return;
      const q = Math.min(3, (window.devicePixelRatio || 1) * (fit.s || 1));
      if (Math.abs(sprite.current.q - q) > 0.01) {
        sprite.current = { q, masa: masaCiz(q), top: {} };
        c.width = Math.round(SW * q); c.height = Math.round(SH * q);
        kirli.current = true;
      }
      const a = anim.current;
      const nabiz = (eldeMod && !a) || botNisan.current;
      if (!a && !kirli.current && !nabiz) return;
      kirli.current = false;
      const ctx = c.getContext("2d");
      ctx.setTransform(q, 0, 0, q, 0, 0);
      ctx.clearRect(0, 0, SW, SH);
      ctx.drawImage(sprite.current.masa, 0, 0, SW, SH);
      let toplar = goruntu.current;
      if (a) {
        const kareler = a.sim.kareler;
        const i = Math.max(0, Math.min(kareler.length - 1, Math.floor((simdi - a.t0) / (1000 / 60))));
        const f = kareler[i];
        toplar = [];
        a.sim.sira.forEach((n, j) => { if (!f[j * 3 + 2]) toplar.push([n, f[j * 3], f[j * 3 + 1]]); });
        // sesler
        const son = {};
        while (a.oi < a.sim.olaylar.length && a.sim.olaylar[a.oi].k <= i) {
          const o = a.sim.olaylar[a.oi++];
          if (son[o.tur]) continue;
          son[o.tur] = 1;
          if (o.tur === "top") cal("b_top", Math.max(0.12, o.s));
          else if (o.tur === "bant") cal("b_bant", Math.max(0.1, o.s * 0.7));
          else if (o.tur === "cep") cal("b_cep", 0.9);
        }
        if (i >= kareler.length - 1) {
          anim.current = null;
          goruntu.current = toplar;
          setOynuyor(false);
          a.sonra && a.sonra();
        }
      }
      // beyaz eldeyse
      const elde0 = !a && eldeMod && elde.current;
      const cizilecek = elde0 ? toplar.map((t) => (t[0] === 0 ? [0, elde.current[0], elde.current[1]] : t)) : toplar;
      // gölgeler, toplar
      ctx.fillStyle = "rgba(0,0,0,.33)";
      for (const [, x, y] of cizilecek) { const [sx, sy] = ekran(x, y); ctx.beginPath(); ctx.ellipse(sx + 2, sy + 2.6, R * K, R * K * 0.82, 0, 0, 7); ctx.fill(); }
      const r = R * K;
      for (const [n, x, y] of cizilecek) {
        let sp = sprite.current.top[n];
        if (!sp) sp = sprite.current.top[n] = topSprite(n, sprite.current.q);
        const [sx, sy] = ekran(x, y);
        ctx.drawImage(sp, sx - r - 1, sy - r - 1, 2 * r + 2, 2 * r + 2);
      }
      // nişan ve ıstaka (benim sıram ya da botun nişanı)
      const bn = botNisan.current;
      if (!a && (benimSiram || bn)) {
        const beyaz = cizilecek.find(([n]) => n === 0);
        if (beyaz) {
          let bx = beyaz[1], by = beyaz[2];
          if (bn && bn.bx != null) { bx = bn.bx; by = bn.by; }
          const [dx, dy] = bn ? [bn.vx, bn.vy] : nisan.current;
          if (!bn) nisanCiz(ctx, cizilecek, bx, by, dx, dy);
          const cekme = bn ? 0.5 : gucRef.current;
          istakaCiz(ctx, bx, by, dx, dy, cekme);
          if (elde0) {
            const [sx, sy] = ekran(bx, by);
            const gecerli = koyulabilir(toplar, bx, by, d.kirilis);
            ctx.strokeStyle = gecerli ? "rgba(255,255,255,.9)" : "#F87171"; ctx.lineWidth = 1.6;
            ctx.setLineDash([3, 3]); ctx.lineDashOffset = -simdi / 60;
            ctx.beginPath(); ctx.arc(sx, sy, r + 6, 0, 7); ctx.stroke(); ctx.setLineDash([]);
          }
        }
      }
    };
    raf = requestAnimationFrame(kare);
    return () => { dur = true; cancelAnimationFrame(raf); };
  });

  function nisanCiz(ctx, toplar, bx, by, dx, dy) {
    const iz = nisanIzi(toplar, bx, by, dx, dy);
    const [sx, sy] = ekran(bx, by), [gx, gy] = ekran(iz.gx, iz.gy);
    ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1.3; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(gx, gy); ctx.stroke(); ctx.setLineDash([]);
    if (iz.tur === "top") {
      const r = R * K;
      const benimGrup = ks.find((k) => k.koltuk === ben)?.grup;
      const kalan = goruntu.current.filter(([n]) => kendiMi(benimGrup, n)).length;
      const n = iz.hedef[0];
      const yanlis = d && !d.kirilis && (benimGrup ? (kalan ? !kendiMi(benimGrup, n) : n !== 8) : n === 8);
      ctx.strokeStyle = yanlis ? "#F87171" : "rgba(255,255,255,.9)"; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(gx, gy, r, 0, 7); ctx.stroke();
      if (yanlis) { ctx.beginPath(); ctx.moveTo(gx - r * 0.6, gy - r * 0.6); ctx.lineTo(gx + r * 0.6, gy + r * 0.6); ctx.moveTo(gx + r * 0.6, gy - r * 0.6); ctx.lineTo(gx - r * 0.6, gy + r * 0.6); ctx.stroke(); }
      else {
        const [hx, hy] = ekran(iz.hedef[1], iz.hedef[2]);
        const L = 25 + 85 * Math.max(0, iz.kesme);
        ctx.strokeStyle = "rgba(250,204,21,.95)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + iz.nx * L, hy + iz.ny * L); ctx.stroke();
        const L2 = 10 + 45 * (1 - Math.max(0, iz.kesme));
        ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + iz.sx * L2, gy + iz.sy * L2); ctx.stroke(); ctx.setLineDash([]);
      }
    } else {
      ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.arc(gx, gy, 2.5, 0, 7); ctx.fill();
    }
  }
  function istakaCiz(ctx, bx, by, dx, dy, cekme) {
    const [sx, sy] = ekran(bx, by);
    const bosluk = R * K + 3 + cekme * 70;
    const ax = sx - dx * bosluk, ay = sy - dy * bosluk;
    const ex = ax - dx * 330, ey = ay - dy * 330;
    const g = ctx.createLinearGradient(ax, ay, ex, ey);
    g.addColorStop(0, "#2E7DD7"); g.addColorStop(0.012, "#2E7DD7"); g.addColorStop(0.013, "#F3E9D2"); g.addColorStop(0.035, "#F3E9D2");
    g.addColorStop(0.036, "#D9B47A"); g.addColorStop(0.6, "#B98545"); g.addColorStop(0.61, "#2A1A0C"); g.addColorStop(0.64, "#C9A227"); g.addColorStop(0.65, "#3B2412"); g.addColorStop(1, "#1E120A");
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(ax + 3, ay + 5); ctx.lineTo(ex + 3, ey + 5); ctx.stroke();
    ctx.strokeStyle = g; ctx.lineWidth = 5.5;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.lineCap = "butt";
  }

  // ---------- dokunma ----------
  function sahneNoktasi(cx, cy) {
    const r = sahne.current.getBoundingClientRect();
    return fit.rot ? { x: (cy - r.top) / fit.s, y: (r.right - cx) / fit.s } : { x: (cx - r.left) / fit.s, y: (cy - r.top) / fit.s };
  }
  function masaBas(e) {
    if (!benimSiram) return;
    e.preventDefault();
    const p = sahneNoktasi(e.clientX, e.clientY);
    const [ux, uy] = birimden(p.x, p.y);
    const beyaz = goruntu.current.find(([n]) => n === 0);
    const [bx, by] = elde.current || (beyaz ? [beyaz[1], beyaz[2]] : [250, 250]);
    if (d.top_elde && elde.current && (ux - bx) ** 2 + (uy - by) ** 2 < (R * 3.2) ** 2) {
      surukle.current = { tur: "beyaz", son: [bx, by] };
    } else {
      surukle.current = { tur: "nisan" };
      nisanla(ux, uy);
    }
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* */ }
  }
  function nisanla(ux, uy) {
    const beyaz = goruntu.current.find(([n]) => n === 0);
    const [bx, by] = elde.current || (beyaz ? [beyaz[1], beyaz[2]] : [250, 250]);
    const dx = ux - bx, dy = uy - by, L = Math.hypot(dx, dy);
    if (L > 4) { nisan.current = [dx / L, dy / L]; kirli.current = true; }
  }
  function masaKay(e) {
    const s = surukle.current;
    if (!s || !benimSiram) return;
    const p = sahneNoktasi(e.clientX, e.clientY);
    const [ux, uy] = birimden(p.x, p.y);
    if (s.tur === "nisan") nisanla(ux, uy);
    else {
      const [x, y] = konumSinirla(ux, uy, d.kirilis);
      elde.current = [x, y];
      if (koyulabilir(goruntu.current, x, y, d.kirilis)) s.son = [x, y];
      kirli.current = true;
    }
  }
  function masaBirak() {
    const s = surukle.current;
    surukle.current = null;
    if (s && s.tur === "beyaz") { elde.current = s.son; kirli.current = true; }
  }
  // ince ayar tekerleği
  const teker = useRef(null);
  function tekerBas(e) { if (!benimSiram) return; e.preventDefault(); teker.current = sahneNoktasi(e.clientX, e.clientY).y; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* */ } }
  function tekerKay(e) {
    if (teker.current == null) return;
    const y = sahneNoktasi(e.clientX, e.clientY).y;
    const a = (y - teker.current) * 0.0022;
    teker.current = y;
    const [dx, dy] = nisan.current, c = Math.cos(a), s = Math.sin(a);
    const nx = dx * c - dy * s, ny = dx * s + dy * c, L = Math.hypot(nx, ny);
    nisan.current = [nx / L, ny / L];
    setTekerOfs((o) => (o + a / 0.0022) % 12);
    kirli.current = true;
  }
  const [tekerOfs, setTekerOfs] = useState(0);
  // güç çubuğu: aşağı çek, bırak
  const gucBas = useRef(null);
  function gucBasla(e) {
    if (!benimSiram) return;
    e.preventDefault();
    gucBas.current = sahneNoktasi(e.clientX, e.clientY).y;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* */ }
  }
  function gucKay(e) {
    if (gucBas.current == null) return;
    const g = Math.max(0, Math.min(1, (sahneNoktasi(e.clientX, e.clientY).y - gucBas.current) / 210));
    gucRef.current = g; setGuc(g); kirli.current = true;
  }
  function gucBirak() {
    if (gucBas.current == null) return;
    gucBas.current = null;
    const g = gucRef.current;
    gucRef.current = 0; setGuc(0); kirli.current = true;
    if (g > 0.03) atisYap(g);
  }

  async function cagir(ad, arg, sonra) {
    if (mesgul) return;
    setMesgul(true);
    try { await rpc(ad, arg); if (sonra) sonra(); istek.current = false; await getir(true); } catch (e) { goster(hataMetni(e), 3500); }
    setMesgul(false);
  }

  if (!d) return html`<div class="ok-masa-dis bl-masa" ref=${dis}><div class="ok-yukleniyor">Masaya bağlanılıyor…</div></div>`;

  // ---------- görünüm ----------
  const kalan = d.kalan_sn == null ? null : Math.max(0, d.kalan_sn - (Date.now() - alinma) / 1000);
  const oran = kalan == null || antrenman ? null : Math.min(1, kalan / (d.atis_sn || 30));
  const sn = benimSiram && kalan != null && !antrenman ? Math.ceil(kalan) : null;
  if (sn != null && sn <= 5 && sn >= 1 && sonTik.current !== sn) { sonTik.current = sn; cal("sure", 0.5); }
  const bekle = d.bekleme_sn != null ? Math.max(0, Math.ceil(d.bekleme_sn - (Date.now() - alinma) / 1000)) : null;
  const masadaki = goruntu.current || [];
  const oyuncu = (koltuk) => {
    const k = ks.find((x) => x.koltuk === koltuk);
    if (!k) return null;
    const aktif = d.durum === "oynaniyor" && d.sira === koltuk;
    const kalanTop = k.grup ? masadaki.filter(([n]) => kendiMi(k.grup, n)).map(([n]) => n).sort((a, b) => a - b) : [];
    const sekizde = k.grup && !kalanTop.length;
    return html`
      <div class=${"bl-oyuncu" + (aktif ? " aktif" : "") + (koltuk === 1 ? " sag" : "")}>
        ${aktif && oran != null ? html`<${Avatar} ad=${k.ad} bot=${k.bot} size=${28} halka=${oran} />` : html`<${Avatar} ad=${k.ad} bot=${k.bot} size=${28} />`}
        <div class="bl-obilgi">
          <b>${k.ad}${!k.bot && !k.cevrimici ? " • çevrimdışı" : ""}${k.skor ? html` <em>${k.skor}</em>` : ""}</b>
          ${k.grup ? html`<svg class="bl-kalan" width=${Math.max(1, (sekizde ? 1 : kalanTop.length)) * 12} height="12" aria-label=${GRUP_AD[k.grup]}>
              ${(sekizde ? [8] : kalanTop).map((n, i) => html`<${TopSvg} key=${n} n=${n} x=${6 + i * 12} y=${6} r=${5.2} />`)}</svg>`
            : html`<span>${d.durum === "oynaniyor" ? "Açık masa" : ""}</span>`}
        </div>
      </div>`;
  };
  const durumYazi = antrenman ? (d.top_elde ? "Beyazı sürükleyip yerleştir, sonra vur" : "Antrenman • nişan al, gücü çekip bırak")
    : !oturuyor ? "👀 İzliyorsun"
    : d.durum !== "oynaniyor" ? ""
    : oynuyor ? "" : benimSiram ? (d.top_elde ? "Top elinde • beyazı sürükle, nişan al, vur" : `Sıra sende${sn != null ? ` • ${sn} sn` : ""}`)
    : `Sıra ${siradaki?.ad || ""}'de`;

  return html`
    <div class="ok-masa-dis bl-masa" ref=${dis}>
      <div class="ok-sahne" ref=${sahne} style=${`transform:${fit.rot ? "rotate(90deg) " : ""}scale(${fit.s})`}>
        <canvas class="bl-tuval" ref=${tuval} width=${SW} height=${SH}
          onPointerDown=${masaBas} onPointerMove=${masaKay} onPointerUp=${masaBirak} onPointerCancel=${masaBirak}></canvas>

        <div class="ok-cubuk bl-cubuk">
          <button class="ok-cgeri" aria-label="Salona dön" onClick=${onLobi}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18 9 12l6-6"></path></svg>
          </button>
          <div class="ok-cad">${antrenman ? "🎯 Antrenman" : d.ad}${!antrenman && d.oyun_no > 0 ? html` <span class="bl-ono">Oyun ${d.oyun_no}</span>` : ""}</div>
          <div class="bl-oyuncular">
            ${antrenman ? html`<div class="bl-ant-say"><b>${sayim.current.atis}</b> atış • <b>${sayim.current.giren}</b> top soktun • kalan <b>${masadaki.filter(([n]) => n !== 0).length}</b></div>`
              : html`${oyuncu(0) || html`<div class="bl-oyuncu bos">Bekleniyor</div>`}<span class="bl-vs">VS</span>${oyuncu(1) || html`<div class="bl-oyuncu bos sag">Bekleniyor</div>`}`}
          </div>
          <button class="ok-cses" aria-label=${sesOn ? "Sesi kapat" : "Sesi aç"} onClick=${() => { const y = !sesOn; setSesOn(y); sesAyarla(y); }}>${sesOn ? "🔊" : "🔇"}</button>
          ${!antrenman && html`<${MasaSohbet} rpc=${rpc} oyun="bilardo" masaId=${masaId} oturuyor=${oturuyor} goster=${goster} />`}
          ${antrenman ? html`<button class="ok-ckalk" onClick=${() => { sayim.current = { atis: 0, giren: 0 }; const y = yeniAntrenman(); dRef.current = y; goruntu.current = y.toplar; setD(y); }}>Yeniden diz</button>`
            : oturuyor ? html`<button class="ok-ckalk" onClick=${() => setKalkSor(true)}>Kalk</button>`
            : d.durum !== "bekliyor" && ks.some((k) => k.bot) && html`<button class="ok-ckalk yesil" onClick=${() => cagir("bilardo_katil", { p_masa: masaId })}>Otur</button>`}
        </div>

        <!-- güç -->
        <div class=${"bl-guc" + (benimSiram ? "" : " kapali")} onPointerDown=${gucBasla} onPointerMove=${gucKay} onPointerUp=${gucBirak} onPointerCancel=${gucBirak}>
          <div class="bl-guc-ic"><i style=${`height:${guc * 100}%`}></i><span class="bl-guc-ok">▼</span></div>
          <div class="bl-guc-yazi">${guc > 0 ? Math.round(guc * 100) + "%" : "GÜÇ"}</div>
        </div>
        <!-- ince ayar + efekt -->
        <div class=${"bl-teker" + (benimSiram ? "" : " kapali")} onPointerDown=${tekerBas} onPointerMove=${tekerKay}
          onPointerUp=${() => (teker.current = null)} onPointerCancel=${() => (teker.current = null)}>
          <div class="bl-teker-cizgi" style=${`background-position-y:${tekerOfs}px`}></div>
        </div>
        <div class="bl-teker-yazi">İNCE AYAR</div>
        <button class=${"bl-efekt" + (benimSiram ? "" : " kapali")} aria-label="Efekt" onClick=${() => benimSiram && setEfektAc(true)}>
          <i style=${`left:${50 + efekt.ex * 34}%;top:${50 + efekt.ey * -34}%`}></i>
        </button>
        <div class="bl-efekt-yazi">EFEKT</div>

        ${(olay || durumYazi) && d.durum !== "bekliyor" && html`<div class=${"bl-durum" + (olay ? " olay" : benimSiram ? " sende" : "")}>${olay || durumYazi}</div>`}

        ${efektAc && html`
          <div class="ok-kaplama" onClick=${(e) => { if (e.target === e.currentTarget) setEfektAc(false); }}>
            <div class="ok-kutu bl-efekt-kutu">
              <div class="ok-kbas">Efekt</div>
              <div class="ok-kalt">Beyaz topun neresine vurulacağını seç: üst = ileri gider, alt = geri döner, yanlar = bant dönüşü.</div>
              <div class="bl-efekt-buyuk" onPointerDown=${(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const p0 = sahneNoktasi(e.clientX, e.clientY);
                const merkez = sahneNoktasi(r.left + r.width / 2, r.top + r.height / 2);
                const yaricap = 60;
                let ex = (p0.x - merkez.x) / yaricap, ey = -(p0.y - merkez.y) / yaricap;
                const L = Math.hypot(ex, ey); if (L > 1) { ex /= L; ey /= L; }
                setEfekt({ ex: Math.round(ex * 100) / 100, ey: Math.round(ey * 100) / 100 });
              }}>
                <i style=${`left:${50 + efekt.ex * 40}%;top:${50 - efekt.ey * 40}%`}></i>
              </div>
              <div class="ok-pbtn" style="justify-content:center">
                <button class="ok-kbtn gri" onClick=${() => setEfekt({ ex: 0, ey: 0 })}>Ortala</button>
                <button class="ok-kbtn yesil" onClick=${() => setEfektAc(false)}>Tamam</button>
              </div>
            </div>
          </div>`}

        ${d.durum === "bekliyor" && html`
          <div class="ok-kaplama"><div class="ok-kutu">
            <div class="ok-kbas">${d.ad}</div>
            <div class="ok-kalt">${bekle != null ? html`Rakip oturursa hemen başlar • <b class="ok-sayac">${bekle} sn</b> sonra bot oturup başlar` : "1'e 1 • 8 top • rakip bekleniyor"}</div>
            <div class="ok-bkolt" style="grid-template-columns:repeat(2,1fr)">
              ${[0, 1].map((i) => { const k = ks.find((x) => x.koltuk === i);
                return html`<div key=${i} class="ok-bk">${k ? html`<${Avatar} ad=${k.ad} bot=${k.bot} size=${44} />` : html`<div class="ok-av bosav">🤖</div>`}
                  <div class="ok-oad">${k ? k.ad : "Bekleniyor"}</div></div>`; })}
            </div>
            <div class="ok-pbtn" style="justify-content:center">
              ${!oturuyor && html`<button class="ok-kbtn yesil" disabled=${mesgul} onClick=${() => cagir("bilardo_katil", { p_masa: masaId })}>Otur</button>`}
              ${d.kuran_benim && html`<button class="ok-kbtn yesil buyuk" disabled=${mesgul} onClick=${() => cagir("bilardo_baslat", { p_masa: masaId })}>▶ Botla hemen başla</button>`}
              <button class="ok-kbtn gri" onClick=${onLobi}>Salona dön</button>
            </div>
          </div></div>`}

        ${d.durum === "bitti" && !oynuyor && !bittiGizle && html`
          <div class="ok-kaplama"><div class="ok-kutu bl-bitti">
            <div class="bl-kupa">${d.kazanan === ben ? "🏆" : oturuyor ? "🎱" : "🏁"}</div>
            <div class="ok-kbas" style=${d.kazanan === ben ? "color:#FACC15" : ""}>${d.kazanan === ben ? "Kazandın!" : oturuyor ? "Bu sefer olmadı" : `${ks.find((k) => k.koltuk === d.kazanan)?.ad || ""} kazandı`}</div>
            <div class="ok-kalt">${d.son_olay}</div>
            <div class="bl-skor">
              ${ks.map((k) => html`<div key=${k.koltuk} class=${k.koltuk === d.kazanan ? "kazanan" : ""}><${Avatar} ad=${k.ad} bot=${k.bot} size=${30} /><b>${k.ad}</b><em>${k.skor}</em></div>`)}
            </div>
            <div class="ok-pbtn" style="justify-content:center">
              ${oturuyor && html`<button class="ok-kbtn yesil buyuk" disabled=${mesgul} onClick=${() => cagir("bilardo_baslat", { p_masa: masaId })}>🔁 Rövanş</button>`}
              <button class="ok-kbtn gri" onClick=${() => setBittiGizle(true)}>Masaya bak</button>
              <button class="ok-kbtn gri" onClick=${onLobi}>Salona dön</button>
            </div>
          </div></div>`}
        ${d.durum === "bitti" && bittiGizle && html`<button class="ok-sonuc" onClick=${() => setBittiGizle(false)}>🏁 Sonuç</button>`}

        ${antrenman && !masadaki.some(([n]) => n !== 0) && !oynuyor && html`
          <div class="ok-kaplama"><div class="ok-kutu bl-bitti">
            <div class="bl-kupa">🎯</div>
            <div class="ok-kbas" style="color:#FACC15">Masa temizlendi!</div>
            <div class="ok-kalt">${sayim.current.atis} atışta bitirdin.</div>
            <div class="ok-pbtn" style="justify-content:center">
              <button class="ok-kbtn yesil buyuk" onClick=${() => { sayim.current = { atis: 0, giren: 0 }; const y = yeniAntrenman(); dRef.current = y; goruntu.current = y.toplar; setD(y); }}>Yeniden diz</button>
              <button class="ok-kbtn gri" onClick=${onLobi}>Salona dön</button>
            </div>
          </div></div>`}

        ${kalkSor && html`
          <${Pencere} baslik="Masadan kalkılsın mı?" onClose=${() => setKalkSor(false)}
            butonlar=${html`<button class="ok-kbtn gri" onClick=${() => setKalkSor(false)}>Vazgeç</button>
              <button class="ok-kbtn" onClick=${() => { setKalkSor(false); cagir("bilardo_ayril", { p_masa: masaId }, onLobi); }}>Kalk</button>`}>
            <p>${d.durum === "oynaniyor" ? "Oyun sürüyor: kalkarsan yerine bot oturur." : "Masadaki yerin boşalır."}</p>
          </${Pencere}>`}
        <${Bildirim} metin=${toast} />
      </div>
    </div>`;
}

function yeniAntrenman() {
  return { antrenman: true, id: 0, ad: "🎯 Antrenman", durum: "oynaniyor", toplar: ucgen(), top_elde: true, kirilis: true,
    sira: 0, benim_koltuk: 0, atis_no: 1, surum: 1, son_atis: null, koltuklar: [{ koltuk: 0, ad: "Sen", bot: false, grup: null, skor: 0, cevrimici: true }] };
}
