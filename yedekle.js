const fs = require('fs');
const nodemailer = require('nodemailer');

async function yedekGonder() {
    const veriKlasoru = fs.existsSync('/data') ? '/data' : '.';
    const dbYolu = `${veriKlasoru}/database.db`;

    if (!fs.existsSync(dbYolu)) {
        console.error('Yedeklenecek veritabanı bulunamadı:', dbYolu);
        process.exit(1);
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.YEDEK_GONDEREN_EMAIL,
            pass: process.env.YEDEK_GONDEREN_SIFRE
        }
    });

    const tarih = new Date().toISOString().split('T')[0];

    try {
        await transporter.sendMail({
            from: process.env.YEDEK_GONDEREN_EMAIL,
            to: process.env.YEDEK_ALICI_EMAIL,
            subject: `Oyun Veritabanı Yedeği - ${tarih}`,
            text: 'Günlük otomatik yedekleme ekte.',
            attachments: [{ filename: `database-${tarih}.db`, path: dbYolu }]
        });
        console.log('Yedek başarıyla gönderildi:', tarih);
    } catch (hata) {
        console.error('Yedek gönderilemedi:', hata.message);
        process.exit(1);
    }
}

yedekGonder();
