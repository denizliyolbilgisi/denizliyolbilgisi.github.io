// 💊 Nöbetçi Eczaneler: kart listesi (📞 Ara • 🗺 Haritada) ve eczane haritası
import { html, useState, useEffect, useRef, navigate, userMessage } from "../lib.js";
import * as api from "../api.js";
import { TopBar, Spinner, useOnResume, useLive } from "../ui.js";
import { DENIZLI } from "../config.js";

const SEKMELER = [
  ["MERKEZEFENDİ", "Merkezefendi"],
  ["PAMUKKALE", "Pamukkale"],
  ["DİĞER", "Diğer"],
];
const ANA = ["MERKEZEFENDİ", "PAMUKKALE"];

const grupOf = (e) => (ANA.includes(e.ilce) ? e.ilce : "DİĞER");
const trLower = (s) => (s || "").toLocaleLowerCase("tr-TR");
/** "MERKEZEFENDİ" → "Merkezefendi" */
const ilceAdi = (s) => (s ? s.charAt(0) + trLower(s.slice(1)) : "");
/** "02583611230" → "0258 361 12 30" */
export function telYaz(t) {
  const d = (t || "").replace(/\D/g, "");
  return /^0\d{10}$/.test(d) ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}` : (t || "");
}
const telHref = (t) => "tel:" + (t || "").replace(/[^\d+]/g, "");
/** 🧭 Yol tarifi: iPhone'da Apple Haritalar, diğerlerinde Google Haritalar navigasyonu açar */
export function yolHref(e) {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios
    ? `https://maps.apple.com/?daddr=${e.lat},${e.lng}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}&travelmode=driving`;
}
function saatAraligi(b, e) {
  if (!b || !e) return null;
  const f = (x) => new Date(x).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "").replace(/\//g, ".");
  return `${f(b)} → ${f(e)}`;
}
function baslikTarih(list) {
  const b = list.find((e) => e.baslangic)?.baslangic;
  return new Date(b || Date.now()).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
}

let onbellek = null;   // liste ↔ harita geçişinde tekrar yüklenmesin
async function yukle() {
  onbellek = await api.eczaneler();
  return onbellek;
}

function EczaneKart({ e, ilceGoster }) {
  const aralik = saatAraligi(e.baslangic, e.bitis);
  return html`
    <div class="ecz-card">
      <div class="ecz-top">
        <b class="ecz-ad">${e.ad}</b>
        ${ilceGoster && html`<span class="ecz-ilce">${e.ilce}</span>`}
      </div>
      ${e.adres && html`<div class="ecz-adres">📍 ${e.adres}</div>`}
      ${aralik && html`<div class="ecz-saat">🕗 ${aralik}</div>`}
      <div class="ecz-btns">
        ${e.telefon
          ? html`<a class="btn ecz-ara" href=${telHref(e.telefon)}>📞 Ara</a>`
          : html`<span class="btn ecz-ara off">📞 Telefon yok</span>`}
        ${e.lat != null && e.lng != null
          ? html`<button class="btn ecz-map" onClick=${() => navigate("/eczane-harita?id=" + e.id)}>🗺 Haritada</button>
                 <a class="btn ecz-yol" href=${yolHref(e)} target="_blank" rel="noopener">🧭 Yol Tarifi</a>`
          : html`<span class="btn ecz-map off">🗺 Konum yok</span>`}
      </div>
      ${e.telefon && html`<div class="ecz-tel">${telYaz(e.telefon)}</div>`}
    </div>`;
}

export function EczaneScreen() {
  const [list, setList] = useState(onbellek);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState(() => {
    try { return sessionStorage.getItem("dyb_ecz_sekme") || "MERKEZEFENDİ"; } catch (_) { return "MERKEZEFENDİ"; }
  });
  const [q, setQ] = useState("");

  async function load() {
    try {
      setList(await yukle());
      setErr(null);
    } catch (e) {
      setErr(userMessage(e));
      setList((l) => l || []);
    }
    // Menüdeki "YENİ" işareti kalksın
    api.roomsOverview().then((rs) => {
      const r = (rs || []).find((x) => x.id === "eczane");
      if (r && r.last_message_id) api.markSeen("eczane", r.last_message_id);
    }).catch(() => {});
  }
  useEffect(() => { load(); }, []);
  useOnResume(load);
  useLive((kind) => { if (kind === "chat") load(); });

  const sec = (t) => { setTab(t); try { sessionStorage.setItem("dyb_ecz_sekme", t); } catch (_) { /* */ } };

  const all = list || [];
  const aranan = trLower(q.trim());
  const gorunen = aranan
    ? all.filter((e) => trLower(`${e.ad} ${e.adres || ""} ${e.ilce}`).includes(aranan))
    : all.filter((e) => grupOf(e) === tab);

  return html`
    <div class="screen">
      <${TopBar} title="💊 Nöbetçi Eczaneler"
        sub=${list && all.length ? `${baslikTarih(all)} • ${all.length} eczane` : "Denizli"}
        onBack=${() => navigate("/menu")} />
      ${list === null ? html`<${Spinner} />` : all.length === 0 ? html`
        <div class="content" style="text-align:center">
          <div style="font-size:56px">💊</div>
          <h2>${err || "Bugünün listesi henüz alınamadı."}</h2>
          <div class="soft">Liste gün içinde otomatik olarak eklenir. Acil durumda 112'yi arayabilirsin.</div>
        </div>` : html`
        <div class="ecz-tabs">
          ${SEKMELER.map(([k, ad]) => {
            const n = all.filter((e) => grupOf(e) === k).length;
            return html`<button key=${k} class=${"ecz-tab" + (!aranan && tab === k ? " on" : "")}
              onClick=${() => { setQ(""); sec(k); }}>${ad} <span>${n}</span></button>`;
          })}
        </div>
        <div class="ecz-search">
          <input class="input" type="search" placeholder="🔍 Eczane veya mahalle ara" value=${q}
            autocomplete="off" onInput=${(e) => setQ(e.target.value)} />
        </div>
        <div class="ecz-list">
          ${gorunen.length === 0 && html`<div class="soft" style="text-align:center;padding:20px">Eczane bulunamadı.</div>`}
          ${(() => {
            // Diğer ilçelerde ilçe başlığı
            let son = null;
            return gorunen.map((e) => {
              const baslik = !aranan && tab === "DİĞER" && e.ilce !== son;
              son = e.ilce;
              return html`
                ${baslik && html`<div class="ecz-ilce-baslik" key=${"h" + e.ilce}>▪️ ${ilceAdi(e.ilce)}</div>`}
                <${EczaneKart} key=${e.id} e=${e} ilceGoster=${aranan || tab !== "DİĞER"} />`;
            });
          })()}
          <div class="ecz-kaynak">Denizli Eczacı Odası'ndan alıntıdır</div>
        </div>`}
    </div>`;
}

/** Eczane haritası: seçilen eczaneye yakınlaşır, diğer nöbetçiler de 💊 olarak görünür */
export function EczaneMapScreen({ focusId }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const [list, setList] = useState(onbellek);
  const [sel, setSel] = useState(null);

  useEffect(() => {
    if (!list) yukle().then(setList).catch(() => setList([]));
  }, []);

  useEffect(() => {
    const L = window.L;
    const map = L.map(mapEl.current, { zoomControl: false, attributionControl: true })
      .setView([DENIZLI.lat, DENIZLI.lng], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);
    return () => map.remove();
  }, []);

  useEffect(() => {
    const L = window.L;
    const map = mapRef.current;
    if (!map || !list) return;
    const layer = L.layerGroup().addTo(map);
    const konumlu = list.filter((e) => e.lat != null && e.lng != null);
    konumlu.forEach((e) => {
      const odak = String(e.id) === String(focusId);
      L.marker([e.lat, e.lng], {
        zIndexOffset: odak ? 1000 : 0,
        icon: L.divIcon({
          className: "",
          html: `<div class="ecz-pin${odak ? " focus" : ""}">💊</div>`,
          iconSize: odak ? [48, 48] : [34, 34],
          iconAnchor: odak ? [24, 24] : [17, 17],
        }),
      }).on("click", () => setSel(e)).addTo(layer);
    });
    const f = konumlu.find((e) => String(e.id) === String(focusId));
    if (f) {
      map.setView([f.lat, f.lng], 17);
      setSel(f);
    } else if (konumlu.length) {
      map.fitBounds(konumlu.map((e) => [e.lat, e.lng]), { padding: [40, 40] });
    }
    return () => layer.remove();
  }, [list, focusId]);

  return html`
    <div class="mapwrap">
      <div id="map" ref=${mapEl}></div>
      <div class="map-top">
        <button class="btn back" onClick=${() => navigate("/oda/eczane")}>← Liste</button>
        <div class="legend"><div>💊 Nöbetçi eczaneler</div></div>
      </div>
      <div class="map-bottom">
        ${sel && html`
          <div class="ecz-card ecz-pop">
            <div class="ecz-top">
              <b class="ecz-ad">${sel.ad}</b>
              <span class="ecz-ilce">${sel.ilce}</span>
              <button class="ecz-x" onClick=${() => setSel(null)}>✕</button>
            </div>
            ${sel.adres && html`<div class="ecz-adres">📍 ${sel.adres}</div>`}
            <div class="ecz-btns">
              ${sel.telefon && html`<a class="btn ecz-ara" href=${telHref(sel.telefon)}>📞 Ara</a>`}
              <a class="btn ecz-yol" href=${yolHref(sel)} target="_blank" rel="noopener">🧭 Yol Tarifi</a>
            </div>
            ${sel.telefon && html`<div class="ecz-tel">${telYaz(sel.telefon)}</div>`}
          </div>`}
      </div>
    </div>`;
}
