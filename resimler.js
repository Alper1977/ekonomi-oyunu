/* Ecarix - Tesis ve arsa resimleri (kodla çizilen SVG, dosya/telif yok)
   Her tür için 10 farklı görünüm üretir. Aynı (isim, no) her zaman aynı resmi verir. */
(function () {
  var G = (typeof window !== 'undefined') ? window : global;
  var W = 200;

  var SKY = [
    { t: '#4f9de8', b: '#cfe9ff', s: 'g' },
    { t: '#29b6f6', b: '#fff9c4', s: 'g' },
    { t: '#ff8a65', b: '#ffe0b2', s: 'g' },
    { t: '#5c6bc0', b: '#ffcc80', s: 'g' },
    { t: '#f48fb1', b: '#ffe0b2', s: 'g' },
    { t: '#90a4ae', b: '#eceff1', s: 'b' },
    { t: '#1a237e', b: '#3949ab', s: 'a' },
    { t: '#4fc3f7', b: '#e1f5fe', s: 'g' },
    { t: '#7e57c2', b: '#f8bbd0', s: 'g' },
    { t: '#26a69a', b: '#e0f7fa', s: 'g' }
  ];
  var BP = [
    { w: '#ffcc80', r: '#8d3b2f', a: '#5d4037', g: '#b3e5fc' },
    { w: '#b0bec5', r: '#37474f', a: '#263238', g: '#80deea' },
    { w: '#ef9a9a', r: '#b71c1c', a: '#4e342e', g: '#e1f5fe' },
    { w: '#a5d6a7', r: '#2e7d32', a: '#1b5e20', g: '#e0f7fa' },
    { w: '#ce93d8', r: '#6a1b9a', a: '#4a148c', g: '#b3e5fc' },
    { w: '#fff59d', r: '#f9a825', a: '#795548', g: '#81d4fa' },
    { w: '#90caf9', r: '#1565c0', a: '#0d47a1', g: '#e3f2fd' },
    { w: '#ffab91', r: '#bf360c', a: '#3e2723', g: '#b2ebf2' },
    { w: '#eceff1', r: '#546e7a', a: '#37474f', g: '#4fc3f7' },
    { w: '#bcaaa4', r: '#4e342e', a: '#3e2723', g: '#c5e1a5' }
  ];
  var GR = ['#78909c', '#8d9a9f', '#6d7c85', '#9e9e9e', '#7b8a8b', '#6b7b8c', '#808e95', '#90a4ae', '#757575', '#8a9ba5'];
  var GRASS = ['#66bb6a', '#7cb342', '#81c784', '#9ccc65', '#689f38', '#aed581', '#558b2f', '#8bc34a', '#4caf50', '#7cb86a'];
  var TC = ['#388e3c', '#2e7d32', '#ef6c00', '#f9a825', '#ec407a', '#546e7a', '#1b5e20', '#f48fb1', '#6a1b9a', '#00897b'];
  var SIGN = ['#c62828', '#1565c0', '#2e7d32', '#e65100', '#6a1b9a', '#00838f', '#ad1457', '#4e342e', '#283593', '#558b2f'];
  var GL = ['#4fc3f7', '#29b6f6', '#26c6da', '#64b5f6', '#4dd0e1'];
  var CAR = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#fb8c00', '#8e24aa', '#eceff1'];

  var TURLER = ['bayi', 'otel', 'fabrika', 'hastane', 'okul', 'konut', 'avm', 'market'];
  var ARSA_SIRA = ['konut', 'fabrika', 'otel', 'hastane', 'okul', 'avm', 'market'];
  var ARSA_ETIKET = {
    otel: 'OTEL ARSASI', fabrika: 'FABR\u0130KA ARSASI', hastane: 'HASTANE ARSASI',
    okul: '\u00d6ZEL OKUL ARSASI', avm: 'AVM ARSASI', market: 'H\u0130PERMARKET ARSASI', konut: 'KONUT ARSASI'
  };

  function hashNo(s) {
    s = String(s);
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 10;
  }

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function turBul(isim) {
    var s = String(isim || '').toLocaleLowerCase('tr-TR');
    var k = 'bayi';
    if (s.indexOf('otel') >= 0) k = 'otel';
    else if (s.indexOf('fabrika') >= 0) k = 'fabrika';
    else if (s.indexOf('hastane') >= 0) k = 'hastane';
    else if (s.indexOf('okul') >= 0) k = 'okul';
    else if (s.indexOf('konut') >= 0) k = 'konut';
    else if (s.indexOf('avm') >= 0) k = 'avm';
    else if (s.indexOf('hiper') >= 0 || s.indexOf('market') >= 0) k = 'market';
    return { k: k, arsa: s.indexOf('arsa') >= 0 };
  }

  function tesisSvg(isim, no, boyut) {
    no = ((parseInt(no, 10) || 0) % 10 + 10) % 10;
    var tur = turBul(isim);
    var ti = tur.arsa ? 8 + Math.max(0, ARSA_SIRA.indexOf(tur.k)) : TURLER.indexOf(tur.k);
    var rnd = rng(no * 977 + ti * 131 + 7);
    var sk = SKY[no];
    var bp = BP[(no * 3 + ti) % 10];
    var gece = sk.s === 'a';
    var kucuk = boyut === 'kucuk';
    var wc = gece ? '#ffe082' : bp.g;
    var tc = TC[no];
    var o = [];

    var n = function (v) { return Math.round(v * 10) / 10; };
    var R = function (x, y, w, h, f, ex) { o.push('<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(h) + '" fill="' + f + '"' + (ex || '') + '/>'); };
    var C = function (x, y, r, f, op) { o.push('<circle cx="' + n(x) + '" cy="' + n(y) + '" r="' + n(r) + '" fill="' + f + '"' + (op ? ' opacity="' + op + '"' : '') + '/>'); };
    var E = function (x, y, rx, ry, f, op) { o.push('<ellipse cx="' + n(x) + '" cy="' + n(y) + '" rx="' + n(rx) + '" ry="' + n(ry) + '" fill="' + f + '"' + (op ? ' opacity="' + op + '"' : '') + '/>'); };
    var P = function (pts, f, op) { o.push('<polygon points="' + pts + '" fill="' + f + '"' + (op ? ' opacity="' + op + '"' : '') + '/>'); };
    var T = function (x, y, s, f, txt) { o.push('<text x="' + n(x) + '" y="' + n(y) + '" font-size="' + s + '" font-weight="bold" fill="' + f + '" text-anchor="middle" font-family="Arial,sans-serif">' + txt + '</text>'); };
    var L = function (d, s, w) { o.push('<path d="' + d + '" fill="none" stroke="' + s + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"/>'); };

    var pencere = function (x0, y0, kol, sat, pw, ph, gx, gy) {
      for (var r = 0; r < sat; r++) {
        for (var c = 0; c < kol; c++) {
          var f = wc;
          if (gece && rnd() < 0.3) f = '#37474f';
          R(x0 + c * gx, y0 + r * gy, pw, ph, f);
        }
      }
    };
    var agac = function (x, by, s) {
      R(x - 2 * s, by - 12 * s, 4 * s, 12 * s, '#6d4c41');
      C(x, by - 17 * s, 10 * s, tc);
      C(x - 6 * s, by - 13 * s, 7 * s, tc);
      C(x + 6 * s, by - 13 * s, 7 * s, tc);
    };
    var araba = function (cx, col) {
      R(cx, 92, 28, 8, col, ' rx="2"');
      R(cx + 7, 86, 14, 7, col, ' rx="2"');
      R(cx + 9, 88, 4, 4, '#e3f2fd');
      R(cx + 15, 88, 4, 4, '#e3f2fd');
      C(cx + 6, 100, 3, '#212121');
      C(cx + 22, 100, 3, '#212121');
    };

    /* ---------- gökyüzü ---------- */
    R(0, 0, W, 58, sk.t);
    R(0, 58, W, 24, sk.b);
    var gx0 = rnd() < 0.5 ? 28 : 172;
    if (gece) {
      for (var i = 0; i < 9; i++) C(rnd() * 190 + 5, rnd() * 40 + 4, 0.9, '#fff');
      C(gx0, 20, 8, '#fff9c4');
      C(gx0 + 4, 18, 7, sk.t);
    } else if (sk.s === 'g') {
      var alcak = (no === 2 || no === 3 || no === 4);
      C(gx0, alcak ? 48 : 20, alcak ? 11 : 8, alcak ? '#ffb74d' : '#ffd54f');
    }
    if (!kucuk) {
      var nb = (sk.s === 'b') ? 4 : 1 + Math.floor(rnd() * 2);
      for (var j = 0; j < nb; j++) {
        var bx = 20 + rnd() * 160, by = 12 + rnd() * 20;
        var cl = gece ? '#7986cb' : (sk.s === 'b' ? '#cfd8dc' : '#fff');
        E(bx, by, 14, 5, cl, 0.85);
        E(bx + 9, by - 4, 9, 5, cl, 0.85);
      }
      if (sk.s === 'g' && rnd() < 0.5) {
        var kx = 30 + rnd() * 140, ky = 10 + rnd() * 14;
        L('M' + n(kx) + ' ' + n(ky) + 'q3 -3 6 0q3 -3 6 0', '#37474f', 1);
      }
    }

    /* ---------- zemin (arsa dışı) ---------- */
    if (!tur.arsa) {
      R(0, 82, W, 28, GR[no]);
      R(0, 82, W, 3, '#b0bec5');
      if (!kucuk) { for (var d = 6; d < W; d += 24) R(d, 97, 12, 2, '#f5f5f5'); }
    }

    /* ---------- binalar ---------- */
    function bayi() {
      var w = 92 + Math.floor(rnd() * 36), x = Math.round(100 - w / 2), top = 40 + Math.floor(rnd() * 6), h = 82 - top;
      R(x, top, w, h, bp.w);
      var ns = Math.max(4, Math.round(w / 14)), sw = (w + 8) / ns;
      for (var i = 0; i < ns; i++) R(x - 4 + i * sw, top - 6, sw + 0.5, 12, i % 2 ? '#fff' : bp.r);
      R(78, top - 22, 44, 14, bp.a, ' rx="2"');
      T(100, top - 12, 9, '#fff', 'BAY\u0130');
      R(90, top + 16, 20, h - 16, bp.a);
      R(93, top + 19, 14, 10, wc);
      R(x + 8, top + 16, 24, 14, wc);
      R(x + w - 32, top + 16, 24, 14, wc);
      if (rnd() < 0.6) { R(x + w + 6, 72, 10, 10, '#ffb74d'); R(x + w + 8, 68, 6, 4, '#66bb6a'); }
      return [x - 4, x + w + 20];
    }

    function otel() {
      var kol = 3 + Math.floor(rnd() * 3), sat = 3 + Math.floor(rnd() * 3), gx = 15, gy = (sat === 5 ? 11 : 12);
      var w = kol * gx + 2, h = sat * gy + 3, x = Math.round(100 - w / 2), top = 78 - h;
      R(x, top, w, h, bp.w);
      R(x - 3, top - 4, w + 6, 5, bp.r);
      pencere(x + 4, top + 4, kol, sat, 9, 7, gx, gy);
      R(x - 4, 78, w + 8, 4, bp.a);
      R(86, 66, 28, 4, '#ffb300');
      R(92, 70, 16, 9, bp.a);
      R(82, top - 15, 36, 10, bp.a, ' rx="2"');
      T(100, top - 7, 8, '#ffd54f', '\u2605\u2605\u2605');
      return [x - 4, x + w + 4];
    }

    function fabrika() {
      var w = 100 + Math.floor(rnd() * 40), x = Math.round(100 - w / 2) - 6, top = 52 - Math.floor(rnd() * 6);
      R(x, top, w, 82 - top, bp.w);
      var ns = Math.max(3, Math.floor(w / 26)), sw = w / ns, pts = x + ',' + top;
      for (var i = 0; i < ns; i++) pts += ' ' + n(x + i * sw) + ',' + (top - 12) + ' ' + n(x + (i + 1) * sw) + ',' + top;
      P(pts, bp.r);
      var nc = 1 + (rnd() < 0.5 ? 1 : 0);
      for (var k = 0; k < nc; k++) {
        var cx = x + w - 12 - k * 24;
        R(cx, top - 30, 12, 30, bp.a);
        R(cx - 2, top - 34, 16, 5, '#37474f');
        C(cx + 6, top - 40, 5, '#cfd8dc', 0.85);
        C(cx + 14, top - 46, 6, '#cfd8dc', 0.8);
        C(cx + 24, top - 50, 5, '#cfd8dc', 0.7);
      }
      R(x + 8, top + 8, 26, 74 - top, '#455a64');
      for (var q = 0; q < 3; q++) R(x + 8, top + 14 + q * 7, 26, 1, '#37474f');
      var nw = Math.floor((w - 50) / 22);
      for (var m = 0; m < nw; m++) R(x + 44 + m * 22, top + 10, 14, 9, wc);
      if (rnd() < 0.6) { R(x - 12, 72, 10, 10, '#a1887f'); R(x - 10, 64, 8, 8, '#bcaaa4'); }
      return [x - 12, x + w + 6];
    }

    function hastane() {
      var w = 100 + Math.floor(rnd() * 30), x = Math.round(100 - w / 2), top = 30 + Math.floor(rnd() * 8);
      R(x, top, w, 82 - top, '#f5f5f5', ' stroke="#b0bec5" stroke-width="1.5"');
      R(x, top, w, 6, bp.r);
      R(88, top - 16, 24, 24, '#e53935', ' rx="3"');
      R(97, top - 12, 6, 16, '#fff');
      R(92, top - 7, 16, 6, '#fff');
      var np = Math.floor((w - 40) / 2 / 20);
      for (var r = 0; r < 2; r++) {
        for (var i = 0; i < np; i++) {
          var yy = top + 14 + r * 16;
          R(x + 8 + i * 20, yy, 14, 12, bp.g);
          R(x + w - 22 - i * 20, yy, 14, 12, bp.g);
        }
      }
      R(90, 58, 20, 24, '#26a69a');
      R(99, 58, 2, 24, '#e0f2f1');
      var son = x + w + 4;
      var amb = rnd() < 0.6 && (x + w + 8 + 24) < 196;
      if (amb) {
        var ax = x + w + 8;
        R(ax, 72, 24, 10, '#fff', ' stroke="#90a4ae" stroke-width="1"');
        R(ax, 76, 24, 2, '#e53935');
        C(ax + 5, 82, 3, '#212121');
        C(ax + 19, 82, 3, '#212121');
        son = ax + 24;
      }
      return [x - 4, son];
    }

    function okul() {
      var w = 100 + Math.floor(rnd() * 30), x = Math.round(100 - w / 2), top = 46;
      R(x, top, w, 36, bp.w);
      P((x - 6) + ',' + top + ' 100,' + (top - 24) + ' ' + (x + w + 6) + ',' + top, bp.r);
      C(100, top - 10, 6, '#fff');
      L('M100 ' + (top - 10) + 'V' + (top - 14) + 'M100 ' + (top - 10) + 'H103', '#333', 1);
      R(99.3, top - 36, 1.4, 14, '#546e7a');
      P('100.7,' + (top - 36) + ' 112,' + (top - 32) + ' 100.7,' + (top - 28), ['#e53935', '#1565c0', '#2e7d32'][Math.floor(rnd() * 3)]);
      var np = Math.floor((w - 40) / 2 / 18);
      for (var i = 0; i < np; i++) {
        R(x + 8 + i * 18, top + 10, 12, 12, wc);
        R(x + w - 20 - i * 18, top + 10, 12, 12, wc);
      }
      R(91, 58, 18, 24, bp.a);
      R(87, 80, 26, 2, '#bdbdbd');
      return [x - 6, x + w + 6];
    }

    function konut() {
      var nb = 2 + Math.floor(rnd() * 2), bl = [], tw = 0;
      for (var i = 0; i < nb; i++) {
        var bw = 30 + Math.floor(rnd() * 16), bh = 34 + Math.floor(rnd() * 30);
        bl.push([bw, bh]);
        tw += bw;
      }
      tw += (nb - 1) * 4;
      var x0 = Math.round(100 - tw / 2), start = x0;
      for (var b = 0; b < bl.length; b++) {
        var w2 = bl[b][0], h2 = bl[b][1], top = 82 - h2, col = BP[(no * 3 + ti + b * 4) % 10].w;
        R(x0, top, w2, h2, col);
        R(x0 - 2, top - 4, w2 + 4, 5, bp.r);
        pencere(x0 + 4, top + 5, Math.floor((w2 - 4) / 12), Math.floor((h2 - 16) / 14), 8, 8, 12, 14);
        R(Math.round(x0 + w2 / 2 - 4), 72, 8, 10, bp.a);
        x0 += w2 + 4;
      }
      return [start, x0];
    }

    function avm() {
      var w = 130 + Math.floor(rnd() * 30), x = Math.round(100 - w / 2), top = 40 + Math.floor(rnd() * 6);
      R(x, top, w, 82 - top, '#eceff1');
      R(x + 6, top + 10, w - 12, 82 - top - 20, GL[no % 5]);
      var nm = Math.floor((w - 12) / 28);
      for (var i = 1; i < nm; i++) R(x + 6 + i * (w - 12) / nm - 1, top + 10, 2, 82 - top - 20, '#eceff1');
      P((x + 10) + ',72 ' + (x + 30) + ',' + (top + 10) + ' ' + (x + 44) + ',' + (top + 10) + ' ' + (x + 24) + ',72', '#fff', 0.22);
      R(66, top - 14, 68, 16, bp.r, ' rx="3"');
      T(100, top - 2.5, 11, '#fff', 'AVM');
      R(88, 58, 24, 24, bp.a);
      R(99, 58, 2, 24, '#eceff1');
      R(x + 4, top - 14, 1.2, 14, '#546e7a');
      P((x + 5.2) + ',' + (top - 14) + ' ' + (x + 15) + ',' + (top - 10) + ' ' + (x + 5.2) + ',' + (top - 6), '#e53935');
      return [x - 4, x + w + 4];
    }

    function market() {
      var w = 120 + Math.floor(rnd() * 36), x = Math.round(100 - w / 2), top = 42 + Math.floor(rnd() * 5);
      R(x, top, w, 82 - top, bp.w);
      R(x, top, w, 14, bp.r);
      T(100, top + 10.5, 9, '#fff', 'MARKET');
      R(86, top + 20, 28, 82 - top - 20, bp.g);
      R(99, top + 20, 2, 82 - top - 20, bp.a);
      R(x + 8, top + 20, 30, 14, wc);
      var cx = x + w - 36;
      L('M' + n(cx) + ' 64h24l-4 14h-16z', '#455a64', 2);
      C(cx + 6, 81, 2.5, '#455a64');
      C(cx + 18, 81, 2.5, '#455a64');
      L('M' + n(cx - 5) + ' 60l5 4', '#455a64', 2);
      R(x + w + 6, 48, 4, 34, '#546e7a');
      C(x + w + 8, 44, 9, bp.r);
      T(x + w + 8, 47.5, 10, '#fff', 'M');
      return [x - 4, x + w + 20];
    }

    /* ---------- arsa ---------- */
    function arsa() {
      E(30 + rnd() * 40, 66, 70, 20, GRASS[(no + 2) % 10]);
      E(150 + rnd() * 20, 68, 62, 18, GRASS[(no + 5) % 10]);
      R(0, 68, W, 42, GRASS[no]);
      E(50, 94, 28, 5, '#000', 0.08);
      E(150, 100, 30, 6, '#000', 0.08);
      var ft = (no + ti) % 3, i;
      if (ft === 0) {
        for (i = 10; i < W; i += 26) R(i, 70, 4, 22, '#8d6e63');
        R(4, 75, 192, 3, '#a1887f');
        R(4, 84, 192, 3, '#a1887f');
      } else if (ft === 1) {
        R(0, 74, W, 16, '#b8ada0');
        R(0, 79, W, 1, '#9e9487');
        R(0, 84, W, 1, '#9e9487');
        for (i = 8; i < W; i += 16) { R(i, 74, 1, 5, '#9e9487'); R(i + 8, 79, 1, 5, '#9e9487'); R(i, 84, 1, 6, '#9e9487'); }
      } else {
        for (i = 6; i < W; i += 34) R(i, 68, 3, 24, '#78909c');
        L('M0 74H200', '#cfd8dc', 1);
        L('M0 80H200', '#cfd8dc', 1);
        L('M0 86H200', '#cfd8dc', 1);
      }
      var sg = SIGN[(no * 7 + ti) % 10];
      R(98, 48, 4, 32, '#6d4c41');
      R(52, 16, 96, 32, '#fff', ' stroke="' + sg + '" stroke-width="2" rx="3"');
      T(100, 31, 12, sg, 'SATILIK');
      T(100, 43, 7.5, '#37474f', ARSA_ETIKET[tur.k] || 'ARSA');
      var na = 1 + Math.floor(rnd() * 3), slot = [16, 36, 164, 184];
      for (i = 0; i < na; i++) agac(slot[Math.floor(rnd() * 4)], 96, 0.8 + rnd() * 0.4);
      for (i = 0; i < 6; i++) C(rnd() * 190 + 5, 98 + rnd() * 10, 1.5, ['#fff', '#ffeb3b', '#f06292'][i % 3]);
      if (rnd() < 0.5) { P('120,104 126,104 123,95', '#ff6d00'); P('130,106 136,106 133,97', '#ff6d00'); }
      if (rnd() < 0.5) E(60 + rnd() * 80, 104, 7, 4, '#9e9e9e');
      if (rnd() < 0.5) { R(30, 90, 2, 9, '#ff7043'); R(172, 92, 2, 9, '#ff7043'); }
      return [0, W];
    }

    var ext;
    if (tur.arsa) ext = arsa();
    else if (tur.k === 'otel') ext = otel();
    else if (tur.k === 'fabrika') ext = fabrika();
    else if (tur.k === 'hastane') ext = hastane();
    else if (tur.k === 'okul') ext = okul();
    else if (tur.k === 'konut') ext = konut();
    else if (tur.k === 'avm') ext = avm();
    else if (tur.k === 'market') ext = market();
    else ext = bayi();

    if (!tur.arsa) {
      if (ext[0] > 28 && rnd() < 0.75) agac(ext[0] - 12, 82, 0.8 + rnd() * 0.4);
      if (ext[1] < 172 && rnd() < 0.75) agac(ext[1] + 12, 82, 0.8 + rnd() * 0.4);
      if (!kucuk && rnd() < 0.7) araba(rnd() < 0.5 ? 8 + rnd() * 40 : 140 + rnd() * 30, CAR[Math.floor(rnd() * 7)]);
    }
    if (gece) R(0, 0, W, 110, '#0a0e27', ' opacity="0.22"');

    var ad = String(isim || '').replace(/[<>"&]/g, '');
    var attr = kucuk
      ? 'style="display:block;width:100%;height:100%"'
      : 'width="200" height="110" style="display:block;max-width:100%;height:auto"';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 110" preserveAspectRatio="xMidYMid slice" ' + attr + ' role="img" aria-label="' + ad + '">' + o.join('') + '</svg>';
  }

  var onbellek = {};
  function tesisResmi(isim, no, boyut) {
    var k = isim + '|' + no + '|' + (boyut || '');
    if (!onbellek[k]) onbellek[k] = tesisSvg(isim, no, boyut);
    return onbellek[k];
  }

  /* ---------- yardımcılar ---------- */
  function varlikResimNo(v) {
    if (v && v.resimNo !== undefined && v.resimNo !== null && !isNaN(Number(v.resimNo))) return Number(v.resimNo) % 10;
    return hashNo('v' + (v ? v.id : '0'));
  }

  function kamuResimNo(isim) {
    G._kamuResim = G._kamuResim || {};
    if (G._kamuResim[isim] === undefined || G._kamuResim[isim] === null) G._kamuResim[isim] = Math.floor(Math.random() * 10);
    return G._kamuResim[isim];
  }
  function kamuResimAl(isim) {
    var no = kamuResimNo(isim);
    G._kamuResim[isim] = null;
    return no;
  }

  function projeNoAl(isim) {
    G._secilenProje = G._secilenProje || {};
    var no = G._secilenProje[isim];
    if (no === undefined || no === null) no = Math.floor(Math.random() * 10);
    G._secilenProje[isim] = null;
    return no;
  }
  function projeEtiketi(isim) {
    var s = (G._secilenProje || {})[isim];
    return (s === undefined || s === null) ? 'PROJE SE\u00c7' : 'PROJE: ' + (s + 1) + ' \u2713';
  }

  function resimGoster(isim, no) {
    no = Number(no) || 0;
    modalGoster('<div style="border-radius:8px;overflow:hidden;margin:6px 0 8px 0;">' + tesisResmi(isim, no, 'buyuk') +
      '</div><div style="font-size:12px;color:#444;">' + isim + ' \u2022 Proje ' + (no + 1) + '/10</div>');
  }

  function projeSec(isim) {
    var secili = (G._secilenProje || {})[isim];
    var h = '<div style="margin-bottom:6px;">' + isim + ' i\u00e7in proje se\u00e7in</div>' +
      '<div style="max-height:55vh;overflow-y:auto;display:grid;grid-template-columns:1fr 1fr;gap:6px;">';
    for (var i = 0; i < 10; i++) {
      h += '<div onclick="projeSecildi(\'' + isim + '\',' + i + ')" style="cursor:pointer;border-radius:6px;overflow:hidden;border:2px solid ' +
        (secili === i ? '#ffb300' : '#ccc') + ';"><div>' + tesisResmi(isim, i, 'buyuk') +
        '</div><div style="font-size:11px;padding:2px 0;">Proje ' + (i + 1) + '</div></div>';
    }
    h += '</div>';
    modalGoster(h, '<button onclick="document.getElementById(\'modal-overlay\').style.display=\'none\'" style="background:#6c757d;color:#fff;">KAPAT</button>');
  }

  function projeSecildi(isim, no) {
    G._secilenProje = G._secilenProje || {};
    G._secilenProje[isim] = no;
    document.getElementById('modal-overlay').style.display = 'none';
    if (typeof G.yatirimlariGuncelle === 'function') G.yatirimlariGuncelle();
  }

  G.hashNo = hashNo;
  G.tesisResmi = tesisResmi;
  G.varlikResimNo = varlikResimNo;
  G.kamuResimNo = kamuResimNo;
  G.kamuResimAl = kamuResimAl;
  G.projeNoAl = projeNoAl;
  G.projeEtiketi = projeEtiketi;
  G.resimGoster = resimGoster;
  G.projeSec = projeSec;
  G.projeSecildi = projeSecildi;
})();
