// Oyun Salonu 2.0 — 🔤 Günün Kelimesi (her gün bir trafik terimi, 6 hak). Kelime ve renkler sunucuda.
import { html, useState, useEffect } from "../../vendor/preact-htm.js";
import { hataMetni, useToast, Bildirim } from "./okey.js";
import { cal } from "./ses.js";

const KLAVYE = [
  ["E", "R", "T", "Y", "U", "I", "O", "P", "Ğ", "Ü"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ş", "İ"],
  ["⏎", "Z", "C", "V", "B", "N", "M", "Ö", "Ç", "⌫"],
];
const tr = (c) => (c === "i" ? "İ" : c === "ı" ? "I" : c.toLocaleUpperCase("tr-TR"));

export function KelimeEkrani({ rpc }) {
  const [d, setD] = useState(null);
  const [yazi, setYazi] = useState("");
  const [mesgul, setMesgul] = useState(false);
  const [salla, setSalla] = useState(false);
  const [toast, goster] = useToast();

  async function yukle() { try { setD(await rpc("kelime_durum")); } catch (e) { goster(hataMetni(e, "Kelime yüklenemedi."), 3500); } }
  useEffect(() => { yukle(); }, []);

  async function gonder() {
    if (!d || d.bitti || mesgul) return;
    if (yazi.length !== d.uzunluk) { setSalla(true); setTimeout(() => setSalla(false), 400); goster(`${d.uzunluk} harfli bir kelime yaz.`); return; }
    setMesgul(true);
    try {
      const r = await rpc("kelime_tahmin", { p_tahmin: yazi });
      setD(r); setYazi("");
      if (r.kazandi) cal("okey"); else if (r.bitti) cal("bitti"); else cal("diz", 0.8);
    } catch (e) { setSalla(true); setTimeout(() => setSalla(false), 400); goster(hataMetni(e), 3000); cal("hata", 0.4); }
    setMesgul(false);
  }
  function bas(k) {
    if (!d || d.bitti) return;
    if (k === "⏎") return gonder();
    if (k === "⌫") return setYazi((y) => y.slice(0, -1));
    setYazi((y) => (y.length < d.uzunluk ? y + k : y));
  }
  // fiziksel klavye (bilgisayardan deneme)
  useEffect(() => {
    const f = (e) => {
      if (e.key === "Enter") { e.preventDefault(); bas("⏎"); }
      else if (e.key === "Backspace") bas("⌫");
      else if (/^[a-zçğıöşüA-ZÇĞİÖŞÜ]$/.test(e.key)) bas(tr(e.key));
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });

  if (!d) return html`<div class="kl-kutu"><div class="ok-bos">Yükleniyor…</div><${Bildirim} metin=${toast} /></div>`;

  // klavye renkleri: Y (yeşil) > S (sarı) > G (gri)
  const renk = {};
  (d.tahminler || []).forEach(({ t, r }) => {
    const DERECE = { Y: 3, S: 2, G: 1 };
    [...t].forEach((c, i) => { if (!renk[c] || DERECE[r[i]] > DERECE[renk[c]]) renk[c] = r[i]; });
  });
  const satirlar = [];
  for (let i = 0; i < d.hak; i++) {
    const g = d.tahminler[i];
    const harfler = g ? [...g.t] : i === d.tahminler.length && !d.bitti ? [...yazi] : [];
    satirlar.push(html`
      <div key=${i} class=${"kl-satir" + (i === d.tahminler.length && salla ? " salla" : "")}>
        ${Array.from({ length: d.uzunluk }, (_, j) => html`
          <div key=${j} class=${"kl-hucre" + (g ? " r" + g.r[j] : harfler[j] ? " dolu" : "")}>${harfler[j] || ""}</div>`)}
      </div>`);
  }
  return html`
    <div class="kl-kutu">
      <div class="kl-ust">
        <div><b>🔤 Günün Kelimesi</b><span>${d.uzunluk} harf • 6 hak • ipucu: ${d.ipucu}</span></div>
        <div class="kl-seri" title="Art arda bilinen gün">🔥 ${d.seri}</div>
      </div>
      <div class="kl-izgara">${satirlar}</div>
      ${d.bitti && html`
        <div class=${"kl-sonuc " + (d.kazandi ? "iyi" : "kotu")}>
          <b>${d.kazandi ? `🎉 Bildin! ${d.tahminler.length}. denemede` : "Bu sefer olmadı"}</b>
          <span>Kelime: <b>${d.kelime}</b> • Yarın yeni kelime 🕛</span>
          <small>Bildiğin gün: ${d.kazanilan} / ${d.oynanan}</small>
        </div>`}
      ${!d.bitti && html`
        <div class="kl-klavye">
          ${KLAVYE.map((sira, i) => html`
            <div key=${i} class="kl-ksatir">
              ${sira.map((k) => html`<button key=${k} class=${"kl-tus" + (k === "⏎" || k === "⌫" ? " genis" : "") + (renk[k] ? " r" + renk[k] : "")}
                disabled=${mesgul} onClick=${() => bas(k)} aria-label=${k === "⏎" ? "Gönder" : k === "⌫" ? "Sil" : k}>${k}</button>`)}
            </div>`)}
        </div>`}
      <div class="kl-renkler"><span class="rY">A</span> doğru yerde <span class="rS">A</span> kelimede var <span class="rG">A</span> yok</div>
      <${Bildirim} metin=${toast} />
    </div>`;
}
