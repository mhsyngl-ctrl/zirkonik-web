/* Sayfa ve menü yetki bekçisi — supabase-client.js'ten SONRA yüklenir.
 *
 * Kurallar:
 *  - yonetici (İşveren/Yönetici pozisyonu): her şeyi görür.
 *  - personel (Teknisyen/Yardımcı Teknisyen): yalnız Üretim/İşler +
 *    izinliyse Stok, Finans, Doktorlar (salt-görüntüleme). Ekip,
 *    Laboratuvarlar, Fiyat Listesi, Siparişler ve Yeni İş yönetici işidir.
 *  - doktor: yalnız kendi paneli (+ bildirimler, profil).
 *
 * Menü gizleme iki aşamalı: son bilinen yetkiler localStorage'da tutulur (girişte de yazılır)
 * ve sayfa açılır açılmaz SENKRON uygulanır (geri tuşunda menü "gelip
 * gitmesin"); ardından sunucudan taze yetki gelince yeniden uygulanır.
 * Asıl güvenlik RLS'tedir (personel işleri oda bazlı görür, iş ekleyemez).
 */
(function () {
  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase().replace('.html', '') || 'index';
  var PUBLIC = { giris: 1, 'sifre-sifirla': 1, index: 1 };
  if (PUBLIC[page] || !window.ZirkonikAuth || !window.ZirkonikAuth.me) return;

  var ADMIN_PAGES = {
    ekip: 1, laboratuvarlar: 1, 'fiyat-listesi': 1,
    siparisler: 1, 'rol-ve-yetki-detay': 1, 'yeni-giri-i': 1
  };
  var DOCTOR_PAGES = { 'doktor-siparis': 1, profil: 1, bildirimler: 1 };

  function enforce(role, p) {
    if (role === 'doktor') {
      if (!DOCTOR_PAGES[page]) { location.replace('doktor-siparis.html'); return true; }
      return false;
    }
    if (role !== 'personel') return false; // yonetici: serbest
    if (page === 'doktor-siparis') { location.replace('retim.html'); return true; }
    if (ADMIN_PAGES[page]) { location.replace('retim.html'); return true; }
    if (page === 'stok' && !p.can_manage_stock) { location.replace('retim.html'); return true; }
    if (page === 'finans' && !p.can_view_finance) { location.replace('retim.html'); return true; }
    if (page === 'doktorlar' && !p.can_view_doctors) { location.replace('retim.html'); return true; }
    return false;
  }

  function hideUi(p) {
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
    // Yönetici sayfalarına götüren kısayollar
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

  function applyStaff(p) {
    function run() { hideUi(p); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
    // Dinamik içerik (kartlar sonradan çizilir) için ikinci geçiş
    setTimeout(run, 800);
    setTimeout(run, 2500);
  }

  // 1) SENKRON: son bilinen yetkilerle anında uygula (titreme olmasın)
  var cached = null;
  try { cached = JSON.parse(localStorage.getItem('zk-guard') || 'null'); } catch (e) {}
  if (cached) {
    if (enforce(cached.role, cached)) return;
    if (cached.role === 'personel') applyStaff(cached);
  }

  // 2) ASENKRON: taze yetkiyle doğrula ve önbelleği tazele
  ZirkonikAuth.me().then(function (me) {
    if (!me) return; // oturum denetimini sayfanın kendi requireAuth'u yapar
    var p = me.user_permissions || {};
    if (Object.prototype.toString.call(p) === '[object Array]') p = p[0] || {};
    var snap = {
      role: me.role,
      can_manage_stock: !!p.can_manage_stock,
      can_view_finance: !!p.can_view_finance,
      can_view_doctors: !!p.can_view_doctors
    };
    try { localStorage.setItem('zk-guard', JSON.stringify(snap)); } catch (e) {}
    if (enforce(snap.role, snap)) return;
    if (snap.role === 'personel') applyStaff(snap);
  }).catch(function () {});
})();
