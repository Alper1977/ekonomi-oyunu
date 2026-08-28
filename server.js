const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const app = express();

app.use(express.json());
app.use(express.static(__dirname));

console.log("Klasördeki dosyalar:", fs.readdirSync(__dirname));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Ana oyun veritabanı
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error("Veritabanı bağlantı hatası:", err.message);
    } else {
        console.log("SQLite veritabanına başarıyla bağlanıldı.");
    }
});

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

db.run(`CREATE TABLE IF NOT EXISTS kullanicilar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kadi TEXT UNIQUE,
    email TEXT UNIQUE,
    sifre TEXT,
    adsoyad TEXT,
    portfoy TEXT,
    tarih DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// 🌟 Senin istediğin merkezi ayarlar tablosu (Hiçbir şeyi bozmadan buraya eklendi)
db.run(`CREATE TABLE IF NOT EXISTS oyun_ayarlari (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    ayarlar TEXT
)`, () => {
    db.get(`SELECT * FROM oyun_ayarlari WHERE id = 1`, (err, row) => {
        if (!row) {
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
            db.run(`INSERT OR REPLACE INTO oyun_ayarlari (id, ayarlar) VALUES (1, ?)`, [JSON.stringify(varsayilanAyarlar)]);
        }
    });
});
// 🌟 Ayar Okuma ve Güncelleme Rotaları
app.get('/api/oyun-ayarlari', (req, res) => {
    db.get(`SELECT ayarlar FROM oyun_ayarlari WHERE id = 1`, (err, row) => {
        if (err || !row) {
            return res.status(500).json({ basari: false, mesaj: "Ayarlar okunamadı" });
        }
        res.json({ basari: true, ayarlar: JSON.parse(row.ayarlar) });
    });
});

app.post('/api/admin/ayar-guncelle', (req, res) => {
    const { ayarlar, sureler } = req.body;
    if (!ayarlar) {
        return res.status(400).json({ basari: false, mesaj: "Ayar verisi boş olamaz!" });
    }

    // Hem ayarları hem süreleri tek bir pakette birleştirip kaydedelim
    const kayitPaketi = {
        ...ayarlar,
        sureler: sureler || {}
    };

    const ayarlarStr = JSON.stringify(kayitPaketi);
    
    db.run(`INSERT OR REPLACE INTO oyun_ayarlari (id, ayarlar) VALUES (1, ?)`, [ayarlarStr], function(err) {
        if (err) {
            return res.status(500).json({ basri: false, mesaj: err.message });
        }
        res.json({ basari: true, mesaj: "Ayarlar başarıyla güncellendi." });
    });
});

// YENİ ÜYE KAYIT ROTASI
app.post('/api/kayit', (req, res) => {
    const { kadi, email, sifre, adsoyad, portfoy } = req.body; 
    
    if (!email) {
        return res.status(400).json({ basari: false, mesaj: 'E-posta adresi boş olamaz!' });
    }

    const varsayilanPortfoy = {
        ...(portfoy || { para: 1000000, hisseler: [] }) 
    };

    const portfoyStr = JSON.stringify(varsayilanPortfoy);
    
    db.run(`INSERT INTO kullanicilar (kadi, email, sifre, adsoyad, portfoy) VALUES (?, ?, ?, ?, ?)`, 
    [kadi, email, sifre, adsoyad, portfoyStr], function(err) {
        if (err) {
            console.error("Kayıt hatası:", err.message); 
            return res.status(400).json({ basari: false, mesaj: 'Bu e-posta adresi zaten alınmış veya hata oluştu!' });
        }
        res.json({ basari: true, id: this.lastID, mesaj: 'Kayıt başarılı!' });
    });
});

app.post('/api/sifre-sifirla', (req, res) => {
    const { email, yeniSifre } = req.body;

    if (!email || !yeniSifre) {
        return res.json({ basarili: false, mesaj: "E-posta veya yeni şifre boş olamaz!" });
    }

    db.run(`UPDATE kullanicilar SET sifre = ? WHERE email = ?`, [yeniSifre, email], function(err) {
        if (err) {
            console.error("SQL Hata:", err.message);
            return res.json({ basarili: false, mesaj: "Veritabanı hatası!" });
        }
        if (this.changes === 0) {
            return res.json({ basarili: false, mesaj: "Bu e-posta adresine sahip kullanıcı bulunamadı." });
        }
        res.json({ basarili: true, mesaj: "Şifreniz başarıyla güncellendi." });
    });
});

// Profil (Ad Soyad / Şirket Unvanı) Güncelleme Rotalama
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

    db.run(`UPDATE kullanicilar SET adsoyad = ? WHERE id = ?`, [temizAd, userId], function(err) {
        if (err) {
            console.error("Profil güncelleme veritabanı hatası:", err.message);
            return res.status(500).json({ basari: false, mesaj: "Veritabanı güncellenemedi!" });
        }

        req.session.kullanici.adsoyad = temizAd;
        res.json({ basari: true, mesaj: "Profil başarıyla güncellendi." });
    });
});

// EKSİK OLAN ÇIKIŞ ROTASI
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
    db.get(`SELECT * FROM kullanicilar WHERE kadi = ? AND sifre = ?`, [kadi, sifre], (err, row) => {
        if (err) {
            return res.status(500).json({ basari: false, mesaj: err.message });
        }
        if (row) {
            req.session.regenerate((err) => {
                if (err) return res.status(500).json({ basari: false, mesaj: err.message });



               req.session.userId = row.id;
                req.session.kullanici = { 
                    id: row.id, 
                    kadi: row.kadi, // Zaten e-postanı kadi olarak giriyorsan buradadır
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
    });
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

    db.run(`UPDATE kullanicilar SET portfoy = ? WHERE id = ?`, [portfoyStr, userId], function(err) {
        if (err) {
            console.error("Portföy güncelleme hatası:", err.message);
            return res.status(500).json({ basari: false, mesaj: err.message });
        }
        
        req.session.kullanici.portfoy = yeniPortfoy;
        res.json({ basari: true, mesaj: "Portföy kaydedildi." });
    });
});

app.get('/api/kullanicilar-liste', (req, res) => {
    db.all(`SELECT adsoyad, portfoy FROM kullanicilar`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ basari: false, mesaj: err.message });
        }

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
    });
});

app.listen(3000, '0.0.0.0', () => {
    console.log("Sunucumuz 3000 portunda başarıyla çalışıyor.");
}).on('error', (err) => {
    console.error("SUNUCU AÇILAMADI HATA ŞU:", err);
});
