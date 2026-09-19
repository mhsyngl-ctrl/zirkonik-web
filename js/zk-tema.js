/*
 * Zirkonik — koyu / açık tema.
 *
 * Renk jetonları her sayfanın kendi <style> bloğunda tanımlı. Açık palet
 * css/zk-utils.css içinde :root[data-theme="light"] altında duruyor; attribute
 * seçici daha yüksek özgüllükte olduğu için sayfa içi :root'u eziyor ve 19
 * sayfanın tamamı tek yerden dönüyor.
 *
 * Bu dosya yalnızca tercihi saklar ve <html data-theme> değerini yazar.
 * FOUC (açılışta bir an koyu görünmesi) olmasın diye <head> içinde, CSS'ten
 * sonra ve body'den ÖNCE yüklenmeli.
 */
(function () {
  'use strict';

  var ANAHTAR = 'zk-tema';

  function oku() {
    try { return localStorage.getItem(ANAHTAR); } catch (e) { return null; }
  }
  function yaz(v) {
    try { localStorage.setItem(ANAHTAR, v); } catch (e) {}
  }

  function uygula(tema) {
    document.documentElement.setAttribute('data-theme', tema);
    // iOS durum çubuğu ve tarayıcı arayüzü de temaya uysun.
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', tema === 'light' ? '#FFFFFF' : '#0E1013');
  }

  /* 2026-09-19: varsayilan ACIK oldu (kullanici karari — "uygulamayi tamamen
     beyaza dondurelim"). Daha once kaydetmis kullanicinin tercihi korunuyor;
     yalnizca hic secim yapmamis olana acik geliyor. Koyu tema duruyor,
     Ayarlar > Gorunum'den secilebiliyor. */
  var mevcut = oku() || 'light';
  uygula(mevcut);

  function degistir(tema) {
    mevcut = (tema === 'light' || tema === 'dark') ? tema : (mevcut === 'light' ? 'dark' : 'light');
    yaz(mevcut);
    uygula(mevcut);
    return mevcut;
  }

  /* 2026-09-19: önce her ekranın sağ üstünde yüzen bir anahtar vardı; ana
     ekranda durması hoş olmadı. Seçim artık yalnızca Ayarlar ekranında
     (profil.html > Görünüm). Bu dosya sadece tercihi okuyup uyguluyor —
     her sayfada çalışması gerekiyor ki açılışta doğru tema gelsin. */
  window.ZkTema = { degistir: degistir, mevcut: function () { return mevcut; } };
})();
