const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('better-sqlite3');
const fs = require('fs');

const app = express();

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
    tarih DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

// 🌟 Merkezi ayarlar tablosu
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
    const kullanici = req.session.kullanici;

    try {
        const stmt = db.prepare(`INSERT INTO ilanlar (kullanici_id, satici_adsoyad, ilan_tipi, fiyat, detaylar) VALUES (?, ?, ?, ?, ?)`);
        const info = stmt.run(kullanici.id, kullanici.adsoyad, ilan_tipi, fiyat, JSON.stringify(detaylar || {}));
        res.json({ basari: true, id: info.lastInsertRowid, mesaj: "İlan başarıyla yayınlandı." });
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

    const { ilanId } = req.body;
    if (!ilanId) {
        return res.status(400).json({ basari: false, mesaj: "İlan ID belirtilmedi!" });
    }

    try {
        const info = db.prepare(`DELETE FROM ilanlar WHERE id = ?`).run(ilanId);

        if (info.changes === 0) {
            return res.status(404).json({ basari: false, mesaj: "İlan bulunamadı veya zaten satın alınmış." });
        }

        res.json({ basari: true, mesaj: "İlan başarıyla satın alındı ve sistemden kaldırıldı." });
    } catch (err) {
        res.status(500).json({ basari: false, mesaj: err.message });
    }
});

// 🌟 Ayar Okuma ve Güncelleme Rotaları
app.get('/api/oyun-ayarlari', (req, res) => {
    try {
        const row = db.prepare(`SELECT ayarlar FROM oyun_ayarlari WHERE id = 1`).get();
        if (!row) {
            return res.status(500).json({ basari: false, mesaj: "Ayarlar okunamadı" });
        }
        res.json({ basari: true, ayarlar: JSON.parse(row.ayarlar) });
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
        res.json({ basari: true, mesaj: "Ayarlar başarıyla güncellendi." });
    } catch (err) {
        res.status(500).json({ basari: false, mesaj: err.message });
    }
});

// YENİ ÜYE KAYIT ROTASI (Eksiksiz ve büyük/küçük harf duyarlı kontrolleriyle)
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
        // Büyük/küçük harf ve boşluk farkını yok sayarak ad soyad kontrolü
        const mevcutAd = db.prepare(`SELECT id FROM kullanicilar WHERE LOWER(TRIM(adsoyad)) = LOWER(TRIM(?))`).get(temizAdSoyad);
        if (mevcutAd) {
            return res.status(400).json({ basari: false, mesaj: 'Bu ad soyad (şirket ismi) daha önce alınmış! Lütfen başka bir tane seçin.' });
        }

        const varsayilanPortfoy = {
            ...(portfoy || { para: 1000000, hisseler: [] }) 
        };

        const stmt = db.prepare(`INSERT INTO kullanicilar (kadi, email, sifre, adsoyad, portfoy) VALUES (?, ?, ?, ?, ?)`);
        const info = stmt.run(kadi, email, sifre, temizAdSoyad, JSON.stringify(varsayilanPortfoy));
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

// Profil Güncelleme Rotalama
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
        // Kesin çözüm: Büyük/küçük harf ve boşlukları temizleyerek kontrol et
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

// ÇIKIŞ ROTASI
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

                req.session.userId = row.id;
                req.session.kullanici = { 
                    id: row.id, 
                    kadi: row.kadi, 
                    adsoyad: row.adsoyad || '', 
                    portfoy: JSON.parse(row.portfoy || '{}') 
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
    if (req.session && req.session.kullanici) {
        res.json(req.session.kullanici);
    } else {
        res.status(401).json({ basari: false, mesaj: "Oturum bulunamadı" });
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
        db.prepare(`UPDATE kullanicilar SET portfoy = ? WHERE id = ?`).run(portfoyStr, userId);
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

app.listen(3000, '0.0.0.0', () => {
    console.log("Sunucumuz 3000 portunda başarıyla çalışıyor.");
}).on('error', (err) => {
    console.error("SUNUCU AÇILAMADI HATA ŞU:", err);
});
