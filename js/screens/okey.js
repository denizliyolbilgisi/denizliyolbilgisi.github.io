// 1.1.2.7 🎴 Okey — iPhone ekranı (asıl oyun js/okey/okey.js; Android de aynısını kullanır)
import { html, useEffect, navigate, can } from "../lib.js";
import * as api from "../api.js";
import { OkeyApp } from "../okey/okey.js";

export function OkeyScreen() {
  // sayfa kaymasın (masada sürükleme var)
  useEffect(() => {
    document.documentElement.classList.add("okey-acik");
    return () => document.documentElement.classList.remove("okey-acik");
  }, []);
  if (!can("okey_oyna")) {
    return html`<div class="screen"><div class="content center" style="gap:14px">
      <div style="font-size:48px">🎴</div><b>Okey şu an sadece yönetim ekibine açık.</b>
      <button class="btn" onClick=${() => navigate("/menu")}>Ana sayfaya dön</button></div></div>`;
  }
  return html`<${OkeyApp} rpc=${api.rpcCall} onExit=${() => navigate("/menu")} />`;
}

/** Ana sayfa kartı (yalnız izni olana) */
export function OkeyHomeCard() {
  if (!can("okey_oyna")) return null;
  return html`
    <button class="video-hero okey-hero" onClick=${() => navigate("/okey")}>
      <span class="vh-th okey-th"><i>🎴</i></span>
      <span class="grow" style="min-width:0">
        <span class="vh-t">🎴 Okey</span>
        <span class="vh-d">Masa aç ya da otur • eksik yerlere bot oturur</span>
      </span>
      <span class="hh-c">›</span>
    </button>`;
}
