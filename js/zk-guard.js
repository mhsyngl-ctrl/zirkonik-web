/* Sayfa ve menü yetki bekçisi — supabase-client.js'ten SONRA yüklenir.
 *
 * Kurallar:
 *  - yonetici (işveren): her şeyi görür.
 *  - personel (teknisyen/resepsiyon): yalnız Üretim/İşler + izinliyse Stok,
 *    Finans. Ekip, Doktorlar, Laboratuvarlar, Fiyat Listesi, Siparişler ve
 *    Yeni İş yönetici işidir; menüden gizlenir, adres yazılsa bile geri atar.
 *  - doktor: yalnız kendi paneli (doktor-siparis).
 *
 * Not: Bu yalnız arayüz katmanı; asıl güvenlik RLS'tedir (personel işleri
 * oda bazlı görür, iş ekleyemez — bkz. backend/rls_policies.sql).
 */
(function () {
  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase().replace('.html', '') || 'index';
  var PUBLIC = { giris: 1, 'sifre-sifirla': 1, index: 1 };
  if (PUBLIC[page] || !window.ZirkonikAuth || !window.ZirkonikAuth.me) return;

  var ADMIN_PAGES = {
    ekip: 1, laboratuvarlar: 1, 'fiyat-listesi': 1,
    siparisler: 1, 'rol-ve-yetki-detay': 1, 'yeni-giri-i': 1
  };

  ZirkonikAuth.me().then(function (me) {
    if (!me) return; // oturum denetimini sayfanın kendi requireAuth'u yapar
    var p = me.user_permissions || {};
    if (Object.prototype.toString.call(p) === '[object Array]') p = p[0] || {};
    var isAdmin = me.role === 'yonetici';
    var isDoctor = me.role === 'doktor';

    if (isDoctor) {
      if (page !== 'doktor-siparis' && page !== 'profil') location.replace('doktor-siparis.html');
      return;
    }
    if (isAdmin) return;

    // ---- personel ----
    if (page === 'doktor-siparis') { location.replace('retim.html'); return; }
    if (ADMIN_PAGES[page]) { location.replace('retim.html'); return; }
    if (page === 'stok' && !p.can_manage_stock) { location.replace('retim.html'); return; }
    if (page === 'finans' && !p.can_view_finance) { location.replace('retim.html'); return; }
    if (page === 'doktorlar' && !p.can_view_doctors) { location.replace('retim.html'); return; }

    function hideUi() {
      // Alt menü sekmeleri
      var TABS = {
        'Stok': !!p.can_manage_stock,
        'Finans': !!p.can_view_finance,
        'Laboratuvarlar': false,
        'Ekip': false,
        'Doktorlar': !!p.can_view_doctors
      };
      var tabs = document.querySelectorAll('[data-fv-tab]');
      for (var i = 0; i < tabs.length; i++) {
        var t = tabs[i].getAttribute('data-fv-tab');
        if (t in TABS && !TABS[t]) tabs[i].style.display = 'none';
      }
      // Yönetici sayfalarına götüren kısayollar (Yeni İş, Siparişler, Fiyat Listesi)
      var sel = 'a[href*="yeni-giri-i"],[onclick*="yeni-giri-i"],' +
                'a[href*="siparisler"],[onclick*="siparisler"],' +
                'a[href*="fiyat-listesi"],[onclick*="fiyat-listesi"],' +
                'a[href*="laboratuvarlar"],[onclick*="laboratuvarlar"],' +
                'a[href*="ekip"],[onclick*="ekip.html"]';
      if (!p.can_view_finance) sel += ',a[href*="finans"],[onclick*="finans"]';
      if (!p.can_manage_stock) sel += ',a[href*="stok"],[onclick*="stok"]';
      if (!p.can_view_doctors) sel += ',a[href*="doktorlar"],[onclick*="doktorlar"]';
      var links = document.querySelectorAll(sel);
      for (var k = 0; k < links.length; k++) links[k].style.display = 'none';
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hideUi);
    else hideUi();
    // Dinamik içerik (kartlar sonradan çizilir) için kısa aralıklı ikinci geçiş
    setTimeout(hideUi, 800);
    setTimeout(hideUi, 2500);
  }).catch(function () {});
})();
