/*
 * Zirkonik — alt tab çubuğunun ÜZERİNDE yüzen butonları konumlandırır.
 *
 * 26 Eylül 2026, sahibinin iki kez bildirdiği "alt bara kayık" hatası: önce
 * sabit bir piksel sayısı (76px) tab çubuğunun yüksekliğini TAHMİN ediyordu
 * — cihaza/yazı boyutuna göre gerçek yükseklik değişince buton ya çubuğun
 * içine gömülüyor ya da (tahmin düzeltilip yükseklik birebir eşleşince)
 * çubuğa yapışık, boşluksuz duruyordu. Artık tahmin yok: .zk-tabbar'ın
 * GERÇEK yüksekliği ölçülüp üstüne data-zk-above-tabbar'daki boşluk (px)
 * eklenir. Cihaz/yazı boyutu ne olursa olsun doğru kalır.
 *
 * Kullanım: <div id="..." data-zk-above-tabbar="16" class="fixed left-0 ...">
 */
(function () {
  'use strict';
  function konumlandir() {
    var bar = document.querySelector('.zk-tabbar');
    if (!bar) return;
    var yukseklik = bar.getBoundingClientRect().height;
    if (!yukseklik) return;
    document.querySelectorAll('[data-zk-above-tabbar]').forEach(function (el) {
      var bosluk = Number(el.getAttribute('data-zk-above-tabbar')) || 16;
      el.style.bottom = (yukseklik + bosluk) + 'px';
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', konumlandir);
  } else {
    konumlandir();
  }
  window.addEventListener('resize', konumlandir);
  // iconify-icon web bileşeni asenkron render olur, ikon boyu netleşince
  // çubuğun boyu değişebilir — kısa bir gecikmeyle yeniden ölçülür.
  setTimeout(konumlandir, 300);
})();
