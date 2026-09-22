/*
 * Zirkonik — "aşağıya çek, güncelle" (pull to refresh).
 *
 * Kullanım: sayfaya ekle, başka bir şey gerekmez —
 *   <script src="js/zk-ptr.js"></script>
 *
 * Sayfa isterse yumuşak yenileme sağlayabilir: window.zkRefresh tanımlıysa
 * o çağrılır (veri yeniden çekilir, sayfa yeniden yüklenmez). Tanımlı
 * değilse location.reload() yapılır. zkRefresh bir söz (promise) döndürürse
 * gösterge o bitene kadar döner.
 *
 * Yalnız DOKUNMATİK cihazlarda çalışır: masaüstünde parmakla çekme diye bir
 * şey yok, tarayıcının kendi yenilemesi var. Fare olan cihazlarda hiç
 * bağlanmaz ki yanlışlıkla tetiklenmesin.
 */
(function () {
  'use strict';

  // Fare varsa hiç kurulma.
  if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  var ESIK = 70;      // bu kadar çekilince yenileme tetiklenir
  var TAVAN = 110;    // göstergenin inebileceği en fazla mesafe
  var SURUKLEME = 0.5; // parmağın gittiği yolun ne kadarı göstergeye yansır

  var kaydirici = null, gosterge = null;
  var baslangicY = 0, cekiliyor = false, mesafe = 0, calisiyor = false;

  /* Sayfanın kaydırılan kabı. Zirkonik sayfaları içeriği .overflow-y-auto
     bir kapta tutuyor — AMA alt panel (sheet/modal) açıkken kendi İÇİNDE
     de ayrı bir .overflow-y-auto listesi olabiliyor (ör. bir doktorun cari
     geçmişi paneli). Öncesinde her zaman belgedeki İLK .overflow-y-auto
     alınıyordu — panel açıkken bu hep ana sayfanın kendisiydi (o da zaten
     tepede durduğu için her aşağı çekiş yanlışlıkla "yenile" sayılıp TÜM
     sayfa yenileniyordu, panel içindeki liste hiç kaydırılamıyordu).
     Artık dokunulan elemente EN YAKIN .overflow-y-auto aranıyor; yoksa
     eski davranışa (belgedeki ilki) düşülüyor. */
  function kaydiriciBul(hedef) {
    var yakin = hedef && hedef.closest ? hedef.closest('.overflow-y-auto') : null;
    return yakin || document.querySelector('.overflow-y-auto') || document.scrollingElement || document.body;
  }
  function tepedeMi() {
    var k = kaydirici || kaydiriciBul();
    return (k.scrollTop || 0) <= 0;
  }

  function gostergeKur() {
    if (gosterge) return gosterge;
    gosterge = document.createElement('div');
    gosterge.id = 'zk-ptr';
    gosterge.innerHTML = '<span class="zk-ptr-cark"></span><span class="zk-ptr-yazi">Yenilemek için bırakın</span>';
    document.body.appendChild(gosterge);
    return gosterge;
  }

  function ciz(px) {
    var g = gostergeKur();
    g.style.transform = 'translate(-50%,' + px + 'px)';
    g.style.opacity = px > 8 ? '1' : '0';
    g.classList.toggle('zk-ptr-hazir', px >= ESIK);
    var yazi = g.querySelector('.zk-ptr-yazi');
    if (yazi && !calisiyor) yazi.textContent = px >= ESIK ? 'Yenilemek için bırakın' : 'Yenilemek için aşağı çekin';
  }

  function gizle() {
    if (!gosterge) return;
    gosterge.style.transition = 'transform .2s ease, opacity .2s ease';
    ciz(0);
    setTimeout(function () { if (gosterge) gosterge.style.transition = ''; }, 220);
  }

  function yenile() {
    calisiyor = true;
    var g = gostergeKur();
    g.classList.add('zk-ptr-donuyor');
    var yazi = g.querySelector('.zk-ptr-yazi');
    if (yazi) yazi.textContent = 'Yenileniyor…';
    ciz(ESIK);

    function bitir() {
      calisiyor = false;
      g.classList.remove('zk-ptr-donuyor');
      gizle();
    }

    if (typeof window.zkRefresh === 'function') {
      var sonuc;
      try { sonuc = window.zkRefresh(); } catch (e) { bitir(); return; }
      if (sonuc && typeof sonuc.then === 'function') sonuc.then(bitir, bitir);
      // Söz dönmeyen sayfalarda veri çekimi genelde kısa sürüyor; göstergeyi
      // sonsuza kadar açık bırakmamak için kısa bir bekleme sonrası kapatıyoruz.
      else setTimeout(bitir, 700);
    } else {
      location.reload();
    }
  }

  document.addEventListener('touchstart', function (e) {
    if (calisiyor || !e.touches || e.touches.length !== 1) return;
    // Alt-sayfa (seçici) açıkken çekme devre dışı — orası kendi listesini kaydırıyor.
    if (document.querySelector('.zk-picker-overlay')) return;
    kaydirici = kaydiriciBul(e.target);
    if (!tepedeMi()) { kaydirici = null; return; }
    baslangicY = e.touches[0].clientY;
    cekiliyor = true;
    mesafe = 0;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!cekiliyor || calisiyor) return;
    var dy = e.touches[0].clientY - baslangicY;
    if (dy <= 0 || !tepedeMi()) { if (mesafe) { mesafe = 0; ciz(0); } cekiliyor = false; return; }
    mesafe = Math.min(dy * SURUKLEME, TAVAN);
    ciz(mesafe);
    // Parmak aşağı giderken sayfanın kendi "lastik" efekti devreye girmesin.
    if (mesafe > 4 && e.cancelable) e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', function () {
    if (!cekiliyor) return;
    cekiliyor = false;
    if (mesafe >= ESIK && !calisiyor) yenile();
    else gizle();
    mesafe = 0;
    kaydirici = null;
  }, { passive: true });

  window.ZkPtr = { yenile: yenile };
})();
