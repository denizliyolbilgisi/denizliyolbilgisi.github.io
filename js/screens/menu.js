// Karşılama menüsü: Harita + sohbet odaları (küçük kartlar), altta kısayollar
import { html, useState, useEffect, useRef, navigate, agoText, remainingText, isStillActive, roleRank, toast, store } from "../lib.js";
import * as api from "../api.js";
import { Modal, useInterval, useOnResume } from "../ui.js";
import { DENIZLI, FETCH_RADIUS_M } from "../config.js";
import { enablePush, pushConfigured, pushSupported, permission } from "../push.js";
import { RankUpModal } from "./profile.js";

const ROOM_COLORS = {
  trafik: ["#FFB020", "#E07B00"],
  is_ilanlari: ["#26A69A", "#00796B"],
  alim_satim: ["#EC407A", "#AD1457"],
};

function MenuCard({ icon, colors, title, line, live, liveColor, unread, onClick }) {
  return html`
    <button class=${"mcard" + (unread ? " unread" : "")} onClick=${onClick}>
      <div class="ico" style=${`background:linear-gradient(135deg,${colors[0]},${colors[1]})`}>${icon}</div>
      <div class="body">
        <div class="t"><span>${title}</span>${unread && html`<em class="new-pill" style="font-style:normal">YENİ</em>`}</div>
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
  const [me, setMe] = useState(null);
  const [rooms, setRooms] = useState(api.cachedRooms());
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [chatError, setChatError] = useState(false);
  const [radars, setRadars] = useState(null);
  const [radarError, setRadarError] = useState(false);
  const [openReports, setOpenReports] = useState(0);
  const [dmUnread, setDmUnread] = useState(0);         // okunmamış özel mesaj
  const [announcement, setAnnouncement] = useState({ text: "", warn: false });
  const [tick, setTick] = useState(0);
  const [rankUp, setRankUp] = useState(null);   // { icon, name }
  const lastPoints = useRef(null);
  const [pushPerm, setPushPerm] = useState(permission());

  // Son bilinen rütbe saklanır: bağlantı koparsa Yönetim düğmesi kaybolmaz
  const roleKey = "dyb_son_rutbe_" + (api.myId() || "");
  const [knownRank, setKnownRank] = useState(() => store.get(roleKey, 1));
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
      const rk = roleRank(p.role);
      if (rk !== knownRank) {
        setKnownRank(rk);
        store.set(roleKey, rk);
      }
      if (p && p.banned_at && p.role !== "kurucu") onBanned(p);
      if (p && roleRank(p.role) >= 2) api.openReportCount().then(setOpenReports).catch(() => {});
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
    api.roomsOverview().then((list) => {
      if (list.length) setRooms(list);
      setRoomsLoaded(true);
      setChatError(false);
    }).catch(() => setChatError(true));
    api.nearbyRadars(DENIZLI.lat, DENIZLI.lng, FETCH_RADIUS_M).then((l) => {
      setRadars(l || []);
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

  useEffect(() => { refresh(); }, []);
  useInterval(() => { refresh(); setTick((t) => t + 1); }, 30000);
  useOnResume(refresh);

  // Harita kartı
  const lastRadar = radars && radars.length
    ? radars.reduce((a, b) => ((a.created_at || "") > (b.created_at || "") ? a : b)) : null;
  const radarText = radars ? (radars.length ? `${radars.length} aktif bildirim` : "Şu an aktif bildirim yok")
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

  return html`
    <div class="screen gradient">
      <div class="menu-head">
        <div class="badge" style="margin:0 auto;width:74px;height:74px;font-size:24px">DYB</div>
        <h1>Denizli Yol Bilgisi</h1>
        <p>Radar • Trafik • İlanlar</p>
      </div>

      ${announcement.text && html`
        <div class="banner" style=${`margin-top:12px;background:${announcement.warn ? "#B26A004D" : "#2E7D5B4D"};border:1px solid ${announcement.warn ? "#B26A00" : "#2E7D5B"}`}>
          <div class="grow">
            <div class="bt">${announcement.warn ? "⚠️ Duyuru" : "📢 Duyuru"}</div>
            <div class="bd">${announcement.text}</div>
          </div>
        </div>`}

      ${showPushBanner && html`
        <div class="banner" style="margin-top:12px;background:#1F6FEB4D;border:1px solid #1F6FEB">
          <div class="grow">
            <div class="bt">🔔 Bildirimleri aç</div>
            <div class="bd">Yeni radar ve mesajlardan haberdar ol.</div>
          </div>
          <button class="btn white small" onClick=${turnOnPush}>Aç</button>
        </div>`}

      <div class="menu-cards" data-tick=${tick}>
        <${MenuCard} icon="🗺" colors=${["#3D8BFF", "#1E5FD1"]} title="Harita" line=${radarLine}
          live=${radarText} liveColor=${radarError ? "#FFB020" : "#3DDC84"} onClick=${() => navigate("/harita")} />
        ${rooms.map((r) => html`
          <${MenuCard} key=${r.id} icon=${r.icon} colors=${ROOM_COLORS[r.id] || ["#7E57C2", "#512DA8"]} title=${r.name}
            line=${roomLine(r)}
            live=${roomStatus(r) + (isStillActive(r.muted_until) && rank < 4 ? " • 🔇 susturuldun" : "")}
            liveColor=${chatError ? "#FFB020" : "#3DDC84"}
            unread=${api.hasUnread(r, me?.username)}
            onClick=${() => navigate("/oda/" + r.id)} />`)}
      </div>

      ${muted && html`
        <div class="card" style="margin:14px 16px 0;background:#5A1E1E;border-color:#FF6B6B">
          <div class="bold" style="font-size:18px">🔇 Susturuldun • Kalan: ${remainingText(me.muted_until)}</div>
          ${me.mute_reason && html`<div style="margin-top:6px">Sebep: ${me.mute_reason}</div>`}
          <div class="small" style="margin-top:6px;color:#FFD6D6">Bu sürede mesaj yazamaz, radar bildiremez, oy veremez ve davet kodu üretemezsin.</div>
        </div>`}

      <div style="flex:1"></div>
      <div style="height:84px"></div>
      <nav class="bottom-nav">
        <button class="on"><span class="i">🏠</span>Ana Sayfa</button>
        <button onClick=${() => navigate("/mesajlar")}><span class="i">✉️</span>Mesajlar
          ${dmUnread > 0 && html`<span class="count">${dmUnread > 9 ? "9+" : dmUnread}</span>`}</button>
        ${rank >= 2 && html`<button onClick=${() => navigate("/yonetim")}><span class="i">🛡</span>Yönetim
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
