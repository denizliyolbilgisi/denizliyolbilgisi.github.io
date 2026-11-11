// 1.1.2.7 🎴 Okey — taş yardımcıları, ıstaka dizme ve el çözücü (sunucudaki SQL 39a ile aynı kurallar)
// Taş: 0..103 = renk*26 + (sayı-1)*2 + kopya (renk: 0 kırmızı, 1 sarı, 2 mavi, 3 siyah); 104, 105 = sahte okey
// Bu dosyadaki kontrol yalnız ipucu ve gösterim içindir; asıl karar sunucudadır.

export const RENK = ["#D93025", "#D97706", "#1D4ED8", "#1F2937"];
export const RENK_AD = ["Kırmızı", "Sarı", "Mavi", "Siyah"];
export const SATIR = 13;            // ıstakada her sırada 13 yer
export const YER = SATIR * 2;       // toplam 26 yer

export const renk = (t) => Math.floor(t / 26);
export const sayi = (t) => Math.floor((t % 26) / 2) + 1;
export const sahte = (t) => t >= 104;
export const gercekOkey = (t, okR, okN) => t < 104 && renk(t) === okR && sayi(t) === okN;
/** Oyundaki değer: sahte okey → okeyin değeri; gerçek okey → -1 (joker); diğer → 1..52 */
export function deger(t, okR, okN) {
  if (t >= 104) return okR * 13 + okN;
  if (renk(t) === okR && sayi(t) === okN) return -1;
  return renk(t) * 13 + sayi(t);
}
export const tasAdi = (t) => (t >= 104 ? "Sahte okey" : `${RENK_AD[renk(t)]} ${sayi(t)}`);

// ---------------------------------------------------------------------------
// Çözücü (SQL okey_coz ile aynı arama). Gruplar {v, j} listesi olarak kaydedilir.
// ---------------------------------------------------------------------------
function coz(c, j, esnek, out) {
  let i = 0;
  for (let k = 1; k <= 52; k++) if (c[k] > 0) { i = k; break; }
  if (!i) {
    if (j === 0 || j >= 3 || esnek) {
      if (j > 0) out.push(Array.from({ length: j }, () => ({ v: 0, j: true })));
      return true;
    }
    return false;
  }
  const r = Math.floor((i - 1) / 13), n = (i - 1) % 13 + 1;
  // 1) PER
  const diger = [];
  for (let k = 0; k < 4; k++) if (k !== r && c[k * 13 + n] > 0) diger.push(k);
  for (let mask = 0; mask < (1 << diger.length); mask++) {
    const sec = diger.filter((_, b) => (mask >> b) & 1);
    for (let jk = 0; jk <= Math.min(j, 3); jk++) {
      const boy = 1 + sec.length + jk;
      if (boy < 3 || boy > 4) continue;
      const c2 = c.slice();
      c2[i]--;
      sec.forEach((k) => c2[k * 13 + n]--);
      const g = [{ v: i }, ...sec.map((k) => ({ v: k * 13 + n }))];
      for (let x = 0; x < jk; x++) g.push({ v: 0, j: true });
      out.push(g);
      if (coz(c2, j - jk, esnek || boy === 3, out)) return true;
      out.pop();
    }
  }
  // 2) SERİ
  const c2 = c.slice();
  c2[i]--;
  for (let pre = 0; pre <= Math.min(j, n - 1); pre++) {
    const g = [];
    for (let x = 0; x < pre; x++) g.push({ v: r * 13 + n - pre + x, j: true });
    g.push({ v: i });
    if (seri(c2, j - pre, r, n + 1, pre + 1, esnek || n - pre > 1, g, out)) return true;
  }
  if (n === 1) {
    for (let s = 12; s >= 2; s--) {
      if (seriSonu1(c2, j, r, s, s, esnek, [], out)) return true;
    }
  }
  return false;
}
function seri(c, j, r, pos, uz, esnek, g, out) {
  if (uz >= 3) {
    out.push(g);
    if (coz(c, j, esnek || pos <= 14, out)) return true;
    out.pop();
  }
  if (pos > 14) return false;
  const idx = r * 13 + (pos === 14 ? 1 : pos);
  if (c[idx] > 0) {
    const c2 = c.slice(); c2[idx]--;
    if (seri(c2, j, r, pos + 1, uz + 1, esnek, [...g, { v: idx }], out)) return true;
  }
  if (j > 0 && seri(c, j - 1, r, pos + 1, uz + 1, esnek, [...g, { v: idx, j: true }], out)) return true;
  return false;
}
function seriSonu1(c, j, r, s, pos, esnek, g, out) {
  if (pos > 13) {
    out.push([...g, { v: r * 13 + 1 }]);
    if (coz(c, j, esnek || s > 1, out)) return true;
    out.pop();
    return false;
  }
  const idx = r * 13 + pos;
  if (c[idx] > 0) {
    const c2 = c.slice(); c2[idx]--;
    if (seriSonu1(c2, j, r, s, pos + 1, esnek, [...g, { v: idx }], out)) return true;
  }
  if (j > 0 && seriSonu1(c, j - 1, r, s, pos + 1, esnek, [...g, { v: idx, j: true }], out)) return true;
  return false;
}

/** 14 taş bitmiş mi? → "cift" | "normal" | null */
export function bittiMi(el, okR, okN) {
  if (!el || el.length !== 14) return null;
  const c = new Array(53).fill(0);
  let j = 0;
  for (const t of el) { const d = deger(t, okR, okN); if (d === -1) j++; else c[d]++; }
  let tek = 0;
  for (let k = 1; k <= 52; k++) { if (c[k] > 2) { tek = 99; break; } tek += c[k] % 2; }
  if (tek <= j) return "cift";
  return coz(c, j, false, []) ? "normal" : null;
}

/** 15 taştan biri atılınca el bitiyor mu? (ipucu) */
export function bitirebilir(el, okR, okN) {
  if (!el || el.length !== 15) return false;
  const denenen = new Set();
  for (const t of el) {
    const d = deger(t, okR, okN);
    if (denenen.has(d)) continue;
    denenen.add(d);
    const kalan = el.slice(); kalan.splice(kalan.indexOf(t), 1);
    if (bittiMi(kalan, okR, okN)) return true;
  }
  return false;
}

/** Bitmiş eli gruplarına ayır (el bitti ekranı için). Bulunamazsa tek grup döner. */
export function gruplara(el, okR, okN, tur) {
  if (!el || !el.length) return [];
  const kova = {}, jok = [];
  for (const t of el) { const d = deger(t, okR, okN); if (d === -1) jok.push(t); else (kova[d] ||= []).push(t); }
  const al = (x) => (x.j ? jok.shift() : kova[x.v]?.shift());
  if (tur === "cift" || tur === "cift_okey") {
    const gr = [];
    Object.keys(kova).map(Number).sort((a, b) => a - b).forEach((v) => {
      const l = kova[v];
      while (l.length >= 2) gr.push([l.shift(), l.shift()]);
      if (l.length) gr.push([l.shift(), jok.length ? jok.shift() : null].filter((x) => x != null));
    });
    if (jok.length) gr.push(jok.splice(0));
    return gr;
  }
  const c = new Array(53).fill(0);
  let j = 0;
  for (const t of el) { const d = deger(t, okR, okN); if (d === -1) j++; else c[d]++; }
  const out = [];
  if (!coz(c, j, false, out)) return [diz(el, okR, okN).filter((x) => x != null)];
  const gr = out.map((g) => g.map(al).filter((x) => x != null));
  // artan jokerler ayrı grup olarak geldiyse ve 3'ten azsa son gruba ekle
  const son = gr[gr.length - 1];
  if (gr.length > 1 && son.every((t) => deger(t, okR, okN) === -1) && son.length < 3) gr[gr.length - 2].push(...gr.pop());
  return gr.filter((g) => g.length);
}

// ---------------------------------------------------------------------------
// Istaka dizme
// ---------------------------------------------------------------------------
/** Grupları 2 × 13 yere yerleştir (araya boşluk koyarak; sığmazsa boşluksuz) */
export function yerlestir(gruplar) {
  const parca = [];
  for (const g of gruplar) for (let i = 0; i < g.length; i += SATIR) parca.push(g.slice(i, i + SATIR));
  for (const bosluk of [1, 0]) {
    const d = new Array(YER).fill(null);
    let sira = 0, pos = 0, ok = true;
    for (const g of parca) {
      if (!g.length) continue;
      if (pos > 0 && pos + bosluk + g.length > SATIR) { sira++; pos = 0; } else if (pos > 0) pos += bosluk;
      if (sira > 1 || pos + g.length > SATIR) { ok = false; break; }
      g.forEach((t, i) => { d[sira * SATIR + pos + i] = t; });
      pos += g.length;
    }
    if (ok) return d;
  }
  const d = new Array(YER).fill(null);
  gruplar.flat().slice(0, YER).forEach((t, i) => { d[i] = t; });
  return d;
}

/** "Seri diz": aynı renkte art arda olanlar, sonra aynı sayıda farklı renkler (per), kalanlar, en sonda okeyler */
export function seriGruplari(el, okR, okN) {
  const jok = [], tas = [];
  for (const t of el) (deger(t, okR, okN) === -1 ? jok : tas).push(t);
  const dv = (t) => deger(t, okR, okN);
  tas.sort((a, b) => dv(a) - dv(b) || a - b);
  const seriler = [], artan = [];
  for (let r = 0; r < 4; r++) {
    const renkli = tas.filter((t) => Math.floor((dv(t) - 1) / 13) === r);
    const ilk = [], tekrar = [];
    const gor = new Set();
    for (const t of renkli) { const n = (dv(t) - 1) % 13 + 1; if (gor.has(n)) tekrar.push(t); else { gor.add(n); ilk.push(t); } }
    let cur = [];
    const bitir = () => { if (cur.length >= 3) seriler.push(cur); else artan.push(...cur); cur = []; };
    for (const t of ilk) {
      const n = (dv(t) - 1) % 13 + 1;
      if (cur.length && (dv(cur[cur.length - 1]) - 1) % 13 + 1 !== n - 1) bitir();
      cur.push(t);
    }
    // 12-13-1: 1 başta kaldıysa ve seri 13'le bitiyorsa sona ekle
    if (cur.length && (dv(cur[cur.length - 1]) - 1) % 13 + 1 === 13 && artan.length) {
      const birIdx = artan.findIndex((t) => dv(t) === r * 13 + 1);
      if (birIdx >= 0 && cur.length >= 2) cur.push(artan.splice(birIdx, 1)[0]);
    }
    bitir();
    artan.push(...tekrar);
  }
  // per: aynı sayı, farklı renkler
  const perler = [];
  for (let n = 1; n <= 13; n++) {
    const aday = [];
    const renkler = new Set();
    for (const t of artan) {
      const v = dv(t), r = Math.floor((v - 1) / 13);
      if ((v - 1) % 13 + 1 === n && !renkler.has(r)) { renkler.add(r); aday.push(t); }
    }
    if (aday.length >= 3) { perler.push(aday); aday.forEach((t) => artan.splice(artan.indexOf(t), 1)); }
  }
  // kalanları renge göre küçük gruplar
  const kalan = [];
  for (let r = 0; r < 4; r++) {
    const g = artan.filter((t) => Math.floor((dv(t) - 1) / 13) === r).sort((a, b) => dv(a) - dv(b));
    if (g.length) kalan.push(g);
  }
  const gr = [...seriler, ...perler, ...kalan];
  if (jok.length) gr.push(jok);
  return gr;
}

/** "Çift diz": aynı iki taş yan yana, tekler sonda, okeyler en sonda */
export function ciftGruplari(el, okR, okN) {
  const dv = (t) => deger(t, okR, okN);
  const jok = el.filter((t) => dv(t) === -1);
  const kova = {};
  el.filter((t) => dv(t) !== -1).forEach((t) => (kova[dv(t)] ||= []).push(t));
  const ciftler = [], tekler = [];
  Object.keys(kova).map(Number).sort((a, b) => a - b).forEach((v) => {
    const l = kova[v];
    while (l.length >= 2) ciftler.push([l.shift(), l.shift()]);
    tekler.push(...l);
  });
  const gr = [...ciftler];
  if (tekler.length) gr.push(tekler);
  if (jok.length) gr.push(jok);
  return gr;
}

export const diz = (el, okR, okN) => yerlestir(seriGruplari(el, okR, okN));

/** Yerel diziyi sunucudaki elle eşitle: gidenleri çıkar, yenileri en sağdaki boş yere koy */
export function esitle(dizi, el, okR, okN) {
  if (!el) return null;
  if (!dizi || dizi.length !== YER) return diz(el, okR, okN);
  const var_ = new Set(el);
  const d = dizi.map((t) => (t != null && var_.has(t) ? t : null));
  const seen = new Set();
  for (let i = 0; i < YER; i++) { if (d[i] != null) { if (seen.has(d[i])) d[i] = null; else seen.add(d[i]); } }
  for (const t of el) {
    if (seen.has(t)) continue;
    let k = -1;
    for (let i = YER - 1; i >= 0; i--) if (d[i] == null) { k = i; break; }
    if (k < 0) return diz(el, okR, okN);
    d[k] = t; seen.add(t);
  }
  return d;
}

/** Taşı başka yere taşı. Dolu yere bırakılırsa aynı sıradaki taşlar kayar. */
export function tasi(dizi, from, to) {
  if (from === to) return dizi;
  const d = dizi.slice();
  const t = d[from];
  if (t == null) return dizi;
  d[from] = null;
  if (d[to] == null) { d[to] = t; return d; }
  const bas = to < SATIR ? 0 : SATIR, son = bas + SATIR - 1;
  let k = -1;
  for (let i = to + 1; i <= son; i++) if (d[i] == null) { k = i; break; }
  if (k >= 0) { for (let i = k; i > to; i--) d[i] = d[i - 1]; d[to] = t; return d; }
  for (let i = to - 1; i >= bas; i--) if (d[i] == null) { k = i; break; }
  if (k >= 0) { for (let i = k; i < to; i++) d[i] = d[i + 1]; d[to] = t; return d; }
  d[from] = d[to]; d[to] = t;   // sıra dolu: yer değiştir
  return d;
}
