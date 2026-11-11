// 1.1.2.7 🎴 Okey — Android uygulamasının içindeki sayfa (okey.html).
// Oturum anahtarı uygulamadan alınır (DYBAndroid.token()); yenileme anahtarı sayfaya hiç verilmez.
import { html, render } from "../../vendor/preact-htm.js";
import { SUPABASE_URL, SUPABASE_KEY } from "../config.js";
import { OkeyApp } from "./okey.js";

const koprü = window.DYBAndroid;
const token = () => { try { return koprü ? koprü.token() : null; } catch (_) { return null; } };
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(ad, arg = {}, tekrar = true) {
  const t = token();
  if (!t) { if (tekrar) { await bekle(1500); return rpc(ad, arg, false); } throw Object.assign(new Error("jwt yok"), { code: "JWT" }); }
  const ctrl = new AbortController();
  const zaman = setTimeout(() => ctrl.abort(), 15000);
  let r;
  try {
    r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${ad}`, {
      method: "POST", signal: ctrl.signal,
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + t, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(arg),
    });
  } finally { clearTimeout(zaman); }
  const metin = await r.text();
  const veri = metin ? JSON.parse(metin) : null;
  if (!r.ok) {
    // süresi dolmuş anahtar: uygulama yeniler, bir kez daha dene
    if (r.status === 401 && tekrar) { try { koprü && koprü.refresh && koprü.refresh(); } catch (_) { /* */ } await bekle(1500); return rpc(ad, arg, false); }
    throw Object.assign(new Error(veri?.message || "Hata " + r.status), { code: veri?.code });
  }
  return veri;
}

const cik = () => { try { koprü ? koprü.close() : history.back(); } catch (_) { /* */ } };
const yon = (o) => { try { koprü && koprü.orientation && koprü.orientation(o); } catch (_) { /* */ } };

if (!koprü) {
  document.getElementById("app").innerHTML = '<div style="color:#fff;padding:40px;text-align:center;font-family:system-ui">Bu sayfa DYB uygulamasının içinden açılır.</div>';
} else {
  render(html`<${OkeyApp} rpc=${rpc} onExit=${cik} setOrientation=${yon} />`, document.getElementById("app"));
}
