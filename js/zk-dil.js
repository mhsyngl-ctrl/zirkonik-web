/* Zirkonik dil seçimi (7 Kasım 2026, sahibinin isteği: "uygulamayı İngilizce yapalım").
 *
 * Arayüz metinleri sayfalarda TÜRKÇE yazılıdır (kaynak dil). Kullanıcı ayarlardan «English» seçince bu dosya İngilizce motoru ve sözlüğü yükler
 * (js/dil/motor.js + js/dil/en.js): ekrana gelen her metin sözlükten çevrilir — düğme, kart başlığı, yer tutucu, ipucu, bildirim, onay penceresi,
 * sonradan çizilen liste satırı dahil. Türkçe seçiliyken hiçbir şey yüklenmez (sayfalar eskisi gibi çalışır).
 *
 * Seçim cihazda saklanır (localStorage 'zk_dil'). Seçim YOKSA (8 Kasım 2026, sahibinin kararı) telefonun/tarayıcının dili kullanılır: Türkçe ise Türkçe,
 * Arapça, Almanca ya da başka herhangi bir dil ise İngilizce. Profil ve Giriş'teki dil düğmesi herkese açıktır; seçim otomatik dilin önüne geçer. Dil değişince sayfa yenilenir.
 * <head>'te js/zk-tema.js'ten sonra, gövdeden ÖNCE yüklenmeli (eşzamanlı): ilk boyamada Türkçe görünmesin.
 * Eksiksizlik denetimi: tests/duman/dil-tarama.mjs (İngilizce modda her sayfada çevrilmemiş metin kalmamalı). Plan: docs/dil-plani.md */
(function (global) {
  'use strict';
  var ANAHTAR = 'zk_dil';
  /** Cihazın asıl (ilk tercih) dili: iOS kabuğu telefonun dilini __zkSistemDili ile verir (WKWebView'in navigator.language'ı uygulamanın kendi dil paketine bağlı kalabilir), başka yerde tarayıcı dili. Bilinmiyorsa Türkçe. */
  function sistemDili() {
    var n = global.navigator || {};
    var l = String(global.__zkSistemDili || (n.languages && n.languages[0]) || n.language || '');
    return !l || /^tr([-_]|$)/i.test(l) ? 'tr' : 'en';
  }
  function oku() {
    try { var s = global.localStorage.getItem(ANAHTAR); if (s === 'en' || s === 'tr') return s; } catch (e) {}
    return sistemDili();
  }
  var dil = oku();
  var D = global.ZkDil = {
    dil: dil, en: dil === 'en',
    /** Dil seçenekleri (Profil, Giriş) herkese açık (8 Kasım 2026). false yapılırsa yalnız İngilizce seçmiş cihazlar seçeneği görür. */
    hazir: true,
    /** Dil seç ('tr' | 'en') ve sayfayı yenile. */
    sec: function (yeni) {
      try { global.localStorage.setItem(ANAHTAR, yeni === 'en' ? 'en' : 'tr'); } catch (e) {}
      // Sunucuya da yaz (bildirim dili); en çok 1 sn beklenir, sonra sayfa yenilenir.
      var bitti = false, yenile = function () { if (!bitti) { bitti = true; global.location.reload(); } };
      try { if (global.zkDilEsle) global.zkDilEsle().then(yenile, yenile); } catch (e) {}
      setTimeout(yenile, 1000);
    },
    /** JS içinden üretilen metinler için: İngilizcede çevirir, Türkçede aynen döner. Motor yüklenince değişir. */
    t: function (s) { return s; },
    eksikler: function () { return []; }
  };
  if (dil !== 'en') return;
  global.document.documentElement.setAttribute('lang', 'en');
  // Eşzamanlı yükleme: sözlük ve motor gövde boyanmadan önce hazır olsun.
  global.document.write('<script src="js/dil/en.js"><\/script><script src="js/dil/motor.js"><\/script>');
})(window);
