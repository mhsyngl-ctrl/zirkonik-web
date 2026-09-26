/*
 * Zirkonik — açık tema (sabit).
 *
 * 26 Eylül 2026, sahibinin kararı: koyu tema seçeneği tamamen kaldırıldı —
 * "Koyu/Açık" butonları Ayarlar'da ölü/anlamsız duruyordu, uygulama hep
 * beyaz kalsın istendi. Bu dosya artık bir seçim sunmuyor, yalnızca
 * data-theme="light"i koşulsuz uyguluyor.
 *
 * Renk jetonları her sayfanın kendi <style> bloğunda tanımlı (koyu, tarihi
 * varsayılan); açık palet css/zk-utils.css içinde :root[data-theme="light"]
 * altında duruyor ve daha yüksek özgüllükte olduğu için sayfa içi :root'u
 * eziyor. Bu script o attribute'u yazan TEK yer — silinirse tüm sayfalar
 * sayfa içi (koyu) varsayılana döner.
 *
 * FOUC (açılışta bir an koyu görünmesi) olmasın diye <head> içinde, CSS'ten
 * sonra ve body'den ÖNCE yüklenmeli.
 */
(function () {
  'use strict';
  document.documentElement.setAttribute('data-theme', 'light');
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#FFFFFF');
})();
