/*
 * Zirkonik — sekmeye/uygulamaya dönünce veriyi tazele.
 *
 * Sorun: sayfalar veriyi YALNIZ açılışta çekiyordu. Başka biri iş ekleyince,
 * bir tahsilat girince ya da sipariş onaylanınca ekranda hiçbir şey değişmiyor;
 * kullanıcı "sayfayı yenilemem lazım" diyordu. Ayrıca uygulama uzun süre arka
 * planda kalınca Supabase oturum jetonunun süresi doluyor ve dönüşteki ilk
 * sorgu jeton yenilenene kadar bekliyor — ekran "donmuş" gibi görünüyor.
 *
 * Çözüm: sayfa tekrar görünür olduğunda, yeterince uzun süre gizli kaldıysa
 * sayfanın kendi window.zkRefresh'i çağrılır (veri tazelenir, sayfa yeniden
 * YÜKLENMEZ — form doldurmakta olan kullanıcının yazdıkları gitmez).
 *
 * zkRefresh tanımlamayan sayfalarda hiçbir şey yapılmaz. Sayfa yeniden
 * yükleme burada BİLEREK yok: giriş formu, yeni iş girişi gibi ekranlarda
 * kullanıcının girdiği veriyi silmek kabul edilemez.
 */
(function () {
  'use strict';

  // Bu süreden kısa gizlenmelerde tazeleme yok: sekmeler arası hızlı geçişte
  // ya da klavye açılıp kapanınca boşuna sorgu atmayalım.
  var ESIK_MS = 30000;

  var gizlenmeAni = 0;
  var calisiyor = false;

  function tazele(sebep) {
    if (calisiyor) return;
    if (typeof window.zkRefresh !== 'function') return;
    calisiyor = true;
    var bitir = function () { calisiyor = false; };
    var sonuc;
    try { sonuc = window.zkRefresh(sebep); } catch (e) { bitir(); return; }
    if (sonuc && typeof sonuc.then === 'function') sonuc.then(bitir, bitir);
    else bitir();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { gizlenmeAni = Date.now(); return; }
    if (gizlenmeAni && Date.now() - gizlenmeAni >= ESIK_MS) tazele('geri-donus');
    gizlenmeAni = 0;
  });

  // Geri/ileri gezinmede tarayıcı sayfayı önbellekten diriltirse (bfcache)
  // script yeniden çalışmaz; veri o anki haliyle eski kalır.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) tazele('bfcache');
  });

  // Bağlantı geri geldiğinde: kopukken yapılan sorgular boş dönmüş olabilir.
  window.addEventListener('online', function () { tazele('cevrimici'); });

  window.ZkYenile = { tazele: tazele };
})();
