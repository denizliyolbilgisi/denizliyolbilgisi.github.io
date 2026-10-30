// DYB iPhone sürümü – giriş noktası: cihaz kontrolü, oturum, ekranlar arası geçiş
import {
  html, render, useState, useEffect, sb, isAppleMobile, isStandalone, isTestMode, store,
  navigate, currentPath,
} from "./lib.js";
import * as api from "./api.js";
import { Toaster, Spinner } from "./ui.js";
import { refreshPush } from "./push.js";
import { startUsageTracking } from "./usage.js";
import "./theme.js";
import { LoginScreen, RegisterScreen, UsernameScreen, BannedScreen, NewPasswordScreen } from "./screens/auth.js";
import { ProfileScreen } from "./screens/profile.js";
import { MenuScreen } from "./screens/menu.js";
import { DmInboxScreen, DmChatScreen } from "./screens/dm.js";
import { ChatScreen } from "./screens/chat.js";
import { EczaneScreen, EczaneMapScreen } from "./screens/eczane.js";
import { MapScreen } from "./screens/map.js";
import { InvitesScreen } from "./screens/invites.js";
import { SettingsScreen } from "./screens/settings.js";
import { AdminScreen } from "./screens/admin.js";

// Arka plan görevlisi (bildirim ve çevrimdışı açılış)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
  // Bildirime dokunulunca uygulama zaten açıksa ilgili ekrana git
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type === "dyb-live") {
      // Uygulama açıkken bildirim geldi: açık ekran kendini yenilesin
      window.dispatchEvent(new CustomEvent("dyb-live", { detail: e.data.kind || "chat" }));
      return;
    }
    if (e.data?.type === "dyb-open" && e.data.url) {
      const u = new URL(e.data.url);
      if (u.hash) location.hash = u.hash;
    }
  });
}

/** Adres çubuğundaki "#/..." kısmı */
function useRoute() {
  const [path, setPath] = useState(currentPath());
  useEffect(() => {
    const on = () => setPath(currentPath());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const [p, q = ""] = path.split("?");
  return { path: p, query: new URLSearchParams(q) };
}

// ---------------------------------------------------------------------------
// iPhone dışı cihaz
// ---------------------------------------------------------------------------
function NotIphone() {
  return html`
    <div class="screen gradient">
      <div class="content center" style="gap:16px">
        <div class="badge">DYB</div>
        <h1 style="margin:0;font-size:28px">Denizli Yol Bilgisi</h1>
        <p class="soft" style="font-size:19px;max-width:420px">
          Bu adres <b>iPhone</b> kullanıcıları içindir.
        </p>
        <p class="soft" style="font-size:17px;max-width:420px">
          Android kullanıcıları DYB uygulamasını kullanır. Uygulama için sizi davet eden kişiye ulaşın.
        </p>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Ana ekrana ekleme yönergesi (bildirim ve tam ekran için gerekli)
// ---------------------------------------------------------------------------
function InstallGuide({ onSkip }) {
  return html`
    <div class="screen gradient">
      <div class="content center" style="gap:18px;padding-top:calc(var(--safe-top) + 30px)">
        <div class="badge">DYB</div>
        <h1 style="margin:0;font-size:26px">DYB'yi ana ekrana ekle</h1>
        <p class="soft" style="margin:0;max-width:420px">
          Bildirim alabilmek ve uygulama gibi kullanmak için DYB'yi bir kez ana ekrana eklemelisin.
        </p>
        <div class="steps">
          <div class="step"><div class="n">1</div><div>Safari'nin altındaki <b>Paylaş</b> düğmesine dokun
            <span style="font-size:22px">⬆️</span> (kare içinde yukarı ok).</div></div>
          <div class="step"><div class="n">2</div><div>Listeyi aşağı kaydır, <b>"Ana Ekrana Ekle"</b>ye dokun.</div></div>
          <div class="step"><div class="n">3</div><div>Sağ üstteki <b>Ekle</b>'ye dokun.</div></div>
          <div class="step"><div class="n">4</div><div>Safari'yi kapat, ana ekrandaki <b>DYB</b> simgesinden aç.</div></div>
        </div>
        <p class="muted small" style="max-width:420px">iOS 16.4 veya üstü gerekir (Ayarlar → Genel → Hakkında → iOS Sürümü).</p>
        <button class="btn outline" onClick=${onSkip}>Şimdilik Safari'de devam et</button>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Uygulama
// ---------------------------------------------------------------------------
function App() {
  const route = useRoute();
  const [deviceOk] = useState(() => isAppleMobile() || isTestMode());
  const [skipInstall, setSkipInstall] = useState(() => isStandalone() || isTestMode() || store.get("dyb_skip_install", false));
  const [authState, setAuthState] = useState("loading");   // loading | out | in
  const [profile, setProfile] = useState(null);
  const [checked, setChecked] = useState(false);            // yasak / kullanıcı adı kontrolü yapıldı mı
  const [mustChange, setMustChange] = useState(false);      // geçici şifreyle girildi

  // Oturum
  useEffect(() => {
    api.session().then((s) => setAuthState(s ? "in" : "out")).catch(() => setAuthState("out"));
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_OUT") {
        setProfile(null);
        setChecked(false);
      }
      setAuthState(s ? "in" : "out");
    });
    startUsageTracking();
    return () => data.subscription.unsubscribe();
  }, []);

  // Giriş yapıldı: yasak ve kullanıcı adı kontrolü, bildirim adresini tazele
  useEffect(() => {
    if (authState !== "in") return;
    let alive = true;
    (async () => {
      try {
        const p = await api.me();
        if (!alive) return;
        setProfile(p);
        setMustChange(api.mustChangePassword());
        if (p && p.banned_at && p.role !== "kurucu") navigate("/yasakli", true);
        else if (p && !p.username) navigate("/kullanici-adi", true);
        else refreshPush();
      } catch (_) { /* internet yoksa engelleme */ }
      if (alive) setChecked(true);
    })();
    return () => { alive = false; };
  }, [authState]);

  if (!deviceOk) return html`<${NotIphone} />`;
  if (!skipInstall) {
    return html`<${InstallGuide} onSkip=${() => { store.set("dyb_skip_install", true); setSkipInstall(true); }} />`;
  }
  if (authState === "loading") return html`<div class="boot"><div class="badge">DYB</div><${Spinner} /></div>`;

  const { path, query } = route;
  let screen;

  if (authState === "out") {
    if (path === "/kayit") screen = html`<${RegisterScreen} />`;
    else screen = html`<${LoginScreen} />`;
  } else if (!checked) {
    screen = html`<div class="boot"><div class="badge">DYB</div><${Spinner} /></div>`;
  } else if (profile && profile.banned_at && profile.role !== "kurucu") {
    screen = html`<${BannedScreen} profile=${profile} />`;
  } else if (mustChange) {
    screen = html`<${NewPasswordScreen} onDone=${() => { setMustChange(false); navigate("/menu", true); }} />`;
  } else if (profile && !profile.username) {
    screen = html`<${UsernameScreen} onDone=${(name) => { setProfile({ ...profile, username: name }); navigate("/menu", true); }} />`;
  } else if (path === "/oda/eczane") {
    screen = html`<${EczaneScreen} />`;
  } else if (path === "/eczane-harita") {
    screen = html`<${EczaneMapScreen} focusId=${query.get("id")} />`;
  } else if (path.startsWith("/oda/")) {
    const roomId = decodeURIComponent(path.slice(5)) || "trafik";
    screen = html`<${ChatScreen} key=${roomId} roomId=${roomId} focusId=${parseInt(query.get("m") || "", 10) || null} />`;
  } else if (path === "/harita") {
    screen = html`<${MapScreen} focusRadarId=${query.get("radar")} openReport=${query.get("bildir") === "1"} />`;
  } else if (path === "/mesajlar") {
    screen = html`<${DmInboxScreen} />`;
  } else if (path.startsWith("/mesaj/")) {
    const uid = decodeURIComponent(path.slice(7));
    screen = html`<${DmChatScreen} key=${uid} userId=${uid} />`;
  } else if (path === "/davetler") {
    screen = html`<${InvitesScreen} />`;
  } else if (path === "/ayarlar") {
    screen = html`<${SettingsScreen} />`;
  } else if (path === "/yonetim") {
    screen = html`<${AdminScreen} startTab=${query.get("tab")} />`;
  } else if (path === "/profil") {
    screen = html`<${ProfileScreen} />`;
  } else {
    screen = html`<${MenuScreen} onBanned=${(p) => setProfile(p)} />`;
  }

  return html`${screen}<${Toaster} />`;
}

render(html`<${App} />`, document.getElementById("app"));
