// 1.1.3 🎮 Oyun Salonları yönetimi: Salon Sorumlusu / Süper Operatör / Operatör (SQL 55)
// - Herkes: sohbet mesajına ya da masadaki oyuncuya dokunup "Şikayet et"
// - Ekip: mesaj sil, sustur, masadan çıkar, uzaklaştır; "⚙️ Salon Yönetimi" ekranı (şikayetler, cezalar, ekip, salon)
// Kimlikler telefona gönderilmez: işlemler mesaj no'su ya da masa/koltuk ile yapılır, sunucu kişiyi kendi bulur.
import { html, useState, useEffect, useRef } from "../../vendor/preact-htm.js";
import { hataMetni, useToast, Bildirim } from "./okey.js";

// ---------------------------------------------------------------------------
// Yetki durumu ve rozetler (sayfa başına ortak önbellek)
// ---------------------------------------------------------------------------
let durumOnbellek = null, durumZaman = 0, durumIstek = null;
let rozetOnbellek = {}, rozetZaman = 0;
const dinleyiciler = new Set();

export function yonetimYenile(rpc, zorla = false) {
  if (!zorla && durumOnbellek && Date.now() - durumZaman < 30000) return Promise.resolve(durumOnbellek);
  if (durumIstek) return durumIstek;
  durumIstek = Promise.all([
    rpc("oyun_yonetim_durum").catch(() => null),
    Date.now() - rozetZaman > 60000 || zorla ? rpc("oyun_ekip_rozetleri").catch(() => null) : Promise.resolve(undefined),
  ]).then(([d, r]) => {
    durumOnbellek = d; durumZaman = Date.now();
    if (Array.isArray(r)) { rozetOnbellek = {}; r.forEach((x) => { rozetOnbellek[x.ad] = x.rozet; }); rozetZaman = Date.now(); }
    dinleyiciler.forEach((f) => f(d));
    return d;
  }).finally(() => { durumIstek = null; });
  return durumIstek;
}

export function useYonetimDurum(rpc) {
  const [d, setD] = useState(durumOnbellek);
  useEffect(() => {
    if (!rpc) return;
    dinleyiciler.add(setD);
    yonetimYenile(rpc).then(setD);
    const t = setInterval(() => { if (!document.hidden) yonetimYenile(rpc); }, 30000);
    return () => { dinleyiciler.delete(setD); clearInterval(t); };
  }, [rpc]);
  return d;
}

/** Sohbette adın önündeki rozet (🎮 ⚡ 🔹) */
export const rozet = (ad) => rozetOnbellek[ad] || "";

const SEBEPLER = [["kufur", "Küfür / hakaret"], ["oyun_bozma", "Oyunu bozma"], ["taciz", "Taciz"], ["diger", "Diğer"]];
const SUSTUR = [[10, "10 dk"], [30, "30 dk"], [60, "1 saat"], [180, "3 saat"], [1440, "24 saat"]];
const YASAK = [[60, "1 saat"], [1440, "24 saat"], [4320, "3 gün"], [10080, "7 gün"]];
const SEBEP_AD = Object.fromEntries(SEBEPLER);
const OYUN_AD = { okey: "Okey", pisti: "Pişti", bilardo: "Bilardo", salon: "Salon sohbeti" };
const saat = (iso) => { try { return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch (_) { return ""; } };
const kalan = (iso) => {
  const dk = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
  if (dk >= 1440) return Math.round(dk / 1440) + " gün";
  if (dk >= 60) return Math.round(dk / 60) + " saat";
  return dk + " dk";
};

// ---------------------------------------------------------------------------
// İşlem menüsü (sohbet mesajı ya da masadaki oyuncu)
//   hedef: { ad, kaynak, mesaj, metin, benim }  ya da  { ad, oyun, masa, koltuk }
// ---------------------------------------------------------------------------
export function useIslemMenu(rpc, goster) {
  const [hedef, setHedef] = useState(null);
  const yetki = useYonetimDurum(rpc);
  const ac = (h) => { yonetimYenile(rpc); setHedef(h); };
  const menu = hedef ? html`<${IslemMenusu} rpc=${rpc} hedef=${hedef} yetki=${yetki} goster=${goster} kapat=${() => setHedef(null)} />` : null;
  return [ac, menu];
}

function IslemMenusu({ rpc, hedef, yetki, goster, kapat }) {
  const [asama, setAsama] = useState("ana");   // ana | sikayet | sustur | yasak
  const [mesgul, setMesgul] = useState(false);
  const iz = (yetki && yetki.izin) || {};
  const hedefArg = hedef.mesaj != null
    ? { p_kaynak: hedef.kaynak, p_mesaj: hedef.mesaj }
    : { p_oyun: hedef.oyun, p_masa: hedef.masa, p_koltuk: hedef.koltuk };
  const yap = async (ad, arg, sonra) => {
    if (mesgul) return;
    setMesgul(true);
    try {
      const r = await rpc(ad, arg);
      goster && goster(typeof r === "string" ? r.replace(/^tamam: /, "✅ ") : "✅ Tamam", 3200);
      sonra && sonra();
      kapat();
    } catch (e) { goster && goster(hataMetni(e), 3800); setMesgul(false); }
  };
  const yetkili = iz.yonetim && !hedef.benim;
  let icerik;
  if (asama === "sikayet") {
    icerik = html`<p class="oy-acik">Neden şikayet ediyorsun?</p>
      <div class="oy-secenek">${SEBEPLER.map(([k, ad]) => html`
        <button key=${k} disabled=${mesgul} onClick=${() => yap("oyun_sikayet_et", { p_sebep: k, ...hedefArg })}>${ad}</button>`)}</div>`;
  } else if (asama === "sustur" || asama === "yasak") {
    const liste = (asama === "sustur" ? SUSTUR : YASAK).filter(([dk]) => dk <= (asama === "sustur" ? iz.sustur_dk : iz.yasak_dk));
    icerik = html`<p class="oy-acik">${asama === "sustur" ? "Oyun sohbetlerinde ne kadar süre yazamasın?" : "Oyun Salonları'na ne kadar süre giremesin? (oturduğu masalardan kalkar)"}</p>
      <div class="oy-secenek">${liste.map(([dk, ad]) => html`
        <button key=${dk} class=${asama === "yasak" ? "kirmizi" : ""} disabled=${mesgul}
          onClick=${() => yap("oyun_ceza_ver", { p_tur: asama, p_dakika: dk, ...hedefArg })}>${ad}</button>`)}</div>`;
  } else {
    icerik = html`<div class="oy-liste">
      ${hedef.mesaj != null && (hedef.benim || iz.sil) && html`<button disabled=${mesgul} onClick=${() => yap("oyun_mesaj_sil", { p_kaynak: hedef.kaynak, p_mesaj: hedef.mesaj })}>🗑 Mesajı sil</button>`}
      ${!hedef.benim && html`<button onClick=${() => setAsama("sikayet")}>🚩 Şikayet et</button>`}
      ${yetkili && iz.sustur && html`<button onClick=${() => setAsama("sustur")}>🔇 Oyunlarda sustur</button>`}
      ${yetkili && iz.cikar && hedef.koltuk != null && html`<button disabled=${mesgul}
          onClick=${() => yap("oyun_masadan_cikar", { p_oyun: hedef.oyun, p_masa: hedef.masa, p_koltuk: hedef.koltuk })}>🚪 Masadan çıkar</button>`}
      ${yetkili && iz.yasak && html`<button class="kirmizi" onClick=${() => setAsama("yasak")}>⛔ Oyunlardan uzaklaştır</button>`}
    </div>`;
  }
  return html`<div class="oy-perde" onClick=${(e) => { if (e.target === e.currentTarget) kapat(); }}>
    <div class="oy-menu" role="dialog" aria-label=${hedef.ad || "İşlem"}>
      <div class="oy-mbas">
        <b>${rozet(hedef.ad)}${hedef.ad || "Oyuncu"}</b>
        <button class="oy-x" aria-label="Kapat" onClick=${kapat}>✕</button>
      </div>
      ${hedef.metin && html`<div class="oy-alinti">“${hedef.metin}”</div>`}
      ${icerik}
      ${asama !== "ana" && html`<button class="oy-geri" onClick=${() => setAsama("ana")}>‹ Geri</button>`}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Giriş ekranındaki kart (yalnız ekip ve genel yönetim görür)
// ---------------------------------------------------------------------------
export function YonetimKarti({ yetki, onAc }) {
  if (!yetki || !yetki.izin || !yetki.izin.yonetim) return null;
  const n = yetki.acik_sikayet || 0;
  return html`<button class="os-kart yonetim" onClick=${onAc}>
    <span class="os-yonikon" aria-hidden="true">⚙️</span>
    <div class="os-yazi"><b>Salon Yönetimi</b><span class="os-alt">${yetki.seviye_adi || "Genel yönetim"} • şikayetler, cezalar, ekip</span></div>
    ${n > 0 && html`<span class="os-sayi" aria-label=${n + " açık şikayet"}>${n}</span>`}
  </button>`;
}

// ---------------------------------------------------------------------------
// ⚙️ Salon Yönetimi ekranı
// ---------------------------------------------------------------------------
export function SalonYonetimi({ rpc, onGeri }) {
  const yetki = useYonetimDurum(rpc);
  const [toast, goster] = useToast();
  const [sekme, setSekme] = useState("sikayet");
  const iz = (yetki && yetki.izin) || {};
  const sekmeler = [["sikayet", "Şikayetler"], ["ceza", "Cezalar"], iz.ekip || iz.sorumlu_ata ? ["ekip", "Ekip"] : null, iz.sohbet ? ["salon", "Salon"] : null].filter(Boolean);
  return html`<div class="ok-salon os-salon oy-ekran">
    <div class="ok-sbas">
      <button class="ok-geri" aria-label="Geri" onClick=${onGeri}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18 9 12l6-6"></path></svg>
      </button>
      <div style="flex:1;min-width:0">
        <div class="ok-sbaslik">⚙️ Salon Yönetimi</div>
        <div class="ok-salt">${(yetki && yetki.seviye_adi) || "Genel yönetim"}</div>
      </div>
    </div>
    <div class="oy-sekmeler" role="tablist">
      ${sekmeler.map(([k, ad]) => html`<button key=${k} role="tab" aria-selected=${sekme === k} class=${sekme === k ? "secili" : ""} onClick=${() => setSekme(k)}>
        ${ad}${k === "sikayet" && yetki && yetki.acik_sikayet ? html` <i>${yetki.acik_sikayet}</i>` : ""}</button>`)}
    </div>
    <div class="oy-govde">
      ${sekme === "sikayet" && html`<${Sikayetler} rpc=${rpc} iz=${iz} goster=${goster} />`}
      ${sekme === "ceza" && html`<${Cezalar} rpc=${rpc} goster=${goster} />`}
      ${sekme === "ekip" && html`<${Ekip} rpc=${rpc} yetki=${yetki} goster=${goster} />`}
      ${sekme === "salon" && html`<${Salon} rpc=${rpc} iz=${iz} goster=${goster} />`}
    </div>
    <${Bildirim} metin=${toast} />
  </div>`;
}

function useListe(rpc, ad, arg) {
  const [liste, setListe] = useState(null);
  const al = () => rpc(ad, arg || {}).then((x) => setListe(x || [])).catch(() => setListe([]));
  useEffect(() => { al(); }, [ad, JSON.stringify(arg || {})]);
  return [liste, al];
}

function Sikayetler({ rpc, iz, goster }) {
  const [durum, setDurum] = useState("acik");
  const [liste, al] = useListe(rpc, "oyun_sikayetler_listesi", { p_durum: durum });
  const [secili, setSecili] = useState(null);
  const islem = async (ad, arg) => {
    try { const r = await rpc(ad, arg); goster(String(r || "Tamam").replace(/^tamam: /, "✅ "), 3000); setSecili(null); al(); yonetimYenile(rpc, true); }
    catch (e) { goster(hataMetni(e), 3800); }
  };
  return html`<div>
    <div class="oy-filtre">
      <button class=${durum === "acik" ? "secili" : ""} onClick=${() => setDurum("acik")}>Açık</button>
      <button class=${durum === "kapandi" ? "secili" : ""} onClick=${() => setDurum("kapandi")}>Kapanan</button>
    </div>
    ${liste == null ? html`<div class="oy-bos">Yükleniyor…</div>`
      : !liste.length ? html`<div class="oy-bos">${durum === "acik" ? "Açık şikayet yok 👍" : "Son 30 günde kapanan şikayet yok."}</div>`
      : liste.map((s) => html`<div key=${s.id} class="oy-satir">
          <div class="oy-ust"><b>${s.edilen}</b><span>${saat(s.created_at)}</span></div>
          <div class="oy-etiketler">
            <span class="oy-etiket kirmizi">${SEBEP_AD[s.sebep] || s.sebep}</span>
            <span class="oy-etiket">${OYUN_AD[s.oyun] || s.oyun}${s.masa_id ? " #" + s.masa_id : ""}</span>
            ${s.son7gun > 1 && html`<span class="oy-etiket sari">7 günde ${s.son7gun} şikayet</span>`}
            ${s.susturuldu && html`<span class="oy-etiket">🔇 ${kalan(s.susturuldu)}</span>`}
            ${s.yasakli && html`<span class="oy-etiket kirmizi">⛔ ${kalan(s.yasakli)}</span>`}
          </div>
          ${s.mesaj_metni && html`<div class="oy-alinti">“${s.mesaj_metni}”</div>`}
          ${s.notu && html`<div class="oy-not">📝 ${s.notu}</div>`}
          <div class="oy-kim">Şikayet eden: ${s.eden || "—"}</div>
          ${s.durum === "kapandi"
            ? html`<div class="oy-sonuc">${s.sonuc || "Kapandı"}${s.kapatan ? " • " + s.kapatan : ""}</div>`
            : secili === s.id
              ? html`<div class="oy-islemler">
                  ${s.islem_yapabilir && iz.sustur && SUSTUR.filter(([dk]) => dk <= iz.sustur_dk).slice(-2).map(([dk, ad]) => html`
                    <button key=${"s" + dk} onClick=${() => islem("oyun_ceza_ver", { p_tur: "sustur", p_dakika: dk, p_sikayet: s.id })}>🔇 ${ad}</button>`)}
                  ${s.islem_yapabilir && iz.yasak && YASAK.filter(([dk]) => dk <= iz.yasak_dk).slice(-2).map(([dk, ad]) => html`
                    <button key=${"y" + dk} class="kirmizi" onClick=${() => islem("oyun_ceza_ver", { p_tur: "yasak", p_dakika: dk, p_sikayet: s.id })}>⛔ ${ad}</button>`)}
                  <button onClick=${() => islem("oyun_sikayet_kapat", { p_id: s.id, p_yonetime: false })}>✔ İşlem gerekmedi</button>
                  <button onClick=${() => islem("oyun_sikayet_kapat", { p_id: s.id, p_yonetime: true })}>📤 Genel yönetime ilet</button>
                  <button class="gri" onClick=${() => setSecili(null)}>Vazgeç</button>
                </div>`
              : html`<button class="oy-ac" onClick=${() => setSecili(s.id)}>İşlem yap</button>`}
        </div>`)}
  </div>`;
}

function Cezalar({ rpc, goster }) {
  const [liste, al] = useListe(rpc, "oyun_cezalar_listesi");
  const kaldir = async (id) => {
    try { await rpc("oyun_ceza_kaldir", { p_id: id }); goster("✅ Ceza kaldırıldı", 2600); al(); }
    catch (e) { goster(hataMetni(e), 3800); }
  };
  return html`<div>
    ${liste == null ? html`<div class="oy-bos">Yükleniyor…</div>`
      : !liste.length ? html`<div class="oy-bos">Şu an cezalı oyuncu yok.</div>`
      : liste.map((c) => html`<div key=${c.id} class="oy-satir">
          <div class="oy-ust"><b>${c.kim}</b><span>${c.tur === "sustur" ? "🔇 Susturuldu" : "⛔ Uzaklaştırıldı"}</span></div>
          <div class="oy-kim">Kalan: <b>${kalan(c.bitis)}</b> • Veren: ${c.veren}</div>
          ${c.sebep && html`<div class="oy-not">${c.sebep}</div>`}
          ${c.kaldirabilir && html`<button class="oy-ac" onClick=${() => kaldir(c.id)}>Cezayı kaldır</button>`}
        </div>`)}
  </div>`;
}

function Ekip({ rpc, yetki, goster }) {
  const [liste, al] = useListe(rpc, "oyun_ekip_listesi");
  const [ad, setAd] = useState("");
  const [seviye, setSeviye] = useState("operator");
  const iz = (yetki && yetki.izin) || {};
  const benim = yetki && yetki.seviye;
  const verebilir = [
    iz.sorumlu_ata ? ["sorumlu", "🎮 Sorumlu"] : null,
    benim === "sorumlu" || (yetki && yetki.guc >= 9) ? ["yetkili", "⚡ Süper Op."] : null,
    ["operator", "🔹 Operatör"],
  ].filter(Boolean);
  const ata = async (kim, sv) => {
    try { const r = await rpc("oyun_ekip_ata", { p_kullanici: kim, p_seviye: sv }); goster(String(r).replace(/^tamam: /, "✅ "), 3000); setAd(""); al(); yonetimYenile(rpc, true); }
    catch (e) { goster(hataMetni(e), 3800); }
  };
  return html`<div>
    ${(iz.ekip || iz.sorumlu_ata) && html`<form class="oy-ata" onSubmit=${(e) => { e.preventDefault(); if (ad.trim()) ata(ad.trim(), seviye); }}>
      <input placeholder="@kullaniciadi" value=${ad} onInput=${(e) => setAd(e.target.value)} autocapitalize="none" autocorrect="off" spellcheck="false" />
      <select value=${seviye} onChange=${(e) => setSeviye(e.target.value)}>
        ${verebilir.map(([k, a]) => html`<option key=${k} value=${k}>${a}</option>`)}
      </select>
      <button type="submit" disabled=${!ad.trim()}>Ata</button>
    </form>`}
    <p class="oy-acik">Salon Sorumlusu tek kişidir ve bütün oyunlardan sorumludur. Genel yönetim (moderatör ve üstü) oyunlarda zaten yetkilidir.</p>
    ${liste == null ? html`<div class="oy-bos">Yükleniyor…</div>`
      : !liste.length ? html`<div class="oy-bos">Henüz salon ekibi yok.</div>`
      : liste.map((e) => html`<div key=${e.ad} class="oy-satir">
          <div class="oy-ust"><b>${e.ad}</b><span>${e.seviye_adi}</span></div>
          <div class="oy-kim">Görev: ${saat(e.created_at)}${e.last_seen_at ? " • Son görülme: " + saat(e.last_seen_at) : ""}</div>
          ${e.islem_yapabilir && html`<button class="oy-ac" onClick=${() => ata(e.ad, null)}>Görevden al</button>`}
        </div>`)}
  </div>`;
}

function Salon({ rpc, iz, goster }) {
  const [d, al] = useListe(rpc, "oyun_salon_masalari");
  const islem = async (ad, arg) => {
    try { const r = await rpc(ad, arg); goster(String(r || "Tamam").replace(/^tamam: /, "✅ "), 3000); al(); }
    catch (e) { goster(hataMetni(e), 3800); }
  };
  if (d == null || Array.isArray(d)) return html`<div class="oy-bos">Yükleniyor…</div>`;
  return html`<div>
    <div class="oy-satir">
      <div class="oy-ust"><b>💬 Oyun sohbetleri</b><span>${d.sohbet_acik ? "Açık" : "Kapalı"}</span></div>
      <div class="oy-kim">Salon sohbeti ve bütün masa sohbetleri birlikte açılır / kapanır.</div>
      <button class="oy-ac" onClick=${() => islem("oyun_sohbet_ayarla", { p_acik: !d.sohbet_acik })}>${d.sohbet_acik ? "Sohbetleri kapat" : "Sohbetleri aç"}</button>
    </div>
    <p class="oy-acik">Şu an kullanılan masalar. Takılan bir masayı sıfırlarsan masadakiler salona döner.</p>
    ${!(d.masalar || []).length ? html`<div class="oy-bos">Şu an dolu masa yok.</div>`
      : d.masalar.map((m) => html`<div key=${m.oyun + m.id} class="oy-satir">
          <div class="oy-ust"><b>${OYUN_AD[m.oyun]} • ${m.ad}</b><span>${m.durum === "oynaniyor" ? "Oyunda" : m.durum === "bekliyor" ? "Bekliyor" : "Bitti"}</span></div>
          <div class="oy-kim">${(m.koltuklar || []).map((k) => k.ad).join(" • ") || "—"}</div>
          ${iz.sifirla && html`<button class="oy-ac" onClick=${() => islem("oyun_masa_sifirla", { p_oyun: m.oyun, p_masa: m.id })}>Masayı sıfırla</button>`}
        </div>`)}
  </div>`;
}
