// Ortak arayüz parçaları
import { html, useState, useEffect, useRef } from "./lib.js";
import * as api from "./api.js";

/** Üst çubuk: büyük "← Menü" düğmesi + başlık */
export function TopBar({ title, sub, onBack, backLabel = "← Menü", right, onSubClick }) {
  return html`
    <div class="topbar">
      ${onBack && html`<button class="btn back" onClick=${onBack}>${backLabel}</button>`}
      <div class="title">
        <h1>${title}</h1>
        ${sub && html`<div class="sub" onClick=${onSubClick} style=${onSubClick ? "cursor:pointer" : ""}>${sub}</div>`}
      </div>
      ${right}
    </div>`;
}

/** Pencere. [center] true ise ortada, değilse alttan açılır */
export function Modal({ title, onClose, children, actions, center = true, closeOnBackdrop = true }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return html`
    <div class=${"overlay" + (center ? " mid" : "")}
         onClick=${(e) => { if (closeOnBackdrop && e.target === e.currentTarget && onClose) onClose(); }}>
      <div class="sheet" role="dialog">
        ${title && html`<h3>${title}</h3>`}
        ${children}
        ${actions && html`<div class="actions">${actions}</div>`}
      </div>
    </div>`;
}

export function Spinner({ small }) {
  return html`<div class=${"spinner" + (small ? " small" : "")}></div>`;
}

export function Switch({ checked, onChange, label }) {
  return html`
    <label class="switch-row">
      <span class="grow">${label}</span>
      <span class="switch">
        <input type="checkbox" checked=${checked} onChange=${(e) => onChange(e.target.checked)} />
        <span></span>
      </span>
    </label>`;
}

/** Ekranın altında kısa süre görünen yazı (toast) */
export function Toaster() {
  const [t, setT] = useState(null);
  useEffect(() => {
    let timer;
    const on = (e) => {
      setT(e.detail.text);
      clearTimeout(timer);
      timer = setTimeout(() => setT(null), e.detail.ms || 3000);
    };
    window.addEventListener("dyb-toast", on);
    return () => window.removeEventListener("dyb-toast", on);
  }, []);
  return t ? html`<div class="toast">${t}</div>` : null;
}

/** Belirli aralıkla çalışan görev (ekran açıkken) */
export function useInterval(fn, ms, deps = []) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms, ...deps]);
}

/** Uygulamaya her dönüşte (arka plandan öne gelince) çalışır */
export function useOnResume(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const on = () => { if (document.visibilityState === "visible") ref.current(); };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
}

/** Basılı tutma (iPhone'da 0,5 sn). Kaydırınca iptal olur. */
export function longPress(onLong, onClick) {
  let timer = null;
  let sx = 0;
  let sy = 0;
  let fired = false;
  const clear = () => { clearTimeout(timer); timer = null; };
  return {
    onTouchStart: (e) => {
      fired = false;
      const t = e.touches[0];
      sx = t.clientX;
      sy = t.clientY;
      clear();
      timer = setTimeout(() => {
        fired = true;
        if (navigator.vibrate) navigator.vibrate(20);
        onLong();
      }, 500);
    },
    onTouchMove: (e) => {
      const t = e.touches[0];
      if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) clear();
    },
    onTouchEnd: (e) => {
      clear();
      if (fired) e.preventDefault();
    },
    onTouchCancel: clear,
    onContextMenu: (e) => {
      e.preventDefault();
      if (!fired) onLong();
    },
    onClick: (e) => {
      if (fired) {
        fired = false;
        e.preventDefault();
        return;
      }
      if (onClick) onClick(e);
    },
  };
}

// ---------------------------------------------------------------------------
// Fotoğraflar
// ---------------------------------------------------------------------------

/** Gizli depodaki fotoğrafı gösterir */
export function Photo({ path, alt = "Fotoğraf" }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    api.photoUrl(path).then((u) => alive && setSrc(u)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [path]);
  if (failed) return html`<div class="center small muted" style="height:100%">⚠️</div>`;
  return src ? html`<img src=${src} alt=${alt} loading="lazy" />` : null;
}

/** Mesajdaki albüm (en fazla 5 fotoğraf) */
export function PhotoAlbum({ photos, expired, onOpen }) {
  if (!photos || !photos.length) return null;
  if (expired) {
    return html`<div class="expired">📷 ${photos.length > 1 ? photos.length + " fotoğraf" : "Fotoğraf"} süresi doldu</div>`;
  }
  const n = photos.length;
  return html`
    <div class=${"album n" + n}>
      ${photos.map((p, i) => html`
        <div class="ph" key=${p} onClick=${(e) => { e.stopPropagation(); onOpen(i); }}>
          <${Photo} path=${p} />
        </div>`)}
    </div>`;
}

/** Tam ekran fotoğraf (kaydırarak geçilir, iki parmakla yakınlaşır) */
export function PhotoViewer({ photos, start = 0, title, onClose }) {
  const box = useRef(null);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollLeft = el.clientWidth * start;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return html`
    <div class="viewer">
      <div class="vt">
        <button class="btn back" onClick=${onClose}>✕ Kapat</button>
        <div class="grow small">${title}</div>
      </div>
      <div class="vimgs" ref=${box}>
        ${photos.map((p) => html`<div class="vimg" key=${p}><${Photo} path=${p} /></div>`)}
      </div>
    </div>`;
}

/** Kamera / galeri seçimi (iPhone'un kendi seçicisi açılır) */
export function pickPhotos({ camera, multiple, onPicked }) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  if (camera) input.capture = "environment";
  if (multiple) input.multiple = true;
  input.style.display = "none";
  input.onchange = () => {
    const files = Array.from(input.files || []);
    input.remove();
    if (files.length) onPicked(files);
  };
  document.body.appendChild(input);
  input.click();
}

/** Uygulama açıkken bildirim gelince (sw.js haber verir) çalışır: ekran hemen yenilenir */
export function useLive(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const on = (e) => ref.current(e.detail);
    window.addEventListener("dyb-live", on);
    return () => window.removeEventListener("dyb-live", on);
  }, []);
}
