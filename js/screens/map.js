// Harita: radar, kaza, yol durumu bildirimleri, "Hâlâ var / Yok", 500 m yaklaşma uyarısı
import { html, useState, useEffect, useRef, navigate, userMessage, clock, agoText, sleep } from "../lib.js";
import * as api from "../api.js";
import { Modal, Spinner, useInterval, useOnResume } from "../ui.js";
import { DENIZLI, FETCH_RADIUS_M, ALERT_DISTANCE_M } from "../config.js";

const REFETCH_AFTER_MOVE_M = 5000;
const FADE_LAST_MIN = 5;

function distance(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function minutesLeft(expires) {
  if (!expires) return null;
  return Math.floor((new Date(expires).getTime() - Date.now()) / 60000);
}

function remaining(expires) {
  const m = minutesLeft(expires);
  if (m === null) return "Süresiz";
  if (m <= 0) return "Süresi doluyor";
  if (m < 60) return `${m} dk`;
  if (m < 1440) return m % 60 ? `${Math.floor(m / 60)} saat ${m % 60} dk` : `${m / 60} saat`;
  const h = Math.floor((m % 1440) / 60);
  return h ? `${Math.floor(m / 1440)} gün ${h} saat` : `${Math.floor(m / 1440)} gün`;
}

// ---------- Sesli uyarı (iPhone'da ilk dokunuştan sonra çalışır) ----------
let audioCtx = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (_) { /* */ }
}
function beep() {
  try {
    if (!audioCtx) return;
    [0, 0.5].forEach((t) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 1100;
      o.connect(g);
      g.connect(audioCtx.destination);
      const s = audioCtx.currentTime + t;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.6, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.35);
      o.start(s);
      o.stop(s + 0.4);
    });
    if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
  } catch (_) { /* */ }
}

export function MapScreen({ focusRadarId, openReport }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const meMarker = useRef(null);
  const lastFetch = useRef(null);
  const alerted = useRef(new Set());
  const focusHandled = useRef(false);
  const reportHandled = useRef(false);

  const [radars, setRadars] = useState([]);
  const [loc, setLoc] = useState(null);
  const [locError, setLocError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [focusId, setFocusId] = useState(null);

  // Harita kurulumu
  useEffect(() => {
    const L = window.L;
    const map = L.map(mapEl.current, { zoomControl: false, attributionControl: true })
      .setView([DENIZLI.lat, DENIZLI.lng], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    document.addEventListener("touchstart", unlockAudio, { once: true });
    setTimeout(() => map.invalidateSize(), 200);
    return () => map.remove();
  }, []);

  // Konum takibi
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLocError("Bu cihazda konum desteklenmiyor.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setLoc({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocError(null);
      },
      (e) => {
        setLocError(e.code === 1
          ? "Konum izni kapalı. iPhone Ayarlar → Gizlilik ve Güvenlik → Konum Servisleri → Safari Web Siteleri → \"Uygulamayı Kullanırken\" seç."
          : "Konum bulunamadı. Açık alanda tekrar dene.");
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  async function load(center) {
    try {
      const list = await api.nearbyRadars(center.lat, center.lng, FETCH_RADIUS_M);
      setRadars(list || []);
      lastFetch.current = center;
      return list || [];
    } catch (e) {
      setMsg("Bildirimler yüklenemedi: " + userMessage(e));
      return null;
    }
  }

  useEffect(() => { load(DENIZLI); }, []);
  useInterval(() => { load(loc || DENIZLI); setTick((t) => t + 1); }, 60000, [loc]);
  useOnResume(() => load(loc || DENIZLI));

  // Konum ilk bulunduğunda / 5 km ilerleyince
  useEffect(() => {
    if (!loc) return;
    const L = window.L;
    if (!meMarker.current) {
      meMarker.current = L.marker([loc.lat, loc.lng], {
        icon: L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        zIndexOffset: 1000,
      }).addTo(mapRef.current);
      if (!focusRadarId) mapRef.current.setView([loc.lat, loc.lng], 15);
    } else {
      meMarker.current.setLatLng([loc.lat, loc.lng]);
    }
    if (!lastFetch.current || distance(lastFetch.current, loc) > REFETCH_AFTER_MOVE_M) load(loc);
  }, [loc]);

  // Radar işaretleri
  useEffect(() => {
    const L = window.L;
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    radars.forEach((r) => {
      const t = api.radarType(r.type);
      const left = minutesLeft(r.expires_at);
      const faded = left !== null && left <= FADE_LAST_MIN;
      const cls = "radar-pin" + (faded ? " faded" : "") + (String(r.id) === String(focusId) ? " focus" : "");
      L.marker([r.lat, r.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div class="${cls}" style="background:${t.color}">${t.emoji}</div>`,
          iconSize: [36, 36], iconAnchor: [18, 18],
        }),
      }).on("click", () => setSelected(r)).addTo(layer);
    });
  }, [radars, tick, focusId]);

  // Bildirimden gelindi: o radara git
  useEffect(() => {
    if (!focusRadarId || focusHandled.current || !mapRef.current) return;
    focusHandled.current = true;
    (async () => {
      let list = radars.length ? radars : await load(loc || DENIZLI);
      let r = (list || []).find((x) => String(x.id) === String(focusRadarId));
      if (!r) {
        await sleep(1500);
        list = await load(loc || DENIZLI);
        r = (list || []).find((x) => String(x.id) === String(focusRadarId));
      }
      if (r) {
        mapRef.current.setView([r.lat, r.lng], 17);
        setFocusId(r.id);
        setSelected(r);
        setTimeout(() => setFocusId(null), 4500);
      } else {
        setMsg("Bu bildirim artık aktif değil.");
      }
    })();
  }, [focusRadarId]);

  // Ana ekrandan "Bildir" ile gelindi
  useEffect(() => {
    if (openReport && !reportHandled.current) {
      reportHandled.current = true;
      setShowReport(true);
    }
  }, [openReport]);

  // En yakın uyarılı bildirim (500 m içinde) ve bir kez sesli uyarı. Yol çalışması gibi bipsiz türler sayılmaz.
  const beepers = radars.filter((r) => api.radarType(r.type).beep);
  const nearest = loc && beepers.length
    ? beepers.map((r) => [r, distance(loc, r)]).sort((a, b) => a[1] - b[1])[0] : null;
  const alert = nearest && nearest[1] <= ALERT_DISTANCE_M ? nearest : null;
  useEffect(() => {
    if (alert && !alerted.current.has(alert[0].id)) {
      alerted.current.add(alert[0].id);
      beep();
    }
  }, [alert && alert[0].id]);

  // Mesaj 3 sn sonra kaybolur
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  async function report(type) {
    setShowReport(false);
    unlockAudio();
    if (!loc) {
      setMsg(locError || "Konumun bulunamadı. Biraz bekleyip tekrar dene.");
      return;
    }
    setBusy(true);
    try {
      const place = await api.placeName(loc.lat, loc.lng);
      await api.reportRadar(type.key, loc.lat, loc.lng, place);
      setMsg(`${type.emoji} ${type.label} bildirildi, teşekkürler!`);
      await load(loc);
    } catch (e) {
      setMsg("Bildirilemedi: " + userMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function vote(r, stillThere) {
    setBusy(true);
    try {
      await api.voteRadar(r.id, stillThere);
      const list = await load(loc || DENIZLI);
      if (stillThere) {
        setMsg(`Onaylandı, süre ${api.durationText(api.radarType(r.type).minutes)} uzadı. Teşekkürler!`);
        setSelected((list || []).find((x) => x.id === r.id) || null);
      } else {
        setMsg("Bildirildi, teşekkürler!");
        setSelected(null);
      }
    } catch (e) {
      setMsg("Oy verilemedi: " + userMessage(e));
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }

  return html`
    <div class="mapwrap">
      <div id="map" ref=${mapEl}></div>

      <div class="map-top">
        <button class="btn back" onClick=${() => navigate("/menu")}>← Menü</button>
        ${(() => {
          // Sadece haritada olan türler
          const present = api.RADAR_TYPES.filter((t) => radars.some((r) => api.radarType(r.type).key === t.key));
          return present.length > 0 && html`<div class="legend">
            ${present.map((t) => html`<div key=${t.key}><i class="c" style=${`background:${t.color}`}>${t.emoji}</i>${t.label}</div>`)}
          </div>`;
        })()}
      </div>

      <div class="map-bottom">
        ${alert && html`<div class="alert">⚠ ${Math.round(alert[1])} m ileride ${api.radarType(alert[0].type).emoji} ${api.radarType(alert[0].type).label}</div>`}
        ${locError && html`<div class="map-msg">${locError}</div>`}
        ${msg && html`<div class="map-msg">${msg}</div>`}
        <div class="fab-row">
          <button class="fab" title="Konumum" onClick=${() => {
            unlockAudio();
            if (loc) mapRef.current.setView([loc.lat, loc.lng], 16);
            else setMsg(locError || "Konum aranıyor…");
          }}>◎</button>
          <button class="report-btn" disabled=${busy} onClick=${() => { unlockAudio(); setShowReport(true); }}>
            ${busy ? html`<${Spinner} small />` : "➕ Durum Bildir"}
          </button>
        </div>
      </div>

      ${showReport && html`
        <div class="rsheet-back" onClick=${() => setShowReport(false)}>
          <div class="rsheet" onClick=${(e) => e.stopPropagation()}>
            <div class="rsheet-handle"></div>
            <div class="row" style="align-items:center">
              <h2 class="grow" style="margin:0">Durum bildir</h2>
              <button class="btn ghost" style="font-size:22px" onClick=${() => setShowReport(false)}>✕</button>
            </div>
            <div class="muted" style="margin-bottom:10px">Bulunduğun yere eklenir. Ne gördün?</div>
            <div class="report-grid">
              ${api.RADAR_TYPES.map((t) => html`
                <button key=${t.key} class="report-tile" onClick=${() => report(t)}>
                  <span class="ic" style=${`background:${t.color}`}>${t.emoji}</span>
                  <b>${t.label}</b>
                  <small>Haritada ${api.durationText(t.minutes)}</small>
                </button>`)}
            </div>
          </div>
        </div>`}

      ${selected && (() => {
        const t = api.radarType(selected.type);
        return html`
          <${Modal} onClose=${() => setSelected(null)}
            actions=${[
              html`<button class="btn outline" disabled=${busy} onClick=${() => vote(selected, false)}>Yok</button>`,
              html`<button class="btn green" disabled=${busy} onClick=${() => vote(selected, true)}>Hâlâ var</button>`,
            ]}>
            <div class="row" style="margin-bottom:10px">
              <div class="radar-pin" style=${`background:${t.color}`}>${t.emoji}</div>
              <h3 style="margin:0">${t.label}</h3>
            </div>
            ${selected.place && html`<div class="info-row"><span class="l">🗺 Yer</span><span>${selected.place}</span></div>`}
            <div class="info-row"><span class="l">📍 Bildirildi</span><span>${clock(selected.created_at)} (${agoText(selected.created_at)})</span></div>
            <div class="info-row"><span class="l">✅ Son onay</span><span>${clock(selected.last_confirmed_at)} (${agoText(selected.last_confirmed_at)})</span></div>
            <div class="info-row"><span class="l">👥 Onaylayan</span><span>${selected.confirm_count} kişi</span></div>
            <div class="info-row"><span class="l">⏳ Kalan süre</span><span>${remaining(selected.expires_at)}</span></div>
            ${loc && html`<div class="info-row"><span class="l">📏 Uzaklık</span><span>${(() => {
              const d = distance(loc, selected);
              return d < 1000 ? Math.round(d / 10) * 10 + " m" : (d / 1000).toFixed(1).replace(".", ",") + " km";
            })()}</span></div>`}
            <div class="bold" style="margin-top:10px">Bu ${t.label.toLocaleLowerCase("tr-TR")} hâlâ var mı?</div>
            <div class="muted small">"Hâlâ var" dersen süre ${api.durationText(t.minutes)} uzar. 5 kişi "Yok" derse silinir.</div>
          </${Modal}>`;
      })()}
    </div>`;
}
