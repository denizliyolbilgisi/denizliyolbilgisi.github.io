// 🎱 Bilardo fiziği + bot. Saf JS (DOM yok) — telefonda hesaplanır, rakip aynı atışı aynı kodla tekrar izler.
// Masa: çuha 1000 × 500 birim, top yarıçapı 12. Top: [no, x, y], 0 = beyaz.
// Belirlenimci olsun diye sadece + − × ÷ ve karekök kullanılır (açı yerine yön vektörü gönderilir).

export const MW = 1000, MH = 500, R = 12;
export const BAS_CIZGI = 250;                       // kırışta beyaz bu çizginin gerisine konur
const VMAX = 3000;                                  // en güçlü vuruş (birim/sn)
const DT = 1 / 300, KARE = 5;                       // 300 adım/sn, her 5 adımda bir kare (60 fps)
const SURTUNME = 230, HAVA = 0.16, DUR = 5;         // yavaşlama
const TOP_E = 0.95, BANT_E = 0.76;
const CO = 30, SO = 21;                             // köşe ve yan cep ağız payı
// Cepler: [x, y, yakalama yarıçapı]
export const CEPLER = [[-6, -6, 25], [500, -16, 23], [1006, -6, 25], [-6, 506, 25], [500, 516, 23], [1006, 506, 25]];
// Cebe nişan noktası (bot için)
const NISAN = [[6, 6], [500, -2], [994, 6], [6, 494], [500, 502], [994, 494]];
// Bantlar (doğru parçaları); uçları cep ağzının köşeleridir
const BANTLAR = [
  [CO, 0, 500 - SO, 0], [500 + SO, 0, MW - CO, 0],
  [CO, MH, 500 - SO, MH], [500 + SO, MH, MW - CO, MH],
  [0, CO, 0, MH - CO], [MW, CO, MW, MH - CO],
];

export const grubu = (n) => (n >= 1 && n <= 7 ? "duz" : n >= 9 && n <= 15 ? "cizgili" : null);

/** Sunucudaki gibi üçgen dizilişi (antrenman için) */
export function ucgen() {
  const kar = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const duz = kar([1, 2, 3, 4, 5, 6, 7]), ciz = kar([9, 10, 11, 12, 13, 14, 15]);
  const tepe = duz[0];
  const [k1, k2] = Math.random() < 0.5 ? [duz[1], ciz[0]] : [ciz[0], duz[1]];
  const kalan = kar(duz.slice(2).concat(ciz.slice(1)));
  const t = [[0, 250, 250]];
  let i = 0;
  for (let k = 0; k <= 4; k++) for (let j = 0; j <= k; j++) {
    const n = k === 0 ? tepe : k === 2 && j === 1 ? 8 : k === 4 && j === 0 ? k1 : k === 4 && j === 4 ? k2 : kalan[i++];
    t.push([n, Math.round((750 + k * 20.9) * 100) / 100, Math.round((250 + (j - k / 2) * 24.2) * 100) / 100]);
  }
  return t;
}

/**
 * Atışı baştan sona hesaplar.
 * toplar: [[n,x,y]…]  atis: {vx, vy, g (0..1), ex, ey (-1..1 efekt), bx?, by? (top elde)}
 * Dönüş: { kareler: [Float32Array…], sira: [n…], olaylar: [{k, tur, s}], sonuc: {toplar, cebe, ilk} }
 */
export function simule(toplar, atis) {
  const B = toplar.map(([n, x, y]) => ({ n, x: +x, y: +y, vx: 0, vy: 0, cep: false }));
  const beyaz = B.find((b) => b.n === 0);
  if (atis.bx != null && atis.by != null && beyaz) { beyaz.x = +atis.bx; beyaz.y = +atis.by; }
  const hiz = Math.max(0.02, Math.min(1, +atis.g || 0)) * VMAX;
  if (beyaz) { beyaz.vx = (+atis.vx) * hiz; beyaz.vy = (+atis.vy) * hiz; }
  let ex = Math.max(-1, Math.min(1, +atis.ex || 0)), ey = Math.max(-1, Math.min(1, +atis.ey || 0));
  const yon0x = +atis.vx, yon0y = +atis.vy;
  let ilk = null, efektKullanildi = false;
  const cebe = [], olaylar = [], kareler = [];
  const sira = B.map((b) => b.n);
  const kaydet = () => {
    const f = new Float32Array(B.length * 3);
    B.forEach((b, i) => { f[i * 3] = b.x; f[i * 3 + 1] = b.y; f[i * 3 + 2] = b.cep ? 1 : 0; });
    kareler.push(f);
  };
  kaydet();
  for (let adim = 1; adim <= 300 * 25; adim++) {
    let hareket = false;
    // ilerle + sürtünme
    for (const b of B) {
      if (b.cep) continue;
      const v = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (v === 0) continue;
      const yeni = v - (SURTUNME + HAVA * v) * DT;
      if (yeni <= DUR) { b.vx = 0; b.vy = 0; continue; }
      b.vx *= yeni / v; b.vy *= yeni / v;
      b.x += b.vx * DT; b.y += b.vy * DT;
      hareket = true;
    }
    // top – top
    for (let i = 0; i < B.length; i++) {
      const a = B[i];
      if (a.cep) continue;
      for (let j = i + 1; j < B.length; j++) {
        const c = B[j];
        if (c.cep) continue;
        const dx = c.x - a.x, dy = c.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        // üst üste binmeyi aç
        const it = (2 * R - d) / 2;
        a.x -= nx * it; a.y -= ny * it; c.x += nx * it; c.y += ny * it;
        const yaklasma = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
        if (yaklasma <= 0) continue;
        const jm = ((1 + TOP_E) / 2) * yaklasma;
        a.vx -= jm * nx; a.vy -= jm * ny; c.vx += jm * nx; c.vy += jm * ny;
        olaylar.push({ k: kareler.length, tur: "top", s: Math.min(1, yaklasma / 1500) });
        if (ilk == null && (a.n === 0 || c.n === 0)) ilk = a.n === 0 ? c.n : a.n;
        // ileri / geri efekt: beyaz ilk çarpışmadan sonra gidiş yönünde hız kazanır ya da geri döner
        const w = a.n === 0 ? a : c.n === 0 ? c : null;
        if (w && !efektKullanildi && ey !== 0) {
          efektKullanildi = true;
          const k = ey * yaklasma * 0.42;
          w.vx += yon0x * k; w.vy += yon0y * k;
        }
      }
    }
    // bantlar
    for (const b of B) {
      if (b.cep) continue;
      for (const [x1, y1, x2, y2] of BANTLAR) {
        const sx = x2 - x1, sy = y2 - y1;
        let t = ((b.x - x1) * sx + (b.y - y1) * sy) / (sx * sx + sy * sy);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = x1 + sx * t, py = y1 + sy * t;
        const dx = b.x - px, dy = b.y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 >= R * R || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        b.x = px + nx * R; b.y = py + ny * R;
        const vn = b.vx * nx + b.vy * ny;
        if (vn >= 0) continue;
        b.vx -= (1 + BANT_E) * vn * nx; b.vy -= (1 + BANT_E) * vn * ny;
        b.vx *= 0.97; b.vy *= 0.97;
        if (b.n === 0 && ex !== 0) {            // yan efekt: bant dönüşünü biraz büker
          const tx = -ny, ty = nx;
          b.vx += tx * ex * -vn * 0.22; b.vy += ty * ex * -vn * 0.22;
          ex *= 0.5;
        }
        olaylar.push({ k: kareler.length, tur: "bant", s: Math.min(1, -vn / 1500) });
      }
    }
    // cepler
    for (const b of B) {
      if (b.cep) continue;
      let dus = false;
      for (const [cx, cy, cr] of CEPLER) {
        const dx = b.x - cx, dy = b.y - cy;
        if (dx * dx + dy * dy < cr * cr) { dus = true; b.x = cx; b.y = cy; break; }
      }
      if (!dus && (b.x < -R || b.x > MW + R || b.y < -R || b.y > MH + R)) {
        // bir şekilde dışarı çıktıysa en yakın cebe
        let en = 0, ed = 1e12;
        CEPLER.forEach(([cx, cy], i) => { const d = (b.x - cx) ** 2 + (b.y - cy) ** 2; if (d < ed) { ed = d; en = i; } });
        dus = true; b.x = CEPLER[en][0]; b.y = CEPLER[en][1];
      }
      if (dus) { b.cep = true; b.vx = 0; b.vy = 0; cebe.push(b.n); olaylar.push({ k: kareler.length, tur: "cep", s: 1, n: b.n }); }
    }
    if (adim % KARE === 0) kaydet();
    if (!hareket) break;
  }
  // hareket bittikten sonra hepsini durdur
  for (const b of B) { b.vx = 0; b.vy = 0; }
  kaydet();
  const yuvarla = (v) => Math.round(v * 100) / 100;
  return {
    kareler, sira, olaylar,
    sonuc: {
      toplar: B.filter((b) => !b.cep).map((b) => [b.n, yuvarla(b.x), yuvarla(b.y)]),
      cebe, ilk,
    },
  };
}

// ---------------------------------------------------------------------------
// Nişan yardımı: beyazdan çıkan ışının ilk değdiği top ya da bant
// ---------------------------------------------------------------------------
export function nisanIzi(toplar, bx, by, dx, dy) {
  let enT = Infinity, hedef = null;
  for (const [n, x, y] of toplar) {
    if (n === 0) continue;
    // |b + t·d − c| = 2R
    const fx = bx - x, fy = by - y;
    const b = fx * dx + fy * dy, c = fx * fx + fy * fy - 4 * R * R;
    const disk = b * b - c;
    if (disk < 0) continue;
    const t = -b - Math.sqrt(disk);
    if (t > 0 && t < enT) { enT = t; hedef = [n, x, y]; }
  }
  // bant: ışın çuha sınırına (R içeride) çarpar
  let bantT = Infinity;
  if (dx > 0) bantT = Math.min(bantT, (MW - R - bx) / dx); else if (dx < 0) bantT = Math.min(bantT, (R - bx) / dx);
  if (dy > 0) bantT = Math.min(bantT, (MH - R - by) / dy); else if (dy < 0) bantT = Math.min(bantT, (R - by) / dy);
  if (hedef && enT <= bantT) {
    const gx = bx + dx * enT, gy = by + dy * enT;
    let nx = hedef[1] - gx, ny = hedef[2] - gy;
    const d = Math.sqrt(nx * nx + ny * ny) || 1; nx /= d; ny /= d;
    // beyazın sapma yönü (90°)
    const dot = dx * nx + dy * ny;
    let sx = dx - dot * nx, sy = dy - dot * ny;
    const sd = Math.sqrt(sx * sx + sy * sy);
    if (sd > 1e-6) { sx /= sd; sy /= sd; } else { sx = 0; sy = 0; }
    return { tur: "top", gx, gy, hedef, nx, ny, sx, sy, kesme: dot };
  }
  return { tur: "bant", gx: bx + dx * bantT, gy: by + dy * bantT };
}

// ---------------------------------------------------------------------------
// Beyazı elle koyma: geçerli yer mi?
// ---------------------------------------------------------------------------
export function koyulabilir(toplar, x, y, kirilis) {
  if (x < R + 1 || x > MW - R - 1 || y < R + 1 || y > MH - R - 1) return false;
  if (kirilis && x > BAS_CIZGI) return false;
  return !toplar.some(([n, tx, ty]) => n !== 0 && (tx - x) ** 2 + (ty - y) ** 2 < (2 * R + 1) ** 2);
}
export function konumSinirla(x, y, kirilis) {
  return [Math.max(R + 1, Math.min((kirilis ? BAS_CIZGI : MW - R - 1), x)), Math.max(R + 1, Math.min(MH - R - 1, y))];
}

// ---------------------------------------------------------------------------
// 🤖 Bot: cebe girebilecek en iyi topu arar, birkaç adayı hesaplayıp seçer, sonra insan gibi biraz sapar
// ---------------------------------------------------------------------------
function yolTemiz(toplar, x1, y1, x2, y2, haric) {
  const sx = x2 - x1, sy = y2 - y1, L2 = sx * sx + sy * sy;
  for (const [n, x, y] of toplar) {
    if (haric.includes(n)) continue;
    let t = L2 ? ((x - x1) * sx + (y - y1) * sy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = x1 + sx * t, py = y1 + sy * t;
    if ((x - px) ** 2 + (y - py) ** 2 < (2 * R - 0.5) ** 2) return false;
  }
  return true;
}
function birim(x, y) { const d = Math.sqrt(x * x + y * y) || 1; return [x / d, y / d, d]; }

export function botAtis(toplar, grup, kirilis, topElde, zorluk = 1) {
  const kendi = (n) => (grup ? (grup === "duz" ? n >= 1 && n <= 7 : n >= 9 && n <= 15) : n !== 0 && n !== 8);
  const kalanKendi = toplar.filter(([n]) => kendi(n)).length;
  const hedefler = toplar.filter(([n]) => (grup && kalanKendi === 0 ? n === 8 : kendi(n)));
  let [, bx, by] = toplar.find(([n]) => n === 0) || [0, 250, 250];
  const sonuc = {};

  if (kirilis) {
    bx = 230; by = 250 + (Math.random() * 60 - 30);
    const [dx, dy] = birim(750 - bx, 250 + (Math.random() * 6 - 3) - by);
    return { vx: dx, vy: dy, g: 0.95 + Math.random() * 0.05, ex: 0, ey: 0, bx, by };
  }

  // aday atışlar
  const adaylar = [];
  const ekle = (cx, cy, t, p) => {
    const [px, py] = NISAN[p];
    const [ux, uy, d2] = birim(px - t[1], py - t[2]);
    const gx = t[1] - ux * 2 * R, gy = t[2] - uy * 2 * R;
    const [ax, ay, d1] = birim(gx - cx, gy - cy);
    const kos = ax * ux + ay * uy;
    if (kos < 0.3) return;
    if (!yolTemiz(toplar, cx, cy, gx, gy, [0, t[0]])) return;
    if (!yolTemiz(toplar, t[1], t[2], px, py, [0, t[0]])) return;
    const g = Math.max(0.28, Math.min(0.85, (d1 + d2 / Math.max(0.35, kos)) / 1500 + 0.18));
    adaylar.push({ vx: ax, vy: ay, g, puan: kos * kos * 1000 / (d1 + d2 + 200), cx, cy });
  };
  if (topElde) {
    // beyazı iyi bir yere koy: hedef topun cebe düz çizgisinde, 140 birim geride
    for (const t of hedefler) {
      for (let p = 0; p < 6; p++) {
        const [px, py] = NISAN[p];
        const [ux, uy] = birim(px - t[1], py - t[2]);
        for (const geri of [140, 220, 90]) {
          const cx = t[1] - ux * (2 * R + geri), cy = t[2] - uy * (2 * R + geri);
          if (!koyulabilir(toplar, cx, cy, false)) continue;
          ekle(cx, cy, t, p);
          break;
        }
      }
    }
  } else {
    for (const t of hedefler) for (let p = 0; p < 6; p++) ekle(bx, by, t, p);
  }
  adaylar.sort((a, b) => b.puan - a.puan);

  // en iyi 6 adayı hesapla: kendi topunu sokan ve faulsüz olanı seç
  let secilen = null;
  for (const a of adaylar.slice(0, 6)) {
    const atis = { vx: a.vx, vy: a.vy, g: a.g, ex: 0, ey: 0 };
    if (topElde) { atis.bx = a.cx; atis.by = a.cy; }
    const s = simule(toplar, atis).sonuc;
    const beyazGirdi = s.cebe.includes(0);
    const sekizGirdi = s.cebe.includes(8);
    const iyi = !beyazGirdi && s.ilk != null && s.cebe.some((n) => (hedefler.some((t) => t[0] === n)))
      && (!sekizGirdi || (grup && kalanKendi === 0));
    if (iyi) { secilen = atis; break; }
    if (!secilen && !beyazGirdi && !sekizGirdi && s.ilk != null && hedefler.some((t) => t[0] === s.ilk)) secilen = { ...atis, yedek: true };
  }
  if (!secilen) {
    // güvenli vuruş: en yakın kendi topuna doğrudan
    let en = null, ed = Infinity;
    for (const t of hedefler) {
      const d = (t[1] - bx) ** 2 + (t[2] - by) ** 2;
      if (d < ed && yolTemiz(toplar, bx, by, t[1], t[2], [0, t[0]])) { ed = d; en = t; }
    }
    en = en || hedefler[0] || toplar.find(([n]) => n !== 0);
    if (topElde) {
      const yer = [[150, 250], [250, 120], [250, 380], [500, 250], [850, 250], [400, 150], [600, 350]].find(([x, y]) => koyulabilir(toplar, x, y, false));
      if (yer) { bx = yer[0]; by = yer[1]; sonuc.bx = bx; sonuc.by = by; }
    }
    const [dx, dy] = birim(en[1] - bx, en[2] - by);
    secilen = { ...sonuc, vx: dx, vy: dy, g: 0.42, ex: 0, ey: 0 };
  }
  delete secilen.yedek;
  // insan gibi küçük sapma (zorluk 1 ≈ ±0.7°)
  const sap = (Math.random() * 2 - 1) * 0.012 * zorluk;
  const vx = secilen.vx - secilen.vy * sap, vy = secilen.vy + secilen.vx * sap;
  const [nx, ny] = birim(vx, vy);
  return { ...secilen, vx: nx, vy: ny };
}
