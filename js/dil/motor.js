/* Zirkonik İngilizce motoru (7 Kasım 2026). js/zk-dil.js yükler; sözlük js/dil/en.js (window.ZK_DIL_EN).
 *
 *  ZK_DIL_EN = {
 *    e: { 'Türkçe metin': 'English text', ... },      // birebir eşleşme (boşluklar tek boşluğa indirilir)
 *    p: [ ['^(\\d+) iş$', '$1 jobs'], ... ],           // desen: değişken içeren metinler (sayı, ad, tarih)
 *    y: [ '^[\\d\\s.,:/%$₺€+-]+$', ... ]               // YOKSAY: çevrilmeyecek metinler (kişi adı, kod, marka) — eksik bulucu bunları saymaz
 *  }
 *
 * Çevrilenler: metin düğümleri, placeholder/title/aria-label/alt özniteliği, düğme value'su, <title>, alert/confirm/prompt metinleri, tarih ve sayı biçimi (tr → en).
 * Çevrilmeyenler: script/style/textarea, [data-zk-cevirme] içi (kullanıcının yazdığı içerik). Sonradan eklenen her şey MutationObserver ile anında çevrilir. */
(function (global) {
  'use strict';
  var S = global.ZK_DIL_EN || { e: {}, p: [], y: [] };
  var E = S.e || {};
  var P = (S.p || []).map(function (x) { return [new RegExp(x[0]), x[1]]; });
  var Y = (S.y || []).map(function (r) { return new RegExp(r); });
  var ATLA = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, CODE: 1, PRE: 1 };
  var OZNITELIK = ['placeholder', 'title', 'aria-label', 'alt', 'data-zk-tek-metin'];
  var document_ = global.document;

  function cevirMetin(s) {
    if (s == null || s === '') return s;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(String(s));
    var cekirdek = m[2];
    if (!cekirdek) return s;
    var k = cekirdek.replace(/\s+/g, ' ');
    var r = tek(k);
    // « · », « — », « → » ile birleştirilmiş metin ("Ayşe Kaya · Zirkonyum · 3 diş", bildirim gövdeleri): parçalar ayrı çevrilir, çevrilmeyen (ad, kod) aynen kalır.
    if (r === undefined) r = bol(k, 0);
    return r === undefined ? s : m[1] + r + m[3];
  }
  /** « · », « — », « → » ile birleşik metin: parçalar soldan sağa EN UZUN eşleşmeyle çevrilir (bitişik parçalar birleştirilip denenir: «Çevrimdışı — son görülen veriler gösteriliyor» tek giriş olabilir). Hiç parça çevrilmezse undefined. */
  function bol(k, derin) {
    if (!/( · | — | → )/.test(k)) return undefined;
    var par = k.split(/( · | — | → )/), degisti = false, cev = [], i = 0;
    if (par.length > 25) return undefined;
    while (i < par.length) {
      if (i % 2) { cev.push(par[i]); i++; continue; }
      var bul = false;
      for (var j = par.length - 1 - ((par.length - 1 - i) % 2); j >= i; j -= 2) {
        var c = tek(par.slice(i, j + 1).join(''), derin);
        if (c !== undefined) { cev.push(c); degisti = true; i = j + 1; bul = true; break; }
      }
      if (!bul) { cev.push(par[i]); i++; }
    }
    return degisti ? cev.join('') : undefined;
  }
  function tek(k, derin) {   // derin: özyineleme sayısı (en çok 2 kademe: «Yüklenemedi: Bağlantı: Sunucu …»)
    if (Object.prototype.hasOwnProperty.call(E, k)) return E[k];
    for (var i = 0; i < P.length; i++) {
      var m = P[i][0].exec(k);
      if (!m) continue;
      // Desen sonucu: yakalanan parçalar da (ör. «Yüklenemedi: <sunucu hatası>») sözlükte varsa çevrilir; bir kademe derinlik (sonsuz özyineleme yok).
      return P[i][1].replace(/\$(\d)/g, function (_, n) { var g = m[+n]; if (g == null) return ''; var d = (derin || 0) + 1, c = d > 2 ? undefined : tek(g, d); if (c === undefined && d <= 2) c = bol(g, d); return c === undefined ? g : c; });
    }
    return undefined;
  }
  /** Çok satırlı metin (alert/confirm): satır satır çevirir, satır sonlarını korur. */
  function cevirCokSatir(s) {
    if (s == null) return s;
    var t = String(s), tam = cevirMetin(t);
    if (tam !== t) return tam;
    return t.split('\n').map(function (l) { return cevirMetin(l); }).join('\n');
  }
  global.ZkDil.t = cevirCokSatir;
  global.ZkDil.cevirMetin = cevirMetin;

  function atlanir(dugum) {
    for (var n = dugum.parentNode; n && n.nodeType === 1; n = n.parentNode) {
      if (ATLA[n.nodeName] || (n.hasAttribute && n.hasAttribute('data-zk-cevirme'))) return true;
    }
    return false;
  }
  function metinIsle(t) {
    var v = t.nodeValue;
    if (t._zkEn === v) return;                 // kendi yazdığımız çeviri
    if (!/\S/.test(v) || atlanir(t)) return;
    var c = cevirMetin(v);
    if (c !== v) { t._zkEn = c; t.nodeValue = c; } else { t._zkEn = undefined; }
  }
  function oznitelikIsle(el) {
    if (el.nodeType !== 1 || ATLA[el.nodeName]) return;
    var i, a, v, c;
    for (i = 0; i < OZNITELIK.length; i++) {
      a = OZNITELIK[i]; v = el.getAttribute(a);
      if (v == null || !/\S/.test(v)) continue;
      if (el['_zk_' + a] === v) continue;   // kendi yazdığımız çeviri
      c = cevirMetin(v); if (c !== v) { el['_zk_' + a] = c; el.setAttribute(a, c); }
    }
    if (el.nodeName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type)) {
      v = el.getAttribute('value'); if (v && el._zk_value !== v) { c = cevirMetin(v); if (c !== v) { el._zk_value = c; el.setAttribute('value', c); } }
    }
  }
  function isle(kok) {
    if (!kok) return;
    if (kok.nodeType === 3) { metinIsle(kok); return; }
    if (kok.nodeType !== 1 && kok.nodeType !== 9 && kok.nodeType !== 11) return;
    if (kok.nodeType === 1) oznitelikIsle(kok);
    var w = document_.createTreeWalker(kok, 1 | 4, null), n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) metinIsle(n); else oznitelikIsle(n); }
  }

  // Eşzamanlı toplu işleme: gözlemci geri çağrısı boyamadan ÖNCE çalışır; yine de aynı kare içinde birleştirilir.
  var bekleyen = [], planli = false;
  function planla() {
    if (planli) return; planli = true;
    var f = global.requestAnimationFrame || function (fn) { return setTimeout(fn, 0); };
    // microtask: ilk boyamadan önce biter
    Promise.resolve().then(function () { planli = false; var l = bekleyen; bekleyen = []; for (var i = 0; i < l.length; i++) isle(l[i]); });
  }
  var gozlemci = new MutationObserver(function (kayitlar) {
    for (var i = 0; i < kayitlar.length; i++) {
      var k = kayitlar[i];
      if (k.type === 'childList') { for (var j = 0; j < k.addedNodes.length; j++) bekleyen.push(k.addedNodes[j]); }
      else if (k.type === 'characterData') bekleyen.push(k.target);
      else if (k.type === 'attributes') bekleyen.push(k.target);
    }
    if (bekleyen.length) planla();
  });
  gozlemci.observe(document_.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: OZNITELIK.concat(['value']) });
  document_.addEventListener('DOMContentLoaded', function () { isle(document_.documentElement); });
  isle(document_.documentElement);

  // alert / confirm / prompt
  ['alert', 'confirm', 'prompt'].forEach(function (ad) {
    var asil = global[ad]; if (typeof asil !== 'function') return;
    global[ad] = function (m, v) { return arguments.length > 1 ? asil.call(global, cevirCokSatir(m), v) : asil.call(global, cevirCokSatir(m)); };
  });

  // Tarih ve sayı biçimi: kod 'tr-TR' yazdıysa İngilizce arayüzde İngilizce biçim (gün/ay/yıl; 1,234.56).
  function yerel(l) { return (l === 'tr-TR' || l === 'tr') ? 'en-GB' : l; }
  function sayiYerel(l) { return (l === 'tr-TR' || l === 'tr') ? 'en-US' : l; }
  ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString'].forEach(function (ad) {
    var asil = Date.prototype[ad];
    Date.prototype[ad] = function (l, o) { return asil.call(this, yerel(l), o); };
  });
  var asilSayi = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (l, o) { return asilSayi.call(this, sayiYerel(l), o); };
  var NF = Intl.NumberFormat, DF = Intl.DateTimeFormat;
  Intl.NumberFormat = function (l, o) { return new NF(sayiYerel(l), o); }; Intl.NumberFormat.prototype = NF.prototype; Intl.NumberFormat.supportedLocalesOf = NF.supportedLocalesOf;
  Intl.DateTimeFormat = function (l, o) { return new DF(yerel(l), o); }; Intl.DateTimeFormat.prototype = DF.prototype; Intl.DateTimeFormat.supportedLocalesOf = DF.supportedLocalesOf;

  /** Eksiksizlik denetimi: ekranda hâlâ Türkçe (çevrilmemiş) kalan metin ve öznitelikler. YOKSAY desenlerine uyanlar sayılmaz. */
  global.ZkDil.eksikler = function () {
    var cikti = [], w = document_.createTreeWalker(document_.documentElement, 1 | 4, null), n, i;
    function say(deger, tur, yer) {
      var k = deger.replace(/\s+/g, ' ').trim();
      if (!k || !/[A-Za-zÇĞİŞÖÜçğışöü]/.test(k)) return;
      for (i = 0; i < Y.length; i++) if (Y[i].test(k)) return;
      cikti.push({ tur: tur, metin: k, yer: yer });
    }
    function yol(el) { var p = []; for (var x = el; x && x.nodeType === 1 && p.length < 4; x = x.parentNode) p.push(x.nodeName.toLowerCase() + (x.id ? '#' + x.id : '')); return p.join('<'); }
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) {
        if (n._zkEn === n.nodeValue || !/\S/.test(n.nodeValue) || atlanir(n)) continue;
        if (n.parentNode && n.parentNode.nodeType === 1 && (n.parentNode.hidden || n.parentNode.closest('[hidden]'))) { /* gizli metin de çevrilmeli */ }
        say(n.nodeValue, 'metin', yol(n.parentNode));
      } else if (!ATLA[n.nodeName]) {
        OZNITELIK.forEach(function (a) { var v = n.getAttribute(a); if (v && n['_zk_' + a] !== v && cevirMetin(v) === v) say(v, 'oznitelik:' + a, yol(n)); });
      }
    }
    return cikti;
  };
})(window);
