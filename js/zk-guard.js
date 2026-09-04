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

// ---- Bağlantı durumu şeridi ----
// İnternet yokken ekranlar veri çekemez/kaydedemez; kullanıcı "kaydettim
// sandım" tuzağına düşmesin diye üstte kırmızı bir uyarı gösterilir.
// Çevrimdışı kuyruk YOK — bağlantı gelince şerit kaybolur, sayfa taze
// veriyi normal akışıyla (varsa) kendi yenilemesiyle gösterir.
(function () {
  var el = null;
  function ensureEl() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'zk-offline-banner';
    el.textContent = 'Bağlantı yok — işlemler kaydedilmiyor';
    (document.body || document.documentElement).appendChild(el);
    return el;
  }
  function update() {
    var b = ensureEl();
    if (navigator.onLine === false) {
      requestAnimationFrame(function () { b.classList.add('zk-show'); });
    } else {
      b.classList.remove('zk-show');
    }
  }
  if (document.body) update();
  else document.addEventListener('DOMContentLoaded', update);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
})();

// ---- Yükleme çıkmazı koruması ----
// requireAuth()/me() içindeki oturum yenilemesi ağa gider; internet yoksa
// bu istek fetch'in varsayılan zaman aşımı olmadığı için SESSİZCE sonsuza
// dek asılı kalabilir — sayfa "Yükleniyor…" halinde takılı kalır, kullanıcı
// beyaz/boş bir ekranda mahsur kalmış gibi hisseder. Bu bekçi: (a) sayfa
// açılışında zaten çevrimdışıysa hemen, (b) 8 sn içinde oturum kontrolü
// hiç dönmezse tam ekran "İnternet yok" uyarısı + Tekrar Dene gösterir.
(function () {
  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase().replace('.html', '') || 'index';
  var PUBLIC = { giris: 1, 'sifre-sifirla': 1, index: 1 };
  if (PUBLIC[page] || !window.ZirkonikAuth || !window.ZirkonikAuth.getSession) return;

  var settled = false;
  var overlay = null;

  function showOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'zk-offline-overlay';
    overlay.innerHTML =
      '<div class="zk-offline-box">' +
        '<span class="zk-offline-icon">' +
          '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>' +
        '</span>' +
        '<p class="zk-offline-title">İnternet bağlantısı yok</p>' +
        '<p class="zk-offline-sub">Bağlantınızı kontrol edip tekrar deneyin.</p>' +
        '<button type="button" id="zk-offline-retry">Tekrar Dene</button>' +
      '</div>';
    (document.body || document.documentElement).appendChild(overlay);
    document.getElementById('zk-offline-retry').addEventListener('click', function () {
      location.reload();
    });
  }
  function hideOverlay() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }
  function run() {
    if (navigator.onLine === false) showOverlay();
    var timer = setTimeout(function () { if (!settled) showOverlay(); }, 8000);
    ZirkonikAuth.getSession().then(function () {
      settled = true;
      clearTimeout(timer);
      hideOverlay();
    }).catch(function () {
      settled = true;
      clearTimeout(timer);
      showOverlay();
    });
  }
  if (document.body) run();
  else document.addEventListener('DOMContentLoaded', run);
})();

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
