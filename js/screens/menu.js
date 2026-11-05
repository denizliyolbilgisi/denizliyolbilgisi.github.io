// Karşılama menüsü: Harita + sohbet odaları (küçük kartlar), altta kısayollar
import { html, useState, useEffect, useRef, navigate, agoText, remainingText, isStillActive, roleRank, toast, store, can } from "../lib.js";
import * as api from "../api.js";
import { Modal, useInterval, useOnResume, useLive } from "../ui.js";
import { DENIZLI, FETCH_RADIUS_M } from "../config.js";
import { enablePush, pushConfigured, pushSupported, permission } from "../push.js";
import { RankUpModal } from "./profile.js";
import { WallLayer, useWall, NONE, refresh as refreshWall } from "../wall.js";
import { refreshVoiceSettings } from "./voice.js";

const ROOM_COLORS = {
  trafik: ["#FFB020", "#E07B00"],
  is_ilanlari: ["#26A69A", "#00796B"],
  alim_satim: ["#EC407A", "#AD1457"],
  eczane: ["#22C55E", "#15803D"],
  dyt_sohbet: ["#8B5CF6", "#6D28D9"],
  yonetim: ["#475569", "#1E293B"],
};

// 1.1.2.0 düzeni: Trafik - Sohbet / İş İlanları - Alım-Satım / Eczane - Yönetim
const TILE_ORDER = { trafik: 1, dyt_sohbet: 2, is_ilanlari: 3, alim_satim: 4, eczane: 5, yonetim: 6 };
// Kutu zemin tonu (açık / koyu tema CSS'te)
const TILE_TINT = { trafik: "amber", eczane: "green", dyt_sohbet: "purple", is_ilanlari: "teal", alim_satim: "pink", yonetim: "slate" };

function MenuCard({ icon, colors, title, line, live, liveColor, unread, count = 0, onClick }) {
  return html`
    <button class=${"mcard" + (unread ? " unread" : "")} onClick=${onClick}>
      <div class="ico" style=${`background:linear-gradient(135deg,${colors[0]},${colors[1]})`}>${icon}</div>
      <div class="body">
        <div class="t"><span>${title}</span>${unread && html`<em class="new-pill" style="font-style:normal">${count >= 99 ? "99+ " : count > 0 ? count + " " : ""}YENİ</em>`}</div>
        ${line && html`<div class="line">${line}</div>`}
        <div class="live"><i class="dot" style=${`background:${liveColor}`}></i>${live}</div>
      </div>
      <div class="arrow">›</div>
    </button>`;
}

function Tile({ icon, label, color, count, onClick }) {
  return html`
    <button class="tile" style=${`background:${color}38;border-color:${color}b3`} onClick=${onClick}>
      <span class="i">${icon}</span>${label}
      ${count > 0 && html`<span class="count">${count > 9 ? "9+" : count}</span>`}
    </button>`;
}

export function MenuScreen({ onBanned }) {
  const wall = useWall();   // 🎨 1.1.2.4
  // Son görülen ana ekran telefonda saklı: açılışta her şey tek seferde gelir
  const cacheKey = "dyb_menu_" + (api.myId() || "");
  const [disk] = useState(() => store.get(cacheKey, null));
  const saveDisk = (part) => store.set(cacheKey, { ...(store.get(cacheKey, null) || {}), ...part });
  const [me, setMe] = useState(null);
  const [rooms, setRooms] = useState(() => (!api.hasRealRooms() && disk?.rooms?.length ? disk.rooms : api.cachedRooms()));
  const [roomsReady, setRoomsReady] = useState(() => api.hasRealRooms() || !!disk?.rooms?.length);   // false: iskelet kutular
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [chatError, setChatError] = useState(false);
  const [radars, setRadars] = useState(null);
  const [radarError, setRadarError] = useState(false);
  const [openReports, setOpenReports] = useState(0);
  const [dmUnread, setDmUnread] = useState(0);         // okunmamış özel mesaj
  const [roomUnread, setRoomUnread] = useState(() => disk?.unread || {});     // oda başına okunmamış
  const [announcement, setAnnouncement] = useState({ text: "", warn: false });
  const [tick, setTick] = useState(0);
  const [rankUp, setRankUp] = useState(null);   // { icon, name }
  const lastPoints = useRef(null);
  const [pushPerm, setPushPerm] = useState(permission());

  // Son bilinen rütbe saklanır: bağlantı koparsa Yönetim düğmesi kaybolmaz
  const roleKey = "dyb_son_rutbe_" + (api.myId() || "");
  const [knownRank, setKnownRank] = useState(() => store.get(roleKey, 1));
  const [canAdmin, setCanAdmin] = useState(() => can("yonetim_paneli"));   // telefonda saklı son izinler
  const retry = useRef(0);

  async function refresh() {
    api.me().then((p) => {
      if (!p) {
        // Oturum henüz hazır değil: eski bilgi kalsın, 5 sn sonra tekrar sor
        if (retry.current++ < 6) setTimeout(refresh, 5000);
        return;
      }
      retry.current = 0;
      setMe(p);
      if (p.username && p.username !== disk?.username) saveDisk({ username: p.username });
      const rk = roleRank(p.role);
      if (rk !== knownRank) {
        setKnownRank(rk);
        store.set(roleKey, rk);
      }
      if (p && p.banned_at && p.role !== "kurucu") onBanned(p);
      // 1.1.2.4: varsayılan duvar kâğıdı + sesli mesaj ayarları sunucudan
      refreshWall();
      refreshVoiceSettings();
      // 1.1.2.3: rütbe ve izinler sunucudan
      api.refreshPerms().then(() => {
        setCanAdmin(can("yonetim_paneli"));
        if (can("sikayetler")) api.openReportCount().then(setOpenReports).catch(() => {});
      }).catch(() => {});
      // Puan değiştiyse rütbe atladı mı bak (kutlama bir kez gösterilir)
      if (p && p.points !== lastPoints.current) {
        lastPoints.current = p.points;
        api.myProfile().then((d) => {
          const r = d?.rank;
          if (!r) return;
          const key = "dyb_rutbe_" + p.id;
          const seen = store.get(key, 0);
          if (seen >= 1 && seen < r.level) setRankUp({ icon: r.icon, name: r.name });
          if (seen !== r.level) store.set(key, r.level);
        }).catch(() => {});
      }
    }).catch(() => {
      if (retry.current++ < 6) setTimeout(refresh, 5000);
    });
    api.nearbyRadars(DENIZLI.lat, DENIZLI.lng, FETCH_RADIUS_M).then((l) => {
      setRadars(l || []);
      saveDisk({ radarCount: (l || []).length });
      setRadarError(false);
    }).catch(() => setRadarError(true));
    api.refreshConfig().then(() => {
      // Duyuru hedefi: "herkes" (varsayılan), "android" (iPhone'da gizli) ya da "ios".
      // announcement_ios doluysa iPhone'a sadece o gösterilir.
      const only = api.cfgText("announcement_ios");
      const target = api.cfgText("announcement_target", "herkes");
      setAnnouncement(only
        ? { text: only, warn: api.cfgText("announcement_ios_level") === "warning" }
        : { text: target === "android" ? "" : api.cfgText("announcement"), warn: api.cfgText("announcement_level") === "warning" });
    }).catch(() => {});
    api.dmUnreadTotal().then((n) => setDmUnread(n || 0)).catch(() => {});
    setPushPerm(permission());
  }

  // Hafif yenileme: odalar, okunmamış sayıları, özel mesaj rozeti
  async function liveRefresh() {
    try {
      const fresh = await api.roomsOverview();
      const list = fresh.length ? fresh : rooms;
      // Okunmamış sayıları da gelsin, sonra ikisi birlikte ekrana yansısın
      const unread = await api.roomUnreadCounts(list).catch(() => roomUnread);
      setRooms(list);
      setRoomUnread(unread || {});
      setRoomsLoaded(true);
      setRoomsReady(true);
      setChatError(false);
      if (fresh.length) saveDisk({ rooms: fresh, unread: unread || {} });
    } catch (_) {
      setChatError(true);
      setRoomsReady(true);   // bağlantı yoksa yedek liste görünsün
    }
    api.dmUnreadTotal().then((n) => setDmUnread(n || 0)).catch(() => {});
  }

  useEffect(() => { refresh(); liveRefresh(); }, []);
  // Bildirim gelince hemen; gelmese de 15 sn'de bir
  useLive((kind) => { if (kind === "radar") refresh(); else liveRefresh(); });
  useInterval(liveRefresh, 15000);
  useInterval(() => { refresh(); setTick((t) => t + 1); }, 30000);
  useOnResume(() => { refresh(); liveRefresh(); });

  // Harita kartı
  const lastRadar = radars && radars.length
    ? radars.reduce((a, b) => ((a.created_at || "") > (b.created_at || "") ? a : b)) : null;
  const radarN = radars ? radars.length : disk?.radarCount ?? null;
  const radarText = radarN !== null ? (radarN ? `${radarN} aktif bildirim` : "Şu an aktif bildirim yok")
    : radarError ? "Harita bilgisi alınamadı" : "Yükleniyor…";
  const radarLine = lastRadar
    ? ["Son: " + api.radarType(lastRadar.type).emoji + " " + api.radarType(lastRadar.type).label, lastRadar.place, agoText(lastRadar.created_at)].filter(Boolean).join(" • ")
    : "Radar, kaza ve yol durumu";

  const roomLine = (r) => {
    if (!r.last_message_id) return r.description || "";
    const n = r.last_photos || 0;
    const ph = n > 1 ? `📷 ${n} fotoğraf` : n === 1 ? "📷 Fotoğraf" : null;
    const text = [ph, (r.last_text || "").trim() || null].filter(Boolean).join(" ") || "Mesaj";
    return `💬 @${r.last_user || "üye"}: ${text.replace(/\n/g, " ")}`;
  };
  const roomStatus = (r) => r.last_at ? "Son mesaj: " + agoText(r.last_at)
    : roomsLoaded ? "Henüz mesaj yok" : chatError ? "Mesaj bilgisi alınamadı" : "Yükleniyor…";

  const rank = me ? roleRank(me.role) : knownRank;
  const muted = me && me.role !== "kurucu" && isStillActive(me.muted_until);
  const showPushBanner = pushConfigured() && pushSupported() && pushPerm === "default";

  async function turnOnPush() {
    try {
      await enablePush();
      toast("🔔 Bildirimler açıldı");
    } catch (e) {
      toast(e.message || "Bildirim açılamadı", 5000);
    }
    setPushPerm(permission());
  }

  const [annOpen, setAnnOpen] = useState(false);
  const h = new Date().getHours();
  const greet = h < 6 ? "İyi geceler" : h < 12 ? "Günaydın" : h < 18 ? "İyi günler" : "İyi akşamlar";
  const tileSub = (r) => {
    if (isStillActive(r.muted_until) && rank < 6) return "🔇 Susturuldun";
    if (r.id === "eczane") return "Her gün güncel liste";
    if (r.last_at) return "Son: " + agoText(r.last_at);
    return roomsLoaded ? "Henüz mesaj yok" : chatError ? "Bilgi alınamadı" : "Yükleniyor…";
  };

  return html`
    <div class=${"screen gradient" + (wall.id !== NONE ? " has-wall" : "")}>
      <${WallLayer} />
      <div class="home-head">
        <div class="badge home-logo">DYB</div>
        <div class="grow" style="min-width:0">
          <div class="home-title">Denizli Yol Bilgisi</div>
          <div class="home-sub">${greet}${(me?.username || disk?.username) ? ", @" + (me?.username || disk?.username) : ""}</div>
        </div>
      </div>

      ${announcement.text && html`
        <button class=${"ann-strip" + (announcement.warn ? " warn" : "") + (annOpen ? " open" : "")} onClick=${() => setAnnOpen(!annOpen)}>
          <span class="ann-i">${announcement.warn ? "⚠️" : "📢"}</span>
          <span class="ann-t">${announcement.text}</span>
          <span class="ann-c">${annOpen ? "▲" : "›"}</span>
        </button>`}

      ${showPushBanner && html`
        <div class="banner" style="margin-top:10px;background:#1F6FEB4D;border:1px solid #1F6FEB">
          <div class="grow">
            <div class="bt">🔔 Bildirimleri aç</div>
            <div class="bd">Yeni radar ve mesajlardan haberdar ol.</div>
          </div>
          <button class="btn white small" onClick=${turnOnPush}>Aç</button>
        </div>`}

      <button class="home-hero" onClick=${() => navigate("/harita")}>
        <span class="hh-ic">🗺</span>
        <span class="grow" style="min-width:0">
          <span class="hh-t">Harita</span>
          <span class="hh-d">Radar • kaza • yol durumu</span>
          <span class="hh-live">● ${radarText}</span>
        </span>
        <span class="hh-c">›</span>
      </button>

      <div class="home-grid" data-tick=${tick}>
        ${!roomsReady && [1, 2, 3, 4].map((i) => html`<div key=${"s" + i} class="htile skel"></div>`)}
        ${roomsReady && [...rooms].sort((a, b) => (TILE_ORDER[a.id] ?? 50 + a.sort_order) - (TILE_ORDER[b.id] ?? 50 + b.sort_order)).map((r) => {
          const n = roomUnread[r.id] || 0;
          const unread = r.id !== "eczane" && (api.hasUnread(r, me?.username) || n > 0);
          const col = ROOM_COLORS[r.id] || ["#0EA5E9", "#0369A1"];
          const live = tileSub(r);
          const quiet = !r.last_at && r.id !== "eczane";
          return html`
            <button key=${r.id} class=${"htile t-" + (TILE_TINT[r.id] || "sky") + (unread ? " unread" : "")} onClick=${() => navigate("/oda/" + r.id)}>
              ${unread && html`<span class="hbadge">${n >= 99 ? "99+" : n > 0 ? n : ""} yeni</span>`}
              <span class="hic" style=${`background:linear-gradient(135deg,${col[0]},${col[1]})`}>${r.icon}</span>
              <span class="htt">${r.name}</span>
              ${r.description && html`<span class="htd">${r.description}</span>`}
              <span class=${"hlive" + (quiet ? " q" : "") + (r.closed ? " lock" : "")}><i></i>${r.closed ? "🔒 Sohbet kapalı" : live}</span>
            </button>`;
        })}
      </div>

      ${muted && html`
        <div class="card" style="margin:14px 16px 0;background:var(--red-box);border-color:#FF6B6B">
          <div class="bold" style="font-size:18px">🔇 Susturuldun • Kalan: ${remainingText(me.muted_until)}</div>
          ${me.mute_reason && html`<div style="margin-top:6px">Sebep: ${me.mute_reason}</div>`}
          <div class="small" style="margin-top:6px;color:var(--red-text-soft)">Bu sürede mesaj yazamaz, radar bildiremez, oy veremez ve davet kodu üretemezsin.</div>
        </div>`}

      <div style="flex:1"></div>
      <div style="height:84px"></div>
      <nav class="bottom-nav">
        <button class="on"><span class="i">🏠</span>Ana Sayfa</button>
        <button onClick=${() => navigate("/mesajlar")}><span class="i">✉️</span>Mesajlar
          ${dmUnread > 0 && html`<span class="count">${dmUnread > 9 ? "9+" : dmUnread}</span>`}</button>
        ${canAdmin && html`<button onClick=${() => navigate("/yonetim")}><span class="i">🛡</span>Yönetim
          ${openReports > 0 && html`<span class="count">${openReports > 9 ? "9+" : openReports}</span>`}</button>`}
        <button onClick=${() => navigate("/ayarlar")}><span class="i">⚙️</span>Ayarlar</button>
        <button onClick=${() => navigate("/profil")}><span class="i">👤</span>Profil</button>
      </nav>

      ${me?.role_notice && html`
        <${Modal} title="Yetkin değişti" closeOnBackdrop=${false}
          actions=${html`<button class="btn" onClick=${() => { setMe({ ...me, role_notice: null }); api.ackRoleNotice().catch(() => {}); }}>Tamam</button>`}>
          <p style="font-size:18px;margin:0">${me.role_notice}</p>
        </${Modal}>`}

      ${rankUp && html`<${RankUpModal} icon=${rankUp.icon} name=${rankUp.name} onClose=${() => setRankUp(null)} />`}
    </div>`;
}
