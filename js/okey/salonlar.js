// Oyun Salonları — giriş ekranı: oyun kartları + salon sohbeti (kapalı/Beta)
import { html, useState, useEffect } from "../../vendor/preact-htm.js";
import { useToast, Bildirim, hataMetni } from "./okey.js";
import { TopSvg } from "./bilardo.js";
import { SalonSohbetKutusu } from "./sohbet.js";

// ---------------------------------------------------------------------------
// Kart çizimleri (SVG)
// ---------------------------------------------------------------------------
function Tas({ x, y, r = 0, n, c }) {
  return html`<g transform=${`translate(${x} ${y}) rotate(${r})`}>
    <rect x="-17" y="-22" width="34" height="46" rx="5" fill="rgba(0,0,0,.35)" transform="translate(2 3)" />
    <rect x="-17" y="-23" width="34" height="46" rx="5" fill="url(#os-tas)" stroke="#CFC4A8" stroke-width="1" />
    <text x="0" y="4" font-size="21" font-weight="800" text-anchor="middle" fill=${c} font-family="Rubik, Inter, system-ui, sans-serif">${n}</text>
    <circle cx="0" cy="13" r="2.6" fill=${c} />
  </g>`;
}
function Kart({ x, y, r = 0, s, renk, kirmizi }) {
  const c = kirmizi ? "#DC2626" : "#111827";
  return html`<g transform=${`translate(${x} ${y}) rotate(${r})`}>
    <rect x="-23" y="-31" width="46" height="64" rx="6" fill="rgba(0,0,0,.35)" transform="translate(2 3)" />
    <rect x="-23" y="-32" width="46" height="64" rx="6" fill="#FFFFFF" stroke="#E5E7EB" />
    <text x="-16" y="-17" font-size="12" font-weight="800" fill=${c} font-family="Rubik, Inter, system-ui, sans-serif">${s}</text>
    <text x="0" y="11" font-size="26" text-anchor="middle" fill=${c}>${renk}</text>
  </g>`;
}
function Harf({ x, y, h, c }) {
  const bg = { Y: "#16A34A", S: "#CA8A04", G: "#475569", B: "transparent" }[c];
  return html`<g>
    <rect x=${x} y=${y} width="20" height="20" rx="4" fill=${bg} stroke=${c === "B" ? "rgba(255,255,255,.35)" : "none"} stroke-width="1.5" />
    ${h && html`<text x=${x + 10} y=${y + 14.5} font-size="12" font-weight="800" text-anchor="middle" fill="#fff" font-family="Rubik, Inter, system-ui, sans-serif">${h}</text>`}
  </g>`;
}

const CIZIM = {
  bilardo: html`<svg viewBox="0 0 170 120" aria-hidden="true">
    <defs>
      <linearGradient id="os-ah" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9A6634" /><stop offset="1" stop-color="#4A2A12" /></linearGradient>
      <radialGradient id="os-cu" cx="40%" cy="40%" r="80%"><stop offset="0" stop-color="#22A06A" /><stop offset="1" stop-color="#0C4E32" /></radialGradient>
    </defs>
    <rect x="18" y="8" width="170" height="130" rx="16" fill="url(#os-ah)" />
    <rect x="32" y="22" width="160" height="120" rx="4" fill="url(#os-cu)" />
    <circle cx="34" cy="24" r="11" fill="#050505" stroke="#2B1A0C" stroke-width="3" />
    <line x1="2" y1="112" x2="74" y2="82" stroke="#D9B47A" stroke-width="5" stroke-linecap="round" />
    <line x1="2" y1="112" x2="30" y2="100" stroke="#2A1A0C" stroke-width="5.5" stroke-linecap="round" />
    <line x1="72" y1="83" x2="75" y2="82" stroke="#2E7DD7" stroke-width="5" stroke-linecap="round" />
    <${TopSvg} n=${0} x=${86} y=${77} r=${10} />
    <${TopSvg} n=${3} x=${122} y=${48} r=${11} />
    <${TopSvg} n=${11} x=${150} y=${76} r=${11} />
    <${TopSvg} n=${8} x=${120} y=${98} r=${13} />
  </svg>`,
  okey: html`<svg viewBox="0 0 130 96" aria-hidden="true">
    <defs><linearGradient id="os-tas" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFDF6" /><stop offset="1" stop-color="#EBE2CB" /></linearGradient></defs>
    <${Tas} x=${38} y=${54} r=${-14} n="7" c="#DC2626" />
    <${Tas} x=${66} y=${46} r=${0} n="7" c="#1D4ED8" />
    <${Tas} x=${94} y=${54} r=${14} n="7" c="#111827" />
  </svg>`,
  pisti: html`<svg viewBox="0 0 130 96" aria-hidden="true">
    <${Kart} x=${50} y=${52} r=${-12} s="A" renk="♠" />
    <${Kart} x=${80} y=${48} r=${10} s="J" renk="♥" kirmizi=${true} />
  </svg>`,
  bilgi: html`<svg viewBox="0 0 130 96" aria-hidden="true">
    <path d="M54 14 L90 76 H18 Z" fill="#FFFFFF" stroke="#DC2626" stroke-width="7" stroke-linejoin="round" />
    <text x="54" y="69" font-size="32" font-weight="900" text-anchor="middle" fill="#111827" font-family="Rubik, Inter, system-ui, sans-serif">!</text>
    <circle cx="96" cy="34" r="20" fill="#FACC15" />
    <text x="96" y="43" font-size="26" font-weight="900" text-anchor="middle" fill="#1F2937" font-family="Rubik, Inter, system-ui, sans-serif">?</text>
  </svg>`,
  kelime: html`<svg viewBox="0 0 130 84" aria-hidden="true">
    ${[["R", "Y"], ["A", "S"], ["D", "G"], ["A", "Y"], ["R", "Y"]].map(([h, c], i) => html`<${Harf} key=${"a" + i} x=${8 + i * 23} y=${22} h=${h} c=${c} />`)}
    ${[["R", "Y"], ["A", "Y"], ["D", "Y"], ["A", "Y"], ["R", "Y"]].map(([h, c], i) => html`<${Harf} key=${"b" + i} x=${8 + i * 23} y=${46} h=${h} c=${c} />`)}
  </svg>`,
  yuzbir: html`<svg viewBox="0 0 130 96" aria-hidden="true">
    <${Tas} x=${40} y=${50} r=${-8} n="1" c="#64748B" />
    <${Tas} x=${66} y=${46} r=${0} n="0" c="#64748B" />
    <${Tas} x=${92} y=${50} r=${8} n="1" c="#64748B" />
  </svg>`,
};

// ---------------------------------------------------------------------------
export const OYUNLAR = {
  bilardo: { ad: "Bilardo", alt: "8 top • 1'e 1 • 2 masa", renk: "#16A34A" },
  okey: { ad: "Okey", alt: "4 kişilik • 3 masa", renk: "#3B82F6" },
  pisti: { ad: "Pişti", alt: "1'e 1 • 2 masa", renk: "#EF4444" },
  bilgi: { ad: "Bilgi Yarışması", alt: "10 soru • trafik", renk: "#F59E0B" },
  kelime: { ad: "Kelime Tahmini", alt: "Her gün • 6 hak", renk: "#8B5CF6" },
};

function canli(o, varsayilan) {
  if (!o) return [varsayilan, false];
  if (o.oyuncu > 0) return [`${o.oyuncu} kişi oynuyor`, true];
  return [varsayilan, false];
}

// yeniden bağlanma: sayfa ilk açıldığında bir kez, oyunu süren masama dön
// (telefonda kayıtlı açık masa varsa zaten oraya dönülür; o zaman tekrar yönlendirme yapılmaz)
let otoGiris = true;

export function OyunSalonlari({ rpc, onSec, onExit, onDevam, otoIzin = true }) {
  const [oz, setOz] = useState(null);
  const [kapali, setKapali] = useState(null);   // yetki yoksa sunucunun mesajı
  const [toast, goster] = useToast();
  useEffect(() => {
    const al = () => rpc("oyun_salonu_ozet").then((d) => {
      setOz(d); setKapali(null);
      if (otoGiris) {
        otoGiris = false;
        const b = (d && d.benim) || {};
        const oyun = ["okey", "pisti", "bilardo"].find((k) => b[k]);
        if (oyun && onDevam && otoIzin) onDevam(oyun, b[oyun]);
      }
    })
      .catch((e) => { const m = hataMetni(e, ""); if (/kapalı|yetki/i.test(m)) setKapali(m); });
    al();
    const t = setInterval(() => { if (!document.hidden) al(); }, 15000);
    return () => clearInterval(t);
  }, []);
  const kart = (k, durum, aktif, cls = "") => {
    const o = OYUNLAR[k];
    return html`<button key=${k} class=${"os-kart " + cls} style=${`--vurgu:${o.renk}`} onClick=${() => onSec(k)}>
      <div class="os-cizim">${CIZIM[k]}</div>
      <div class="os-yazi">
        ${k === "bilardo" && html`<span class="os-yeni">YENİ</span>`}
        <b>${o.ad}</b>
        <span class="os-alt">${o.alt}</span>
        <span class=${"os-canli" + (aktif ? " aktif" : "")}><i></i>${durum}</span>
      </div>
      <span class="os-ok" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg></span>
    </button>`;
  };
  if (kapali) return html`
    <div class="ok-salon os-salon">
      <div class="ok-sbas">
        <button class="ok-geri" aria-label="Geri" onClick=${onExit}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18 9 12l6-6"></path></svg>
        </button>
        <div class="ok-sbaslik">Oyun Salonları <span class="ok-beta">BETA</span></div>
      </div>
      <div class="ok-bos">${kapali}</div>
    </div>`;
  const [bD, bA] = canli(oz?.bilardo, "Masalar boş • hemen otur");
  const [oD, oA] = canli(oz?.okey, "Boş yer var");
  const [pD, pA] = canli(oz?.pisti, "Boş yer var");
  return html`
    <div class="ok-salon os-salon">
      <div class="ok-sbas">
        <button class="ok-geri" aria-label="Geri" onClick=${onExit}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18 9 12l6-6"></path></svg>
        </button>
        <div style="flex:1;min-width:0">
          <div class="ok-sbaslik">Oyun Salonları <span class="ok-beta">BETA</span></div>
          <div class="ok-salt">Bir oyun seç, salonuna gir</div>
        </div>
      </div>
      <div class="os-liste">
        ${kart("bilardo", bD, bA, "genis")}
        <div class="os-izgara">
          ${kart("okey", oD, oA)}
          ${kart("pisti", pD, pA)}
          ${kart("bilgi", "Sıralama", false)}
          ${kart("kelime", "Bugün hazır", false)}
        </div>
        <div class="os-kart yakinda" aria-disabled="true">
          <div class="os-cizim">${CIZIM.yuzbir}</div>
          <div class="os-yazi"><span class="os-yakinda">YAKINDA</span><b>101 Okey</b><span class="os-alt">Hazırlanıyor</span></div>
        </div>
      </div>
      <${SalonSohbetKutusu} rpc=${rpc} goster=${goster} />
      <div style="flex:1"></div>
      <div class="ok-not">🧪 Oyun Salonları deneme (Beta) aşamasındadır. Oyunlar sadece eğlence içindir; para, çip ya da DYB puanı yoktur. Araç kullanırken oynama.</div>
      <${Bildirim} metin=${toast} />
    </div>`;
}
