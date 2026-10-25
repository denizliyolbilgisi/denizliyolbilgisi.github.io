// Yönetim: Üyeler (e-posta/süre sadece kurucu+yönetici), Şikayetler, Son İşlemler, oda yöneticisi atama
import {
  html, useState, useEffect, navigate, userMessage, agoText, dateText, remainingText, isStillActive,
  roleRank, roleLabel, durationText, parseTime,
} from "../lib.js";
import * as api from "../api.js";
import { TopBar, Modal, Spinner } from "../ui.js";

const MUTE_OPTIONS = [["1 saat", 60], ["5 saat", 300], ["12 saat", 720], ["24 saat", 1440],
  ["15 gün", 15 * 1440], ["30 gün", 30 * 1440], ["Süresiz", null]];
const ROLE_CHOICES = [["yonetici", "🛡  Yönetici Yap"], ["moderator", "⭐  Moderatör Yap"], ["uye", "👤  Normal Üye Yap"]];
const ACTIVITY_FILTERS = [[null, "Tümü"], ["uyelik", "👤 Üyelik"], ["mesaj", "💬 Mesaj"], ["radar", "🚨 Radar"],
  ["davet", "🎟 Davet"], ["sikayet", "🚩 Şikayet"], ["yonetim", "🛡 Yönetim"]];
const ROLE_PILL = { kurucu: ["👑 Kurucu", "#B8860B"], yonetici: ["🛡 Yönetici", "#1F6FEB"], moderator: ["⭐ Moderatör", "#7B4DDB"] };

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

export function AdminScreen() {
  const [myRank, setMyRank] = useState(1);
  const [tab, setTab] = useState(0);
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
        setMyRank(roleRank(p?.role));
        setMembers(await api.adminMembers());
        api.openReportCount().then(setOpenCount).catch(() => {});
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

  const tabs = ["Üyeler", openCount > 0 ? `Şikayetler (${openCount})` : "Şikayetler"];
  if (myRank >= 3) tabs.push("Son İşlemler");

  // Filtre ve sıralama
  const q = search.trim().replace(/^@/, "").toLowerCase();
  let list = (members || []).filter((m) => !q || (m.username || "").includes(q) || (m.invited_by || "").includes(q) ||
    (m.email || "").toLowerCase().includes(q));
  if (sort === 1) list = [...list].sort((a, b) => (b.usage_7d || 0) - (a.usage_7d || 0));
  if (sort === 2) list = [...list].sort((a, b) => (parseTime(b.last_seen_at)?.getTime() || 0) - (parseTime(a.last_seen_at)?.getTime() || 0));

  return html`
    <div class="screen">
      <${TopBar} title="🛡 Yönetim" sub=${members ? `${members.length} üye` : ""} onBack=${() => navigate("/menu")}
        right=${html`<button class="btn ghost" onClick=${() => setReload((r) => r + 1)}>Yenile</button>`} />
      <div class="tabs">
        ${tabs.map((t, i) => html`<button key=${i} class=${tab === i ? "on" : ""} onClick=${() => setTab(i)}>${t}</button>`)}
      </div>
      <div class="content">
        ${info && html`<div class=${"msg " + (info.err ? "err" : "ok")}>${info.text}</div>`}

        ${tab === 1 && html`<${ReportsTab} myRank=${myRank} reload=${reload} onInfo=${setInfo}
            onChanged=${() => setReload((r) => r + 1)}
            onMute=${(r) => r.reported_id && setMuteTarget({ member: { id: r.reported_id, username: r.reported_name, role: r.reported_role }, reportId: r.id })} />`}

        ${tab === 2 && html`<${ActivityTab} user=${activityUser} reload=${reload} onClearUser=${() => setActivityUser(null)} onInfo=${setInfo} />`}

        ${tab === 0 && html`
          <input class="input" placeholder=${myRank >= 3 ? "Üye ara (@ad ya da e-posta)" : "Üye ara (@ad)"} value=${search}
            onInput=${(e) => setSearch(e.target.value)} />
          ${myRank >= 3 && html`
            <div class="chips">
              ${["Rütbe", "⏱ En aktif", "👁 Son görülen"].map((t, i) => html`
                <button key=${i} class=${"chip" + (sort === i ? " on" : "")} onClick=${() => setSort(i)}>${t}</button>`)}
            </div>`}
          ${members === null ? html`<${Spinner} />` : list.length === 0 ? html`<div class="center muted">Üye bulunamadı</div>`
            : list.map((m) => html`<${MemberCard} key=${m.id} m=${m} showPrivate=${myRank >= 3} onClick=${() => setSelected(m)} />`)}
        `}
      </div>

      ${selected && html`
        <${Modal} title=${name(selected)} onClose=${() => setSelected(null)}
          actions=${html`<button class="btn outline" onClick=${() => setSelected(null)}>Kapat</button>`}>
          <div style="white-space:pre-wrap;font-size:16px">${statusText(selected)}</div>
          ${myRank >= 3 && html`<${UsageDetail} userId=${selected.id} />`}
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">
            ${myRank >= 3 && html`<button class="btn block" onClick=${() => { setActivityUser(selected); setSelected(null); setTab(2); }}>📋  İşlemlerini Gör</button>`}
            ${myRank <= roleRank(selected.role) ? html`<div class="bold">Bu üyeye işlem yapma yetkin yok.</div>` : html`
              ${isMuted(selected)
                ? html`<button class="btn block green" disabled=${working} onClick=${() => { const m = selected; setSelected(null); run(`${name(m)} artık yazabilir.`, () => api.adminUnmute(m.id)); }}>🔊  Susturmayı Kaldır</button>`
                : html`<button class="btn block orange" disabled=${working} onClick=${() => { setMuteTarget({ member: selected }); setSelected(null); }}>🔇  Sustur</button>`}
              ${myRank >= 3 && (isBanned(selected)
                ? html`<button class="btn block green" disabled=${working} onClick=${() => { const m = selected; setSelected(null); run(`${name(m)} yasağı kaldırıldı.`, () => api.adminUnban(m.id)); }}>✅  Yasağı Kaldır</button>`
                : html`<button class="btn block red" disabled=${working} onClick=${() => { setBanTarget(selected); setSelected(null); }}>⛔  Yasakla</button>`)}
              ${myRank >= 3 && html`
                <div class="bold" style="margin-top:6px">🔰 Oda yöneticiliği:</div>
                <div class="muted small">Oda yöneticisi sadece kendi odasında mesaj silebilir, sabitleyebilir, 24 saate kadar susturabilir ve açıklamayı değiştirebilir.</div>
                ${rooms.map((r) => {
                  const on = (selected.room_admin_of || []).includes(r.id);
                  return html`<button key=${r.id} class=${"btn block " + (on ? "red" : "green")} disabled=${working}
                    onClick=${() => { const m = selected; setSelected(null);
                      run(on ? `${name(m)} artık ${r.icon} ${r.name} oda yöneticisi değil.` : `${name(m)} artık ${r.icon} ${r.name} oda yöneticisi 🔰`,
                        () => api.setRoomAdmin(r.id, m.id, !on)); }}>
                    ${on ? `✖  ${r.icon} ${r.name}: Kaldır` : `🔰  ${r.icon} ${r.name}: Ata`}</button>`;
                })}
                <div class="bold" style="margin-top:6px">Rol:</div>
                ${ROLE_CHOICES.filter(([role]) => roleRank(role) < myRank && role !== selected.role).map(([role, label]) => html`
                  <button key=${role} class="btn block purple" disabled=${working} onClick=${() => { setRoleTarget({ m: selected, role }); setSelected(null); }}>${label}</button>`)}
              `}
            `}
          </div>
        </${Modal}>`}

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
  if ((m.room_admin_of || []).length) s += `\n🔰 Oda yöneticisi: ${m.room_admin_of.map(roomName).join(", ")}`;
  if (isMuted(m)) s += `\n\n🔇 Susturuldu – kalan: ${remainingText(m.muted_until)}\nSebep: ${m.mute_reason || "-"}\nSusturan: ${m.muted_by ? "@" + m.muted_by : "-"}`;
  if (isBanned(m)) s += `\n\n⛔ Yasaklı\nSebep: ${m.ban_reason || "-"}\nYasaklayan: ${m.banned_by ? "@" + m.banned_by : "-"}`;
  return s;
}

function MemberCard({ m, showPrivate, onClick }) {
  const border = isBanned(m) ? "#D32F2F" : isMuted(m) ? "#E07B00" : "";
  const pill = ROLE_PILL[m.role];
  return html`
    <div class="card member" style=${border ? `border-color:${border}` : ""} onClick=${onClick}>
      <div class="row wrap">
        <div class="name grow">${name(m)}</div>
        ${pill && html`<span class="pill" style=${`background:${pill[1]}`}>${pill[0]}</span>`}
        ${(m.room_admin_of || []).length > 0 && html`<span class="pill" style="background:#2E7D5B">🔰</span>`}
        ${isBanned(m) ? html`<span class="pill" style="background:#D32F2F">⛔ Yasaklı</span>`
          : isMuted(m) ? html`<span class="pill" style="background:#E07B00">🔇</span>` : null}
      </div>
      <div class="soft small" style="margin-top:6px">Katıldı: ${dateText(m.created_at)} • Davet eden: ${m.invited_by ? "@" + m.invited_by : "-"}</div>
      <div class="soft small">Mesaj: ${m.message_count ?? 0} • Son mesaj: ${m.last_message_at ? agoText(m.last_message_at) : "yok"}</div>
      ${(m.room_admin_of || []).length > 0 && html`<div class="small bold" style="color:#8BE0A4">🔰 Oda yöneticisi: ${m.room_admin_of.map(roomName).join(", ")}</div>`}
      ${showPrivate && html`
        ${m.email && html`<div class="soft small">✉️ ${m.email}</div>`}
        <div class="small" style="color:#9FC5FF">⏱ Bugün ${durationText(m.usage_today)} • 7 gün ${durationText(m.usage_7d)} • Toplam ${durationText(m.usage_total)}</div>
        <div class="soft small">👁 Son görülme: ${m.last_seen_at ? agoText(m.last_seen_at) : "yok"}</div>`}
      ${isMuted(m) && html`<div class="small bold" style="color:#FFC27A">Kalan: ${remainingText(m.muted_until)} • Sebep: ${m.mute_reason || "-"} • Susturan: ${m.muted_by ? "@" + m.muted_by : "-"}</div>`}
      ${isBanned(m) && html`<div class="small bold" style="color:#FF8A80">Yasak sebebi: ${m.ban_reason || "-"} • Yasaklayan: ${m.banned_by ? "@" + m.banned_by : "-"}</div>`}
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
  const options = myRank >= 3 ? MUTE_OPTIONS : MUTE_OPTIONS.filter(([, m]) => m !== null && m <= 1440);
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
      ${myRank < 3 && html`<div class="small muted">Moderatör en fazla 24 saat susturabilir.</div>`}
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
              : html`<div class="small bold" style="color:#8BE0A4;margin-top:8px">Kapatan: ${r.resolved_by_name ? "@" + r.resolved_by_name : "-"} • ${r.resolution || ""}</div>`}
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
