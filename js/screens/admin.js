// Yönetim: Üyeler (e-posta/süre sadece kurucu+yönetici), Şikayetler, Son İşlemler, oda yöneticisi atama
import {
  html, useState, useEffect, navigate, userMessage, agoText, dateText, remainingText, isStillActive,
  roleRank, roleLabel, roleBadge, durationText, parseTime, copyText, toast, can, roleInfo,
} from "../lib.js";
import * as api from "../api.js";
import { TopBar, Modal, Spinner, Switch } from "../ui.js";
import { MemberSheet, SimpleMemberRow } from "./staff.js";

const MUTE_OPTIONS = [["1 saat", 60], ["5 saat", 300], ["12 saat", 720], ["24 saat", 1440],
  ["15 gün", 15 * 1440], ["30 gün", 30 * 1440], ["Süresiz", null]];
const ACTIVITY_FILTERS = [[null, "Tümü"], ["uyelik", "👤 Üyelik"], ["mesaj", "💬 Mesaj"], ["radar", "🚨 Radar"],
  ["davet", "🎟 Davet"], ["sikayet", "🚩 Şikayet"], ["yonetim", "🛡 Yönetim"]];

const name = (m) => (m.username ? "@" + m.username : "(ad seçmedi)");
const isMuted = (m) => m.role !== "kurucu" && isStillActive(m.muted_until);
const isBanned = (m) => m.role !== "kurucu" && !!m.banned_at;
const roomName = (id) => api.cachedRoom(id).name;
const DAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
function dayLabel(day) {
  const [y, mo, d] = day.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - dt) / 86400000);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Dün";
  return `${DAYS[dt.getDay()]} ${String(d).padStart(2, "0")}.${String(mo).padStart(2, "0")}`;
}

export function AdminScreen({ startTab }) {
  const [myRank, setMyRank] = useState(1);
  const [tab, setTab] = useState(startTab === "sifre" ? "talep" : "uyeler");
  const [requestCount, setRequestCount] = useState(0);
  const [resetTarget, setResetTarget] = useState(null);   // şifre yenileme onayı
  const [tempPass, setTempPass] = useState(null);         // { name, password }
  const [members, setMembers] = useState(null);
  const [rooms, setRooms] = useState(api.cachedRooms());
  const [openCount, setOpenCount] = useState(0);
  const [info, setInfo] = useState(null);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(0);
  const [selected, setSelected] = useState(null);
  const [muteTarget, setMuteTarget] = useState(null);   // { member, reportId }
  const [banTarget, setBanTarget] = useState(null);
  const [roleTarget, setRoleTarget] = useState(null);
  const [working, setWorking] = useState(false);
  const [activityUser, setActivityUser] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await api.me();
        const rk = roleRank(p?.role);
        setMyRank(rk);
        await api.refreshPerms().catch(() => {});
        // Rehber sadece sade listeyi görür; ayrıntılar moderatör ve üstüne
        if (can("uye_detay")) setMembers(await api.adminMembers());
        else { setSort(2); setMembers(await api.memberList()); }
        if (can("sifre_yenile")) api.adminPasswordRequests().then((l) => setRequestCount(l.length)).catch(() => {});
        if (can("sikayetler")) api.openReportCount().then(setOpenCount).catch(() => {});
        api.roomsOverview().then((l) => l.length && setRooms(l)).catch(() => {});
      } catch (e) {
        setInfo({ err: true, text: "Üyeler yüklenemedi: " + userMessage(e) });
        setMembers((m) => m || []);
      }
    })();
  }, [reload]);

  function run(success, fn) {
    setWorking(true);
    fn().then(() => {
      setInfo({ err: false, text: success });
      setReload((r) => r + 1);
    }).catch((e) => setInfo({ err: true, text: userMessage(e) })).finally(() => setWorking(false));
  }

  // 1.1.2.3: sekmeler sunucudaki izinlere göre
  const tabs = [["uyeler", "Üyeler"]];
  if (can("sikayetler")) tabs.push(["sikayet", openCount > 0 ? `Şikayetler (${openCount})` : "Şikayetler"]);
  if (can("sifre_yenile")) tabs.push(["talep", requestCount > 0 ? `🔑 Talepler (${requestCount})` : "🔑 Talepler"]);
  if (can("oda_ayarlari")) tabs.push(["odalar", "🏠 Odalar"]);
  if (can("son_islemler")) tabs.push(["islem", "Son İşlemler"]);
  const activeTab = tabs.some(([k]) => k === tab) ? tab : "uyeler";
  // En yeni Android sürümü: üyelerin kullandığı en yüksek sürüm
  const latestCode = Math.max(0, ...(members || []).map((m) => m.app_version_code || 0));

  // Filtre ve sıralama
  const q = search.trim().replace(/^@/, "").toLowerCase();
  let list = (members || []).filter((m) => !q || (m.username || "").includes(q) || (m.invited_by || "").includes(q) ||
    (m.email || "").toLowerCase().includes(q));
  if (sort === 1) list = [...list].sort((a, b) => (b.usage_7d || 0) - (a.usage_7d || 0));
  if (sort === 2) list = [...list].sort((a, b) => (a.username || "~").localeCompare(b.username || "~", "tr"));   // 👥 Üyeler
  if (sort === 3) list = list.filter((m) => m.app_version_code && m.app_version_code < latestCode);

  return html`
    <div class="screen">
      <${TopBar} title="🛡 Yönetim" sub=${members ? `${members.length} üye` : ""} onBack=${() => navigate("/menu")}
        right=${html`<button class="btn ghost" onClick=${() => setReload((r) => r + 1)}>Yenile</button>`} />
      <div class="tabs">
        ${tabs.map(([k, t]) => html`<button key=${k} class=${activeTab === k ? "on" : ""} onClick=${() => setTab(k)}>${t}</button>`)}
      </div>
      <div class="content">
        ${info && html`<div class=${"msg " + (info.err ? "err" : "ok")}>${info.text}</div>`}

        ${activeTab === "talep" && html`<${PasswordRequestsTab} reload=${reload} onInfo=${setInfo}
            onChanged=${() => setReload((r) => r + 1)}
            onReset=${(r) => setResetTarget({ id: r.user_id, username: r.username, role: r.role })} />`}

        ${activeTab === "sikayet" && html`<${ReportsTab} myRank=${myRank} reload=${reload} onInfo=${setInfo}
            onChanged=${() => setReload((r) => r + 1)}
            onMute=${(r) => r.reported_id && setMuteTarget({ member: { id: r.reported_id, username: r.reported_name, role: r.reported_role }, reportId: r.id })} />`}

        ${activeTab === "odalar" && html`<${RoomsTab} members=${members || []} myRank=${myRank} onInfo=${setInfo} />`}

        ${activeTab === "islem" && html`<${ActivityTab} user=${activityUser} reload=${reload} onClearUser=${() => setActivityUser(null)} onInfo=${setInfo} />`}

        ${activeTab === "uyeler" && html`
          <input class="input" placeholder=${can("eposta_gor") ? "Üye ara (@ad ya da e-posta)" : "Üye ara (@ad)"} value=${search}
            onInput=${(e) => setSearch(e.target.value)} />
          ${can("uye_detay") && html`
            <div class="chips">
              ${["Rütbe", "⏱ En aktif", "👥 Üyeler", "📲 Eski"].map((t, i) => html`
                <button key=${i} class=${"chip" + (sort === i ? " on" : "")} onClick=${() => setSort(i)}>${t}</button>`)}
            </div>`}
          ${members === null ? html`<${Spinner} />` : list.length === 0 ? html`<div class="center muted">Üye bulunamadı</div>`
            : sort === 2 ? html`<div class="st-list">${list.map((m) => html`<${SimpleMemberRow} key=${m.id} m=${m}
                onClick=${() => can("uye_detay") && setSelected(m)} onMessage=${() => navigate("/mesaj/" + m.id)} />`)}</div>`
            : list.map((m) => html`<${MemberCard} key=${m.id} m=${m} showPrivate=${can("kullanim_gor")} latestCode=${latestCode} onClick=${() => setSelected(m)} />`)}
        `}
      </div>

      ${selected && html`<${MemberSheet} m=${selected} myRank=${myRank} working=${working} onClose=${() => setSelected(null)}
          onActivity=${() => { setActivityUser(selected); setSelected(null); setTab("islem"); }}
          onMute=${() => { setMuteTarget({ member: selected }); setSelected(null); }}
          onUnmute=${() => { const m = selected; setSelected(null); run(`${name(m)} artık yazabilir.`, () => api.adminUnmute(m.id)); }}
          onBan=${() => { setBanTarget(selected); setSelected(null); }}
          onUnban=${() => { const m = selected; setSelected(null); run(`${name(m)} yasağı kaldırıldı.`, () => api.adminUnban(m.id)); }}
          onReset=${() => { setResetTarget(selected); setSelected(null); }}
          onRole=${(role) => { setRoleTarget({ m: selected, role }); setSelected(null); }}
          onMessage=${() => { const m = selected; setSelected(null); navigate("/mesaj/" + m.id); }} />`}

      ${muteTarget && html`<${MuteDialog} target=${muteTarget} myRank=${myRank} onClose=${() => setMuteTarget(null)}
          onConfirm=${(label, minutes, why) => {
            const { member, reportId } = muteTarget;
            setMuteTarget(null);
            run(`${name(member)} ${label} susturuldu.`, async () => {
              await api.adminMute(member.id, minutes, why);
              if (reportId) await api.resolveReport(reportId, `Üye ${label} susturuldu`);
            });
          }} />`}

      ${banTarget && html`<${ReasonDialog} title=${`${name(banTarget)} yasakla`} button="Yasakla" color="red"
          text="Bu üye uygulamaya giremez, hiçbir şey göremez ve bildirim alamaz. Yasağı istediğin zaman kaldırabilirsin."
          placeholder="Örn: Spam – kural 5" onClose=${() => setBanTarget(null)}
          onConfirm=${(why) => { const m = banTarget; setBanTarget(null); run(`${name(m)} yasaklandı.`, () => api.adminBan(m.id, why)); }} />`}

      ${resetTarget && html`
        <${Modal} title="🔑 Şifreyi yenile" onClose=${() => !working && setResetTarget(null)}
          actions=${[
            html`<button class="btn outline" disabled=${working} onClick=${() => setResetTarget(null)}>Vazgeç</button>`,
            html`<button class="btn teal" disabled=${working} onClick=${async () => {
              const m = resetTarget;
              setWorking(true);
              try {
                const password = await api.adminResetPassword(m.id);
                setResetTarget(null);
                setTempPass({ name: name(m), password });
                setInfo({ err: false, text: `${name(m)} için geçici şifre oluşturuldu.` });
                setReload((r) => r + 1);
              } catch (e) {
                setResetTarget(null);
                setInfo({ err: true, text: userMessage(e, "Şifre şu an yenilenemedi. Lütfen tekrar dene.") });
              }
              setWorking(false);
            }}>${working ? "Oluşturuluyor…" : "Yenile"}</button>`,
          ]}>
          <p style="margin:0;font-size:17px;white-space:pre-wrap">${name(resetTarget)} için geçici bir şifre oluşturulacak.

• Üyenin tüm oturumları kapanır.
• Geçici şifreyle girince kendi şifresini belirlemek zorunda olur.
• Geçici şifreyi sadece bir kez göreceksin; üyeye sen ileteceksin.</p>
        </${Modal}>`}

      ${tempPass && html`
        <${Modal} title="✅ Geçici şifre hazır" closeOnBackdrop=${false}
          actions=${[
            html`<button class="btn" onClick=${async () => toast((await copyText(tempPass.password)) ? "Şifre kopyalandı" : "Kopyalanamadı")}>📋 Kopyala</button>`,
            html`<button class="btn outline" onClick=${() => setTempPass(null)}>Kapat</button>`,
          ]}>
          <div>${tempPass.name} için geçici şifre:</div>
          <div style="font-size:28px;font-weight:800;color:var(--yellow);text-align:center;background:rgba(0,0,0,.35);border-radius:12px;padding:14px 0;margin:10px 0;user-select:all">${tempPass.password}</div>
          <div class="soft">Bu şifreyi üyeye güvenli şekilde ilet (yüz yüze, telefon ya da özel mesaj). Pencereyi kapatınca bir daha gösterilmez.</div>
        </${Modal}>`}

      ${roleTarget && html`
        <${Modal} title="Rolü değiştir" onClose=${() => setRoleTarget(null)}
          actions=${[
            html`<button class="btn outline" onClick=${() => setRoleTarget(null)}>Vazgeç</button>`,
            html`<button class="btn purple" onClick=${() => { const { m, role } = roleTarget; setRoleTarget(null);
              run(`${name(m)} artık ${roleLabel(role)}.`, () => api.adminSetRole(m.id, role)); }}>Onayla</button>`,
          ]}>
          <p style="margin:0;font-size:17px">${name(roleTarget.m)} için rol: ${roleLabel(roleTarget.m.role)} → ${roleLabel(roleTarget.role)}</p>
          <p class="soft">Üye uygulamayı açınca bunu bir bildirimle görecek.</p>
        </${Modal}>`}
    </div>`;
}

function statusText(m) {
  let s = `Rol: ${roleLabel(m.role)}\nKatıldı: ${dateText(m.created_at)}\nDavet eden: ${m.invited_by ? "@" + m.invited_by : "-"}\nMesaj sayısı: ${m.message_count ?? 0}`;
  if (m.email) s += `\nE-posta: ${m.email}`;
  if ((m.room_admin_of || []).length) s += `\n🏠 Oda görevi: ${m.room_admin_of.map(roomName).join(", ")}`;
  if (isMuted(m)) s += `\n\n🔇 Susturuldu – kalan: ${remainingText(m.muted_until)}\nSebep: ${m.mute_reason || "-"}\nSusturan: ${m.muted_by ? "@" + m.muted_by : "-"}`;
  if (isBanned(m)) s += `\n\n⛔ Yasaklı\nSebep: ${m.ban_reason || "-"}\nYasaklayan: ${m.banned_by ? "@" + m.banned_by : "-"}`;
  return s;
}

function MemberCard({ m, showPrivate, latestCode, onClick }) {
  const border = isBanned(m) ? "#D32F2F" : isMuted(m) ? "#E07B00" : "";
  const ri = roleInfo(m.role);
  const pill = ri.role === "uye" ? null : [`${ri.rozet} ${ri.ad}`.trim(), ri.renk];
  return html`
    <div class="card member" style=${border ? `border-color:${border}` : ""} onClick=${onClick}>
      <div class="row wrap">
        <div class="name grow">${name(m)}</div>
        ${pill && html`<span class="pill" style=${`background:${pill[1]}`}>${pill[0]}</span>`}
        ${(m.room_admin_of || []).length > 0 && html`<span class="pill" style="background:#2E7D5B">🏠</span>`}
        ${isBanned(m) ? html`<span class="pill" style="background:#D32F2F">⛔ Yasaklı</span>`
          : isMuted(m) ? html`<span class="pill" style="background:#E07B00">🔇</span>` : null}
      </div>
      <div class="soft small" style="margin-top:6px">Katıldı: ${dateText(m.created_at)} • Davet eden: ${m.invited_by ? "@" + m.invited_by : "-"}</div>
      <div class="soft small">Mesaj: ${m.message_count ?? 0} • Son mesaj: ${m.last_message_at ? agoText(m.last_message_at) : "yok"}</div>
      ${(m.room_admin_of || []).length > 0 && html`<div class="small bold" style="color:var(--ok)">🏠 Oda görevi: ${m.room_admin_of.map(roomName).join(", ")}</div>`}
      ${showPrivate && html`
        ${m.email && html`<div class="soft small">✉️ ${m.email}</div>`}
        <div class="small" style="color:var(--blue-text)">⏱ Bugün ${durationText(m.usage_today)} • 7 gün ${durationText(m.usage_7d)} • Toplam ${durationText(m.usage_total)}</div>
        <div class="soft small">👁 Son görülme: ${m.last_seen_at ? agoText(m.last_seen_at) : "yok"}</div>
        <div class="small" style=${`color:${m.app_version_code && m.app_version_code >= latestCode ? "var(--soft)" : "var(--orange-text)"}`}>
          📲 ${!m.app_version_code ? "Sürüm: bilinmiyor (eski Android ya da iPhone)"
            : m.app_version_code < latestCode ? `Sürüm: ${m.app_version_name || m.app_version_code} ⚠️ güncel değil`
            : `Sürüm: ${m.app_version_name || m.app_version_code} ✅`}</div>
        <div class="soft small">⭐ DYB Puanı: ${m.points ?? 0}</div>`}
      ${isMuted(m) && html`<div class="small bold" style="color:var(--orange-text)">Kalan: ${remainingText(m.muted_until)} • Sebep: ${m.mute_reason || "-"} • Susturan: ${m.muted_by ? "@" + m.muted_by : "-"}</div>`}
      ${isBanned(m) && html`<div class="small bold" style="color:var(--red-soft)">Yasak sebebi: ${m.ban_reason || "-"} • Yasaklayan: ${m.banned_by ? "@" + m.banned_by : "-"}</div>`}
    </div>`;
}

function UsageDetail({ userId }) {
  const [days, setDays] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api.adminUsageDetail(userId).then(setDays).catch(() => setFailed(true));
  }, [userId]);
  const max = Math.max(1, ...(days || []).map((d) => d.seconds));
  return html`
    <div class="bars" style="margin-top:10px">
      <div class="bold">⏱ Son 7 gün:</div>
      ${failed ? html`<div class="small">Kullanım bilgisi alınamadı</div>`
        : !days ? html`<div class="small">Yükleniyor…</div>`
        : days.map((d) => html`
          <div class="b" key=${d.day}>
            <span class="l">${dayLabel(d.day)}</span>
            <span class="track"><span class="fill" style=${`display:block;width:${(d.seconds / max) * 100}%`}></span></span>
            <span class="v">${durationText(d.seconds)}</span>
          </div>`)}
    </div>`;
}

function MuteDialog({ target, myRank, onClose, onConfirm }) {
  const options = can("yasakla") ? MUTE_OPTIONS : MUTE_OPTIONS.filter(([, m]) => m !== null && m <= 1440);
  const [choice, setChoice] = useState(0);
  const [reason, setReason] = useState("");
  return html`
    <${Modal} title=${`${name(target.member)} sustur`} onClose=${onClose}
      actions=${[
        html`<button class="btn outline" onClick=${onClose}>Vazgeç</button>`,
        html`<button class="btn orange" disabled=${reason.trim().length < 3}
          onClick=${() => onConfirm(options[choice][0], options[choice][1], reason.trim())}>Sustur</button>`,
      ]}>
      <div class="bold">Süre:</div>
      ${!can("yasakla") && html`<div class="small muted">Moderatör en fazla 24 saat susturabilir.</div>`}
      ${options.map(([label], i) => html`
        <label class="choice" key=${label}><input type="radio" name="msure" checked=${choice === i} onChange=${() => setChoice(i)} />${label}</label>`)}
      <input class="input" maxlength="200" placeholder="Sebep (üye görecek) – örn: Küfür – kural 3" value=${reason}
        onInput=${(e) => setReason(e.target.value)} />
    </${Modal}>`;
}

function ReasonDialog({ title, text, placeholder, button, color, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  return html`
    <${Modal} title=${title} onClose=${onClose}
      actions=${[
        html`<button class="btn outline" onClick=${onClose}>Vazgeç</button>`,
        html`<button class=${"btn " + color} disabled=${reason.trim().length < 3} onClick=${() => onConfirm(reason.trim())}>${button}</button>`,
      ]}>
      <p class="soft" style="margin-top:0">${text}</p>
      <input class="input" maxlength="200" placeholder=${placeholder} value=${reason} onInput=${(e) => setReason(e.target.value)} />
    </${Modal}>`;
}

// ---------------------------------------------------------------------------
function PasswordRequestsTab({ reload, onInfo, onChanged, onReset }) {
  const [items, setItems] = useState(null);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    setItems(null);
    api.adminPasswordRequests().then(setItems).catch((e) => {
      onInfo({ err: true, text: "Talepler yüklenemedi: " + userMessage(e) });
      setItems([]);
    });
  }, [reload]);
  if (items === null) return html`<${Spinner} />`;
  if (!items.length) return html`<div class="center muted" style="padding:30px">Bekleyen şifre talebi yok 👍</div>`;
  return html`
    <div class="soft small">Bu üyeler "Şifremi unuttum" dedi. Kişiyi tanıdığından emin ol, sonra geçici şifre ver.</div>
    ${items.map((r) => html`
      <div class="card" key=${r.id} style="border-color:var(--teal)">
        <div class="bold" style="font-size:20px">🔑 ${r.username ? "@" + r.username : "(ad yok)"} ${{ kurucu: "👑", yonetici: "🛡", moderator: "⭐" }[r.role] || ""}</div>
        ${r.email && html`<div class="soft small">✉️ ${r.email}</div>`}
        <div class="soft small">İstek: ${dateText(r.created_at)} • ${agoText(r.created_at)}</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
          <button class="btn block teal" disabled=${working} onClick=${() => onReset(r)}>🔑 Geçici şifre ver</button>
          <button class="btn block red" disabled=${working} onClick=${async () => {
            setWorking(true);
            try {
              await api.adminClosePasswordRequest(r.id);
              onInfo({ err: false, text: "Talep kapatıldı." });
              onChanged();
            } catch (e) {
              onInfo({ err: true, text: userMessage(e) });
            }
            setWorking(false);
          }}>✖ Talebi kapat (işlem yapma)</button>
        </div>
      </div>`)}`;
}

function ReportsTab({ myRank, reload, onInfo, onChanged, onMute }) {
  const [status, setStatus] = useState("acik");
  const [reports, setReports] = useState(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setReports(null);
    api.adminReports(status).then((l) => setReports(l || [])).catch((e) => {
      onInfo({ err: true, text: "Şikayetler yüklenemedi: " + userMessage(e) });
      setReports([]);
    });
  }, [status, reload]);

  function act(success, fn) {
    setWorking(true);
    fn().then(() => { onInfo({ err: false, text: success }); onChanged(); })
      .catch((e) => onInfo({ err: true, text: userMessage(e) }))
      .finally(() => setWorking(false));
  }

  return html`
    <div class="chips">
      <button class=${"chip" + (status === "acik" ? " on" : "")} onClick=${() => setStatus("acik")}>Bekleyen</button>
      <button class=${"chip" + (status === "kapandi" ? " on" : "")} onClick=${() => setStatus("kapandi")}>Kapanmış</button>
    </div>
    ${reports === null ? html`<${Spinner} />` : reports.length === 0
      ? html`<div class="center muted" style="padding:30px">${status === "acik" ? "Bekleyen şikayet yok 👍" : "Kapanmış şikayet yok"}</div>`
      : reports.map((r) => {
        const open = r.status === "acik";
        const canAct = myRank > roleRank(r.reported_role);
        return html`
          <div class="card" key=${r.id}>
            <div class="bold" style="font-size:19px">🚩 ${api.reasonLabel(r.reason)}</div>
            <div class="bold">Şikayet edilen: ${r.reported_name ? "@" + r.reported_name : "-"}</div>
            <div class="soft small">Şikayet eden: ${r.reporter_name ? "@" + r.reporter_name : "-"} • ${agoText(r.created_at)}</div>
            ${r.room_name && html`<div class="soft small">Oda: ${r.room_name}</div>`}
            <div class="quote-box" style="margin-top:8px">"${r.message_text || ""}"</div>
            ${!r.message_exists && html`<div class="muted small">(Mesaj sohbetten silinmiş)</div>`}
            ${r.note && html`<div class="soft small" style="margin-top:6px">Açıklama: ${r.note}</div>`}
            ${open ? html`
              <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
                ${canAct ? html`
                  ${r.message_exists && html`<button class="btn block red" disabled=${working} onClick=${() => act("Mesaj silindi, şikayet kapatıldı.", async () => {
                    await api.deleteMessage(r.message_id);
                    await api.resolveReport(r.id, "Mesaj silindi");
                  })}>🗑  Mesajı Sil ve Kapat</button>`}
                  <button class="btn block orange" disabled=${working} onClick=${() => onMute(r)}>🔇  Üyeyi Sustur</button>`
                  : html`<div class="muted small">Bu üye senin rütbende ya da üstünde. Sadece şikayeti kapatabilirsin.</div>`}
                <button class="btn block green" disabled=${working} onClick=${() => act("Şikayet kapatıldı.", () => api.resolveReport(r.id, "Sorun bulunmadı"))}>✅  Sorun Yok, Kapat</button>
              </div>`
              : html`<div class="small bold" style="color:var(--ok);margin-top:8px">Kapatan: ${r.resolved_by_name ? "@" + r.resolved_by_name : "-"} • ${r.resolution || ""}</div>`}
          </div>`;
      })}`;
}

function ActivityTab({ user, reload, onClearUser, onInfo }) {
  const [category, setCategory] = useState(null);
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [items, setItems] = useState(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setItems(null);
    api.adminActivity(category, user?.id, applied, null).then((l) => {
      setItems(l || []);
      setMore((l || []).length >= 100);
    }).catch((e) => {
      onInfo({ err: true, text: "Kayıtlar yüklenemedi: " + userMessage(e) });
      setItems([]);
    });
  }, [category, user?.id, applied, reload]);

  async function loadMore() {
    if (!items || !items.length) return;
    setLoadingMore(true);
    try {
      const l = await api.adminActivity(category, user?.id, applied, items[items.length - 1].id);
      setItems([...items, ...(l || [])]);
      setMore((l || []).length >= 100);
    } catch (e) {
      onInfo({ err: true, text: userMessage(e) });
    }
    setLoadingMore(false);
  }

  return html`
    ${user && html`
      <div class="row card" style="padding:10px 14px">
        <div class="grow bold">Sadece ${user.username ? "@" + user.username : "üye"}</div>
        <button class="btn small ghost" onClick=${onClearUser}>Tümünü göster</button>
      </div>`}
    <div class="chips">
      ${ACTIVITY_FILTERS.map(([key, label]) => html`
        <button key=${label} class=${"chip" + (category === key ? " on" : "")} onClick=${() => setCategory(key)}>${label}</button>`)}
    </div>
    ${!user && html`
      <form class="row" onSubmit=${(e) => { e.preventDefault(); setApplied(search.trim()); }}>
        <input class="input grow" placeholder="Kişi ara (@ad)" value=${search} onInput=${(e) => setSearch(e.target.value)} />
        <button class="btn" type="submit">Ara</button>
      </form>`}
    ${items === null ? html`<${Spinner} />` : items.length === 0 ? html`<div class="center muted" style="padding:30px">Kayıt yok</div>`
      : items.map((a) => html`
        <div class="card" key=${a.id} style="padding:12px 14px">
          <div class="small muted">${dateText(a.created_at)} ${new Date(a.created_at).toTimeString().slice(0, 5)} • ${agoText(a.created_at)}</div>
          <div><b>${a.actor_name ? "@" + a.actor_name : "Sistem"}</b> ${a.summary}</div>
        </div>`)}
    ${more && html`<button class="btn block outline" disabled=${loadingMore} onClick=${loadMore}>${loadingMore ? "Yükleniyor…" : "Daha eski kayıtları yükle"}</button>`}`;
}


// =====================================================================
// 🏠 Odalar: görünür / üyeler yazabilir / bildirim, ad ve amaç, sohbeti aç-kapat, oda rütbeleri
// =====================================================================
const LEVEL_CHOICES = [["sorumlu", "🏠 Oda Yöneticisi (odada tek)", "Süper operatör ve operatör atar, sohbeti aç/kapat, sabitle, 24 saate kadar sustur"],
  ["yetkili", "⚡ Süper Operatör", "Operatör atar, sohbeti aç/kapat, sabitle, 3 saate kadar sustur"],
  ["operator", "🔹 Operatör", "Mesaj sil, 1 saate kadar sustur"]];

function RoomsTab({ members, myRank, onInfo }) {
  const [rooms, setRooms] = useState(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);       // oda: ad ve amaç
  const [grant, setGrant] = useState(null);     // { room, user? }
  const [lockFor, setLockFor] = useState(null);

  async function load() {
    try { setRooms(await api.adminRooms()); } catch (e) { onInfo({ err: true, text: userMessage(e) }); setRooms((r) => r || []); }
  }
  useEffect(() => { load(); }, []);

  async function act(text, fn) {
    setBusy(true);
    try { await fn(); onInfo({ err: false, text }); await load(); }
    catch (e) { onInfo({ err: true, text: userMessage(e) }); }
    setBusy(false);
  }

  if (rooms === null) return html`<${Spinner} />`;
  return html`
    <div class="muted small" style="margin-bottom:8px">Oda rütbelerini sadece kurucu ve yönetici verir. Rütbe sadece o odada geçerlidir.</div>
    ${rooms.map((r) => html`
      <div class="card room-adm" key=${r.id} style=${r.active ? "" : "opacity:.7"}>
        <div class="row" style="gap:8px">
          <b class="grow" style="font-size:18px">${r.icon} ${r.name}</b>
          ${r.closed && html`<span class="pill" style="background:#B45309">🔒 Kapalı</span>`}
          ${!r.active && html`<span class="pill" style="background:#475569">Gizli</span>`}
        </div>
        ${r.description && html`<div class="soft small">${r.description}</div>`}
        ${!r.can_edit ? html`<div class="muted small" style="margin-top:6px">Bu odayı sadece kurucu değiştirebilir.</div>` : html`
          <${Switch} label="👁 Görünür (menüde çıksın)" checked=${r.active}
            onChange=${(v) => act(`${r.name}: ${v ? "görünür" : "gizlendi"}`, () => api.adminRoomUpdate(r.id, { active: v }))} />
          ${r.id !== "eczane" && r.id !== "hava" && html`<${Switch} label="✍️ Üyeler yazabilir" checked=${!r.read_only}
            onChange=${(v) => act(`${r.name}: ${v ? "üyeler yazabilir" : "sadece yönetim yazar"}`, () => api.adminRoomUpdate(r.id, { members_write: v }))} />`}
          <${Switch} label="🔔 Bildirim gönder" checked=${r.notify}
            onChange=${(v) => act(`${r.name}: bildirim ${v ? "açık" : "kapalı"}`, () => api.adminRoomUpdate(r.id, { notify: v }))} />
          <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">
            <button class="btn outline small" disabled=${busy} onClick=${() => setEdit(r)}>✏️ Ad ve amaç</button>
            ${r.id !== "eczane" && (r.closed
              ? html`<button class="btn green small" disabled=${busy} onClick=${() => act(`${r.name} sohbete açıldı`, () => api.roomUnlock(r.id))}>🔓 Sohbeti aç</button>`
              : html`<button class="btn orange small" disabled=${busy} onClick=${() => setLockFor(r)}>🔒 Sohbeti kapat</button>`)}
          </div>
          ${r.closed && html`<div class="muted small" style="margin-top:4px">${r.closed_by_name ? "@" + r.closed_by_name + " kapattı" : ""}${r.closed_until ? " • " + new Date(r.closed_until).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) + "'da açılacak" : ""}</div>`}
          ${r.min_rank === 0 && html`
            <div class="bold" style="margin-top:12px">Oda görevlileri</div>
            ${(r.staff || []).length === 0 && html`<div class="muted small">Henüz görevli yok.</div>`}
            ${(r.staff || []).map((x) => html`
              <button class="list-btn" key=${x.user_id} onClick=${() => setGrant({ room: r, user: x })}>
                ${api.LEVELS[x.level]?.[0] || ""} @${x.username} <span class="muted small">• ${api.LEVELS[x.level]?.[1] || ""}</span></button>`)}
            <button class="btn small" style="margin-top:6px" disabled=${busy} onClick=${() => setGrant({ room: r })}>➕ Görevli ekle</button>`}
        `}
      </div>`)}

    ${edit && html`<${RoomEditDialog} room=${edit} onClose=${() => setEdit(null)}
        onSave=${(name, description) => { const r = edit; setEdit(null); act(`${r.icon} ${name} kaydedildi`, () => api.adminRoomUpdate(r.id, { name, description })); }} />`}
    ${lockFor && html`
      <${Modal} title=${`🔒 ${lockFor.name}: sohbeti kapat`} onClose=${() => setLockFor(null)}
        actions=${html`<button class="btn outline" onClick=${() => setLockFor(null)}>Vazgeç</button>`}>
        ${[[30, "30 dakika"], [60, "1 saat"], [180, "3 saat"], [null, "Ben açana kadar"]].map(([v, t]) => html`
          <button key=${t} class="list-btn" onClick=${() => { const r = lockFor; setLockFor(null); act(`${r.name} sohbete kapatıldı`, () => api.roomLock(r.id, v)); }}>⏱  ${t}</button>`)}
      </${Modal}>`}
    ${grant && html`<${GrantDialog} room=${grant.room} user=${grant.user} members=${members} myRank=${myRank} onClose=${() => setGrant(null)}
        onPick=${(userId, uname, level) => { const r = grant.room; setGrant(null);
          act(level ? `@${uname}: ${r.name} odasında ${api.LEVELS[level][1]}` : `@${uname}: ${r.name} görevi kaldırıldı`,
            () => api.adminSetRoomLevel(r.id, userId, level)); }} />`}`;
}

function RoomEditDialog({ room, onClose, onSave }) {
  const [name, setName] = useState(room.name);
  const [desc, setDesc] = useState(room.description || "");
  return html`
    <${Modal} title=${`✏️ ${room.icon} Oda adı ve amacı`} onClose=${onClose}
      actions=${[
        html`<button class="btn outline" onClick=${onClose}>Vazgeç</button>`,
        html`<button class="btn" disabled=${name.trim().length < 2} onClick=${() => onSave(name.trim(), desc.trim())}>Kaydet</button>`,
      ]}>
      <div class="bold">Oda adı</div>
      <input class="input" maxlength="40" value=${name} onInput=${(e) => setName(e.target.value)} />
      <div class="bold" style="margin-top:10px">Amacı (menüde ve oda başlığında görünür)</div>
      <input class="input" maxlength="200" value=${desc} placeholder="Örn: Radar • çevirme • yol yardım" onInput=${(e) => setDesc(e.target.value)} />
    </${Modal}>`;
}

function GrantDialog({ room, user, members, myRank, onClose, onPick }) {
  const [q, setQ] = useState("");
  const [who, setWho] = useState(user ? { id: user.user_id, username: user.username } : null);
  const t = q.trim().replace(/^@/, "").toLowerCase();
  const hits = !who && t.length >= 2
    ? members.filter((m) => m.username && m.username.includes(t) && roleRank(m.role) < myRank).slice(0, 8) : [];
  return html`
    <${Modal} title=${`${room.icon} ${room.name}: oda görevi`} onClose=${onClose}
      actions=${html`<button class="btn outline" onClick=${onClose}>Vazgeç</button>`}>
      ${!who ? html`
        <input class="input" placeholder="🔍 Üye ara (en az 2 harf)" value=${q} autocapitalize="off" onInput=${(e) => setQ(e.target.value)} />
        ${hits.map((m) => html`<button key=${m.id} class="list-btn" onClick=${() => setWho(m)}>@${m.username} ${roleBadge(m.role)}</button>`)}
        ${t.length >= 2 && hits.length === 0 && html`<div class="muted small" style="margin-top:6px">Üye bulunamadı.</div>`}`
      : html`
        <div class="bold" style="font-size:18px;margin-bottom:6px">@${who.username}</div>
        ${LEVEL_CHOICES.map(([lv, t2, d]) => html`
          <button key=${lv} class="list-btn" onClick=${() => onPick(who.id, who.username, lv)}>
            ${t2}${user && user.level === lv ? "  ✓" : ""}<div class="muted small">${d}</div></button>`)}
        ${user && html`<button class="list-btn" style="color:var(--red-soft)" onClick=${() => onPick(who.id, who.username, null)}>✖  Görevi kaldır</button>`}`}
    </${Modal}>`;
}
