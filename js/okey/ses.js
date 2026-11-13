// 1.1.2.8+ 🔊 Okey sesleri (Kenney ses paketleri, CC0 — telifsiz). iPhone ve Android aynı dosyayı kullanır.
// Web Audio ile çalınır (gecikmesiz). Telefonlar sesi ilk dokunuştan sonra açar; ilk dokunuşta kilit açılır.
const ADLAR = ["cek", "at", "diz", "sira", "sure", "karis", "kazan", "okey", "bitti", "hata", "b_top", "b_istaka", "b_bant", "b_cep"];
const KOK = new URL("../../snd/okey/", import.meta.url).href;
let ctx = null;
const tampon = {};
let yuklendi = false;

function acik() {
  try { return localStorage.getItem("okey_ses") !== "0"; } catch (_) { return true; }
}
export function sesAcikMi() { return acik(); }
export function sesAyarla(on) {
  try { localStorage.setItem("okey_ses", on ? "1" : "0"); } catch (_) { /* */ }
  if (on) { hazirla(); cal("diz"); }
}

function hazirla() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    if (!yuklendi) {
      yuklendi = true;
      ADLAR.forEach((ad) => {
        fetch(KOK + ad + ".mp3")
          .then((r) => r.arrayBuffer())
          .then((b) => new Promise((ok, red) => ctx.decodeAudioData(b, ok, red)))
          .then((buf) => { tampon[ad] = buf; })
          .catch(() => {});
      });
    }
  } catch (_) { /* ses yoksa oyun yine çalışır */ }
}

// İlk dokunuşta ses kilidini aç (iPhone / Android kuralı)
if (typeof window !== "undefined") {
  const ac = () => { if (acik()) hazirla(); };
  window.addEventListener("pointerdown", ac, { passive: true });
  window.addEventListener("touchend", ac, { passive: true });
}

/** Sesi çal. ses: 0..1 */
export function cal(ad, ses = 1) {
  if (!acik()) return;
  try {
    hazirla();
    const buf = tampon[ad];
    if (!ctx || !buf || ctx.state !== "running") return;
    const kaynak = ctx.createBufferSource();
    kaynak.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = ses;
    kaynak.connect(g).connect(ctx.destination);
    kaynak.start();
  } catch (_) { /* */ }
}
