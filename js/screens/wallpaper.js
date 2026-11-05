// 1.1.2.4: 🎨 Duvar kâğıdı seçimi (Ayarlar → Duvar kâğıdı)
import { html, useState, useEffect, navigate, toast, userMessage } from "../lib.js";
import { TopBar, Spinner, pickPhotos } from "../ui.js";
import * as wall from "../wall.js";

export function WallpaperScreen() {
  const w = wall.useWall();
  const [busy, setBusy] = useState(false);
  useEffect(() => { wall.refresh(); }, []);

  function pickOwn() {
    if (busy) return;
    pickPhotos({
      onPicked: async (files) => {
        setBusy(true);
        try {
          await wall.setPhoto(files[0]);
          toast("🎨 Duvar kâğıdın değişti");
        } catch (e) {
          toast(userMessage(e, "Fotoğraf açılamadı"), 3500);
        }
        setBusy(false);
      },
    });
  }

  const tiles = [...wall.BUILT_IN, ...wall.serverList()];
  return html`
    <div class="screen has-wall">
      <${wall.WallLayer} />
      <${TopBar} title="🎨 Duvar kâğıdı" backLabel="←" onBack=${() => navigate("/ayarlar")}
        right=${busy && html`<${Spinner} small />`} />
      <div class="wp-body">
        <div class="wp-card">
          <b>Belirginlik</b>
          <div class="muted small">Azaltırsan yazılar daha rahat okunur. Tüm sohbetlerde ve ana sayfada görünür.</div>
          <input type="range" min="0.15" max="1" step="0.05" value=${w.strength}
            onInput=${(e) => wall.setStrength(parseFloat(e.target.value))} aria-label="Belirginlik" />
        </div>
        <div class="wp-grid">
          <button class=${"wp-tile" + (w.id === wall.PHOTO ? " on" : "")} onClick=${pickOwn}>
            <div class="wp-img" style=${wall.hasPhoto() ? `background-image:url("${wall.photoSrc()}")` : ""}>
              ${!wall.hasPhoto() && html`<span class="wp-own">📷<br />Galeriden<br />seç</span>`}
            </div>
            <span class="wp-name">📷 Kendi fotoğrafım</span>
          </button>
          ${tiles.map((t) => html`
            <button key=${t.id} class=${"wp-tile" + (w.id === t.id ? " on" : "")} onClick=${() => wall.choose(t.id)}>
              <div class="wp-img" style=${`background-image:url("${t.url}")`}></div>
              <span class="wp-name">${t.name}</span>
            </button>`)}
          <button class=${"wp-tile" + (w.id === wall.NONE ? " on" : "")} onClick=${() => wall.choose(wall.NONE)}>
            <div class="wp-img plain"></div>
            <span class="wp-name">Düz (kâğıt yok)</span>
          </button>
        </div>
      </div>
    </div>`;
}
