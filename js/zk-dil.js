/* Zirkonik dil seçimi (7 Kasım 2026, sahibinin isteği: "uygulamayı İngilizce yapalım").
 *
 * Arayüz metinleri sayfalarda TÜRKÇE yazılıdır (kaynak dil). Kullanıcı ayarlardan «English» seçince bu dosya İngilizce motoru ve sözlüğü yükler
 * (js/dil/motor.js + js/dil/en.js): ekrana gelen her metin sözlükten çevrilir — düğme, kart başlığı, yer tutucu, ipucu, bildirim, onay penceresi,
 * sonradan çizilen liste satırı dahil. Türkçe seçiliyken hiçbir şey yüklenmez (sayfalar eskisi gibi çalışır).
 *
 * Seçim cihazda saklanır (localStorage 'zk_dil'); varsayılan Türkçe. Dil değişince sayfa yenilenir.
 * <head>'te js/zk-tema.js'ten sonra, gövdeden ÖNCE yüklenmeli (eşzamanlı): ilk boyamada Türkçe görünmesin.
 * Eksiksizlik denetimi: tests/duman/dil-tarama.mjs (İngilizce modda her sayfada çevrilmemiş metin kalmamalı). Plan: docs/dil-plani.md */
(function (global) {
  'use strict';
  var ANAHTAR = 'zk_dil';
  function oku() { try { return global.localStorage.getItem(ANAHTAR) === 'en' ? 'en' : 'tr'; } catch (e) { return 'tr'; } }
  var dil = oku();
  var D = global.ZkDil = {
    dil: dil, en: dil === 'en',
    /** Dil seçenekleri (Profil, Giriş) çeviri TAMAMLANINCA görünür: true yapmak = herkese açmak. Kapalıyken yalnız İngilizce seçmiş cihazlar (test) seçeneği görür. */
    hazir: false,
    /** Dil seç ('tr' | 'en') ve sayfayı yenile. */
    sec: function (yeni) { try { global.localStorage.setItem(ANAHTAR, yeni === 'en' ? 'en' : 'tr'); } catch (e) {} global.location.reload(); },
    /** JS içinden üretilen metinler için: İngilizcede çevirir, Türkçede aynen döner. Motor yüklenince değişir. */
    t: function (s) { return s; },
    eksikler: function () { return []; }
  };
  if (dil !== 'en') return;
  global.document.documentElement.setAttribute('lang', 'en');
  // Eşzamanlı yükleme: sözlük ve motor gövde boyanmadan önce hazır olsun.
  global.document.write('<script src="js/dil/en.js"><\/script><script src="js/dil/motor.js"><\/script>');
})(window);
