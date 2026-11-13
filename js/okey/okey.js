// 1.1.2.7 🎴 Okey 1 — salon + masa. iPhone (PWA) ve Android (WebView içinde okey.html) aynı dosyayı kullanır.
// Dışarıdan verilenler: rpc(ad, argümanlar) → Promise, onExit(), setOrientation(“landscape”|“portrait”) (isteğe bağlı)
import { html, useState, useEffect, useRef, useMemo, useLayoutEffect } from "../../vendor/preact-htm.js";
import {
  RENK, renk, sayi, deger, tasAdi, YER, SATIR, esitle, tasi, yerlestir, seriGruplari, ciftGruplari,
  bitirebilir, gruplara, gercekOkey,
} from "./kural.js";
import { cal, sesAcikMi, sesAyarla } from "./ses.js";
import { PistiSalon, PistiMasa } from "./pisti.js";
import { BilgiEkrani } from "./bilgi.js";
import { KelimeEkrani } from "./kelime.js";
import { SohbetGovde } from "./sohbet.js";
import { BilardoSalon, BilardoMasa } from "./bilardo.js";
import { OyunSalonlari, OYUNLAR } from "./salonlar.js";


const W = 844, H = 390;
const AV = ["#2563EB", "#7C3AED", "#0D9488", "#DB2777", "#EA580C", "#16A34A", "#0891B2", "#B45309"];
export const avRenk = (ad) => { let h = 0; for (const ch of ad || "") h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AV[h % AV.length]; };
export const harf = (ad) => (ad || "?").replace(/^@/, "").replace(/^🤖\s*/, "").charAt(0).toUpperCase() || "?";
export const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* */ } },
  del(k) { try { localStorage.removeItem(k); } catch (_) { /* */ } },
};
/** Sunucunun bilerek verdiği mesajlar (raise exception) gösterilir; teknik hatalar gösterilmez */
export function hataMetni(e, yedek = "İşlem şu an yapılamadı. Tekrar dene.") {
  const m = String(e?.message || "");
  if (e?.code === "P0001" && m) return m.split("\n")[0];
  if (e?.name === "TypeError" || /fetch|network|load failed/i.test(m) || navigator.onLine === false) return "İnternet bağlantını kontrol et.";
  if (/jwt|token/i.test(m)) return "Oturum yenileniyor, birazdan tekrar dene.";
  return yedek;
}
const TUR = {
  normal: "Normal bitirdi • 2 puan",
  okey: "🃏 Okey atarak bitirdi • 4 puan",
  cift: "👯 Çiftle bitirdi • 4 puan",
  cift_okey: "🃏👯 Çift + okeyle bitirdi • 8 puan",
};

// ---------------------------------------------------------------------------
// Küçük parçalar
// ---------------------------------------------------------------------------
function Tas({ t, okR, okN, cls = "", style = "", ...rest }) {
  if (t == null) return html`<div class=${"ok-tas bos " + cls} style=${style} ...${rest}></div>`;
  if (t >= 104) {
    return html`<div class=${"ok-tas " + cls} style=${style} ...${rest}>
      <svg class="ok-yildiz" viewBox="0 0 24 24" role="img" aria-label="Sahte okey"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="#16A34A" stroke="#0F7A37" stroke-width="1"></path></svg>
    </div>`;
  }
  const c = RENK[renk(t)];
  const ok = okR != null && gercekOkey(t, okR, okN);
  return html`<div class=${"ok-tas " + (ok ? "okey " : "") + cls} style=${style} aria-label=${tasAdi(t)} ...${rest}>
    <span class="n" style=${"color:" + c}>${sayi(t)}</span><span class="d" style=${"background:" + c}></span>
    ${ok && html`<span class="ok-rozet">OKEY</span>`}
  </div>`;
}
export function Avatar({ ad, bot, size = 38, halka = null }) {
  const st = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px;background:${bot ? "#475569" : avRenk(ad)}`;
  const a = html`<div class="ok-av" style=${st}>${bot ? "🤖" : harf(ad)}</div>`;
  if (halka == null) return a;
  const R = size / 2 + 7, C = 2 * Math.PI * (R - 2);
  return html`<div class="ok-halka" style=${`width:${R * 2}px;height:${R * 2}px`}>
    <svg width=${R * 2} height=${R * 2} viewBox=${`0 0 ${R * 2} ${R * 2}`} aria-hidden="true">
      <circle cx=${R} cy=${R} r=${R - 2} fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="4"></circle>
      <circle cx=${R} cy=${R} r=${R - 2} fill="none" stroke=${halka < 0.3 ? "#F87171" : "#FACC15"} stroke-width="4" stroke-linecap="round"
        stroke-dasharray=${C} stroke-dashoffset=${C * (1 - halka)} transform=${`rotate(-90 ${R} ${R})`}></circle>
    </svg>
    <div style="position:absolute;inset:7px">${a}</div>
  </div>`;
}
export function Pencere({ baslik, children, onClose, butonlar }) {
  return html`<div class="ok-perde" onClick=${(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
    <div class="ok-pencere">
      ${baslik && html`<h3>${baslik}</h3>`}
      ${children}
      ${butonlar && html`<div class="ok-pbtn">${butonlar}</div>`}
    </div>
  </div>`;
}
export function Bildirim({ metin }) {
  if (!metin) return null;
  return html`<div class="ok-toast" role="status">${metin}</div>`;
}
export function useToast() {
  const [m, setM] = useState(null);
  const t = useRef(0);
  const goster = (x, ms = 2600) => { setM(x); clearTimeout(t.current); t.current = setTimeout(() => setM(null), ms); };
  return [m, goster];
}

// ---------------------------------------------------------------------------
// Uygulama: salon ↔ masa
// ---------------------------------------------------------------------------
export function OkeyApp({ rpc, onExit, setOrientation }) {
  const [masa, setMasa] = useState(() => ls.get("okey_acik_masa", null));
  const [pMasa, setPMasa] = useState(() => ls.get("pisti_acik_masa", null));     // Pişti masası
  const [bMasa, setBMasa] = useState(() => ls.get("bilardo_acik_masa", null));   // Bilardo masası
  const [antrenman, setAntrenman] = useState(false);
  const kayitliMasa = useRef(!!(masa || pMasa || bMasa));   // telefonda açık masa vardı → giriş ekranı tekrar yönlendirmesin
  // Oyun Salonları: giriş ekranı (null) → oyunun salonu → masa
  const [sekme, setSekme] = useState(() => (ls.get("okey_acik_masa", null) ? "okey" : ls.get("pisti_acik_masa", null) ? "pisti"
    : ls.get("bilardo_acik_masa", null) ? "bilardo" : null));
  useEffect(() => { if (masa) ls.set("okey_acik_masa", masa); else ls.del("okey_acik_masa"); }, [masa]);
  useEffect(() => { if (pMasa) ls.set("pisti_acik_masa", pMasa); else ls.del("pisti_acik_masa"); }, [pMasa]);
  useEffect(() => { if (bMasa) ls.set("bilardo_acik_masa", bMasa); else ls.del("bilardo_acik_masa"); }, [bMasa]);
  const yatay = !!(masa || pMasa || bMasa || antrenman);
  useEffect(() => { setOrientation?.(yatay ? "landscape" : "portrait"); }, [yatay]);
  // Android geri tuşu: masa → salon → Oyun Salonları → çıkış (true = işlendi)
  useEffect(() => {
    window.dybBack = () => {
      if (masa) { setMasa(null); return true; }
      if (pMasa) { setPMasa(null); return true; }
      if (bMasa) { setBMasa(null); return true; }
      if (antrenman) { setAntrenman(false); return true; }
      if (sekme) { setSekme(null); return true; }
      return false;
    };
    return () => { window.dybBack = null; };
  }, [masa, pMasa, bMasa, antrenman, sekme]);
  let icerik;
  if (masa) icerik = html`<${Masa} key=${masa} rpc=${rpc} masaId=${masa} onLobi=${() => setMasa(null)} />`;
  else if (pMasa) icerik = html`<${PistiMasa} key=${pMasa} rpc=${rpc} masaId=${pMasa} onLobi=${() => setPMasa(null)} />`;
  else if (bMasa) icerik = html`<${BilardoMasa} key=${bMasa} rpc=${rpc} masaId=${bMasa} onLobi=${() => setBMasa(null)} />`;
  else if (antrenman) icerik = html`<${BilardoMasa} key="antrenman" rpc=${rpc} antrenman=${true} onLobi=${() => setAntrenman(false)} />`;
  else if (sekme) icerik = html`<${Salon} key=${sekme} rpc=${rpc} sekme=${sekme} onHub=${() => setSekme(null)} onMasa=${setMasa}
      onPisti=${setPMasa} onBilardo=${setBMasa} onAntrenman=${() => setAntrenman(true)} />`;
  else icerik = html`<${OyunSalonlari} rpc=${rpc} onSec=${setSekme} onExit=${onExit} otoIzin=${!kayitliMasa.current}
      onDevam=${(oyun, id) => { setSekme(oyun); if (oyun === "okey") setMasa(id); else if (oyun === "pisti") setPMasa(id); else if (oyun === "bilardo") setBMasa(id); }} />`;
  return html`<div class="okey-kok">${icerik}</div>`;
}

// ---------------------------------------------------------------------------
// Salon (masa listesi)
// ---------------------------------------------------------------------------
function Salon({ rpc, onHub, onMasa, onPisti, onBilardo, onAntrenman, sekme = "okey" }) {
  const [liste, setListe] = useState(null);
  const [salon, setSalon] = useState({});        // 1.1: masa_ac, sohbet_acik, sohbet
  const [alinma, setAlinma] = useState(Date.now());
  const [, saniye] = useState(0);
  const [ist, setIst] = useState(null);
  const [hata, setHata] = useState(null);
  const [mesgul, setMesgul] = useState(false);
  const [toast, goster] = useToast();

  async function yukle() {
    try {
      const r = await rpc("okey_masalar_listesi");
      const veri = Array.isArray(r) ? { masalar: r } : (r || {});   // eski sunucu dizi döner
      const l = veri.masalar || [];
      setListe(l); setSalon(veri); setAlinma(Date.now()); setHata(null);
      // yeniden bağlanma artık Oyun Salonları giriş ekranında (oyun_salonu_ozet.benim)
    } catch (e) { setHata(hataMetni(e, "Masalar yüklenemedi.")); }
  }
  useEffect(() => {
    if (sekme !== "okey") return;
    yukle();
    rpc("okey_istatistigim").then(setIst).catch(() => {});
    const t = setInterval(() => { if (!document.hidden) yukle(); }, 10000);
    const s = setInterval(() => saniye((x) => x + 1), 1000);   // geri sayım
    return () => { clearInterval(t); clearInterval(s); };
  }, []);

  async function islem(fn) {
    if (mesgul) return;
    setMesgul(true);
    try { await fn(); } catch (e) { goster(hataMetni(e), 3500); }
    setMesgul(false);
  }
  const kur = () => islem(async () => { const id = await rpc("okey_masa_kur", { p_ad: null }); onMasa(id); });
  const otur = (m) => islem(async () => { if (!m.benim) await rpc("okey_katil", { p_masa: m.id }); onMasa(m.id); });
  const hizli = () => islem(async () => {
    const l = liste || [];
    const benim = l.find((m) => m.benim);
    if (benim) { onMasa(benim.id); return; }
    // önce oyuncu bekleyen masa (en kalabalık), sonra boş masa, sonra botun yerine
    const bekleyen = l.filter((m) => m.durum === "bekliyor" && (m.koltuklar || []).length < 4)
      .sort((a, b) => (b.koltuklar || []).length - (a.koltuklar || []).length);
    const bos = bekleyen[0] || l.find((m) => m.durum !== "bekliyor" && (m.koltuklar || []).some((k) => k.bot));
    if (bos) { await rpc("okey_katil", { p_masa: bos.id }); onMasa(bos.id); return; }
    if (salon.masa_ac) { const id = await rpc("okey_masa_kur", { p_ad: null }); onMasa(id); return; }
    goster("Tüm masalar dolu. Bir masayı izleyebilir ya da biraz sonra tekrar deneyebilirsin.", 4500);
  });
  const gecen = (Date.now() - alinma) / 1000;

  const insan = (liste || []).reduce((s, m) => s + (m.koltuklar || []).filter((k) => !k.bot).length, 0);
  return html`
    <div class="ok-salon">
      <div class="ok-sbas">
        <button class="ok-geri" aria-label="Oyun Salonları" onClick=${onHub}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18 9 12l6-6"></path></svg>
        </button>
        <div style="flex:1;min-width:0">
          <div class="ok-sbaslik">${OYUNLAR[sekme]?.ad || "Oyun"} <span class="ok-beta">BETA</span></div>
          <div class="ok-salt">Oyun Salonları • ${OYUNLAR[sekme]?.alt || ""}</div>
        </div>
      </div>
      ${sekme === "bilardo" && html`<${BilardoSalon} rpc=${rpc} onMasa=${onBilardo} onAntrenman=${onAntrenman} />`}
      ${sekme === "pisti" && html`<${PistiSalon} rpc=${rpc} onMasa=${onPisti} />`}
      ${sekme === "bilgi" && html`<${BilgiEkrani} rpc=${rpc} />`}
      ${sekme === "kelime" && html`<${KelimeEkrani} rpc=${rpc} />`}
      ${sekme === "okey" && html`

      <button class="ok-hizli" disabled=${mesgul} onClick=${hizli}>
        <div class="ok-hizli-t">
          <${Tas} t=${12} cls="xs" style="transform:rotate(-8deg)" />
          <${Tas} t=${14} cls="xs" />
          <${Tas} t=${104} cls="xs" style="transform:rotate(8deg)" />
        </div>
        <div style="flex:1;text-align:left">
          <div class="ok-hb">Hızlı oyna</div>
          <div class="ok-hd">Uygun masaya otur; 4 kişi olunca ya da 1 dk içinde başlar</div>
        </div>
        <span class="ok-oynat"><svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true"><path d="M7 4v16l13-8z"></path></svg></span>
      </button>

      <div class="ok-ist">
        <div><b>${ist?.oynanan ?? "–"}</b><span>El oynadın</span></div>
        <div><b style="color:#4ADE80">${ist?.kazanilan ?? "–"}</b><span>Kazandın</span></div>
        <div><b style="color:#FACC15">${ist ? (ist.cift || 0) + (ist.okey_bitis || 0) : "–"}</b><span>Çift / okey</span></div>
      </div>

      <div class="ok-bolum">MASALAR</div>
      <div class="ok-masalar">
        ${!liste && !hata && html`<div class="ok-bos">Yükleniyor…</div>`}
        ${hata && html`<div class="ok-bos">${hata}<br /><button class="ok-kbtn" style="margin-top:10px" onClick=${yukle}>Tekrar dene</button></div>`}
        ${liste && !liste.length && html`<div class="ok-bos">Şu an açık masa yok.</div>`}
        ${(liste || []).map((m) => {
          const ks = m.koltuklar || [];
          const bosYer = 4 - ks.length, bot = ks.filter((k) => k.bot).length;
          const bekle = m.bekleme_sn != null ? Math.max(0, Math.ceil(m.bekleme_sn - gecen)) : null;
          const [etiket, ebg, efg] = m.durum === "bekliyor"
            ? (!ks.length ? ["Boş • otur, oyun başlasın", "rgba(34,197,94,0.18)", "#86EFAC"]
              : [`${bekle != null ? `Başlıyor ${bekle} sn • ` : ""}${bosYer} yer boş`, "rgba(250,204,21,0.16)", "#FDE68A"])
            : m.durum === "bitti" ? [`El ${m.el_no} bitti`, "rgba(250,204,21,0.16)", "#FDE68A"]
            : [`Oynanıyor • El ${m.el_no}`, "rgba(148,163,184,0.18)", "#CBD5E1"];
          const yerVar = m.durum === "bekliyor" ? bosYer > 0 : bot > 0;
          const [btn, bbg] = m.benim ? ["Dön", "#1F6FEB"] : yerVar ? ["Otur", "#16A34A"] : ["İzle", "#334155"];
          return html`
            <div key=${m.id} class="ok-mkart">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                  <div class="ok-mad">${m.ad}</div>
                  <div class="ok-etiket" style=${`background:${ebg};color:${efg}`}>${etiket}</div>
                </div>
                <div class="ok-koltuklar">
                  ${[0, 1, 2, 3].map((i) => {
                    const k = ks.find((x) => x.koltuk === i);
                    return k
                      ? html`<div key=${i} class="ok-kc" title=${k.ad} style=${`background:${k.bot ? "#475569" : avRenk(k.ad)}`}>${k.bot ? "🤖" : harf(k.ad)}</div>`
                      : html`<div key=${i} class="ok-kc bos">+</div>`;
                  })}
                </div>
              </div>
              <button class="ok-mbtn" disabled=${mesgul} style=${`background:${bbg}`}
                onClick=${() => (btn === "İzle" ? onMasa(m.id) : otur(m))}>${btn}</button>
            </div>`;
        })}
      </div>

      <div class="ok-alt">
        ${salon.masa_ac && html`<button class="ok-masaac" disabled=${mesgul} onClick=${kur}>＋ Masa aç</button>`}
        <button class="ok-yenile" disabled=${mesgul} onClick=${yukle}>↻ Yenile</button>
      </div>

      `}

      <div style="flex:1"></div>
      <div class="ok-not">🧪 Oyun Salonları deneme (Beta) aşamasındadır. Oyun sadece eğlence içindir; para, çip ya da DYB puanı yoktur. Araç kullanırken oynama.</div>
      <${Bildirim} metin=${toast} />
    </div>`;
}

// ---------------------------------------------------------------------------
// Ekrana sığdırma: masa 844×390 tasarlandı; telefon dikse 90° döndürülür
// ---------------------------------------------------------------------------
export function useSigdir(dis, dep) {
  const [f, setF] = useState({ s: 1, rot: false });
  useLayoutEffect(() => {
    const hesap = () => {
      const el = dis.current;
      if (!el) return;
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const rot = h > w * 1.1;
      const s = rot ? Math.min(h / W, w / H) : Math.min(w / W, h / H);
      setF({ s: Math.max(0.3, s), rot });
    };
    hesap();
    window.addEventListener("resize", hesap);
    window.addEventListener("orientationchange", hesap);
    const t = setTimeout(hesap, 400);
    return () => { window.removeEventListener("resize", hesap); window.removeEventListener("orientationchange", hesap); clearTimeout(t); };
  }, [dep]);
  return f;
}

// ---------------------------------------------------------------------------
// Masa
// ---------------------------------------------------------------------------
function Masa({ rpc, masaId, onLobi }) {
  const [d, setD] = useState(null);            // okey_durum
  const [hata, setHata] = useState(null);
  const [alinma, setAlinma] = useState(0);     // durumun geldiği an (geri sayım için)
  const [, tik] = useState(0);
  const [dizi, setDizi] = useState(null);      // ıstakadaki yerleşim (26 yer)
  const [secili, setSecili] = useState(null);  // seçili yer (index)
  const [yeni, setYeni] = useState(null);      // son çekilen taş
  const [suruk, setSuruk] = useState(null);    // sürüklenen {yer, t, x, y}
  const [mesgul, setMesgul] = useState(false);
  const [kalkSor, setKalkSor] = useState(false);
  const [bittiGizle, setBittiGizle] = useState(false);
  const [sohbetAcik, setSohbetAcik] = useState(false);
  const [okunan, setOkunan] = useState(0);
  const [toast, goster] = useToast();
  const dRef = useRef(null);
  const sayac = useRef(0);
  const [sesOn, setSesOn] = useState(sesAcikMi());
  const sonSes = useRef(null);      // önceki durum (sesler için)
  const sonTik = useRef(null);
  const dis = useRef(null), sahne = useRef(null);
  const fit = useSigdir(dis, !!d);
  const istek = useRef(false);
  const sonEl = useRef(null);
  const sonSira = useRef(null);
  const bas = useRef(null);
  const atAsama0 = !!d && d.durum === "oynaniyor" && d.benim_koltuk != null && d.sira === d.benim_koltuk && d.asama === "at";
  const hazir = useMemo(() => (atAsama0 && d.el ? bitirebilir(d.el, d.okey_r, d.okey_n) : false), [atAsama0, d?.el && d.el.join(",")]);

  const anahtar = d ? `okey_dizi_${masaId}_${d.el_no}` : null;

  async function getir(tam = false) {
    if (istek.current) return;
    istek.current = true;
    try {
      // 1.1: değişiklik yoksa sunucu kısa cevap verir (yeni sunucu "sabit" alanını gönderir); her 10. istek tam
      const onceki = dRef.current;
      sayac.current++;
      const kisa = !tam && onceki && "sabit" in onceki && sayac.current % 10 !== 0;
      const x = await rpc("okey_durum", kisa ? { p_masa: masaId, p_surum: onceki.surum } : { p_masa: masaId });
      if (x && x.ayni) {
        const yeniD = { ...onceki, kalan_sn: x.kalan_sn, bekleme_sn: x.bekleme_sn };
        dRef.current = yeniD; setD(yeniD);
      } else {
        dRef.current = x; setD(x);
      }
      setAlinma(Date.now()); setHata(null);
      if (x.durum === "kapandi") { goster("Masa kapandı."); setTimeout(onLobi, 1200); }
    } catch (e) {
      const m = hataMetni(e, "Masaya bağlanılamadı.");
      setHata(m);
      if (/Masa bulunamadı/.test(m)) setTimeout(onLobi, 1200);
    }
    istek.current = false;
  }
  useEffect(() => {
    let dur = false, zaman = 0;
    // sıra bendeyken ya da masa başlamayı beklerken 1 sn, diğer zamanlarda 2 sn
    const dongu = async () => {
      if (dur) return;
      if (!document.hidden) await getir();
      const x = dRef.current;
      const hizli = !x || x.durum === "bekliyor" || (x.durum === "oynaniyor" && x.benim_koltuk != null && x.sira === x.benim_koltuk);
      zaman = setTimeout(dongu, hizli ? 1000 : 2000);
    };
    dongu();
    const s = setInterval(() => tik((x) => x + 1), 250);
    const gor = () => { if (!document.hidden) getir(true); };
    document.addEventListener("visibilitychange", gor);
    return () => { dur = true; clearTimeout(zaman); clearInterval(s); document.removeEventListener("visibilitychange", gor); };
  }, [masaId]);

  // Istakayı sunucudaki elle eşitle (yerleşim telefonda saklanır)
  useEffect(() => {
    if (!d || !d.el) { if (d && !d.el) setDizi(null); return; }
    const k = `okey_dizi_${masaId}_${d.el_no}`;
    const onceki = dizi && sonEl.current?.k === k ? dizi : ls.get(k, null);
    const yeniDizi = esitle(onceki, d.el, d.okey_r, d.okey_n);
    const eski = sonEl.current?.k === k ? sonEl.current.el : null;
    if (eski && d.el.length > eski.length) {
      const gelen = d.el.find((t) => !eski.includes(t));
      if (gelen != null) setYeni(gelen);
    }
    sonEl.current = { k, el: d.el.slice() };
    if (JSON.stringify(yeniDizi) !== JSON.stringify(dizi)) {
      setDizi(yeniDizi);
      ls.set(k, yeniDizi);
      setSecili((s) => (s != null && yeniDizi[s] != null ? s : null));
    }
    // eski ellerin yerleşimini sil
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const kk = localStorage.key(i);
        if (kk && kk.startsWith(`okey_dizi_${masaId}_`) && kk !== k) localStorage.removeItem(kk);
      }
    } catch (_) { /* */ }
  }, [d?.el && d.el.join(","), d?.el_no]);

  // 🔊 Olay sesleri: önceki durumla karşılaştır (kendi hamlelerimin sesi hamle() içinde çalar)
  useEffect(() => {
    if (!d || d.ayni) return;
    const o = sonSes.current;
    sonSes.current = d;
    if (!o || o.id !== d.id) return;
    const ben = d.benim_koltuk;
    if (d.durum === "oynaniyor" && (o.durum !== "oynaniyor" || d.el_no !== o.el_no)) { cal("karis"); return; }
    if (d.durum === "bitti" && o.durum === "oynaniyor") {
      if (d.kazanan != null && d.kazanan === ben) cal(d.bitis_turu === "normal" ? "kazan" : "okey");
      else cal("bitti");
      return;
    }
    if (d.durum !== "oynaniyor") return;
    // başkasının attığı taş (kısık)
    (d.koltuklar || []).forEach((k) => {
      const ok = (o.koltuklar || []).find((x) => x.koltuk === k.koltuk);
      if (ok && k.koltuk !== ben && k.atilan_sayi > ok.atilan_sayi) cal("at", 0.45);
    });
    if (ben != null && d.sira === ben && o.sira !== ben) setTimeout(() => cal("sira", 0.8), 250);
  }, [d?.surum, d?.durum, d?.el_no]);
  // ⏱ son 5 saniye (sadece benim sıramda)
  {
    const sn = d && d.durum === "oynaniyor" && d.benim_koltuk != null && d.sira === d.benim_koltuk && d.kalan_sn != null
      ? Math.ceil(Math.max(0, d.kalan_sn - (Date.now() - alinma) / 1000)) : null;
    if (sn != null && sn >= 1 && sn <= 5 && sonTik.current !== sn) { sonTik.current = sn; cal("sure", 0.5); }
    if (sn == null || sn > 5) sonTik.current = null;
  }

  // Sıra bana geçince titreşim
  useEffect(() => {
    if (!d) return;
    const benim = d.durum === "oynaniyor" && d.sira === d.benim_koltuk;
    if (benim && sonSira.current !== true) { try { navigator.vibrate && navigator.vibrate(60); } catch (_) { /* */ } }
    sonSira.current = benim;
    if (d.durum !== "bitti") setBittiGizle(false);
  }, [d?.sira, d?.durum, d?.el_no]);

  function kaydet(yeniDizi) { setDizi(yeniDizi); if (anahtar) ls.set(anahtar, yeniDizi); }

  async function hamle(h, tas = null) {
    if (mesgul) return;
    setMesgul(true);
    try {
      await rpc("okey_hamle", { p_masa: masaId, p_hamle: h, p_tas: tas });
      if (h === "cek_deste" || h === "cek_yer") cal("cek"); else if (h === "at") cal("at");
      setSecili(null);
      istek.current = false;
      await getir(true);
    } catch (e) { cal("hata", 0.6); goster(hataMetni(e), 3800); }
    setMesgul(false);
  }
  async function cagir(ad, arg, sonra) {
    if (mesgul) return;
    setMesgul(true);
    try { await rpc(ad, arg); if (sonra) sonra(); istek.current = false; await getir(true); } catch (e) { goster(hataMetni(e), 3800); }
    setMesgul(false);
  }

  if (!d) {
    return html`<div class="ok-masa-dis" ref=${dis}><div class="ok-yukleniyor">${hata || "Masaya bağlanılıyor…"}
      ${hata && html`<div style="margin-top:14px;display:flex;gap:10px;justify-content:center">
        <button class="ok-kbtn" onClick=${() => getir(true)}>Tekrar dene</button><button class="ok-kbtn gri" onClick=${onLobi}>Salona dön</button></div>`}</div></div>`;
  }

  const ben = d.benim_koltuk;
  const oturuyor = ben != null;
  const goreli = (k) => (oturuyor ? (k - ben + 4) % 4 : k);           // 0 alt, 1 sağ, 2 üst, 3 sol
  const koltuk = (yon) => (d.koltuklar || []).find((k) => goreli(k.koltuk) === yon) || null;
  const sirabende = d.durum === "oynaniyor" && oturuyor && d.sira === ben;
  const cekAsama = sirabende && d.asama === "cek";
  const atAsama = sirabende && d.asama === "at";
  const benimK = koltuk(0);
  const solK = koltuk(3);
  const kalan = d.kalan_sn == null ? null : Math.max(0, d.kalan_sn - (Date.now() - alinma) / 1000);
  const oran = kalan == null ? null : Math.min(1, kalan / Math.max(1, d.hamle_sn || 30));
  const siradaki = (d.koltuklar || []).find((k) => k.koltuk === d.sira);
  const cevrim = (d.koltuklar || []).filter((k) => !k.bot && k.cevrimici).length;
  const botYeri = (d.koltuklar || []).some((k) => k.bot);

  // ---------- Sohbet ----------
  const mesajlar = d.sohbet || [];
  const sonMsj = mesajlar.length ? mesajlar[mesajlar.length - 1].id : 0;
  const okunmamis = sohbetAcik ? 0 : mesajlar.filter((x) => x.id > okunan && !x.benim).length;
  const sohbetGonder = async (t) => {
    try { await rpc("okey_sohbet_yaz", { p_masa: masaId, p_metin: t }); istek.current = false; await getir(true); return true; }
    catch (e) { goster(hataMetni(e), 3500); return false; }
  };

  // ---------- Istaka: dokun / sürükle ----------
  function sahneNoktasi(cx, cy) {
    const r = sahne.current.getBoundingClientRect();
    return fit.rot ? { x: (cy - r.top) / fit.s, y: (r.right - cx) / fit.s } : { x: (cx - r.left) / fit.s, y: (cy - r.top) / fit.s };
  }
  function hedef(cx, cy) {
    const el = document.elementFromPoint(cx, cy);
    const z = el && el.closest("[data-drop]");
    return z ? z.getAttribute("data-drop") : null;
  }
  function tasBasla(e, yer) {
    if (dizi[yer] == null || mesgul) return;
    e.preventDefault();
    bas.current = { yer, x: e.clientX, y: e.clientY, kaydi: false };
    const hareket = (ev) => {
      const b = bas.current;
      if (!b) return;
      if (!b.kaydi && Math.hypot(ev.clientX - b.x, ev.clientY - b.y) > 6) b.kaydi = true;
      if (b.kaydi) { const p = sahneNoktasi(ev.clientX, ev.clientY); setSuruk({ yer: b.yer, t: dizi[b.yer], ...p, h: hedef(ev.clientX, ev.clientY) }); }
    };
    const bitis = (ev) => {
      window.removeEventListener("pointermove", hareket);
      window.removeEventListener("pointerup", bitis);
      window.removeEventListener("pointercancel", bitis);
      const b = bas.current;
      bas.current = null;
      setSuruk(null);
      if (!b) return;
      if (!b.kaydi) { tasDokun(b.yer); return; }
      birak(b.yer, hedef(ev.clientX, ev.clientY));
    };
    window.addEventListener("pointermove", hareket);
    window.addEventListener("pointerup", bitis);
    window.addEventListener("pointercancel", bitis);
  }
  function birak(yer, h) {
    if (!h) return;
    const t = dizi[yer];
    if (h.startsWith("yer:")) { kaydet(tasi(dizi, yer, parseInt(h.slice(4), 10))); setSecili(null); cal("diz", 0.6); }
    else if (h === "at") { if (atAsama) hamle("at", t); else goster(sirabende ? "Önce taş çekmelisin." : "Sıra sende değil."); }
    else if (h === "bitir") { if (atAsama) hamle("bitir", t); else goster(sirabende ? "Bitirmek için önce taş çek." : "Sıra sende değil."); }
  }
  function tasDokun(yer) {
    if (secili === yer) { setSecili(null); return; }
    setSecili(yer);
  }
  function yerDokun(yer) {
    if (secili != null && dizi[yer] == null) { kaydet(tasi(dizi, secili, yer)); setSecili(null); cal("diz", 0.6); }
  }
  function atDokun() {
    if (!atAsama) { goster(cekAsama ? "Önce desteden ya da soldan taş çek." : "Sıra sende değil."); return; }
    if (secili == null) { goster("Atacağın taşı seç (dokun) ya da buraya sürükle."); return; }
    hamle("at", dizi[secili]);
  }
  function bitirDokun() {
    if (!atAsama) { goster(cekAsama ? "Önce taş çek, sonra bitir." : "Sıra sende değil."); return; }
    if (secili == null) { goster("Ortaya atacağın taşı seç, sonra Bitir'e bas."); return; }
    hamle("bitir", dizi[secili]);
  }
  const seriDiz = () => { if (d.el) { kaydet(yerlestir(seriGruplari(d.el, d.okey_r, d.okey_n))); setSecili(null); } };
  const ciftDiz = () => { if (d.el) { kaydet(yerlestir(ciftGruplari(d.el, d.okey_r, d.okey_n))); setSecili(null); } };

  // ---------- Durum yazısı ----------
  let durumYazi = "";
  if (d.durum === "oynaniyor") {
    if (cekAsama) durumYazi = "Sıra sende • desteden ya da soldan taş çek";
    else if (atAsama) durumYazi = hazir ? "🎉 Elin bitmeye hazır! Ortaya atacağın taşı seç → Bitir" : "Sıra sende • atacağın taşı seç, sağdaki alana at";
    else if (siradaki) durumYazi = `Sıra ${siradaki.ad}'de${siradaki.bot ? " • düşünüyor…" : ""}`;
  }

  // ---------- Oyuncu kutusu ----------
  const oyuncu = (k, yon) => {
    if (!k) return html`<div class="ok-oyuncu bos-k">Boş yer</div>`;
    const sirada = d.durum === "oynaniyor" && d.sira === k.koltuk;
    return html`<div class=${"ok-oyuncu" + (sirada ? " sirada" : "")}>
      ${sirada && oran != null ? html`<${Avatar} ad=${k.ad} bot=${k.bot} halka=${oran} />` : html`<${Avatar} ad=${k.ad} bot=${k.bot} />`}
      <div class="ok-oad">${k.ad}</div>
      <div class="ok-oalt">${d.durum === "oynaniyor" ? `${k.tas} taş • ` : ""}${k.skor} puan</div>
      ${!k.bot && !k.cevrimici && html`<div class="ok-orozet">çevrimdışı</div>`}
      ${k.otomatik && html`<div class="ok-orozet">otomatik</div>`}
    </div>`;
  };

  const ust = koltuk(2), sag = koltuk(1);
  const solUst = solK?.atilan_ust;
  const benimUst = benimK?.atilan_ust;
  const gostergeHedef = suruk && suruk.h === "bitir";
  const atHedef = suruk && suruk.h === "at";

  return html`
    <div class="ok-masa-dis" ref=${dis}>
      <div class="ok-sahne" ref=${sahne}
        style=${`transform:${fit.rot ? "rotate(90deg) " : ""}scale(${fit.s})`}>
        <div class="ok-desen"></div>

        <!-- üst çubuk -->
        <div class="ok-cubuk">
          <button class="ok-cgeri" aria-label="Salona dön" onClick=${onLobi}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18 9 12l6-6"></path></svg>
          </button>
          <div class="ok-logo">DYB</div>
          <div class="ok-cad">${d.ad}</div>
          ${d.el_no > 0 && html`<div class="ok-cel">El ${d.el_no}</div>`}
          <div style="flex:1"></div>
          <div class="ok-cevrim"><span></span>${cevrim} oyuncu çevrimiçi</div>
          <button class="ok-cses" aria-label=${sesOn ? "Sesi kapat" : "Sesi aç"} onClick=${() => { const y = !sesOn; setSesOn(y); sesAyarla(y); }}>${sesOn ? "🔊" : "🔇"}</button>
          <button class="ok-csohbet" aria-label="Masa sohbeti" onClick=${() => { setSohbetAcik(!sohbetAcik); setOkunan(sonMsj); }}>
            💬${okunmamis > 0 && html`<i>${okunmamis}</i>`}
          </button>
          ${oturuyor
            ? html`<button class="ok-ckalk" onClick=${() => setKalkSor(true)}>Kalk</button>`
            : d.durum !== "bekliyor" && botYeri && html`<button class="ok-ckalk yesil" onClick=${() => cagir("okey_katil", { p_masa: masaId })}>Otur</button>`}
        </div>

        <!-- oyuncular -->
        <div class="ok-ust">${ust && html`
          <div class=${"ok-ustk" + (d.durum === "oynaniyor" && d.sira === ust.koltuk ? " sirada" : "")}>
            ${d.durum === "oynaniyor" && d.sira === ust.koltuk && oran != null ? html`<${Avatar} ad=${ust.ad} bot=${ust.bot} size=${30} halka=${oran} />` : html`<${Avatar} ad=${ust.ad} bot=${ust.bot} size=${30} />`}
            <div><div class="ok-oad">${ust.ad}</div><div class="ok-oalt">${d.durum === "oynaniyor" ? `${ust.tas} taş • ` : ""}${ust.skor} puan${ust.otomatik ? " • otomatik" : ""}${!ust.bot && !ust.cevrimici ? " • çevrimdışı" : ""}</div></div>
          </div>`}
          ${ust?.atilan_ust != null && html`<${Tas} t=${ust.atilan_ust} okR=${d.okey_r} okN=${d.okey_n} cls="sm ok-ustatilan" />`}
        </div>
        <div class="ok-sol">${oyuncu(solK, 3)}</div>
        <div class="ok-sag">${oyuncu(sag, 1)}</div>

        <!-- yerdeki taşlar -->
        <button class=${"ok-yer ok-solyer" + (cekAsama && solUst != null ? " aktif" : "")} aria-label="Soldaki taşı al"
          disabled=${!(cekAsama && solUst != null) || mesgul} onClick=${() => hamle("cek_yer")}>
          ${solUst != null ? html`<${Tas} t=${solUst} okR=${d.okey_r} okN=${d.okey_n} style="transform:rotate(-6deg)" />` : html`<div class="ok-yerbos"></div>`}
          ${cekAsama && solUst != null && html`<span class="ok-al">Al</span>`}
        </button>
        ${sag?.atilan_ust != null && html`<div class="ok-sagyer"><${Tas} t=${sag.atilan_ust} okR=${d.okey_r} okN=${d.okey_n} cls="sm" style="transform:rotate(5deg)" /></div>`}

        <!-- orta: deste, gösterge, okey -->
        ${d.gosterge != null && html`
          <div class="ok-orta">
            <button class=${"ok-deste" + (cekAsama ? " aktif" : "")} disabled=${!cekAsama || mesgul || !d.deste} onClick=${() => hamle("cek_deste")} aria-label="Desteden çek">
              <div class="ok-dst">
                <div style="left:6px;top:0;background:#164FAF"></div>
                <div style="left:4px;top:4px;background:#1A5CC8"></div>
                <div style="left:2px;top:8px;background:#1F6FEB" class="ust">DYB</div>
              </div>
              <span class="ok-etk">Deste • ${d.deste}</span>
            </button>
            <div class="ok-gst" data-drop="bitir">
              <${Tas} t=${d.gosterge} cls=${"gosterge" + (gostergeHedef ? " hedef" : "")} />
              <span class="ok-etk">${atAsama ? "Bitir: buraya bırak" : "Gösterge"}</span>
            </div>
            <div class="ok-okey">
              <div class="k">OKEY</div>
              <div class="v" style=${"color:" + ["#FF8A80", "#FCD34D", "#93C5FD", "#E5E7EB"][d.okey_r]}>${["Kırmızı", "Sarı", "Mavi", "Siyah"][d.okey_r]} ${d.okey_n}</div>
            </div>
          </div>`}

        ${durumYazi && html`<div class=${"ok-durum" + (hazir ? " hazir" : sirabende ? "" : " soluk")}>${durumYazi}</div>`}
        ${d.son_olay && d.durum === "oynaniyor" && html`<div class="ok-olay">${d.son_olay}</div>`}
        ${benimK?.otomatik && html`
          <div class="ok-oto">⏱ Süren doldu, otomatik oynanıyor.
            <button onClick=${() => cagir("okey_katil", { p_masa: masaId })}>Ben oynayacağım</button></div>`}

        <!-- ben -->
        ${oturuyor && benimK && html`
          <div class="ok-ben">
            ${sirabende && oran != null ? html`<${Avatar} ad=${benimK.ad} halka=${oran} />` : html`<${Avatar} ad=${benimK.ad} />`}
            <div class="ok-oad">${benimK.ad}</div>
            <div class="ok-oalt" style=${sirabende ? "color:#FDE68A" : ""}>${sirabende && kalan != null ? `0:${String(Math.ceil(kalan)).padStart(2, "0")}` : `${benimK.skor} puan`}</div>
          </div>`}

        <!-- ıstaka -->
        ${dizi && html`
          <div class="ok-istaka">
            ${[0, 1].map((sr) => html`
              <div class="ok-sira" key=${sr}>
                ${dizi.slice(sr * SATIR, sr * SATIR + SATIR).map((t, i) => {
                  const yer = sr * SATIR + i;
                  if (t == null) {
                    return html`<div key=${"b" + yer} class=${"ok-tas bos" + (suruk && suruk.h === "yer:" + yer ? " hedef" : "") + (secili != null ? " davet" : "")}
                      data-drop=${"yer:" + yer} onClick=${() => yerDokun(yer)}></div>`;
                  }
                  const cls = (secili === yer ? "sec " : "") + (yeni === t ? "yeni " : "") + (suruk && suruk.yer === yer ? "kayan " : "") + (suruk && suruk.h === "yer:" + yer ? "hedef" : "");
                  return html`<${Tas} key=${"t" + t} t=${t} okR=${d.okey_r} okN=${d.okey_n} cls=${cls} data-drop=${"yer:" + yer}
                    onPointerDown=${(e) => tasBasla(e, yer)} />`;
                })}
              </div>`)}
          </div>`}
        ${!oturuyor && d.durum !== "bekliyor" && html`<div class="ok-izleyici">👀 İzliyorsun${botYeri ? " • bir botun yerine oturabilirsin (sağ üstte Otur)" : ""}</div>`}

        <!-- benim attığım / atma alanı -->
        ${oturuyor && d.durum === "oynaniyor" && html`
          <div class=${"ok-atalan" + (atAsama ? " aktif" : "") + (atHedef ? " hedef" : "")} data-drop="at" onClick=${atDokun}>
            ${benimUst != null && !atAsama ? html`<${Tas} t=${benimUst} okR=${d.okey_r} okN=${d.okey_n} cls="sm" />` : html`<span>At</span>`}
          </div>`}

        <!-- düğmeler -->
        ${dizi && html`
          <div class="ok-dugmeler">
            <button onClick=${seriDiz}>Seri diz</button>
            <button onClick=${ciftDiz}>Çift diz</button>
            <button class=${"bitir" + (hazir ? " parla" : "")} disabled=${mesgul} onClick=${bitirDokun}>Bitir</button>
          </div>`}

        <!-- sürüklenen taş -->
        ${suruk && html`<${Tas} t=${suruk.t} okR=${d.okey_r} okN=${d.okey_n} cls="hayalet" style=${`left:${suruk.x - 20}px;top:${suruk.y - 30}px`} />`}

        ${d.durum === "bekliyor" && html`<${Bekleme} d=${d} mesgul=${mesgul}
          kalanBekleme=${d.bekleme_sn != null ? Math.max(0, Math.ceil(d.bekleme_sn - (Date.now() - alinma) / 1000)) : null}
          onBaslat=${() => cagir("okey_baslat", { p_masa: masaId })}
          onOtur=${() => cagir("okey_katil", { p_masa: masaId })} onLobi=${onLobi} />`}
        ${d.durum === "bitti" && !bittiGizle && html`<${Bitti} d=${d} mesgul=${mesgul}
          onYeni=${() => cagir("okey_baslat", { p_masa: masaId })} onLobi=${onLobi} onGizle=${() => setBittiGizle(true)} />`}
        ${d.durum === "bitti" && bittiGizle && html`<button class="ok-sonuc" onClick=${() => setBittiGizle(false)}>🏁 El sonucu</button>`}

        ${sohbetAcik && html`
          <div class="ok-sh-panel">
            <div class="ok-sh-bas">💬 Masa sohbeti <span class="ok-beta">BETA</span>
              <button aria-label="Kapat" onClick=${() => { setSohbetAcik(false); setOkunan(sonMsj); }}>✕</button></div>
            <${SohbetGovde} acik=${!!d.sohbet_acik} mesajlar=${mesajlar} yazabilir=${oturuyor}
              yazamazNeden="Masayı izliyorsun; yalnız oturanlar yazabilir." gonder=${sohbetGonder} mesgul=${mesgul} />
          </div>`}
        ${kalkSor && html`
          <${Pencere} baslik="Masadan kalkılsın mı?" onClose=${() => setKalkSor(false)}
            butonlar=${html`
              <button class="ok-kbtn gri" onClick=${() => setKalkSor(false)}>Vazgeç</button>
              ${d.kuran_benim && !d.sabit && html`<button class="ok-kbtn kirmizi" onClick=${() => { setKalkSor(false); cagir("okey_kapat", { p_masa: masaId }, onLobi); }}>Masayı kapat</button>`}
              <button class="ok-kbtn" onClick=${() => { setKalkSor(false); cagir("okey_ayril", { p_masa: masaId }, onLobi); }}>Kalk</button>`}>
            <p>${d.durum === "oynaniyor" ? "Oyun sürüyor: kalkarsan yerine bot oturur." : "Masadaki yerin boşalır."}</p>
          </${Pencere}>`}
        <${Bildirim} metin=${toast} />
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Bekleme (masa kuruldu, oyun başlamadı)
// ---------------------------------------------------------------------------
function Bekleme({ d, mesgul, onBaslat, onOtur, onLobi, kalanBekleme }) {
  const ks = d.koltuklar || [];
  const oturuyor = d.benim_koltuk != null;
  return html`
    <div class="ok-kaplama">
      <div class="ok-kutu">
        <div class="ok-kbas">🎴 ${d.ad}</div>
        <div class="ok-kalt">${kalanBekleme != null
          ? html`4 kişi olunca hemen başlar • <b class="ok-sayac">${kalanBekleme} sn</b> sonra boş yerlere bot oturup başlar`
          : `4 kişilik masa • hamle süresi ${d.hamle_sn || 30} sn • boş yerlere bot oturur`}</div>
        <div class="ok-bkolt">
          ${[0, 1, 2, 3].map((i) => {
            const k = ks.find((x) => x.koltuk === i);
            return html`<div key=${i} class="ok-bk">
              ${k ? html`<${Avatar} ad=${k.ad} bot=${k.bot} size=${44} />` : html`<div class="ok-av bosav">🤖</div>`}
              <div class="ok-oad">${k ? k.ad : "Bot oturacak"}</div>
            </div>`;
          })}
        </div>
        <div class="ok-pbtn" style="justify-content:center">
          ${!oturuyor && ks.length < 4 && html`<button class="ok-kbtn yesil" disabled=${mesgul} onClick=${onOtur}>Otur</button>`}
          ${d.kuran_benim
            ? html`<button class="ok-kbtn yesil buyuk" disabled=${mesgul} onClick=${onBaslat}>▶ Hemen başlat</button>`
            : oturuyor && html`<div class="ok-bekle">${d.masa_basi ? `Masa başı ${d.masa_basi} • ` : ""}diğer oyuncular bekleniyor…</div>`}
          <button class="ok-kbtn gri" onClick=${onLobi}>Salona dön</button>
        </div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// El bitti
// ---------------------------------------------------------------------------
function Bitti({ d, mesgul, onYeni, onLobi, onGizle }) {
  const ks = d.koltuklar || [];
  const kaz = ks.find((k) => k.koltuk === d.kazanan);
  const benKazandim = d.kazanan != null && d.kazanan === d.benim_koltuk;
  const gruplar = useMemo(() => (d.bitis_el ? gruplara(d.bitis_el, d.okey_r, d.okey_n, d.bitis_turu) : []), [d.el_no, d.bitis_el && d.bitis_el.join(",")]);
  const sirali = [...ks].sort((a, b) => b.skor - a.skor || a.koltuk - b.koltuk);
  return html`
    <div class="ok-kaplama">
      <div class="ok-bitti">
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:10px">
          ${kaz ? html`
            <div style="display:flex;align-items:center;gap:12px">
              <div style="box-shadow:0 0 0 3px #FACC15;border-radius:50%"><${Avatar} ad=${kaz.ad} bot=${kaz.bot} size=${46} /></div>
              <div>
                <div class="ok-bbas">${benKazandim ? "Tebrikler, eli bitirdin! 🎉" : `${kaz.ad} eli bitirdi!`}</div>
                <div class="ok-btur">${TUR[d.bitis_turu] || ""}</div>
              </div>
            </div>
            <div class="ok-bolum2">KAZANAN EL ${d.ortaya != null ? html`<span style="font-weight:600;letter-spacing:0">• ortaya: ${tasAdi(d.ortaya)}</span>` : ""}</div>
            <div class="ok-gruplar">
              ${gruplar.map((g, i) => html`<div key=${i} class="ok-grup">${g.map((t) => html`<${Tas} key=${t} t=${t} okR=${d.okey_r} okN=${d.okey_n} cls="xs" />`)}</div>`)}
            </div>`
          : html`<div><div class="ok-bbas">El berabere bitti</div><div class="ok-btur">Destede taş kalmadı, kimse puan almadı.</div></div>`}
          <div style="display:flex;gap:10px;margin-top:4px">
            ${d.benim_koltuk != null && html`<button class="ok-kbtn yesil buyuk" style="flex:1" disabled=${mesgul} onClick=${onYeni}>Yeni el (${d.el_no + 1}. el)</button>`}
            <button class="ok-kbtn gri" style="width:120px" onClick=${onGizle}>Masayı gör</button>
            <button class="ok-kbtn gri" style="width:120px" onClick=${onLobi}>Salona dön</button>
          </div>
        </div>
        <div class="ok-puanlar">
          <div class="ok-bolum2">PUAN DURUMU</div>
          ${sirali.map((k, i) => html`
            <div key=${k.koltuk} class="ok-psatir" style=${k.koltuk === d.kazanan ? "background:rgba(250,204,21,0.12)" : ""}>
              <div class="ok-psira">${i + 1}</div>
              <${Avatar} ad=${k.ad} bot=${k.bot} size=${28} />
              <div class="ok-pad">${k.ad}</div>
              <div class="ok-pp">${k.skor}</div>
            </div>`)}
          <div class="ok-pnot">Puanlar bu masaya özeldir, DYB puanına eklenmez.</div>
        </div>
      </div>
    </div>`;
}
