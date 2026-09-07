const express = require('express');
const http = require('http'); 
const { Server } = require('socket.io'); 
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session); 
const Database = require('better-sqlite3');
const fs = require('fs');

const app = express();
const server = http.createServer(app); 
const io = new Server(server); 

app.use(express.json());
app.use(express.static(__dirname));

console.log("Klasördeki dosyalar:", fs.readdirSync(__dirname));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Ana oyun veritabanı (better-sqlite3 senkron yapısı)
const db = new Database('./database.db');
console.log("SQLite veritabanına başarıyla bağlanıldı."); 

// Oturumları çakışmayı önlemek için ayrı bir veritabanında (sessions.db) saklıyoruz
app.use(session({
    store: new SQLiteStore({
        db: 'sessions.db',
        dir: '.'
    }),
    secret: 'cok-gizli-bir-anahtar-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

db.prepare(`CREATE TABLE IF NOT EXISTS kullanicilar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kadi TEXT UNIQUE,
    email TEXT UNIQUE,
    sifre TEXT,
    adsoyad TEXT UNIQUE,
    portfoy TEXT,
    son_guncelleme INTEGER,
    tarih DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

// Sütun eksikse otomatik ekleme güvenliği
try {
    db.prepare(`ALTER TABLE kullanicilar ADD COLUMN son_guncelleme INTEGER`).run();
} catch (e) {
    // Sütun zaten varsa hata verir, yoksayabiliriz
}

// --- 🌟 MERKEZİ AYARLAR TABLOSU ---
db.prepare(`CREATE TABLE IF NOT EXISTS oyun_ayarlari (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    ayarlar TEXT
)`).run();

const mevcutAyarlar = db.prepare(`SELECT * FROM oyun_ayarlari WHERE id = 1`).get();
if (!mevcutAyarlar) {
    const varsayilanAyarlar = {
        gunlukGelir: 800000,
        konutKiraGeliri: 0,
        kazancTablosu: {
            "Bayi": 300000,
            "Otel": 4000000,
            "Fabrika": 1500000,
            "Hastane": 2500000,
            "Özel Okul": 600000,
            "AVM": 3000000,
            "Hipermarket": 700000
        },
        kurlar: { 
            dolar: { alis: 50.00, satis: 49.00 },
            euro:  { alis: 55.00, satis: 54.00 },
            altin: { alis: 6100,  satis: 6000 }
        },
        faizOranlari: {
            vadeliGunluk: 0.02,  
            yatirimKredisiYuzde: 5,    
            krediKatsayi: 1.05,        
            ilanKredisiYuzde: 5,        
            ilanKrediKatsayi: 1.05      
        },
        satisFiyatlari: {
            'Otel': 1000000000,
            'Fabrika': 425000000,
            'Hastane': 650000000,
            'Özel Okul': 150000000,
            'Konut': 12000000,
            'AVM': 750000000,
            'Hipermarket': 200000000,
            'Konut Arsası': 100000000,
            'Fabrika Arsası': 300000000,
            'Otel Arsası': 400000000,
            'Hastane Arsası': 150000000,
            'Özel Okul Arsası': 50000000,
            'AVM Arsası': 450000000,
            'Hipermarket Arsası': 125000000
        },
        yatirimMaliyetleri: {
            "Bayi": 10000000,
            "Otel": 600000000,
            "Fabrika": 125000000,
            "Hastane": 500000000,
            "Özel Okul": 100000000,
            "Konut": 250000000,
            "AVM": 300000000,
            "Hipermarket": 75000000
        },
        odemeProgrami: [
            { saat: 10, dakika: 0 },
            { saat: 15, dakika: 0 },
            { saat: 18, dakika: 46 }
        ],
        GLOBAL_BEKLEME_SURESI: 3 * 24 * 60 * 60 * 1000,
        sureler: {
            faizSuresi: 86400000,
            taksitSuresi: 86400000,
            kiraSuresi: 86400000,
            sirketKazancSuresi: 86400000,
            botHizi: 8000,
            botIlanHizi: 15000,
            maksimumIlanSiniri: 3,
            insaatSuresiBayi: 3 * 86400000,
            insaatSuresiDiger: 12 * 86400000
        }
    };
    db.prepare(`INSERT OR REPLACE INTO oyun_ayarlari (id, ayarlar) VALUES (1, ?)`).run(JSON.stringify(varsayilanAyarlar));
}

db.prepare(`CREATE TABLE IF NOT EXISTS ilanlar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kullanici_id INTEGER,
    satici_adsoyad TEXT,
    ilan_tipi TEXT,
    fiyat REAL,
    detaylar TEXT,
    tarih DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

// --- 🌟 ÇEVRİMİÇİ / ÇEVRİMDIŞI TAM Kapsamlı EKONOMİ & FİNANS MOTORU ---
function kullaniciEkonomisiniIslet(userRow, ayarlar) {
    if (!userRow || !userRow.portfoy) return null;

    let portfoy;
    try {
        portfoy = JSON.parse(userRow.portfoy);
    } catch (e) {
        return null;
    }

    const simdi = Date.now();
    let sonGuncelleme = userRow.son_guncelleme || simdi;
    const gecenSure = simdi - sonGuncelleme;

    if (gecenSure < 5000) return portfoy; 

    const sureler = ayarlar.sureler || {};
    const kiraPeriyodu = sureler.kiraSuresi || 86400000; 
    const faizPeriyodu = sureler.faizSuresi || 86400000;
    const taksitPeriyodu = sureler.taksitSuresi || 86400000;
    const kazancTablosu = ayarlar.kazancTablosu || {};

    let degisiklikOldu = false;
    let yeniSonGuncelleme = sonGuncelleme;

    // 1. KİRA / ŞİRKET GELİRLERİ (Periyot bazlı telafi)
    const kiraPeriyotSayisi = Math.floor(gecenSure / kiraPeriyodu);
    if (kiraPeriyotSayisi > 0) {
        let toplamEklenenGelir = 0;

        if (portfoy.varliklar && Array.isArray(portfoy.varliklar)) {
            portfoy.varliklar.forEach(v => {
                if (v.durum === 'sahip' && kazancTablosu[v.isim]) {
                    toplamEklenenGelir += (kazancTablosu[v.isim] * kiraPeriyotSayisi);
                }
            });
        }

        if (ayarlar.konutKiraGeliri > 0 && portfoy.varliklar) {
            portfoy.varliklar.forEach(v => {
                if (v.durum === 'sahip' && v.isim === 'Konut') {
                    toplamEklenenGelir += (ayarlar.konutKiraGeliri * kiraPeriyotSayisi);
                }
            });
        }

        if (toplamEklenenGelir > 0) {
            let mevcutNakit = portfoy.nakit !== undefined ? portfoy.nakit : (portfoy.para || 0);
            mevcutNakit += toplamEklenenGelir;
            portfoy.nakit = mevcutNakit;
            degisiklikOldu = true;
        }
        yeniSonGuncelleme = Math.max(yeniSonGuncelleme, sonGuncelleme + (kiraPeriyotSayisi * kiraPeriyodu));
    }

    // 2. VADELİ HESAP / FAİZ GELİRLERİ (Çevrimdışı geçen sürede biriken faiz telafisi)
    const faizPeriyotSayisi = Math.floor(gecenSure / faizPeriyodu);
    if (faizPeriyotSayisi > 0 && portfoy.vadeliHesap && portfoy.vadeliHesap > 0) {
        const gunlukFaizOrani = (ayarlar.faizOranlari && ayarlar.faizOranlari.vadeliGunluk !== undefined) 
            ? ayarlar.faizOranlari.vadeliGunluk 
            : 0.02;

        let toplamFaizGetirisi = 0;
        for (let i = 0; i < faizPeriyotSayisi; i++) {
            toplamFaizGetirisi += (portfoy.vadeliHesap * gunlukFaizOrani);
        }

        if (toplamFaizGetirisi > 0) {
            portfoy.vadeliHesap += toplamFaizGetirisi;
            degisiklikOldu = true;
        }
    }

    // 3. KREDİ TAKSİTLERİ VE BORÇLAR (Çevrimdışı sürede ödenmeyen taksitlerin düşülmesi)
    const taksitPeriyotSayisi = Math.floor(gecenSure / taksitPeriyodu);
    if (taksitPeriyotSayisi > 0 && portfoy.krediler && Array.isArray(portfoy.krediler) && portfoy.krediler.length > 0) {
        let mevcutNakit = portfoy.nakit !== undefined ? portfoy.nakit : (portfoy.para || 0);

        portfoy.krediler.forEach(kredi => {
            if (kredi && kredi.kalanTaksit > 0 && kredi.taksitTutari > 0) {
                const odenecekAdet = Math.min(kredi.kalanTaksit, taksitPeriyotSayisi);
                const toplamDusulecekTaksit = kredi.taksitTutari * odenecekAdet;

                mevcutNakit -= toplamDusulecekTaksit;
                kredi.kalanTaksit -= odenecekAdet;
                degisiklikOldu = true;
            }
        });

        portfoy.nakit = mevcutNakit;
        // Tamamen biten kredileri temizle
        portfoy.krediler = portfoy.krediler.filter(k => k.kalanTaksit > 0);
    }

    if (degisiklikOldu) {
        db.prepare(`UPDATE kullanicilar SET portfoy = ?, son_guncelleme = ? WHERE id = ?`).run(
            JSON.stringify(portfoy),
            simdi,
            userRow.id
        );
    }

    return portfoy;
}

// Arka plan otomatik döngüsü
setInterval(() => {
    try {
        const ayarKaydi = db.prepare(`SELECT ayarlar FROM oyun_ayarlari WHERE id = 1`).get();
        if (!ayarKaydi) return;
        const ayarlar = JSON.parse(ayarKaydi.ayarlar);

        const kullanicilar = db.prepare(`SELECT id, portfoy, son_guncelleme FROM kullanicilar`).all();
        
        const transaction = db.transaction(() => {
            kullanicilar.forEach(user => {
                kullaniciEkonomisiniIslet(user, ayarlar);
            });
        });

        transaction();
    } catch (err) {
        console.error("Arka plan oyun döngüsü hatası:", err.message);
    }
}, 30000);

// --- API Rotaları ---

app.get('/api/ilanlar', (req, res) => {
    try {
        const ilanlar = db.prepare(`SELECT * FROM ilanlar`).all();
        const aktifKullaniciId = req.session && req.session.kullanici ? req.session.kullanici.id : null;

        const duzenlenmisIlanlar = ilanlar.map(ilan => ({
            ...ilan,
            detaylar: JSON.parse(ilan.detaylar || '{}'),
            benim_mi: aktifKullaniciId && ilan.kullanici_id === aktifKullaniciId 
        }));

        res.json({ basari: true, ilanlar: duzenlenmisIlanlar });
    } catch (err) {
        res.status(500).json({ basari: false, mesaj: err.message });
    }
});

app.post('/api/ilan-ekle', (req, res) => {
    if (!req.session || !req.session.kullanici) {
        return res.status(401).json({ basari: false, mesaj: "Oturum bulunamadı!" });
    }

    const { ilan_tipi, fiyat, detaylar } = req.body;
    const sessionKullanici = req.session.kullanici;
    const userId = typeof sessionKullanici === 'object' ? sessionKullanici.id : sessionKullanici;
    const varlikId = detaylar && detaylar.varlikId ? detaylar.varlikId : null;

    let userAdSoyad = (typeof sessionKullanici === 'object' && sessionKullanici.adsoyad) ? sessionKullanici.adsoyad : "Satıcı";

    try {
        const transaction = db.transaction(() => {
            const stmt = db.prepare(`INSERT INTO ilanlar (kullanici_id, satici_adsoyad, ilan_tipi, fiyat, detaylar) VALUES (?, ?, ?, ?, ?)`);
            const info = stmt.run(userId, userAdSoyad, ilan_tipi, fiyat, JSON.stringify(detaylar || {}));

            if (varlikId) {
                const userRow = db.prepare(`SELECT portfoy FROM kullanicilar WHERE id = ?`).get(userId);
                if (userRow && userRow.portfoy) {
                    let portfoyObj = JSON.parse(userRow.portfoy);
                    if (portfoyObj && portfoyObj.varliklar) {
                        portfoyObj.varliklar.forEach(v => {
                            if (v.id == varlikId) {
                                v.durum = 'ilan-aktif';
                                v.sunucuIlanId = info.lastInsertRowid;
                            }
                        });
                        db.prepare(`UPDATE kullanicilar SET portfoy = ?, son_guncelleme = ? WHERE id = ?`).run(JSON.stringify(portfoyObj), Date.now(), userId);
                        req.session.kullanici.portfoy = portfoyObj;
                    }
                }
            }
            return info.lastInsertRowid;
        });

        const yeniIlanId = transaction();
        res.json({ basari: true, id: yeniIlanId, mesaj: "İlan başarıyla yayınlandı." });
    } catch (err) {
        res.status(500).json({ basari: false, mesaj: err.message });
    }
});

app.post('/api/ilan-sil', (req, res) => {
    if (!req.session || !req.session.kullanici) {
        return res.status(401).json({ basari: false, mesaj: "Oturum bulunamadı!" });
    }

    const { id } = req.body;
    try {
        db.prepare(`DELETE FROM ilanlar WHERE id = ? AND kullanici_id = ?`).run(id, req.session.kullanici.id);
        res.json({ basari: true, mesaj: "İlan kaldırıldı." });
    } catch (err) {
        res.status(500).json({ basari: false, mesaj: err.message });
    }
});

app.post('/api/ilan-guncelle', (req, res) => {
    if (!req.session || !req.session.kullanici) {
        return res.status(401).json({ basari: false, mesaj: "Oturum bulunamadı!" });
    }

    const { id, fiyat, detaylar } = req.body;
    try {
        const info = db.prepare(`UPDATE ilanlar SET fiyat = ?, detaylar = ? WHERE id = ? AND kullanici_id = ?`).run(
            fiyat, 
            JSON.stringify(detaylar || {}), 
            id, 
            req.session.kullanici.id
        );

        if (info.changes === 0) {
            return res.status(403).json({ basari: false, mesaj: "Bu ilanı güncelleme yetkiniz yok veya ilan bulunamadı." });
        }

        res.json({ basari: true, mesaj: "İlan başarıyla güncellendi." });
    } catch (err) {
        res.status(500).json({ basari: false, mesaj: err.message });
    }
});

app.post('/api/ilan-satin-al', (req, res) => {
    if (!req.session || !req.session.kullanici) {
        return res.status(401).json({ basari: false, mesaj: "Oturum bulunamadı!" });
    }

    const aliciId = req.session.kullanici.id;
    const { ilanId } = req.body;

    try {
        const transaction = db.transaction(() => {
            const ilan = db.prepare(`SELECT * FROM ilanlar WHERE id = ?`).get(ilanId);
            if (!ilan) {
                throw new Error("İlan bulunamadı veya zaten satılmış.");
            }

            if (ilan.kullanici_id === aliciId) {
                throw new Error("Kendi ilanınızı satın alamazsınız!");
            }

            const saticiId = ilan.kullanici_id;
            const ilanFiyat = ilan.fiyat;
            const ilanTipi = ilan.ilan_tipi;
            
            let detaylarObj = {};
            try {
                detaylarObj = JSON.parse(ilan.detaylar || '{}');
            } catch (e) {
                detaylarObj = {};
            }
            const hedefVarlikId = detaylarObj.varlikId;

            const aliciRow = db.prepare(`SELECT portfoy FROM kullanicilar WHERE id = ?`).get(aliciId);
            if (!aliciRow) throw new Error("Alıcı bulunamadı.");
            
            let aliciPortfoy = JSON.parse(aliciRow.portfoy || '{}');
            let aliciNakit = aliciPortfoy.nakit !== undefined ? aliciPortfoy.nakit : (aliciPortfoy.para || 0);

            if (aliciNakit < ilanFiyat) {
                throw new Error("Yeterli nakit paranız yok!");
            }

            aliciNakit -= ilanFiyat;
            aliciPortfoy.nakit = aliciNakit;
            if (!aliciPortfoy.varliklar) aliciPortfoy.varliklar = [];

            aliciPortfoy.varliklar.push({
                id: Date.now() + Math.random(),
                isim: ilanTipi,
                durum: 'sahip',
                bloke: false,
                krediID: null,
                atananKonum: detaylarObj.atananKonum || null
            });

            db.prepare(`UPDATE kullanicilar SET portfoy = ?, son_guncelleme = ? WHERE id = ?`).run(JSON.stringify(aliciPortfoy), Date.now(), aliciId);

            const saticiRow = db.prepare(`SELECT portfoy FROM kullanicilar WHERE id = ?`).get(saticiId);
            if (saticiRow && saticiRow.portfoy) {
                let saticiPortfoy = JSON.parse(saticiRow.portfoy || '{}');
                let saticiNakit = saticiPortfoy.nakit !== undefined ? saticiPortfoy.nakit : (saticiPortfoy.para || 0);
                saticiNakit += ilanFiyat;
                saticiPortfoy.nakit = saticiNakit;

                if (saticiPortfoy.varliklar) {
                    saticiPortfoy.varliklar = saticiPortfoy.varliklar.filter(v => {
                        if (!v) return false;
                        if (hedefVarlikId && String(v.id) === String(hedefVarlikId)) {
                            return false; 
                        }
                        if (v.isim === ilanTipi && (v.durum === 'ilan-aktif' || v.durum === 'satildi')) {
                            return false; 
                        }
                        return true;
                    });
                }

                db.prepare(`UPDATE kullanicilar SET portfoy = ?, son_guncelleme = ? WHERE id = ?`).run(JSON.stringify(saticiPortfoy), Date.now(), saticiId);
            }

            db.prepare(`DELETE FROM ilanlar WHERE id = ?`).run(ilanId);

            return true;
        });

        transaction();
        res.json({ basari: true, mesaj: "Satın alma gerçekleşti, mülk envantere aktarıldı." });
    } catch (err) {
        console.error("Satın alma işlem hatası:", err.message);
        res.status(400).json({ basari: false, mesaj: err.message });
    }
});

app.get('/api/oyun-ayarlari', (req, res) => {
    try {
        const kayit = db.prepare(`SELECT ayarlar FROM oyun_ayarlari WHERE id = 1`).get();
        if (kayit && kayit.ayarlar) {
            const parsedAyarlar = JSON.parse(kayit.ayarlar);
            res.json({ basari: true, ayarlar: parsedAyarlar, sureler: parsedAyarlar.sureler || {} });
        } else {
            res.status(404).json({ basari: false, mesaj: "Ayarlar bulunamadı." });
        }
    } catch (err) {
        res.status(500).json({ basari: false, mesaj: err.message });
    }
});

app.post('/api/admin/ayar-guncelle', (req, res) => {
    const { ayarlar, sureler } = req.body;
    if (!ayarlar) {
        return res.status(400).json({ basari: false, mesaj: "Ayar verisi boş olamaz!" });
    }

    const kayitPaketi = {
        ...ayarlar,
        sureler: sureler || {}
    };

    try {
        db.prepare(`INSERT OR REPLACE INTO oyun_ayarlari (id, ayarlar) VALUES (1, ?)`).run(JSON.stringify(kayitPaketi));
        
        io.emit('ayarlarDegisti', {
            ayarlar: kayitPaketi,
            sureler: kayitPaketi.sureler
        });

        res.json({ basari: true, mesaj: "Ayarlar başarıyla güncellendi." });
    } catch (err) {
        res.status(500).json({ basari: false, mesaj: err.message });
    }
});

app.post('/api/kayit', (req, res) => {
    const { kadi, email, sifre, adsoyad, portfoy } = req.body; 
    
    if (!email) {
        return res.status(400).json({ basari: false, mesaj: 'E-posta adresi boş olamaz!' });
    }

    if (!adsoyad || !adsoyad.trim()) {
        return res.status(400).json({ basari: false, mesaj: 'Ad Soyad (Şirket ismi) boş olamaz!' });
    }

    const temizAdSoyad = adsoyad.trim();

    try {
        const mevcutAd = db.prepare(`SELECT id FROM kullanicilar WHERE LOWER(TRIM(adsoyad)) = LOWER(TRIM(?))`).get(temizAdSoyad);
        if (mevcutAd) {
            return res.status(400).json({ basari: false, mesaj: 'Bu ad soyad (şirket ismi) daha önce alınmış! Lütfen başka bir tane seçin.' });
        }

        const varsayilanPortfoy = {
            ...(portfoy || { para: 1000000, hisseler: [] }) 
        };

        const simdi = Date.now();
        const stmt = db.prepare(`INSERT INTO kullanicilar (kadi, email, sifre, adsoyad, portfoy, son_guncelleme) VALUES (?, ?, ?, ?, ?, ?)`);
        const info = stmt.run(kadi, email, sifre, temizAdSoyad, JSON.stringify(varsayilanPortfoy), simdi);
        res.json({ basari: true, id: info.lastInsertRowid, mesaj: 'Kayıt başarılı!' });
    } catch (err) {
        console.error("Kayıt hatası:", err.message); 
        if (err.message.includes('UNIQUE constraint failed')) {
            if (err.message.includes('adsoyad')) {
                return res.status(400).json({ basari: false, mesaj: 'Bu ad soyad (şirket ismi) zaten kullanımda!' });
            }
            if (err.message.includes('email')) {
                return res.status(400).json({ basari: false, mesaj: 'Bu e-posta adresi zaten alınmış!' });
            }
            if (err.message.includes('kadi')) {
                return res.status(400).json({ basari: false, mesaj: 'Bu kullanıcı adı zaten alınmış!' });
            }
        }
        return res.status(400).json({ basari: false, mesaj: 'Bu e-posta adresi zaten alınmış veya hata oluştu!' });
    }
});

app.post('/api/sifre-sifirla', (req, res) => {
    const { email, yeniSifre } = req.body;

    if (!email || !yeniSifre) {
        return res.json({ basarili: false, mesaj: "E-posta veya yeni şifre boş olamaz!" });
    }

    try {
        const info = db.prepare(`UPDATE kullanicilar SET sifre = ? WHERE email = ?`).run(yeniSifre, email);
        if (info.changes === 0) {
            return res.json({ basarili: false, mesaj: "Bu e-posta adresine sahip kullanıcı bulunamadı." });
        }
        res.json({ basarili: true, mesaj: "Şifreniz başarıyla güncellendi." });
    } catch (err) {
        console.error("SQL Hata:", err.message);
        return res.json({ basarili: false, mesaj: "Veritabanı hatası!" });
    }
});

app.post('/api/profil-guncelle', (req, res) => {
    if (!req.session || !req.session.kullanici) {
        return res.status(401).json({ basari: false, mesaj: "Oturum bulunamadı, lütfen tekrar giriş yapın." });
    }

    const userId = req.session.kullanici.id;
    const { yeniAdSoyad } = req.body;

    if (!yeniAdSoyad || !yeniAdSoyad.trim()) {
        return res.json({ basari: false, mesaj: "Yeni ad soyad boş olamaz!" });
    }

    const temizAd = yeniAdSoyad.trim();

    try {
        const baskaKullaniciVarmi = db.prepare(`SELECT id FROM kullanicilar WHERE LOWER(TRIM(adsoyad)) = LOWER(TRIM(?)) AND id != ?`).get(temizAd, userId);
        
        if (baskaKullaniciVarmi) {
            return res.json({ basari: false, mesaj: "Bu ad soyad başka bir kullanıcı tarafından kullanılıyor!" });
        }

        db.prepare(`UPDATE kullanicilar SET adsoyad = ? WHERE id = ?`).run(temizAd, userId);
        req.session.kullanici.adsoyad = temizAd;
        res.json({ basari: true, mesaj: "Profil başarıyla güncellendi." });
    } catch (err) {
        console.error("Profil güncelleme veritabanı hatası:", err.message);
        return res.status(500).json({ basari: false, mesaj: "Veritabanı güncellenemedi!" });
    }
});

app.get('/api/portfoy-getir', (req, res) => {
    if (!req.session || !req.session.kullanici) {
        return res.status(401).json({ basari: false, mesaj: "Oturum bulunamadı!" });
    }

    try {
        const userId = req.session.kullanici.id;
        const user = db.prepare(`SELECT * FROM kullanicilar WHERE id = ?`).get(userId);
        
        if (!user) {
            return res.status(404).json({ basari: false, mesaj: "Kullanıcı bulunamadı!" });
        }

        const ayarKaydi = db.prepare(`SELECT ayarlar FROM oyun_ayarlari WHERE id = 1`).get();
        const ayarlar = ayarKaydi ? JSON.parse(ayarKaydi.ayarlar) : {};

        // 🌟 Çevrimdışı geçen süredeki gelirleri, faizleri ve kredi taksitlerini hesaba kat!
        const guncelPortfoy = kullaniciEkonomisiniIslet(user, ayarlar) || JSON.parse(user.portfoy || '{}');

        res.json({
            basari: true,
            nakit: guncelPortfoy.nakit !== undefined ? guncelPortfoy.nakit : (guncelPortfoy.para || 0),
            varliklar: guncelPortfoy.varliklar || [],
            gunlukGelir: guncelPortfoy.gunlukGelir || 0,
            konutKiraGeliri: guncelPortfoy.konutKiraGeliri || 0 
        });
    } catch (err) {
        console.error("Portföy getirme hatası:", err.message);
        res.status(500).json({ basari: false, mesaj: err.message });
    }
});

app.get('/api/cikis', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Oturum yok etme hatası:", err);
        }
        res.clearCookie('connect.sid', { path: '/' });
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.json({ basari: true, mesaj: "Oturum başarıyla kapatıldı." });
    });
});

app.post('/api/giris', (req, res) => {
    const { kadi, sifre } = req.body;
    try {
        const row = db.prepare(`SELECT * FROM kullanicilar WHERE kadi = ? AND sifre = ?`).get(kadi, sifre);
        if (row) {
            req.session.regenerate((err) => {
                if (err) return res.status(500).json({ basari: false, mesaj: err.message });

                const ayarKaydi = db.prepare(`SELECT ayarlar FROM oyun_ayarlari WHERE id = 1`).get();
                const ayarlar = ayarKaydi ? JSON.parse(ayarKaydi.ayarlar) : {};
                const portfoyObj = kullaniciEkonomisiniIslet(row, ayarlar) || JSON.parse(row.portfoy || '{}');

                req.session.userId = row.id;
                req.session.kullanici = { 
                    id: row.id, 
                    kadi: row.kadi, 
                    adsoyad: row.adsoyad || '', 
                    portfoy: portfoyObj 
                };

                req.session.save((saveErr) => {
                    if (saveErr) {
                        return res.status(500).json({ basari: false, mesaj: saveErr.message });
                    }
                    res.json({ 
                        basari: true, 
                        kullanici: req.session.kullanici 
                    });
                });
            });
        } else {
            res.status(401).json({ basari: false, mesaj: 'E-posta veya şifre yanlış!' });
        }
    } catch (err) {
        return res.status(500).json({ basari: false, mesaj: err.message });
    }
});

app.get('/api/aktif-kullanici', (req, res) => {
    if (!req.session || !req.session.kullanici) {
        return res.status(401).json({ basari: false, mesaj: "Oturum bulunamadı" });
    }

    try {
        const userId = req.session.kullanici.id;
        const dbUser = db.prepare(`SELECT * FROM kullanicilar WHERE id = ?`).get(userId);
        
        if (!dbUser) {
            return res.status(404).json({ basari: false, mesaj: "Kullanıcı bulunamadı" });
        }

        const ayarKaydi = db.prepare(`SELECT ayarlar FROM oyun_ayarlari WHERE id = 1`).get();
        const ayarlar = ayarKaydi ? JSON.parse(ayarKaydi.ayarlar) : {};

        const portfoyObj = kullaniciEkonomisiniIslet(dbUser, ayarlar) || JSON.parse(dbUser.portfoy || '{}');
        req.session.kullanici.portfoy = portfoyObj;

        res.json({
            id: dbUser.id,
            adsoyad: dbUser.adsoyad,
            portfoy: portfoyObj
        });
    } catch (err) {
        res.status(500).json({ basari: false, mesaj: err.message });
    }
});

app.post('/api/portfoy-guncelle', (req, res) => {
    if (!req.session || !req.session.kullanici) {
        return res.status(401).json({ basari: false, mesaj: "Oturum bulunamadı!" }); 
    }

    const userId = req.session.kullanici.id;
    const yeniPortfoy = req.body.portfoy;
    const portfoyStr = JSON.stringify(yeniPortfoy || {});

    try {
        db.prepare(`UPDATE kullanicilar SET portfoy = ?, son_guncelleme = ? WHERE id = ?`).run(portfoyStr, Date.now(), userId);
        req.session.kullanici.portfoy = yeniPortfoy;
        res.json({ basari: true, mesaj: "Portföy kaydedildi." });
    } catch (err) {
        console.error("Portföy güncelleme hatası:", err.message);
        return res.status(500).json({ basari: false, mesaj: err.message });
    }
});

app.get('/api/kullanicilar-liste', (req, res) => {
    try {
        const rows = db.prepare(`SELECT adsoyad, portfoy FROM kullanicilar`).all();

        let uyeler = rows.map(row => {
            let portfoyData = {};
            try {
                if (typeof row.portfoy === 'string') {
                    portfoyData = JSON.parse(row.portfoy);
                } else if (typeof row.portfoy === 'object' && row.portfoy !== null) {
                    portfoyData = row.portfoy;
                }
            } catch (e) {
                portfoyData = {};
            }

            return {
                adsoyad: row.adsoyad ? row.adsoyad.trim() : 'İsimsiz Şirket',
                portfoy: portfoyData
            };
        });

        res.json({ basari: true, uyeler: uyeler });
    } catch (err) {
        return res.status(500).json({ basari: false, mesaj: err.message });
    }
});

io.on('connection', (socket) => {
    console.log('Bir kullanıcı socket üzerinden bağlandı:', socket.id);

    socket.on('adminAyariGuncelle', (veri) => {
        io.emit('ayarlarDegisti', veri);
    });

    socket.on('disconnect', () => {
        console.log('Bir kullanıcı socket bağlantısını kesti:', socket.id);
    });
});

server.listen(3000, '0.0.0.0', () => {
    console.log("Sunucumuz 3000 portunda ve çevrimdışı motor aktif şekilde çalışıyor.");
}).on('error', (err) => {
    console.error("SUNUCU AÇILAMADI HATA ŞU:", err);
});
