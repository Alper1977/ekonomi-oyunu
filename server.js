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

// Sadece tablo tamamen boşsa varsayılanları ekle, asla mevcut verinin üzerine yazma
const ayarSayisi = db.prepare(`SELECT COUNT(*) as sayi FROM oyun_ayarlari`).get();
if (ayarSayisi.sayi === 0) {
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
    // INSERT OR IGNORE kullanarak mevcut verinin ezilmesini kesin olarak önlüyoruz
    db.prepare(`INSERT OR IGNORE INTO oyun_ayarlari (id, ayarlar) VALUES (1, ?)`).run(JSON.stringify(varsayilanAyarlar));
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

db.exec(`
    CREATE TABLE IF NOT EXISTS oyun_ayarlari (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ayarlar TEXT
    );
    CREATE TABLE IF NOT EXISTS oyun_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        veri TEXT
    );
`);

// --- 🌟 ÇEVRİMİÇİ / ÇEVRİMDIŞI AKILLI EKONOMİ MOTORU (TAM KAPSAMLI) ---
function kullaniciEkonomisiniIslet(userRow, ayarlar, kurlar) {
    if (!userRow || !userRow.portfoy) return null;

    let portfoy;
    try {
        portfoy = JSON.parse(userRow.portfoy);
    } catch (e) {
        return null;
    }

    const simdi = Date.now();
    let sonGuncelleme = (userRow.son_guncelleme && !isNaN(userRow.son_guncelleme)) ? Number(userRow.son_guncelleme) : simdi;
    
    if (!userRow.son_guncelleme) {
        db.prepare(`UPDATE kullanicilar SET son_guncelleme = ? WHERE id = ?`).run(simdi, userRow.id);
        return portfoy;
    }

    const gecenSure = simdi - sonGuncelleme;
    if (gecenSure < 5000) return portfoy; // 5 saniyeden kısa süreleri pas geç

    const sureler = ayarlar.sureler || {};
    const kiraPeriyodu = sureler.kiraSuresi || 86400000;    // 24 Saat (veya ayarlanan)
    const faizPeriyodu = sureler.faizSuresi || 86400000;    // Vadeli faiz periyodu
    const taksitPeriyodu = sureler.taksitSuresi || 86400000; // Kredi taksit periyodu
    const kazancTablosu = ayarlar.kazancTablosu || {};
    const faizOranlari = ayarlar.faizOranlari || { vadeliGunluk: 0.02, krediKatsayi: 1.25 };
    const satisFiyatlari = ayarlar.satisFiyatlari || {};

    let degisiklikOldu = false;

    // --- 1. KİRA / ŞİRKET GELİRLERİ ---
    const kiraPeriyotSayisi = Math.floor(gecenSure / kiraPeriyodu);
    if (kiraPeriyotSayisi > 0) {
        let toplamEklenenGelir = 0;

        if (portfoy.varliklar && Array.isArray(portfoy.varliklar)) {
            portfoy.varliklar.forEach(v => {
                if (v && v.durum === 'sahip' && kazancTablosu[v.isim]) {
                    toplamEklenenGelir += (kazancTablosu[v.isim] * kiraPeriyotSayisi);
                }
            });
        }

        if (ayarlar.konutKiraGeliri > 0 && portfoy.varliklar) {
            portfoy.varliklar.forEach(v => {
                if (v && v.durum === 'sahip' && v.isim === 'Konut') {
                    toplamEklenenGelir += (ayarlar.konutKiraGeliri * kiraPeriyotSayisi);
                }
            });
        }

        if (toplamEklenenGelir > 0) {
            let mevcutNakit = portfoy.nakit !== undefined ? Number(portfoy.nakit) : (portfoy.para !== undefined ? Number(portfoy.para) : 0);
            mevcutNakit += toplamEklenenGelir;
            portfoy.nakit = mevcutNakit;
            portfoy.para = mevcutNakit;
            degisiklikOldu = true;
        }
    }

    // --- 2. VADELİ HESAP / FAİZ GELİRLERİ ---
    const faizPeriyotSayisi = Math.floor(gecenSure / faizPeriyodu);
    let vadeliDeger = portfoy.vadeli !== undefined ? Number(portfoy.vadeli) : (portfoy.vadeliHesap !== undefined ? Number(portfoy.vadeliHesap) : 0);
    
    if (faizPeriyotSayisi > 0 && vadeliDeger > 0) {
        let gunlukFaizOrani = faizOranlari.vadeliGunluk !== undefined ? Number(faizOranlari.vadeliGunluk) : 0.02;
        let toplamFaizGetirisi = 0;
        let anapara = vadeliDeger;
        
        for (let i = 0; i < faizPeriyotSayisi; i++) {
            toplamFaizGetirisi += (anapara * gunlukFaizOrani);
        }

        if (toplamFaizGetirisi > 0) {
            let yeniVadeli = anapara + toplamFaizGetirisi;
            portfoy.vadeli = yeniVadeli;
            portfoy.vadeliHesap = yeniVadeli;
            degisiklikOldu = true;
        }
    }

    // --- 3. KREDİ TAKSİTLERİ VE OTOMATİK TAHSİLAT (DÖVİZ/ALTIN/VADELİ BOZMA & İCRA) ---
    const taksitPeriyotSayisi = Math.floor(gecenSure / taksitPeriyodu);
    if (taksitPeriyotSayisi > 0 && portfoy.krediler && Array.isArray(portfoy.krediler) && portfoy.krediler.length > 0) {
        
        for (let adim = 0; adim < taksitPeriyotSayisi; adim++) {
            portfoy.krediler.forEach(kr => {
                if (!kr || kr.kalanBorc <= 0) return;

                if (!kr.taksitTutu) {
                    kr.taksitTutu = (kr.kalanBorc / 48) * (faizOranlari.krediKatsayi || 1.25);
                }
                if (typeof kr.ustUsteOdenmeyen !== 'number') {
                    kr.ustUsteOdenmeyen = 0;
                }

                let taksitMiktari = kr.taksitTutu;
                let mevcutNakit = portfoy.nakit !== undefined ? Number(portfoy.nakit) : (portfoy.para !== undefined ? Number(portfoy.para) : 0);

                // Nakit yetmiyorsa alternatif hesapları (Dolar, Euro, Altın, Vadeli) sırayla bozdur
                if (mevcutNakit < taksitMiktari) {
                    let eksikTutar = taksitMiktari - mevcutNakit;

                    // 1. Dolar Bozdur
                    if (eksikTutar > 0 && portfoy.dolar > 0) {
                        let dolarSatis = (kurlar && kurlar.dolar) ? kurlar.dolar.satis : 49;
                        let dolarTl = portfoy.dolar * dolarSatis;
                        if (dolarTl >= eksikTutar) {
                            portfoy.dolar -= (eksikTutar / dolarSatis);
                            mevcutNakit += eksikTutar;
                            eksikTutar = 0;
                        } else {
                            mevcutNakit += dolarTl;
                            eksikTutar -= dolarTl;
                            portfoy.dolar = 0;
                        }
                    }

                    // 2. Euro Bozdur
                    if (eksikTutar > 0 && portfoy.euro > 0) {
                        let euroSatis = (kurlar && kurlar.euro) ? kurlar.euro.satis : 54;
                        let euroTl = portfoy.euro * euroSatis;
                        if (euroTl >= eksikTutar) {
                            portfoy.euro -= (eksikTutar / euroSatis);
                            mevcutNakit += eksikTutar;
                            eksikTutar = 0;
                        } else {
                            mevcutNakit += euroTl;
                            eksikTutar -= euroTl;
                            portfoy.euro = 0;
                        }
                    }

                    // 3. Altın Bozdur
                    if (eksikTutar > 0 && portfoy.altin > 0) {
                        let altinSatis = (kurlar && kurlar.altin) ? kurlar.altin.satis : 6000;
                        let altinTl = portfoy.altin * altinSatis;
                        if (altinTl >= eksikTutar) {
                            portfoy.altin -= (eksikTutar / altinSatis);
                            mevcutNakit += eksikTutar;
                            eksikTutar = 0;
                        } else {
                            mevcutNakit += altinTl;
                            eksikTutar -= altinTl;
                            portfoy.altin = 0;
                        }
                    }

                    // 4. Vadeli Hesaptan Çek
                    let guncelVadeli = portfoy.vadeli !== undefined ? Number(portfoy.vadeli) : (portfoy.vadeliHesap !== undefined ? Number(portfoy.vadeliHesap) : 0);
                    if (eksikTutar > 0 && guncelVadeli > 0) {
                        let cekilecek = Math.min(eksikTutar, guncelVadeli);
                        guncelVadeli -= cekilecek;
                        mevcutNakit += cekilecek;
                        eksikTutar -= cekilecek;
                        
                        portfoy.vadeli = guncelVadeli;
                        portfoy.vadeliHesap = guncelVadeli;
                    }

                    portfoy.nakit = mevcutNakit;
                    portfoy.para = mevcutNakit;
                }

                // Nihai Nakit Kontrolü: Taksit ödenebiliyor mu?
                if (portfoy.nakit >= taksitMiktari) {
                    portfoy.nakit -= taksitMiktari;
                    portfoy.para = portfoy.nakit;
                    kr.kalanBorc -= taksitMiktari;
                    if (kr.kalanBorc < 0) kr.kalanBorc = 0;
                    kr.ustUsteOdenmeyen = 0;

                    // Borç bittiyse blokesini kaldır
                    if (kr.kalanBorc === 0 && portfoy.varliklar) {
                        let ilgiliVarlik = portfoy.varliklar.find(v => v && v.krediID === kr.id);
                        if (ilgiliVarlik) {
                            ilgiliVarlik.bloke = false;
                            ilgiliVarlik.krediID = null;
                        }
                    }
                } else {
                    // Nakit yetmedi, ödenmedi sayılır
                    kr.ustUsteOdenmeyen++;

                    // 3 Dönem üst üste ödenmediyse İCRA (Varlığa el koyma)
                    if (kr.ustUsteOdenmeyen >= 3 && portfoy.varliklar) {
                        let ilgiliVarlik = portfoy.varliklar.find(v => v && v.krediID === kr.id && v.bloke === true);
                        if (ilgiliVarlik) {
                            let satisFiyati = (satisFiyatlari && satisFiyatlari[ilgiliVarlik.isim]) ? satisFiyatlari[ilgiliVarlik.isim] : 10000000;
                            
                            // Varlığı portföyden sil
                            portfoy.varliklar = portfoy.varliklar.filter(v => v && v.id !== ilgiliVarlik.id);

                            let artisFarki = satisFiyati - kr.kalanBorc;
                            if (artisFarki > 0) {
                                portfoy.nakit += artisFarki;
                                portfoy.para = portfoy.nakit;
                            }
                        }
                        kr.silinecek = true;
                    }
                }
                degisiklikOldu = true;
            });

            // Silinecek veya borcu biten kredileri temizle
            portfoy.krediler = portfoy.krediler.filter(kr => kr && kr.kalanBorc > 0 && !kr.silinecek);
        }

        // Genel borç ve taksit özet alanlarını güncelle
        portfoy.kredi = portfoy.krediler.reduce((toplam, kr) => toplam + (kr.kalanBorc || 0), 0);
        portfoy.taksit = portfoy.krediler.reduce((toplam, kr) => toplam + (kr.taksitTutu || 0), 0);
        if (portfoy.kredi <= 0) {
            portfoy.kredi = 0;
            portfoy.taksit = 0;
            portfoy.krediler = [];
        }
    }

    // Yeni son güncelleme zamanını hesaplanan periyotlar üzerinden ileri taşı
    const tuketilenPeriyot = Math.max(kiraPeriyotSayisi, faizPeriyotSayisi, taksitPeriyotSayisi);
    const bazSureMs = Math.min(kiraPeriyodu, faizPeriyodu, taksitPeriyodu);
    
    let yeniSonGuncelleme = sonGuncelleme;
    if (tuketilenPeriyot > 0) {
        yeniSonGuncelleme += (tuketilenPeriyot * bazSureMs);
    }

    if (degisiklikOldu || tuketilenPeriyot > 0) {
        db.prepare(`UPDATE kullanicilar SET portfoy = ?, son_guncelleme = ? WHERE id = ?`).run(
            JSON.stringify(portfoy),
            yeniSonGuncelleme,
            userRow.id
        );
    }

    return portfoy;
}

setInterval(async () => {
    try {
        let res = await fetch('/api/oyun-ayarlari');
        let sonuc = await res.json();
        if (sonuc.basari && sonuc.ayarlar) {
            window.oyunAyar = sonuc.ayarlar;
            if (sonuc.ayarlar.sureler) {
                window.oyunAyarlari = sonuc.ayarlar.sureler;
            }
        }
    } catch (e) {
        // Sessizce geç
    }

    if (typeof state === 'undefined' || !state) {
        return;
    }

    // 1. Sunucudan güncel portföyü çek
    try {
        let res = await fetch('/api/portfoy-getir'); 
        let data = await res.json();
        let portfoyVerisi = data.portfoy || data;

        if (portfoyVerisi) {
            if (portfoyVerisi.varliklar) state.varliklar = portfoyVerisi.varliklar;
            if (portfoyVerisi.nakit !== undefined) {
                state.nakit = portfoyVerisi.nakit;
                state.para = portfoyVerisi.nakit;
            }
            if (portfoyVerisi.krediler) state.krediler = portfoyVerisi.krediler;
            if (portfoyVerisi.kredi !== undefined) state.kredi = portfoyVerisi.kredi;
            if (portfoyVerisi.taksit !== undefined) state.taksit = portfoyVerisi.taksit;

            if (typeof arayuzuGuncelle === 'function') {
                arayuzuGuncelle();
            }
            
            if (typeof finansalDonguyuCalistir === 'function') {
                finansalDonguyuCalistir();
            }
        }
    } catch (e) {
        // Ağ hatası
    }
    
    // 2. Mülk listesini ekranda anında yeniden çiz (Fonksiyona gerek kalmadan direkt burada çalışır)
    let vList = document.getElementById('varliklar-listesi');
    if (vList) {
        vList.innerHTML = '';
        
        let aktifVarliklar = (state.varliklar || []).filter(v => 
            v && 
            v.durum !== 'silinecek' && 
            v.durum !== 'satildi' && 
            v.durum !== 'satildi-bekliyor'
        );

        aktifVarliklar.forEach(v => {
            let blokeYazisi = v.bloke ? '<span style="color:#ff4444">(BLOKELİ)</span>' : '';
            
            let talepBul = typeof state.talepler !== 'undefined' ? state.talepler.find(t => t.tur === v.isim || t.isim === v.isim) : null;
            let bedel = v.bedel || (talepBul ? talepBul.bedel : (typeof kazancTablosu !== 'undefined' && kazancTablosu[v.isim] ? kazancTablosu[v.isim] : 0));
            let gunlukKar = bedel * 3;
            
            let haritalanabilirMulkler = ['arsası', 'otel', 'fabrika', 'hastane', 'okul', 'avm', 'hipermarket', 'konut'];
            let arsaMi = haritalanabilirMulkler.some(tur => v.isim.toLowerCase().includes(tur));
            
            if (arsaMi && !v.atananKonum) {
                v.atananKonum = arsaKonumunuAl(v);
            }
            
            let sagButonlarHTML = '';

            if (v.durum === 'sahip') {
                if (v.isim !== 'Bayi') {
                    sagButonlarHTML += `<button onclick="ilanaCikar(${v.id})" style="width: 100%; box-sizing: border-box;">SAT</button>`;
                }
            } else if (v.durum === 'inşaat') {
                let kalanMs = v.bitis - Date.now();
                let kalanGun = Math.max(0, Math.ceil(kalanMs / (1000 * 60 * 60 * 24)));
                sagButonlarHTML += `<span style="color:#ffcc00; font-size:11px;">İnşaat: ${kalanGun} gün</span>`;
            } else if (v.durum === 'ilan-aktif') {
                sagButonlarHTML += `<span style="color:#ff4444; font-size:13px; font-weight:bold;">SATIŞTA</span>
                                   <button onclick="vazgec(${v.id})" class="btn-red" style="margin-top: 4px; width: 100%; box-sizing: border-box;">Vazgeç</button>`;
            }

            let goruntuleBtnVarlik = arsaMi ? `<button onclick="arsaKonumGoster('${v.isim}', '${v.atananKonum}')" style="background:#3498db; color:#fff; border:none; border-radius:4px; font-weight:bold; cursor:pointer; width: 100%; margin-top: 4px; box-sizing: border-box;">Görüntüle</button>` : '';

            let html = `
                <div class="item-box-varlik">
                    <div>
                        <div style="font-weight: bold; color: #fff; font-size: 13px;">${v.isim} ${blokeYazisi}</div>
                        <div style="font-size: 11px; color: #ffcc00; margin-top: 3px;">Günlük Kar: ${gunlukKar.toLocaleString()} TL</div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; min-width: 90px;">
                        ${sagButonlarHTML}
                        ${goruntuleBtnVarlik}
                    </div>
                </div>
            `;
            vList.innerHTML += html; 
        });
    }
    
    let simdiMs = Date.now();
    let veriDegisti = false;

    if (typeof window !== 'undefined' && window.oyunAyar) {
        if (window.oyunAyar.satisFiyatlari) satisFiyatlari = window.oyunAyar.satisFiyatlari;
        if (window.oyunAyar.faizOranlari) faizOranlari = window.oyunAyar.faizOranlari;
        if (window.oyunAyar.kurlar) kurlar = window.oyunAyar.kurlar;
        if (window.oyunAyar.kazancTablosu) kazancTablosu = window.oyunAyar.kazancTablosu;
        if (window.oyunAyar.yatirimMaliyetleri) yatirimMaliyetleri = window.oyunAyar.yatirimMaliyetleri;
        if (window.oyunAyar.odemeProgrami) odemeProgrami = window.oyunAyar.odemeProgrami;
    }



    // 1. Faiz İşlemi

    if (simdiMs - sonFaizZamani >= window.oyunAyarlari.faizSuresi) {
        state.faiz = state.vadeli * faizOranlari.vadeliGunluk;
        state.vadeli += state.faiz;
        sonFaizZamani = simdiMs;
        guncelle();
        veriDegisti = true;
    }

    let suAn = new Date();
    let saat = suAn.getHours();
    let dakika = suAn.getMinutes();

    // Yeni dinamik kontrol bloğu buraya gelecek

let simdikiZaman = typeof saat !== 'undefined' ? { saat: saat, dakika: dakika } : { saat: new Date().getHours(), dakika: new Date().getMinutes() };
let simdikiToplamDakika = simdikiZaman.saat * 60 + simdikiZaman.dakika;

// odemeProgramındaki saatleri kontrol et: Ödeme saatinden itibaren 60 dakika (1 saat) geçerli olsun
let aktifOdemePenceresi = odemeProgrami.find(p => {
    let odemeToplamDakika = p.saat * 60 + (p.dakika || 0);
    let fark = simdikiToplamDakika - odemeToplamDakika;
    
    // Eğer oyuncu ödeme saatinden itibaren geçen 0 ile 59 dakika arasındaysa (1 saatlik pencere)
    return fark >= 0 && fark < 60;
});

if (aktifOdemePenceresi) {
    let bugunStr = new Date().toISOString().split('T')[0]; // Günlük benzersiz anahtar için
    
    state.varliklar.forEach(v => {
        if ((v.durum === 'sahip' || v.durum === 'ilan-aktif') && v.isim !== 'Konut') {
            // Bu varlık için bugün bu ödeme saatinde zaten tahsilat açıldı mı veya yapıldı mı?
            let talepAnahtari = `${bugunStr}-${aktifOdemePenceresi.saat}-${v.id || v.isim}`;
            
            if (!v.sonTahsilatGunu || v.sonTahsilatGunu !== talepAnahtari) {
                v.talepAktif = true;
                v.talepBaslangic = Date.now();
                v.sonTahsilatGunu = talepAnahtari; // Bugün bu saat için açıldı olarak işaretle
                veriDegisti = true;
            }
        }
    });
    if (typeof veriDegisti !== 'undefined' && veriDegisti) {
        guncelle();
    }
}

    state.varliklar.forEach(v => {
        if (v.talepAktif && v.talepBaslangic > 0 && (Date.now() - v.talepBaslangic >= 3600000)) {
            v.talepAktif = false;
            v.talepBaslangic = 0;
            guncelle();
            veriDegisti = true;
        }
    });

    // 3. İnşaat ve Varlık Bitişleri

   let degisiklikVar = false;

    state.varliklar.forEach(v => {

        if (v.durum === 'inşaat' && simdiMs >= v.bitis) {
            let arsaBloke = v.bloke;
            let arsaKrediId = v.krediID;
            // 🌟 İŞTE BURASI: Arsanın o anki sabit konumunu mülke kilitliyoruz!
            let sabitKonum = v.atananKonum || arsaKonumunuAl(v);

            if (v.isim === 'Konut') {
                for(let i = 0; i < 30; i++) {
                    state.varliklar.push({
                        id: Date.now() + i + Math.random(),
                        isim: 'Konut',
                        durum: 'sahip',
                        bloke: arsaBloke,        
                        krediID: arsaKrediId,
                        atananKonum: sabitKonum // Konutlar da arsanın konumunu alır
                    });
                }
            } else {
                state.varliklar.push({
                    id: Date.now() + Math.random(),
                    isim: v.isim,
                    durum: 'sahip',
                    bloke: arsaBloke,        
                    krediID: arsaKrediId,
                    atananKonum: sabitKonum // Yeni mülk arsanın konumunu devralır
                });
            }
            v.durum = 'silinecek';
            degisiklikVar = true;
            veriDegisti = true;
        }
        if (v.durum === 'satildi-bekliyor' && simdiMs >= v.silinmeZamani) {
            v.durum = 'silinecek';
            degisiklikVar = true;
            veriDegisti = true;
        }
    });

   if (degisiklikVar) {
        state.varliklar = state.varliklar.filter(v => v.durum !== 'silinecek');
        guncelle();
    }

if (typeof sonTaksitZamani === 'undefined') { sonTaksitZamani = simdiMs; } 

console.log("Geçen süre (sn):", Math.floor((simdiMs - sonTaksitZamani) / 1000));

// Süre dolduysa ve aktif krediler varsa
if (simdiMs - sonTaksitZamani >= window.oyunAyarlari.taksitSuresi) {

    console.log("1 dakika doldu, kredi bazlı taksit kontrolü yapılıyor...");

    if (state.krediler && state.krediler.length > 0) {

        let bildirimler = []; // O turda yaşanan tüm uyarıları burada biriktireceğiz

        state.krediler.forEach(kr => {

            if (!kr.taksitTutu) {
                kr.taksitTutu = (kr.kalanBorc / 48) * (typeof faizOranlari !== 'undefined' ? faizOranlari.krediKatsayi : 1.25);
            }
            if (typeof kr.ustUsteOdenmeyen !== 'number') {
                kr.ustUsteOdenmeyen = 0;
            }

            let taksitMiktari = kr.taksitTutu;

            // --- OTOMATİK NAKİT TAMAMLAMA (DÖVİZ, ALTIN VE VADELİ KONTROLÜ) ---

            if (state.nakit < taksitMiktari) {

    let eksikTutar = taksitMiktari - state.nakit;
    let donusturulenAciklama = [];

    // 1. Önce Dolar bozdur

    if (eksikTutar > 0 && state.dolar > 0) {

        let dolarSatisFiyati = (typeof kurlar !== 'undefined' && kurlar.dolar) ? kurlar.dolar.satis : 49;
        let dolarTlKarsiligi = state.dolar * dolarSatisFiyati;

        if (dolarTlKarsiligi >= eksikTutar) {

            let harcananDolar = eksikTutar / dolarSatisFiyati;
            state.dolar -= harcananDolar;
            state.nakit += eksikTutar;
            donusturulenAciklama.push(`${harcananDolar.toFixed(2)} Dolar bozduruldu`);
            eksikTutar = 0;
        } else {
            state.nakit += dolarTlKarsiligi;
            eksikTutar -= dolarTlKarsiligi;
            state.dolar = 0;
            donusturulenAciklama.push(`Tüm Dolar varlıklarınız bozduruldu (${dolarTlKarsiligi.toLocaleString()} TL)`);
        }
    }
    // 2. Sonra Euro bozdur

    if (eksikTutar > 0 && state.euro > 0) {

        let euroSatisFiyati = (typeof kurlar !== 'undefined' && kurlar.euro) ? kurlar.euro.satis : 54;
        let euroTlKarsiligi = state.euro * euroSatisFiyati;

        if (euroTlKarsiligi >= eksikTutar) {
            let harcananEuro = eksikTutar / euroSatisFiyati;
            state.euro -= harcananEuro;
            state.nakit += eksikTutar;
            donusturulenAciklama.push(`${harcananEuro.toFixed(2)} Euro bozduruldu`);
            eksikTutar = 0;
        } else {
            state.nakit += euroTlKarsiligi;
            eksikTutar -= euroTlKarsiligi;
            state.euro = 0;
            donusturulenAciklama.push(`Tüm Euro varlıklarınız bozduruldu (${euroTlKarsiligi.toLocaleString()} TL)`);
        }
    }

    // 3. Sonra Altın bozdur

    if (eksikTutar > 0 && state.altin > 0) {

        let altinSatisFiyati = (typeof kurlar !== 'undefined' && kurlar.altin) ? kurlar.altin.satis : 6000;
        let altinTlKarsiligi = state.altin * altinSatisFiyati;

        if (altinTlKarsiligi >= eksikTutar) {
            let harcananGram = eksikTutar / altinSatisFiyati;
            state.altin -= harcananGram;
            state.nakit += eksikTutar;
            donusturulenAciklama.push(`${harcananGram.toFixed(2)} gram altın bozduruldu`);
            eksikTutar = 0;
        } else {
            state.nakit += altinTlKarsiligi;
            eksikTutar -= altinTlKarsiligi;
            state.altin = 0;
            donusturulenAciklama.push(`Tüm altınlarınız bozduruldu (${altinTlKarsiligi.toLocaleString()} TL)`);
        }
    }

    // 4. En son Vadeli Hesaptan çek

    let vadeliDeger = state.vadeli || state.vadeliHesap || 0;
    if (eksikTutar > 0 && vadeliDeger > 0) {
        let cekilecek = Math.min(eksikTutar, vadeliDeger);
        if (state.vadeli !== undefined) state.vadeli -= cekilecek;
        if (state.vadeliHesap !== undefined) state.vadeliHesap -= cekilecek;
        state.nakit += cekilecek;
        eksikTutar -= cekilecek;
        donusturulenAciklama.push(`Vadeli hesabınızdan ${cekilecek.toLocaleString()} TL çekildi`);
    }
    if (donusturulenAciklama.length > 0) {
        bildirimler.push(`🔄 <b>OTOMATİK TAHSİLAT:</b> Nakdiniz yetmediği için ${donusturulenAciklama.join(', ')} ve taksit ödendi.`);
    }
}

            // SENARYO A: Nakit artık yetiyor mu?

            if (state.nakit >= taksitMiktari) {
                state.nakit -= taksitMiktari;
                kr.kalanBorc -= taksitMiktari;
                if (kr.kalanBorc < 0) kr.kalanBorc = 0;
                kr.ustUsteOdenmeyen = 0;

                if (kr.kalanBorc === 0) {
        let ilgiliVarlik = state.varliklar.find(v => v.krediID === kr.id);
        if (ilgiliVarlik) {
            ilgiliVarlik.bloke = false; // Bloke kalktı!
            ilgiliVarlik.krediID = null; // Bağlantıyı temizle
            bildirimler.push(`🔓 <b>KREDİ BİTTİ:</b> Borcunuz tamamen ödendiği için <b>${ilgiliVarlik.isim}</b> üzerindeki bloke kaldırıldı!`);
        }
    }
            }
            // SENARYO B: Her şeye rağmen Nakit YETMİYOR
            else {
                kr.ustUsteOdenmeyen++;

                // Bu krediye bağlı varlığı bulalım

                let ilgiliVarlik = state.varliklar.find(v => v.krediID === kr.id && v.bloke === true);
                let varlikAdi = ilgiliVarlik ? ilgiliVarlik.isim : "Bir varlığınız";

                // Eğer 3. taksit dolduysa İCRA İŞLEMİ

                if (kr.ustUsteOdenmeyen >= 3) {

                    if (ilgiliVarlik) {

                        let satisFiyati = (satisFiyatlari && satisFiyatlari[ilgiliVarlik.isim]) ? satisFiyatlari[ilgiliVarlik.isim] : 10000000;

                        // Varlığı sistemden kaldır

                        state.varliklar = state.varliklar.filter(v => v.id !== ilgiliVarlik.id);

                        let artisFarki = satisFiyati - kr.kalanBorc;

                        if (artisFarki > 0) {
                            state.nakit += artisFarki;
                        }

                        // İcra bildirimini listeye ekle

                        bildirimler.push(`🚨 <b>İCRA:</b> 3 dönem ödenemeyen ve alternatif hesaplardan da karşılanamayan <b>${varlikAdi}</b> haczedilerek satıldı!`);
                    }
                    kr.silinecek = true;
                } else {
                    // Normal gecikme bildirimi (1. veya 2. taksit)

                    bildirimler.push(`⚠️ <b>Gecikme:</b> Yeterli likidite bulunamadığından ${varlikAdi} için taksit ödenemedi (${kr.ustUsteOdenmeyen}/3).`);
                }
            }
        });

        // 3. taksiti dolup icralık olan kredileri listeden uçur

        state.krediler = state.krediler.filter(kr => kr.kalanBorc > 0 && !kr.silinecek);

        // Eğer bu turda herhangi bir uyarı/icra olunduysa, hepsini tek pencerede göster!
        if (bildirimler.length > 0) {
            modalGoster(`📋 <b>DÖNEMSEL FİNANSAL RAPOR</b><br><br>` + bildirimler.join('<br><br>'));
        }

        // Genel borç ve taksitleri güncelle

        state.kredi = state.krediler.reduce((toplam, kr) => toplam + kr.kalanBorc, 0);
        state.taksit = state.krediler.reduce((toplam, kr) => toplam + (kr.taksitTutu || 0), 0);

        if (state.kredi <= 0) {
            state.kredi = 0;
            state.taksit = 0;
            state.krediler = [];
        }
    }
    sonTaksitZamani = simdiMs;
    guncelle();
    veriDegisti = true;
}
 
// 5. Konut Kira Gelirleri
if (simdiMs - sonKiraZamani >= window.oyunAyarlari.kiraSuresi) {
    let konutSayisi = state.varliklar.filter(v => v.isim === 'Konut' && v.durum === 'sahip').length;
    
    // 🌟 state yerine doğrudan anlık global ayardan okuyoruz
    let guncelKiraGeliri = window.oyunAyar?.konutKiraGeliri ?? state.konutKiraGeliri ?? 0;
    let toplamKira = konutSayisi * guncelKiraGeliri;

    state.nakit += toplamKira;
    sonKiraZamani = simdiMs;
    guncelle();
    veriDegisti = true;
}

// 6. Şirket Günlük Gelirleri
if (simdiMs - sonSirketKazanci >= window.oyunAyarlari.sirketKazancSuresi) {
    
    // 🌟 state yerine doğrudan anlık global ayardan okuyoruz
    let guncelGunlukGelir = window.oyunAyar?.gunlukGelir ?? state.gunlukGelir ?? 800000;

    state.nakit += guncelGunlukGelir;
    sonSirketKazanci = simdiMs;
    guncelle();
    veriDegisti = true;
}

    // 🌟 7. EN ÖNEMLİ HAMLE: Döngü içinde parada veya varlıkta bir değişiklik olduysa sunucuya kaydet!

    if (veriDegisti) {
        portfoyuSunucuyaKaydet(state);
    }

if (typeof maksimumIlanSiniri === 'undefined') { var maksimumIlanSiniri = window.oyunAyarlari.maksimumIlanSiniri; }

    // 1. Bot İşlemleri (Her 8 saniyede bir botlar varlık alır veya para kazanır)

    if (typeof sonBotZamani === 'undefined') { sonBotZamani = 0; }

    if (simdiMs - sonBotZamani >= window.oyunAyarlari.botHizi) {

        let gercekVarliklar = Object.keys(satisFiyatlari);

        for (let i = 0; i < 5; i++) {

            let rastgeleBot = botlar[Math.floor(Math.random() * botlar.length)];

            if (!rastgeleBot.varliklar) rastgeleBot.varliklar = [];

            if (Math.random() < 0.30) {
                rastgeleBot.nakit += Math.floor(Math.random() * 200000000) + 50000000;
            } else {
                let secilenUrun = gercekVarliklar[Math.floor(Math.random() * gercekVarliklar.length)];
                let bedel = satisFiyatlari[secilenUrun];

                if (rastgeleBot.nakit >= bedel) {
                    rastgeleBot.nakit -= bedel;
                    rastgeleBot.varliklar.push({
                        id: Date.now() + Math.random(),
                        isim: secilenUrun,
                        durum: 'sahip'
                    });
                }
            }
        }
        if (typeof zenginlerListesiniGuncelle === 'function') {
            zenginlerListesiniGuncelle();
        }
        sonBotZamani = simdiMs;
    }

    // 2. Bot İlan Açma Döngüsü (Her 15 saniyede bir - Global Ürün Başına Maksimum Sınır)
   if (typeof sonBotIlanZamani === 'undefined') { sonBotIlanZamani = 0; }

    if (simdiMs - sonBotIlanZamani >= window.oyunAyarlari.botIlanHizi) {

        let aktifIlanSayilari = {};

        botlar.forEach(b => {

            if (b.varliklar) {
                b.varliklar.forEach(v => {
                    if (v.durum === 'ilan-aktif') {
                        aktifIlanSayilari[v.isim] = (aktifIlanSayilari[v.isim] || 0) + 1;
                    }
                });
            }
        });

        botlar.forEach(bot => {

            if (bot.varliklar && bot.varliklar.length > 0) {

                let sahipVarliklar = bot.varliklar.filter(v => v.durum === 'sahip');

                if (sahipVarliklar.length > 0 && Math.random() < 0.30) {
                    let uygunVarliklar = sahipVarliklar.filter(v => {
                    let mevcutSayi = aktifIlanSayilari[v.isim] || 0;
                        return mevcutSayi < maksimumIlanSiniri;
                    });

                    if (uygunVarliklar.length > 0) {
                        uygunVarliklar.sort(() => Math.random() - 0.5);
                        let secilenVarlik = uygunVarliklar[0];
                    
                        secilenVarlik.durum = 'ilan-aktif';
                        secilenVarlik.ilanSahibi = bot.isim;
                        secilenVarlik.ilanVerilisZamani = simdiMs;
                        aktifIlanSayilari[secilenVarlik.isim] = (aktifIlanSayilari[secilenVarlik.isim] || 0) + 1;
                    }
                }
            }
        });

        sonBotIlanZamani = simdiMs;
    }
 // 3. Senin İlanlarını Kontrol Eden Mekanizma (Garanti Satış)

botlar.forEach(bot => {
    if (!bot.varliklar || !Array.isArray(bot.varliklar)) return;

    bot.varliklar.forEach(varlik => {
        // 🔥 BOT ENGELİNİ KALDIRAN FİLTRE:
        if (varlik.durum !== 'ilan-aktif') return;
        if (varlik.satinAlindi || varlik.islemde) return; 

        // ... geri kalan 3 günlük bekleme süresi ve bot alım kodları burada devam eder ...
    });
});

window.ilanZamanlari = window.ilanZamanlari || {};
let beklemeSuresiMs = window.oyunAyar.GLOBAL_BEKLEME_SURESI;

let satilikVarliklar = state.varliklar.filter(v => v.durum === 'ilan-aktif' && v.ilanSahibi === 'ben');

if (satilikVarliklar.length > 0) {
    satilikVarliklar.forEach(varlik => {
        if (!varlik.ilanVerilisZamani) {
            varlik.ilanVerilisZamani = simdiMs;
        }

        let gecenSure = simdiMs - varlik.ilanVerilisZamani;
        if (gecenSure < beklemeSuresiMs) {
            return;
        }

        let satisBedeli = (satisFiyatlari && satisFiyatlari[varlik.isim]) ? satisFiyatlari[varlik.isim] : 2000000;
        let alabilecekBotlar = botlar.filter(b => b.nakit >= satisBedeli);
        let aliciBot;

        if (alabilecekBotlar.length > 0) {
            aliciBot = alabilecekBotlar[Math.floor(Math.random() * alabilecekBotlar.length)];
        } else {
            aliciBot = botlar[Math.floor(Math.random() * botlar.length)];
            aliciBot.nakit += satisBedeli + 5000000;
        }

        let dusulenBorc = 0;

        if (varlik.bloke && varlik.krediID && state.krediler) {
            let ilgiliKredi = state.krediler.find(kr => kr.id === varlik.krediID);

            if (ilgiliKredi) {
                dusulenBorc = ilgiliKredi.kalanBorc;
                state.kredi = Math.max(0, state.kredi - dusulenBorc);
                ilgiliKredi.kalanBorc = 0;
                state.krediler = state.krediler.filter(kr => kr.kalanBorc > 0);

                if (state.kredi <= 0) {
                    state.kredi = 0;
                    state.taksit = 0;
                    state.krediler = [];
                    if (Array.isArray(state.varliklar)) {
                        state.varliklar.forEach(item => {
                            item.bloke = false;
                            item.krediID = null;
                        });
                    }
                } else {
                    let katsayi = (typeof faizOranlari !== 'undefined' && faizOranlari.krediKatsayi) ? faizOranlari.krediKatsayi : 1;
                    state.taksit = (state.kredi / 48) * katsayi;
                }
            }
        }
        let netKazanc = satisBedeli - dusulenBorc;

        aliciBot.nakit -= satisBedeli;
        state.nakit += netKazanc;
        varlik.durum = 'silinecek';

        if (!aliciBot.varliklar) aliciBot.varliklar = [];
        aliciBot.varliklar.push({
            id: Date.now() + Math.random(),
            isim: varlik.isim,
            durum: 'sahip'
        });

        // 🔥 KRİTİK: Verinin değiştiğini işaretliyoruz ki sunucuya kaydedilebilsin!
        if (typeof veriDegisti !== 'undefined') {
            veriDegisti = true;
        }

        let mesaj = `Piyasa Hareketi (Süre Doldu):\n\n${aliciBot.isim}, ilanda bekleyen "${varlik.isim}" varlığını ${satisBedeli.toLocaleString()} TL ödeyerek satın aldı!`;
        if (dusulenBorc > 0) {
            mesaj += `\n\nKredi Borcu Kapandı: -${dusulenBorc.toLocaleString()} TL\nKasanıza Eklenen Net Tutar: ${netKazanc.toLocaleString()} TL`;
        } else {
            mesaj += `\nKasanıza Eklenen Tutar: ${satisBedeli.toLocaleString()} TL`;
        }
        
        if (typeof onayModalGoster === 'function') {
            onayModalGoster(mesaj, varlik);
        } else if (typeof modalGoster === 'function') {
            modalGoster(mesaj);
        }
    });

    state.varliklar = state.varliklar.filter(v => v.durum !== 'silinecek');
    
    // 🔥 KRİTİK: Filtreleme yapıldıktan sonra da veri değişim bayrağını tetikliyoruz
    if (typeof veriDegisti !== 'undefined') {
        veriDegisti = true;
    }
}
// 4. DİĞER BOTLARIN İLANLARININ SÜRESİ DOLUNCA BAŞKA BOTLAR TARAFINDAN ALINMASI VE TEMİZLENMESİ
    botlar.forEach(tekilBot => { // Burada bot yerine 'tekilBot' gibi net bir isim verelim
        if (!tekilBot.varliklar || !Array.isArray(tekilBot.varliklar)) return;

        tekilBot.varliklar.forEach(varlik => {
            // 🔥 BOT ENGELİNİ KALDIRAN FİLTRE (Doğru yeri burası):
            if (varlik.durum !== 'ilan-aktif') return;
            if (varlik.satinAlindi || varlik.islemde || varlik.durum === 'satildi-bekliyor' || varlik.durum === 'silinecek') return; 

            // ... geri kalan 3 günlük bekleme süresi ve bot alım kodları burada devam eder ...
            if (!varlik.ilanVerilisZamani) {
                varlik.ilanVerilisZamani = simdiMs;
                return;
            }
            
            let gecenSure = simdiMs - varlik.ilanVerilisZamani;
            if (gecenSure < beklemeSuresiMs) return;

            let satisBedeli = (satisFiyatlari && satisFiyatlari[varlik.isim]) ? satisFiyatlari[varlik.isim] : 2000000;
            let alabilecekBotlar = botlar.filter(b => b.isim !== tekilBot.isim && b.nakit >= satisBedeli);
            let aliciBot;

            if (alabilecekBotlar.length > 0) {
                aliciBot = alabilecekBotlar[Math.floor(Math.random() * alabilecekBotlar.length)];
            } else {
                let digerBotlar = botlar.filter(b => b.isim !== tekilBot.isim);
                if (digerBotlar.length > 0) {
                    aliciBot = digerBotlar[Math.floor(Math.random() * digerBotlar.length)];
                    aliciBot.nakit += satisBedeli + 5000000;
                }
            }

            if (aliciBot) {
                aliciBot.nakit -= satisBedeli;
                tekilBot.nakit += satisBedeli;
                varlik.durum = 'satildi_isaretle';

                if (!aliciBot.varliklar) aliciBot.varliklar = [];
                aliciBot.varliklar.push({
                    id: Date.now() + Math.random(),
                    isim: varlik.isim,
                    durum: 'sahip'
                });
            }
        });

        tekilBot.varliklar = tekilBot.varliklar.filter(v => v.durum !== 'satildi_isaretle');
    });
    // 5. Arayüz ve Sunucu Güncellemeleri
  guncelle();

    if (typeof ilanlariGuncelle === 'function') { ilanlariGuncelle(); }
    
    // Sadece veri değiştiğinde sunucuya kaydet ki arkayı boğmasın!
    if (typeof veriDegisti !== 'undefined' && veriDegisti && typeof portfoyuSunucuyaKaydet === 'function') {
        portfoyuSunucuyaKaydet(state);
    }
}, 3000);

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

app.post('/api/ilan-satin-al', (req, res) => {
    if (!req.session || !req.session.kullanici) {
        return res.status(401).json({ basari: false, mesaj: "Oturum bulunamadı!" });
    }

    const aliciId = req.session.kullanici.id;
    const { ilanId, odenenNakit, ilanTipiBedel, ilanIsmi } = req.body;
    let guncelAliciPortfoy = null;

    try {
        const transaction = db.transaction(() => {
            let ilan = null;
            // Sadece geçerli bir ilanId varsa veritabanında ara
            if (ilanId !== null && ilanId !== undefined && ilanId !== 'null' && ilanId !== '') {
                try {
                    ilan = db.prepare(`SELECT * FROM ilanlar WHERE id = ?`).get(ilanId);
                } catch (e) {
                    ilan = null;
                }
            }
            
            let saticiId = null;
            let ilanFiyat = 0;
            let ilanTipi = "";
            let detaylarObj = {};

            if (ilan) {
                // GERÇEK KULLANICI İLANI (P2P)
                if (ilan.kullanici_id === aliciId) {
                    throw new Error("Kendi ilanınızı satın alamazsınız!");
                }
                saticiId = ilan.kullanici_id;
                ilanFiyat = ilan.fiyat;
                ilanTipi = ilan.ilan_tipi;
                try {
                    detaylarObj = JSON.parse(ilan.detaylar || '{}');
                } catch (e) {
                    detaylarObj = {};
                }
            } else {
                // KAMU VEYA BOT İLANI (Veritabanında yoksa doğrudan istemciden gelen verileri baz al)
                ilanFiyat = ilanTipiBedel || (odenenNakit ? Number(odenenNakit) * 10/7 : 0);
                ilanTipi = ilanIsmi || "Kamu Mülkü";
            }

            // ALICI İŞLEMLERİ
            const aliciRow = db.prepare(`SELECT portfoy FROM kullanicilar WHERE id = ?`).get(aliciId);
            if (!aliciRow) throw new Error("Alıcı bulunamadı.");
            
            let aliciPortfoy = JSON.parse(aliciRow.portfoy || '{}');
            let aliciNakit = aliciPortfoy.nakit !== undefined ? aliciPortfoy.nakit : (aliciPortfoy.para || 0);

            const tahsilEdilecekTutar = (odenenNakit !== undefined && odenenNakit !== null) ? Number(odenenNakit) : ilanFiyat;

            if (aliciNakit < tahsilEdilecekTutar) {
                throw new Error("Yeterli nakit paranız (peşinatınız) yok!");
            }

            aliciNakit -= tahsilEdilecekTutar;
            aliciPortfoy.nakit = aliciNakit;
            if (!aliciPortfoy.varliklar) aliciPortfoy.varliklar = [];

            const yeniBlokeDurumu = (odenenNakit !== undefined && odenenNakit !== null && Number(odenenNakit) < ilanFiyat);

            aliciPortfoy.varliklar.push({
                id: Date.now() + Math.random(),
                isim: ilanTipi,
                durum: 'sahip',
                bloke: yeniBlokeDurumu,
                krediID: null,
                atananKonum: detaylarObj.atananKonum || null
            });

            db.prepare(`UPDATE kullanicilar SET portfoy = ?, son_guncelleme = ? WHERE id = ?`).run(JSON.stringify(aliciPortfoy), Date.now(), aliciId);
            guncelAliciPortfoy = aliciPortfoy;

            // SATICI İŞLEMLERİ (Sadece gerçek kullanıcılar için)
            if (saticiId) {
                const saticiRow = db.prepare(`SELECT portfoy FROM kullanicilar WHERE id = ?`).get(saticiId);
                
                if (saticiRow && saticiRow.portfoy) {
                    let saticiPortfoy = JSON.parse(saticiRow.portfoy || '{}');
                    let saticiNakit = saticiPortfoy.nakit !== undefined ? saticiPortfoy.nakit : (saticiPortfoy.para || 0);
                    
                    saticiNakit += ilanFiyat;
                    saticiPortfoy.nakit = saticiNakit;

                    if (saticiPortfoy.varliklar) {
                        let silindiMi = false;
                        let hedefVarlikId = detaylarObj.varlikId;

                        saticiPortfoy.varliklar = saticiPortfoy.varliklar.filter(v => {
                            if (!v) return true;
                            if (silindiMi) return true;

                            if (hedefVarlikId && String(v.id) === String(hedefVarlikId)) {
                                silindiMi = true;
                                return false; 
                            }
                            if (v.isim === ilanTipi && (v.durum === 'ilan-aktif' || v.durum === 'satildi' || v.durum === 'sahip')) {
                                silindiMi = true;
                                return false; 
                            }
                            return true;
                        });
                    }

                    db.prepare(`UPDATE kullanicilar SET portfoy = ?, son_guncelleme = ? WHERE id = ?`).run(JSON.stringify(saticiPortfoy), Date.now(), saticiId);
                }
            }

            if (ilan) {
                db.prepare(`DELETE FROM ilanlar WHERE id = ?`).run(ilanId);
            }

            return true;
        });

        transaction();
        res.json({ basari: true, mesaj: "Satın alma gerçekleşti, mülk envantere aktarıldı.", yeniPortfoy: guncelAliciPortfoy });
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

        // 🌟 Çevrimdışı geçen süredeki gelirleri hesaba kat!
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

app.get('/api/detayli-oyun-ayarlari', (req, res) => {
    try {
        const kayit = db.prepare(`SELECT ayarlar FROM oyun_ayarlari WHERE id = 1`).get();
        if (kayit && kayit.ayarlar) {
            const parsedAyarlar = JSON.parse(kayit.ayarlar);
            res.json({ 
                basari: true, 
                oyunAyar: parsedAyarlar.oyunAyar || {},
                kurlar: parsedAyarlar.kurlar || {},
                faizOranlari: parsedAyarlar.faizOranlari || {},
                satisFiyatlari: parsedAyarlar.satisFiyatlari || {},
                yatirimMaliyetleri: parsedAyarlar.yatirimMaliyetleri || {}
            });
        } else {
            res.status(404).json({ basari: false, mesaj: "Oyun ayarları bulunamadı." });
        }
    } catch (err) {
        res.status(500).json({ basari: false, mesaj: err.message });
    }
});

// --- OYUN DURUMUNU (STATE VE BOTLAR) SUNUCUDAN SUNMA ---
app.get('/api/oyun-durumu', (req, res) => {
    try {
        const stateKayit = db.prepare(`SELECT veri FROM oyun_state WHERE id = 1`).get();
        let stateVerisi = stateKayit ? JSON.parse(stateKayit.veri) : { state: {}, botlar: [] };

        res.json({
            basari: true,
            state: stateVerisi.state || {},
            botlar: stateVerisi.botlar || []
        });
    } catch (err) {
        res.status(500).json({ basari: false, mesaj: err.message });
    }
});

// --- OYUN DURUMUNU GÜNCELLEME (İstemci veya Arka Plan Döngüsü İçin) ---
app.post('/api/oyun-durumu-guncelle', (req, res) => {
    try {
        const { state, botlar } = req.body;
        const paket = JSON.stringify({ state: state || {}, botlar: botlar || [] });
        
        db.prepare(`INSERT OR REPLACE INTO oyun_state (id, veri) VALUES (1, ?)`).run(paket);
        
        // Socket.io ile bağlı diğer istemcilere de anlık bildir
        io.emit('stateDegisti', { state, botlar });

        res.json({ basari: true, mesaj: "Oyun durumu güncellendi." });
    } catch (err) {
        res.status(500).json({ basari: false, mesaj: err.message });
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
