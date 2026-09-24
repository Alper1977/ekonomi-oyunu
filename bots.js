const KONUM = require('./konumlar');
const ISIM = [/* istemcideki isimHavuzu */];
const SOY  = [/* istemcideki soyisimHavuzu */];

let botlar = [], sonId = 1000000000, sonHareket = 0, sonIlan = 0;
const rnd = a => a[Math.floor(Math.random() * a.length)];
const konumSec = u => (KONUM[u] && KONUM[u].liste.length) ? rnd(KONUM[u].liste) : null;

function uret() {
  const kullanilan = new Set(); botlar = [];
  while (botlar.length < 500) {
    const isim = rnd(ISIM) + ' ' + rnd(SOY) + ' A.Ş.';
    if (kullanilan.has(isim)) continue;          // isimler benzersiz olmalı
    kullanilan.add(isim);
    botlar.push({ id: botlar.length + 1, isim,
      nakit: Math.floor(Math.random() * 50000000) + 5000000,
      vadeli: Math.floor(Math.random() * 10000000), varliklar: [] });
  }
}

function kaydet(db) {
  db.prepare(`INSERT OR REPLACE INTO botlar (id, veri) VALUES (1, ?)`).run(JSON.stringify(botlar));
}

function baslat(db) {
  db.prepare(`CREATE TABLE IF NOT EXISTS botlar (id INTEGER PRIMARY KEY CHECK (id = 1), veri TEXT)`).run();
  const k = db.prepare(`SELECT veri FROM botlar WHERE id = 1`).get();
  if (k) {
    botlar = JSON.parse(k.veri);
    botlar.forEach(b => b.varliklar.forEach(v => { if (v.id > sonId) sonId = v.id; }));
  } else { uret(); kaydet(db); }
}

function dongu(db, ayar) {
  const s = ayar.sureler || {}, fiyat = ayar.satisFiyatlari || {}, now = Date.now();
  const urunler = Object.keys(fiyat);
  let degisti = false;

  // 1) Botlar para kazanır / mülk alır
  if (now - sonHareket >= (s.botHizi || 8000)) {
    sonHareket = now; degisti = true;
    for (let i = 0; i < 5; i++) {
      const b = rnd(botlar);
      if (Math.random() < 0.30) b.nakit += Math.floor(Math.random() * 200000000) + 50000000;
      else {
        const u = rnd(urunler);
        if (b.nakit >= fiyat[u]) {
          b.nakit -= fiyat[u];
          b.varliklar.push({ id: ++sonId, isim: u, durum: 'sahip', atananKonum: konumSec(u) });
        }
      }
    }
  }

  // 2) Botlar ilan açar (ürün başına global sınır)
  if (now - sonIlan >= (s.botIlanHizi || 15000)) {
    sonIlan = now; degisti = true;
    const max = s.maksimumIlanSiniri || 3, say = {};
    botlar.forEach(b => b.varliklar.forEach(v => { if (v.durum === 'ilan-aktif') say[v.isim] = (say[v.isim] || 0) + 1; }));
    botlar.forEach(b => {
      if (Math.random() >= 0.30) return;
      const uygun = b.varliklar.filter(v => v.durum === 'sahip' && (say[v.isim] || 0) < max);
      if (!uygun.length) return;
      const v = rnd(uygun); v.durum = 'ilan-aktif'; v.ilanZamani = now;
      say[v.isim] = (say[v.isim] || 0) + 1;
    });
  }

  // 3) Süresi dolan bot ilanları başka bota satılır
  const bekleme = ayar.GLOBAL_BEKLEME_SURESI || 3 * 86400000;
  botlar.forEach(satan => {
    for (let i = satan.varliklar.length - 1; i >= 0; i--) {
      const v = satan.varliklar[i];
      if (v.durum !== 'ilan-aktif' || now - (v.ilanZamani || now) < bekleme) continue;
      const f = fiyat[v.isim] || 2000000;
      let alici = rnd(botlar.filter(x => x !== satan && x.nakit >= f));
      if (!alici) { alici = rnd(botlar.filter(x => x !== satan)); alici.nakit += f; }
      alici.nakit -= f; satan.nakit += f;
      satan.varliklar.splice(i, 1);
      alici.varliklar.push({ id: ++sonId, isim: v.isim, durum: 'sahip', atananKonum: v.atananKonum });
      degisti = true;
    }
  });

  if (degisti) kaydet(db);
}

const servet = (b, fiyat) =>
  b.nakit + b.vadeli + b.varliklar.reduce((t, v) => t + (fiyat[v.isim] || 0), 0);

const liste = fiyat => botlar.map(b => ({ isim: b.isim, servet: servet(b, fiyat) }));

function ilanlar(fiyat) {
  const out = [];
  botlar.forEach(b => b.varliklar.forEach(v => {
    if (v.durum === 'ilan-aktif')
      out.push({ id: v.id, botIsmi: b.isim, isim: v.isim, fiyat: fiyat[v.isim] || 2000000, atananKonum: v.atananKonum });
  }));
  return out;
}

function bul(id) {
  for (const b of botlar) {
    const v = b.varliklar.find(x => x.durum === 'ilan-aktif' && String(x.id) === String(id));
    if (v) return { isim: v.isim, atananKonum: v.atananKonum };
  }
  return null;
}

function al(db, id, fiyat) {   // satın alma başarılıysa çağrılır
  for (const b of botlar) {
    const i = b.varliklar.findIndex(x => x.durum === 'ilan-aktif' && String(x.id) === String(id));
    if (i !== -1) { b.nakit += fiyat; b.varliklar.splice(i, 1); kaydet(db); return true; }
  }
  return false;
}

module.exports = { baslat, dongu, liste, ilanlar, bul, al };
