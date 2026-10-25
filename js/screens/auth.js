// Giriş, kayıt, kullanıcı adı seçimi ve yasak ekranı
import {
  html, useState, navigate, userMessage, cleanUsername, usernameLocalError, USERNAME_MIN, USERNAME_MAX, dateText,
} from "../lib.js";
import * as api from "../api.js";
import { Modal, Spinner } from "../ui.js";
import { disablePush } from "../push.js";

function Logo({ sub }) {
  return html`
    <div class="center" style="gap:6px;margin:calc(var(--safe-top) + 20px) 0 10px">
      <div class="badge">DYB</div>
      <h1 style="margin:10px 0 0;font-size:26px">Denizli Yol Bilgisi</h1>
      ${sub && html`<div class="soft">${sub}</div>`}
    </div>`;
}

// ---------------------------------------------------------------------------
// Giriş
// ---------------------------------------------------------------------------
export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!email.includes("@")) return setErr("Geçerli bir e-posta gir.");
    if (!password) return setErr("Şifre boş olamaz.");
    setBusy(true);
    setErr(null);
    try {
      await api.signIn(email.trim(), password);
      navigate("/menu", true);
    } catch (ex) {
      setErr(userMessage(ex, "Giriş yapılamadı. Lütfen tekrar dene."));
    } finally {
      setBusy(false);
    }
  }

  return html`
    <div class="screen gradient">
      <form class="content" onSubmit=${submit} style="max-width:480px;margin:0 auto;width:100%">
        <${Logo} sub="Üye girişi" />
        <div class="field">
          <label>E-posta</label>
          <input class="input" type="email" autocomplete="email" inputmode="email" autocapitalize="none"
                 value=${email} onInput=${(e) => setEmail(e.target.value)} />
        </div>
        <div class="field">
          <label>Şifre</label>
          <div class="input-wrap">
            <input class="input" type=${show ? "text" : "password"} autocomplete="current-password"
                   value=${password} onInput=${(e) => setPassword(e.target.value)} style="padding-right:90px" />
            <button type="button" class="btn ghost suffix" onClick=${() => setShow(!show)}>${show ? "Gizle" : "Göster"}</button>
          </div>
        </div>
        ${err && html`<div class="msg err">${err}</div>`}
        <button class="btn block big" type="submit" disabled=${busy}>${busy ? html`<${Spinner} small />` : "Giriş Yap"}</button>
        <button type="button" class="btn ghost" onClick=${() => navigate("/kayit")}>Davet kodum var – Kayıt ol</button>
      </form>
    </div>`;
}

// ---------------------------------------------------------------------------
// Kayıt (davet kodu ile)
// ---------------------------------------------------------------------------
export function RegisterScreen() {
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  function validate() {
    const e = {};
    if (!code.trim()) e.code = "Davet kodunu yaz.";
    const ue = usernameLocalError(username);
    if (ue) e.username = ue;
    if (!email.includes("@")) e.email = "Geçerli bir e-posta gir.";
    if (password.length < 6) e.password = "Şifre en az 6 karakter olmalı.";
    if (password2 !== password) e.password2 = "Şifreler aynı değil.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function register() {
    setConfirm(false);
    setBusy(true);
    setMsg(null);
    const c = code.trim().toUpperCase();
    try {
      let ok;
      try {
        ok = await api.checkInvite(c);
      } catch (ex) {
        return setMsg({ err: true, text: userMessage(ex, "Davet kodu şu an doğrulanamadı. Lütfen tekrar dene.") });
      }
      if (!ok) {
        setErrors({ code: "Davet kodunu kontrol et." });
        return setMsg({ err: true, text: "Davet kodu geçersiz veya daha önce kullanılmış." });
      }
      let problem;
      try {
        problem = await api.checkUsername(username);
      } catch (ex) {
        return setMsg({ err: true, text: userMessage(ex, "Kullanıcı adı şu an kontrol edilemedi. Lütfen tekrar dene.") });
      }
      if (problem) {
        setErrors({ username: problem });
        return setMsg({ err: true, text: problem });
      }
      const loggedIn = await api.signUp(email.trim(), password, c, username);
      if (loggedIn) navigate("/menu", true);
      else setMsg({ err: false, text: "Kayıt başarılı! E-postana gelen onay bağlantısına tıkla, sonra giriş yap." });
    } catch (ex) {
      setMsg({ err: true, text: userMessage(ex, "Kayıt şu an tamamlanamadı. Lütfen biraz sonra tekrar dene.") });
    } finally {
      setBusy(false);
    }
  }

  const f = (key, label, input, hint) => html`
    <div class="field">
      <label>${label}</label>
      ${input}
      ${(errors[key] || hint) && html`<div class=${"hint" + (errors[key] ? " err" : "")}>${errors[key] || hint}</div>`}
    </div>`;

  return html`
    <div class="screen gradient">
      <form class="content" style="max-width:480px;margin:0 auto;width:100%"
            onSubmit=${(e) => { e.preventDefault(); if (validate()) setConfirm(true); }}>
        <${Logo} sub="Yeni üye kaydı – davet kodu ile" />
        ${f("code", "Davet Kodu", html`<input class=${"input" + (errors.code ? " err" : "")} autocapitalize="characters"
            value=${code} onInput=${(e) => setCode(e.target.value)} placeholder="DYB-XXXXXX" />`)}
        ${f("username", "Kullanıcı Adı (zorunlu)", html`
          <div class="input-wrap"><span class="prefix">@</span>
            <input class=${"input with-prefix" + (errors.username ? " err" : "")} autocapitalize="none" autocorrect="off"
                   value=${username} onInput=${(e) => { const v = cleanUsername(e.target.value); e.target.value = v; setUsername(v); }} />
          </div>`, `${USERNAME_MIN}-${USERNAME_MAX} karakter: a-z, 0-9 ve _ • Sonradan değiştirilemez`)}
        ${f("email", "E-posta", html`<input class=${"input" + (errors.email ? " err" : "")} type="email" autocomplete="email"
            autocapitalize="none" value=${email} onInput=${(e) => setEmail(e.target.value)} />`, "Diğer üyelere gösterilmez")}
        ${f("password", "Şifre", html`<input class=${"input" + (errors.password ? " err" : "")} type="password"
            autocomplete="new-password" value=${password} onInput=${(e) => setPassword(e.target.value)} />`)}
        ${f("password2", "Şifre (tekrar)", html`<input class=${"input" + (errors.password2 ? " err" : "")} type="password"
            autocomplete="new-password" value=${password2} onInput=${(e) => setPassword2(e.target.value)} />`)}
        ${msg && html`<div class=${"msg " + (msg.err ? "err" : "ok")}>${msg.text}</div>`}
        <button class="btn block big" type="submit" disabled=${busy}>${busy ? html`<${Spinner} small />` : "Kayıt Ol"}</button>
        <button type="button" class="btn ghost" onClick=${() => navigate("/giris")}>← Girişe dön</button>
      </form>
      ${confirm && html`
        <${Modal} title="Kullanıcı adını onayla" onClose=${() => setConfirm(false)}
          actions=${[
            html`<button class="btn outline" onClick=${() => setConfirm(false)}>Düzelt</button>`,
            html`<button class="btn" onClick=${register}>Evet, kayıt ol</button>`,
          ]}>
          <p style="font-size:19px;margin:0">Kullanıcı adın <b>@${username}</b> olacak.</p>
          <p class="soft">Kullanıcı adı sonradan <b>değiştirilemez</b>. Sohbette herkes seni bu adla görür.</p>
        </${Modal}>`}
    </div>`;
}

// ---------------------------------------------------------------------------
// Kullanıcı adı olmayan eski üyeler için tek seferlik seçim
// ---------------------------------------------------------------------------
export function UsernameScreen({ onDone }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function save() {
    setConfirm(false);
    setBusy(true);
    setErr(null);
    try {
      const problem = await api.checkUsername(name);
      if (problem) return setErr(problem);
      await api.setUsername(name);
      onDone(name);
    } catch (ex) {
      setErr(userMessage(ex, "Kullanıcı adı kaydedilemedi. Lütfen tekrar dene."));
    } finally {
      setBusy(false);
    }
  }

  return html`
    <div class="screen gradient">
      <form class="content" style="max-width:480px;margin:0 auto;width:100%"
            onSubmit=${(e) => { e.preventDefault(); const le = usernameLocalError(name); le ? setErr(le) : setConfirm(true); }}>
        <${Logo} sub="Kullanıcı adını seç" />
        <p class="soft" style="margin:0">Sohbette e-postan yerine kullanıcı adın görünür. Bir kez seçilir, sonradan değiştirilemez.</p>
        <div class="field">
          <label>Kullanıcı Adı</label>
          <div class="input-wrap"><span class="prefix">@</span>
            <input class=${"input with-prefix" + (err ? " err" : "")} autocapitalize="none" autocorrect="off" value=${name}
                   onInput=${(e) => { const v = cleanUsername(e.target.value); e.target.value = v; setName(v); setErr(null); }} />
          </div>
          <div class=${"hint" + (err ? " err" : "")}>${err || `${USERNAME_MIN}-${USERNAME_MAX} karakter: a-z, 0-9 ve _`}</div>
        </div>
        <button class="btn block big" type="submit" disabled=${busy}>${busy ? html`<${Spinner} small />` : "Kaydet"}</button>
        <button type="button" class="btn ghost" onClick=${async () => { await disablePush(); await api.signOut(); navigate("/giris", true); }}>Çıkış Yap</button>
      </form>
      ${confirm && html`
        <${Modal} title="Emin misin?" onClose=${() => setConfirm(false)}
          actions=${[
            html`<button class="btn outline" onClick=${() => setConfirm(false)}>Düzelt</button>`,
            html`<button class="btn" onClick=${save}>Evet, kaydet</button>`,
          ]}>
          <p style="font-size:19px;margin:0">Kullanıcı adın <b>@${name}</b> olacak. Sonradan değiştirilemez.</p>
        </${Modal}>`}
    </div>`;
}

// ---------------------------------------------------------------------------
// Yasaklı üye
// ---------------------------------------------------------------------------
export function BannedScreen({ profile }) {
  return html`
    <div class="screen gradient">
      <div class="content center" style="gap:16px;padding-top:calc(var(--safe-top) + 40px)">
        <div style="font-size:64px">⛔</div>
        <h1 style="margin:0">Hesabın askıya alındı</h1>
        <div class="card" style="max-width:440px;width:100%;text-align:left">
          <div class="bold">Sebep:</div>
          <div style="font-size:18px">${profile?.ban_reason || "-"}</div>
          <div class="muted small" style="margin-top:8px">Tarih: ${dateText(profile?.banned_at)}</div>
        </div>
        <p class="soft" style="max-width:440px">Bir hata olduğunu düşünüyorsan seni davet eden kişiyle ya da yönetimle iletişime geç.</p>
        <button class="btn red big" onClick=${async () => { await disablePush(); await api.signOut(); navigate("/giris", true); }}>🚪 Çıkış Yap</button>
      </div>
    </div>`;
}
