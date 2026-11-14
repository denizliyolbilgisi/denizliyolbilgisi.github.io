// Oyun Salonları — giriş ekranı: oyun kartları + salon sohbeti (kapalı/Beta)
import { html, useState, useEffect } from "../../vendor/preact-htm.js";
import { useToast, Bildirim, hataMetni } from "./okey.js";
import { TopSvg } from "./bilardo.js";
import { SalonSohbetKutusu } from "./sohbet.js";
import { YonetimKarti, useYonetimDurum } from "./yonetim.js";

// ---------------------------------------------------------------------------
// Kart çizimleri (SVG) — 1.1.3: daha gerçekçi ışık/gölge, sade kompozisyon
// ---------------------------------------------------------------------------
const FONT = "Rubik, Inter, system-ui, sans-serif";
function Tas({ x, y, r = 0, n, c, w = 36, h = 48 }) {
  return html`<g transform=${`translate(${x} ${y}) rotate(${r})`}>
    <rect x=${-w / 2} y=${-h / 2 + 3} width=${w} height=${h} rx="6" fill="#B9AE92" />
    <rect x=${-w / 2} y=${-h / 2} width=${w} height=${h} rx="6" fill="url(#os-tas)" />
    <rect x=${-w / 2 + 2.5} y=${-h / 2 + 2.5} width=${w - 5} height=${h - 5} rx="4.5" fill="none" stroke="rgba(120,100,60,.18)" />
    <text x="0" y=${h * 0.09} font-size=${h * 0.47} font-weight="800" text-anchor="middle" fill=${c} font-family=${FONT}>${n}</text>
    <circle cx="0" cy=${h * 0.3} r="2.6" fill=${c} />
  </g>`;
}
function Kart({ x, y, r = 0, s, renk, kirmizi }) {
  const c = kirmizi ? "#D61F2C" : "#111827";
  return html`<g transform=${`translate(${x} ${y}) rotate(${r})`}>
    <rect x="-25" y="-34" width="50" height="70" rx="6" fill="#FFFFFF" />
    <rect x="-25" y="-34" width="50" height="70" rx="6" fill="url(#os-kagit)" />
    <text x="-19" y="-20" font-size="12" font-weight="800" fill=${c} font-family=${FONT}>${s}</text>
    <text x="-19" y="-9" font-size="10" fill=${c}>${renk}</text>
    <text x="0" y="12" font-size="28" text-anchor="middle" fill=${c}>${renk}</text>
  </g>`;
}
function Harf({ x, y, h, c, s = 21 }) {
  const bg = { Y: ["#22C55E", "#15803D"], S: ["#EAB308", "#A16207"], G: ["#64748B", "#334155"] }[c];
  return html`<g>
    <rect x=${x} y=${y + 2} width=${s} height=${s} rx="5" fill=${bg[1]} />
    <rect x=${x} y=${y} width=${s} height=${s} rx="5" fill=${bg[0]} />
    <rect x=${x + 1.5} y=${y + 1.5} width=${s - 3} height=${s * 0.42} rx="3.5" fill="rgba(255,255,255,.16)" />
    <text x=${x + s / 2} y=${y + s * 0.72} font-size=${s * 0.58} font-weight="800" text-anchor="middle" fill="#fff" font-family=${FONT}>${h}</text>
  </g>`;
}
const ORTAK_DEFS = html`<defs>
  <linearGradient id="os-tas" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFEF8" /><stop offset="1" stop-color="#EDE4CC" /></linearGradient>
  <linearGradient id="os-kagit" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0" /><stop offset="1" stop-color="#CBD5E1" stop-opacity=".45" /></linearGradient>
</defs>`;

const CIZIM = {
  bilardo: html`<svg viewBox="0 0 230 150" aria-hidden="true">
    <defs><linearGradient id="os-isteka" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3B2412" /><stop offset=".55" stop-color="#C69A5B" /><stop offset="1" stop-color="#F1DDB4" /></linearGradient></defs>
    <ellipse cx="150" cy="128" rx="78" ry="10" fill="rgba(0,0,0,.28)" />
    <${TopSvg} n=${1} x=${150} y=${46} r=${13} />
    <${TopSvg} n=${9} x=${163} y=${68} r=${13} />
    <${TopSvg} n=${3} x=${137} y=${68} r=${13} />
    <${TopSvg} n=${8} x=${150} y=${90} r=${13} />
    <${TopSvg} n=${14} x=${176} y=${90} r=${13} />
    <${TopSvg} n=${5} x=${124} y=${90} r=${13} />
    <${TopSvg} n=${0} x=${86} y=${112} r=${13} />
    <line x1="8" y1="148" x2="70" y2="121" stroke="url(#os-isteka)" stroke-width="6" stroke-linecap="round" />
    <line x1="68" y1="122" x2="72" y2="120" stroke="#3B82F6" stroke-width="6" stroke-linecap="round" />
  </svg>`,
  okey: html`<svg viewBox="0 0 130 96" aria-hidden="true">${ORTAK_DEFS}
    <${Tas} x=${44} y=${56} r=${-12} n="7" c="#D61F2C" />
    <${Tas} x=${70} y=${50} r=${0} n="8" c="#D61F2C" />
    <${Tas} x=${96} y=${56} r=${12} n="9" c="#D61F2C" />
  </svg>`,
  pisti: html`<svg viewBox="0 0 130 96" aria-hidden="true">${ORTAK_DEFS}
    <${Kart} x=${50} y=${54} r=${-14} s="A" renk="♠" />
    <${Kart} x=${84} y=${50} r=${9} s="J" renk="♥" kirmizi=${true} />
  </svg>`,
  bilgi: html`<svg viewBox="0 0 130 96" aria-hidden="true">
    <defs><linearGradient id="os-saat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FDE68A" /><stop offset="1" stop-color="#F59E0B" /></linearGradient></defs>
    <circle cx="80" cy="48" r="34" fill="rgba(0,0,0,.25)" />
    <circle cx="80" cy="46" r="34" fill="#1F2937" stroke="rgba(255,255,255,.12)" stroke-width="1.5" />
    <circle cx="80" cy="46" r="27" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="6" />
    <path d="M80 19 A27 27 0 1 1 56.6 59.5" fill="none" stroke="url(#os-saat)" stroke-width="6" stroke-linecap="round" />
    <text x="80" y="57" font-size="32" font-weight="900" text-anchor="middle" fill="#FDE68A" font-family=${FONT}>?</text>
    <rect x="72" y="5" width="16" height="7" rx="2.5" fill="#94A3B8" />
  </svg>`,
  kelime: html`<svg viewBox="0 0 130 84" aria-hidden="true">
    ${[["R", "G"], ["A", "S"], ["D", "G"], ["A", "Y"], ["R", "G"]].map(([h, c], i) => html`<${Harf} key=${"a" + i} x=${10 + i * 23} y=${16} h=${h} c=${c} />`)}
    ${[["R", "Y"], ["A", "Y"], ["D", "Y"], ["A", "Y"], ["R", "Y"]].map(([h, c], i) => html`<${Harf} key=${"b" + i} x=${10 + i * 23} y=${44} h=${h} c=${c} />`)}
  </svg>`,
  yuzbir: html`<svg viewBox="0 0 130 96" aria-hidden="true">${ORTAK_DEFS}
    <${Tas} x=${44} y=${52} r=${-8} n="1" c="#475569" />
    <${Tas} x=${70} y=${48} r=${0} n="0" c="#475569" />
    <${Tas} x=${96} y=${52} r=${8} n="1" c="#475569" />
  </svg>`,
};

// ---------------------------------------------------------------------------
export const OYUNLAR = {
  bilardo: { ad: "Bilardo", alt: "8 top • 1'e 1 • 2 masa", renk: "#16A34A", zemin: "radial-gradient(120% 120% at 75% 30%, #1E8A57 0%, #11603C 45%, #0A3A25 100%)" },
  okey: { ad: "Okey", alt: "4 kişilik • 3 masa", renk: "#3B82F6", zemin: "radial-gradient(120% 120% at 80% 20%, #2B58B8 0%, #1B3B85 45%, #0F2150 100%)" },
  pisti: { ad: "Pişti", alt: "1'e 1 • 2 masa", renk: "#EF4444", zemin: "radial-gradient(120% 120% at 80% 20%, #A3243A 0%, #6E1427 48%, #3A0A15 100%)" },
  bilgi: { ad: "Bilgi Yarışması", alt: "10 soru • trafik", renk: "#F59E0B", zemin: "radial-gradient(120% 120% at 80% 20%, #8A5A12 0%, #5A3608 48%, #2C1A05 100%)" },
  kelime: { ad: "Kelime Tahmini", alt: "Her gün • 6 hak", renk: "#8B5CF6", zemin: "radial-gradient(120% 120% at 80% 20%, #6534C9 0%, #42218A 48%, #211046 100%)" },
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
  const yetki = useYonetimDurum(rpc);
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
    return html`<button key=${k} class=${"os-kart " + cls} style=${`--vurgu:${o.renk};--zemin:${o.zemin}`} onClick=${() => onSec(k)}>
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
        <${YonetimKarti} yetki=${yetki} onAc=${() => onSec("yonetim")} />
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
