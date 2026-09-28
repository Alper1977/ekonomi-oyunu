const SEHIRLER = ['Ankara', 'İstanbul', 'İzmir', 'Antalya', 'Adana', 'Mersin', 'Bursa', 'Konya', 'Trabzon', 'Muğla', 'Diyarbakır', 'Gaziantep', 'Balıkesir', 'Eskişehir'];
const TIPLER = ['Konut Arsası', 'Hastane Arsası', 'Özel Okul Arsası', 'AVM Arsası', 'Hipermarket Arsası', 'Fabrika Arsası', 'Otel Arsası', 'Konut', 'Hastane', 'Özel Okul', 'AVM', 'Hipermarket', 'Fabrika', 'Otel'];

const KONUM = {};
TIPLER.forEach(t => { KONUM[t] = { liste: SEHIRLER }; });

module.exports = KONUM;
