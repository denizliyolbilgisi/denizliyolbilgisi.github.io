// 1.1.3 🔔 "Sıra sende" uyarısı — Okey, Pişti, Bilardo (ve sonraki oyunlar) aynı modülü kullanır.
// Sıra gelince: yükselen ses (tam ses) + titreşim (Android) + ekranda "SIRA SENDE!" ve yanıp sönen kenar.
// 10 sn kala hâlâ oynamadıysa ses ve titreşim bir kez daha.
import { html } from "../../vendor/preact-htm.js";
import { cal } from "./ses.js";

/** Titreşim: Android uygulamasında köprü (telefon sessizdeyse titremez), diğerlerinde tarayıcı */
export function titret(desen = [180, 90, 180]) {
  try {
    const k = window.DYBAndroid;
    if (k && typeof k.titret === "function") { k.titret(desen.join(",")); return; }
  } catch (_) { /* eski uygulama */ }
  try { if (navigator.vibrate) navigator.vibrate(desen); } catch (_) { /* iPhone desteklemez */ }
}

/**
 * Her çizimde çağrılır (oyunlar zaten 250 ms'de bir çiziliyor).
 * siram: şu an sıra bende mi; kalan: hamle için kalan saniye (bilinmiyorsa null).
 * Dönüş: "SIRA SENDE!" yazısı şu an görünsün mü.
 */
export function siraTakip(ref, siram, kalan) {
  const r = ref.current || (ref.current = { siram: false, tekrar: false, bitis: 0, basla: 0, son: null });
  const simdi = Date.now();
  if (!siram) {
    r.siram = false; r.tekrar = false; r.son = null;
    return false;
  }
  if (!r.siram) {
    r.siram = true; r.tekrar = false; r.basla = simdi; r.bitis = simdi + 2600;
    setTimeout(() => { cal("sira", 1); titret(); }, 200);
  } else if (kalan != null && r.son != null && kalan > r.son + 3) {
    r.tekrar = false;                       // aynı oyuncuya yeni hamle süresi (ör. bilardoda top soktu)
  }
  if (!r.tekrar && kalan != null && kalan <= 10 && kalan > 1 && simdi - r.basla > 3000) {
    r.tekrar = true; r.bitis = simdi + 1800;
    cal("sira", 1); titret([140]);
  }
  if (kalan != null) r.son = kalan;
  return simdi < r.bitis;
}

/** Ekrandaki uyarı (dokunmayı engellemez) */
export function SiraSende({ goster, sesOn }) {
  if (!goster) return null;
  return html`<div class="sira-sende" role="status" aria-live="assertive">
    <div class="sira-kutu"><b>SIRA SENDE!</b>${!sesOn && html`<small>🔇 Oyun sesi kapalı</small>`}</div>
  </div>`;
}
