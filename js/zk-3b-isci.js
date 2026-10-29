/*
 * Zirkonik — 3B dosya işçisi (Web Worker). 15 Ekim 2026.
 *
 * Ana sayfayı dondurmadan STL dosyasını okur ve küçültür.
 *
 *  'stl-sikistir'  : ham STL (ikili ya da metin) → ZKM1 biçimi.
 *                    Tekrarlayan köşe noktaları birleştirilir: 18,5 MB'lık bir
 *                    model kaidesi ~6,7 MB olur. Çizim için gereken her şey kalır.
 *  'zkm1-coz'      : ZKM1 → pozisyon (Float32Array) + indeks (Uint32Array).
 *
 * ZKM1 biçimi (küçük uçlu / little-endian):
 *   "ZKM1" (4 bayt) · uint32 nokta sayısı (nv) · uint32 indeks sayısı (ni)
 *   · float32 × nv×3 pozisyon · uint32 × ni indeks
 */
(function () {
  'use strict';

  // PLY (ağız içi tarayıcıların yaygın çıktısı): ikili (küçük/büyük uçlu) ya da metin. Nokta + yüz listesi
  // üçgen çorbasına açılır (çokgen yüzler yelpaze üçgenlenir), sonrası STL ile aynı yoldan geçer. Renk atılır.
  var PLY_BOY = { char: 1, int8: 1, uchar: 1, uint8: 1, short: 2, int16: 2, ushort: 2, uint16: 2, int: 4, int32: 4, uint: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
  function plyCoz(buf) {
    var bayt = new Uint8Array(buf);
    var son = Math.min(bayt.length, 4096), bas = -1;
    var ust = new TextDecoder('latin1').decode(bayt.subarray(0, son));
    var m = /end_header\r?\n/.exec(ust);
    if (!m) throw new Error('PLY başlığı okunamadı');
    bas = m.index + m[0].length;
    var satirlar = ust.slice(0, m.index).split(/\r?\n/);
    var bicim = '', ogeler = [], g = null;
    satirlar.forEach(function (l) {
      var t = l.trim().split(/\s+/);
      if (t[0] === 'format') bicim = t[1];
      else if (t[0] === 'element') { g = { ad: t[1], n: +t[2], ozellik: [] }; ogeler.push(g); }
      else if (t[0] === 'property' && g) {
        if (t[1] === 'list') g.ozellik.push({ liste: true, say: t[2], tur: t[3], ad: t[4] });
        else g.ozellik.push({ tur: t[1], ad: t[2] });
      }
    });
    var kucuk = bicim === 'binary_little_endian', ikili = kucuk || bicim === 'binary_big_endian';
    if (!ikili && bicim !== 'ascii') throw new Error('PLY biçimi desteklenmiyor');
    var nok = null, yuzler = [];
    var dv = new DataView(buf), o = bas;
    var metin = null, jt = null, ji = 0;
    if (!ikili) { metin = new TextDecoder('utf-8').decode(bayt.subarray(bas)).split(/\s+/).filter(Boolean); }
    function oku(tur) {
      if (!ikili) return +metin[ji++];
      var v;
      switch (tur) {
        case 'char': case 'int8': v = dv.getInt8(o); o += 1; break;
        case 'uchar': case 'uint8': v = dv.getUint8(o); o += 1; break;
        case 'short': case 'int16': v = dv.getInt16(o, kucuk); o += 2; break;
        case 'ushort': case 'uint16': v = dv.getUint16(o, kucuk); o += 2; break;
        case 'int': case 'int32': v = dv.getInt32(o, kucuk); o += 4; break;
        case 'uint': case 'uint32': v = dv.getUint32(o, kucuk); o += 4; break;
        case 'float': case 'float32': v = dv.getFloat32(o, kucuk); o += 4; break;
        case 'double': case 'float64': v = dv.getFloat64(o, kucuk); o += 8; break;
        default: throw new Error('PLY alan türü tanınmıyor');
      }
      if (o > buf.byteLength) throw new Error('PLY dosyası eksik');
      return v;
    }
    ogeler.forEach(function (e) {
      if (e.ad === 'vertex') {
        nok = new Float32Array(e.n * 3);
        for (var i = 0; i < e.n; i++) {
          for (var k = 0; k < e.ozellik.length; k++) {
            var p = e.ozellik[k];
            if (p.liste) { var c = oku(p.say); for (var q = 0; q < c; q++) oku(p.tur); continue; }
            var v = oku(p.tur);
            if (p.ad === 'x') nok[i * 3] = v; else if (p.ad === 'y') nok[i * 3 + 1] = v; else if (p.ad === 'z') nok[i * 3 + 2] = v;
          }
        }
      } else if (e.ad === 'face') {
        for (var f = 0; f < e.n; f++) {
          for (var k2 = 0; k2 < e.ozellik.length; k2++) {
            var p2 = e.ozellik[k2];
            if (p2.liste) {
              var say = oku(p2.say), ind = [];
              for (var q2 = 0; q2 < say; q2++) ind.push(oku(p2.tur));
              if (p2.ad === 'vertex_indices' || p2.ad === 'vertex_index') for (var t = 1; t + 1 < ind.length; t++) yuzler.push(ind[0], ind[t], ind[t + 1]);
            } else oku(p2.tur);
          }
        }
      } else {
        // bilinmeyen öğe (kenar vb.) atlanır: sabit boyutlu ikili ise ilerle
        if (!ikili) { for (var a = 0; a < e.n; a++) e.ozellik.forEach(function (p3) { if (p3.liste) { var c3 = oku(p3.say); for (var z = 0; z < c3; z++) oku(p3.tur); } else oku(p3.tur); }); }
        else for (var b = 0; b < e.n; b++) e.ozellik.forEach(function (p4) { if (p4.liste) { var c4 = oku(p4.say); for (var y = 0; y < c4; y++) oku(p4.tur); } else oku(p4.tur); });
      }
    });
    if (!nok || !yuzler.length) throw new Error('PLY dosyasında yüzey bulunamadı');
    var nv = nok.length / 3, poz = new Float32Array(yuzler.length * 3);
    for (var j = 0; j < yuzler.length; j++) {
      var ix = yuzler[j];
      if (ix < 0 || ix >= nv) throw new Error('PLY yüz listesi bozuk');
      poz[j * 3] = nok[ix * 3]; poz[j * 3 + 1] = nok[ix * 3 + 1]; poz[j * 3 + 2] = nok[ix * 3 + 2];
    }
    return poz;
  }

  function stlCoz(buf) {
    var bayt = new Uint8Array(buf);
    if (bayt.length > 4 && bayt[0] === 0x70 && bayt[1] === 0x6C && bayt[2] === 0x79 && (bayt[3] === 0x0A || bayt[3] === 0x0D)) return plyCoz(buf); // "ply"
    // İkili STL: 80 bayt başlık + uint32 üçgen sayısı + 50 bayt/üçgen. Bazı tarayıcı
    // yazılımları dosya sonuna fazladan bayt ekler; "en az" ölçüsü kabul edilir (Orion bulgusu).
    if (buf.byteLength >= 84) {
      var dv = new DataView(buf);
      var n = dv.getUint32(80, true);
      if (n > 0 && 84 + n * 50 <= buf.byteLength) return ikiliCoz(dv, n);
    }
    // Metin STL: isteğe bağlı BOM, sonra "solid" ve içinde "facet" geçer.
    var bas = 0;
    if (bayt.length >= 3 && bayt[0] === 0xEF && bayt[1] === 0xBB && bayt[2] === 0xBF) bas = 3;
    var ilk = '';
    for (var i = bas; i < Math.min(bas + 5, bayt.length); i++) ilk += String.fromCharCode(bayt[i]);
    if (ilk.toLowerCase() === 'solid') {
      var on = new TextDecoder('utf-8').decode(bayt.subarray(bas, Math.min(bayt.length, bas + 4096)));
      if (/facet/i.test(on) || bayt.length <= 4096) return metinCoz(buf);
    }
    throw new Error('Dosya geçerli bir STL değil');
  }

  function ikiliCoz(dv, n) {
    var poz = new Float32Array(n * 9);
    var k = 0, o = 84;
    for (var t = 0; t < n; t++) {
      o += 12; // yüzey normali atlanır, çizimde yeniden hesaplanır
      for (var v = 0; v < 9; v++) { poz[k++] = dv.getFloat32(o, true); o += 4; }
      o += 2;  // öznitelik bayt sayısı
    }
    return poz;
  }

  function metinCoz(buf) {
    var metin = new TextDecoder('utf-8').decode(buf);
    var re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
    var liste = [], m;
    while ((m = re.exec(metin))) { liste.push(+m[1], +m[2], +m[3]); }
    if (!liste.length || liste.length % 9 !== 0) throw new Error('Metin STL okunamadı');
    return new Float32Array(liste);
  }

  // Tekrarlayan noktaları birleştirir. Anahtar: üç float32'nin ham bit deseni (-0 → +0).
  // Sayısal açık adresli karma tablo: metin anahtarlı Map'e göre ~11 kat hızlı ve çok daha
  // az bellek (Orion ölçümü, 15 Ekim 2026) — iPhone'da işçi olmadığından ana sayfada koşuyor.
  function sikistir(poz) {
    var nv3 = poz.length;          // 9 × üçgen
    var noktaSayisi = nv3 / 3;
    var u32 = new Uint32Array(poz.buffer, poz.byteOffset, nv3);
    var indeks = new Uint32Array(noktaSayisi);
    var tekil = new Float32Array(nv3); // en kötü durumda hepsi tekil
    var tekilU = new Uint32Array(tekil.buffer);
    var kapasite = 1; while (kapasite < noktaSayisi * 2) kapasite <<= 1;
    var tablo = new Int32Array(kapasite); tablo.fill(-1);
    var maske = kapasite - 1;
    var nv = 0;
    var minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (var i = 0, j = 0; i < nv3; i += 3, j++) {
      var a = u32[i], b = u32[i + 1], c = u32[i + 2];
      if (a === 0x80000000) a = 0; if (b === 0x80000000) b = 0; if (c === 0x80000000) c = 0;
      var h = (Math.imul(a, 0x9E3779B1) ^ Math.imul(b, 0x85EBCA77) ^ Math.imul(c, 0xC2B2AE3D)) >>> 0;
      h = (h ^ (h >>> 15)) & maske;
      var id;
      for (;;) {
        id = tablo[h];
        if (id === -1) {
          id = nv++;
          tablo[h] = id;
          tekilU[id * 3] = a; tekilU[id * 3 + 1] = b; tekilU[id * 3 + 2] = c;
          var x = tekil[id * 3], y = tekil[id * 3 + 1], z = tekil[id * 3 + 2];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
          break;
        }
        if (tekilU[id * 3] === a && tekilU[id * 3 + 1] === b && tekilU[id * 3 + 2] === c) break;
        h = (h + 1) & maske;
      }
      indeks[j] = id;
    }
    var ni = indeks.length;
    var cikti = new ArrayBuffer(12 + nv * 12 + ni * 4);
    var u8 = new Uint8Array(cikti);
    u8[0] = 90; u8[1] = 75; u8[2] = 77; u8[3] = 49; // "ZKM1"
    var dv = new DataView(cikti);
    dv.setUint32(4, nv, true);
    dv.setUint32(8, ni, true);
    new Float32Array(cikti, 12, nv * 3).set(tekil.subarray(0, nv * 3));
    new Uint32Array(cikti, 12 + nv * 12, ni).set(indeks);
    return {
      zkm1: cikti, nokta: nv, ucgen: ni / 3,
      kutu: [maxX - minX, maxY - minY, maxZ - minZ],
      merkez: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]
    };
  }

  function zkm1Coz(buf) {
    var u8 = new Uint8Array(buf);
    if (buf.byteLength < 12 || u8[0] !== 90 || u8[1] !== 75 || u8[2] !== 77 || u8[3] !== 49) throw new Error('ZKM1 başlığı yok');
    var dv = new DataView(buf);
    var nv = dv.getUint32(4, true), ni = dv.getUint32(8, true);
    if (12 + nv * 12 + ni * 4 !== buf.byteLength) throw new Error('ZKM1 boyutu tutmuyor');
    // Kopyalanır ki ana sayfaya aktarırken hizalama sorunu çıkmasın.
    var poz = new Float32Array(buf.slice(12, 12 + nv * 12));
    var idx = new Uint32Array(buf.slice(12 + nv * 12));
    return { poz: poz, idx: idx, nokta: nv, ucgen: ni / 3 };
  }

  // Tek giriş: hem işçide hem (işçi çalışmazsa) ana sayfada aynı kod kullanılır.
  function calistir(tur, buffer) {
    if (tur === 'stl-sikistir') {
      var s = sikistir(stlCoz(buffer));
      return { zkm1: s.zkm1, nokta: s.nokta, ucgen: s.ucgen, kutu: s.kutu, merkez: s.merkez, _aktar: [s.zkm1] };
    }
    if (tur === 'zkm1-coz') {
      var c = zkm1Coz(buffer);
      return { poz: c.poz, idx: c.idx, nokta: c.nokta, ucgen: c.ucgen, _aktar: [c.poz.buffer, c.idx.buffer] };
    }
    if (tur === 'stl-coz') {
      // Sıkıştırılmamış STL'i doğrudan çizmek için (eski kayıt / sıkıştırma başarısız)
      var c2 = zkm1Coz(sikistir(stlCoz(buffer)).zkm1);
      return { poz: c2.poz, idx: c2.idx, nokta: c2.nokta, ucgen: c2.ucgen, _aktar: [c2.poz.buffer, c2.idx.buffer] };
    }
    throw new Error('Bilinmeyen işçi komutu');
  }

  var kok = typeof self !== 'undefined' ? self : this;
  kok.ZK3BIsci = { calistir: calistir, stlCoz: stlCoz, plyCoz: plyCoz, sikistir: sikistir, zkm1Coz: zkm1Coz };

  // Yalnız gerçek Web Worker içinde mesaj dinlenir. iOS kabuğu sayfaları file:// ile
  // açıyor ve orada Worker yasak; o zaman bu dosya düz <script> olarak yüklenir ve
  // zk-3b.js ZK3BIsci.calistir'ı ana sayfada çağırır (15 Ekim 2026 telefon hatası).
  if (typeof importScripts === 'function') {
    self.onmessage = function (e) {
      var m = e.data || {};
      try {
        var r = calistir(m.tur, m.buffer);
        var aktar = r._aktar; delete r._aktar;
        r.id = m.id; r.ok = true;
        self.postMessage(r, aktar);
      } catch (err) {
        self.postMessage({ id: m.id, ok: false, hata: (err && err.message) || String(err) });
      }
    };
  }
})();
