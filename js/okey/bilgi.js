// Oyun Salonu 2.0 — 🚦 Trafik Bilgi Yarışması (10 soru, soru başına süre, haftalık sıralama)
// Doğru cevap sunucuda; telefon sadece seçimini gönderir.
import { html, useState, useEffect, useRef } from "../../vendor/preact-htm.js";
import { hataMetni, useToast, Bildirim } from "./okey.js";
import { cal } from "./ses.js";

const HARF = ["A", "B", "C", "D"];

export function BilgiEkrani({ rpc }) {
  const [durum, setDurum] = useState(null);
  const [oturum, setOturum] = useState(null);     // {id, soru}
  const [sonuc, setSonuc] = useState(null);       // son cevabın sonucu
  const [secim, setSecim] = useState(null);
  const [bitti, setBitti] = useState(null);       // {toplam, dogru_sayi}
  const [sira, setSira] = useState(null);
  const [mesgul, setMesgul] = useState(false);
  const [alinma, setAlinma] = useState(Date.now());
  const [, tik] = useState(0);
  const [toast, goster] = useToast();
  const gonderildi = useRef(false);
  const sonTik = useRef(null);

  async function yukle() {
    try {
      const d = await rpc("bilgi_durum");
      setDurum(d);
      if (d.aktif_oturum && !oturum) {
        const r = await rpc("bilgi_soru", { p_oturum: d.aktif_oturum });
        if (!r.bitti) { setOturum({ id: r.oturum, soru: r.soru, toplam: r.toplam }); setAlinma(Date.now()); gonderildi.current = false; }
      }
    } catch (e) { goster(hataMetni(e, "Yarışma bilgisi alınamadı."), 3500); }
  }
  async function siralamaYukle() { try { setSira(await rpc("bilgi_siralama")); } catch (_) { /* */ } }
  useEffect(() => { yukle(); siralamaYukle(); const t = setInterval(() => tik((x) => x + 1), 250); return () => clearInterval(t); }, []);

  const soru = oturum?.soru;
  const kalan = soru && !sonuc ? Math.max(0, soru.kalan_sn - (Date.now() - alinma) / 1000) : null;
  // süre doldu → otomatik "cevapsız"
  useEffect(() => { if (kalan != null && kalan <= 0 && !gonderildi.current) cevapla(-1); }, [kalan != null && kalan <= 0]);
  const sn = kalan == null ? null : Math.ceil(kalan);
  if (sn != null && sn <= 5 && sn >= 1 && sonTik.current !== sn) { sonTik.current = sn; cal("sure", 0.4); }

  async function basla() {
    if (mesgul) return;
    setMesgul(true);
    try {
      const r = await rpc("bilgi_basla");
      setOturum({ id: r.oturum, soru: r.soru, toplam: 0 }); setSonuc(null); setSecim(null); setBitti(null);
      setAlinma(Date.now()); gonderildi.current = false; cal("karis", 0.6);
    } catch (e) { goster(hataMetni(e), 4000); }
    setMesgul(false);
  }
  async function cevapla(i) {
    if (!oturum || gonderildi.current) return;
    gonderildi.current = true;
    setSecim(i);
    try {
      const r = await rpc("bilgi_cevap", { p_oturum: oturum.id, p_secim: i });
      setSonuc(r);
      cal(r.dogru ? "kazan" : "hata", r.dogru ? 0.7 : 0.5);
      setOturum((o) => ({ ...o, toplam: r.toplam }));
      if (r.bitti) { setBitti({ toplam: r.toplam, dogru_sayi: r.dogru_sayi }); }
    } catch (e) { gonderildi.current = false; goster(hataMetni(e), 3500); }
  }
  async function sonraki() {
    if (bitti) { setOturum(null); setSonuc(null); setSecim(null); yukle(); siralamaYukle(); return; }
    setMesgul(true);
    try {
      const r = await rpc("bilgi_soru", { p_oturum: oturum.id });
      setOturum({ id: r.oturum, soru: r.soru, toplam: r.toplam }); setSonuc(null); setSecim(null);
      setAlinma(Date.now()); gonderildi.current = false;
    } catch (e) { goster(hataMetni(e), 3500); }
    setMesgul(false);
  }

  // ---------- soru ekranı ----------
  if (oturum && soru) {
    const oran = kalan == null ? 0 : kalan / (soru.sure || 20);
    return html`
      <div class="bq-kutu">
        <div class="bq-ust">
          <span class="bq-no">Soru ${soru.no} / ${soru.adet}</span>
          <span class="bq-kat">${soru.kategori}</span>${soru.zorluk ? html`<span class=${"bq-zor bq-z" + soru.zorluk}>${["", "Kolay", "Normal", "Zor"][soru.zorluk]}</span>` : null}
          <span class="bq-puan">⭐ ${oturum.toplam || 0}</span>
        </div>
        <div class="bq-sure"><i style=${`width:${Math.max(0, oran * 100)}%;background:${oran < 0.3 ? "#EF4444" : "#FACC15"}`}></i></div>
        <div class="bq-soru">${soru.soru}</div>
        <div class="bq-secenekler">
          ${soru.secenekler.map((t, i) => {
            let cls = "bq-sec";
            if (sonuc) { if (i === sonuc.dogru_secim) cls += " dogru"; else if (i === secim) cls += " yanlis"; else cls += " soluk"; }
            return html`<button key=${i} class=${cls} disabled=${!!sonuc || gonderildi.current} onClick=${() => cevapla(i)}>
              <b>${HARF[i]}</b><span>${t}</span></button>`;
          })}
        </div>
        ${!sonuc && html`<div class="bq-alt">${sn} sn • hızlı cevap daha çok puan</div>`}
        ${sonuc && html`
          <div class=${"bq-sonuc " + (sonuc.dogru ? "iyi" : "kotu")}>
            <b>${sonuc.dogru ? `✅ Doğru! +${sonuc.puan}` : secim === -1 ? "⏱ Süre doldu" : "❌ Yanlış"}</b>
            ${sonuc.aciklama && html`<p>💡 ${sonuc.aciklama}</p>`}
            ${sonuc.kaynak && html`<small>Kaynak: ${sonuc.kaynak}</small>`}
          </div>
          <button class="bq-ileri" disabled=${mesgul} onClick=${sonraki}>${bitti ? "Sonucu gör" : "Sonraki soru ›"}</button>`}
        <${Bildirim} metin=${toast} />
      </div>`;
  }

  // ---------- giriş / sonuç / sıralama ----------
  return html`
    <div class="bq-giris">
      ${bitti && html`
        <div class="bq-bitti">
          <div class="bq-kupa">${bitti.dogru_sayi >= 8 ? "🏆" : bitti.dogru_sayi >= 5 ? "🥈" : "🚦"}</div>
          <b>${bitti.dogru_sayi} / 10 doğru • ${bitti.toplam} puan</b>
          <span>${bitti.dogru_sayi >= 8 ? "Harika! Trafik kurallarına çok hâkimsin." : bitti.dogru_sayi >= 5 ? "İyi gidiyorsun!" : "Açıklamaları okuyup tekrar dene."}</span>
        </div>`}
      <div class="bq-kart">
        <div class="bq-baslik">🚦 Trafik Bilgi Yarışması</div>
        <div class="bq-acik">10 soru • soru başına ${20} sn • hızlı ve doğru cevap daha çok puan</div>
        <div class="bq-ist">
          <div><b>${durum ? durum.hak : "–"}</b><span>Bugünkü hak</span></div>
          <div><b style="color:#FACC15">${durum ? durum.haftalik_puan : "–"}</b><span>Haftalık puan</span></div>
          <div><b style="color:#4ADE80">${durum?.haftalik_sira ? durum.haftalik_sira + "." : "–"}</b><span>Sıran</span></div>
        </div>
        <button class="bq-basla" disabled=${mesgul || !durum || durum.hak <= 0} onClick=${basla}>
          ${durum && durum.hak <= 0 ? "Bugünkü hakların bitti • yarın yine gel" : "▶ Yarışmaya başla"}
        </button>
      </div>
      <div class="ok-bolum">BU HAFTANIN SIRALAMASI</div>
      <div class="bq-sira">
        ${!sira && html`<div class="ok-bos">Yükleniyor…</div>`}
        ${sira && !sira.liste.length && html`<div class="ok-bos">Bu hafta henüz kimse yarışmadı. İlk sen ol!</div>`}
        ${(sira?.liste || []).map((x) => html`
          <div key=${x.ad} class=${"bq-satir" + (x.ben ? " ben" : "")}>
            <span class="bq-s">${x.sira <= 3 ? ["🥇", "🥈", "🥉"][x.sira - 1] : x.sira + "."}</span>
            <span class="bq-ad">${x.ad}</span>
            <span class="bq-d">${x.dogru} doğru</span>
            <span class="bq-p">${x.puan}</span>
          </div>`)}
      </div>
      <${Bildirim} metin=${toast} />
    </div>`;
}
