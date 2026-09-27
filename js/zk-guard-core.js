/* Yetki kurallarının TEK kaynağı — hem <head>'teki erken koruma
 * (js/zk-erken-koruma.js) hem de sayfa altındaki asıl bekçi (js/zk-guard.js)
 * buradaki aynı fonksiyonları çağırır. Kural değişince yalnız burası
 * güncellenir, iki yerde ayrı ayrı tutulup birbirinden sapma riski olmaz.
 *
 * Bağımlılığı yoktur (ZirkonikAuth/Supabase gerekmez) — yalnız localStorage
 * ve document kullanır, bu yüzden hiçbir şey boyanmadan ÖNCE, <head>'in en
 * başında güvenle çalışabilir.
 */
(function () {
  var PUBLIC = { giris: 1, 'sifre-sifirla': 1, index: 1, 'hesap-kilitli': 1 };

  // Bunlar hiçbir izinle personele açılmaz — organizasyon/kadro ayarı, yönetici işi.
  var ADMIN_PAGES = { ekip: 1, laboratuvarlar: 1, 'rol-ve-yetki-detay': 1 };
  var DOCTOR_PAGES = { 'doktor-siparis': 1, profil: 1, bildirimler: 1 };
  // 25 Eylül 2026, sahibinin kuralı: bu iki pozisyon uygulamanın yalnız kendi
  // dar köşesini görür — aşağıdaki her sayfa-bazlı izin (can_manage_orders vb.)
  // hâlâ ayrıca uygulanır, bu yalnız dıştaki sınırı çizer.
  var PROSPECT_ONLY_PAGES = { 'aday-havuzu': 1, profil: 1, bildirimler: 1, izinlerim: 1, kilavuz: 1 };
  // 25 Eylül 2026: Yeni İş Oluştur artık admin-sabit değil — resepsiyonun
  // can_manage_orders yetkisiyle açılabilir (sayfa içinde fiyat kutusu gizlenir).
  var RECEPTION_PAGES = { retim: 1, isler: 1, detay: 1, siparisler: 1, doktorlar: 1, 'yeni-giri-i': 1, profil: 1, bildirimler: 1, izinlerim: 1, kilavuz: 1 };

  function page() {
    return (location.pathname.split('/').pop() || 'index.html').toLowerCase().replace('.html', '') || 'index';
  }

  function enforce(role, p) {
    var pg = page();
    if (role === 'doktor') {
      if (!DOCTOR_PAGES[pg]) { location.replace('doktor-siparis.html'); return true; }
      return false;
    }
    if (role !== 'personel') return false; // yonetici: serbest
    if (p.position === 'Satış Pazarlama Sorumlusu' && !PROSPECT_ONLY_PAGES[pg]) {
      location.replace('aday-havuzu.html'); return true;
    }
    if (p.position === 'Resepsiyon Sorumlusu' && !RECEPTION_PAGES[pg]) {
      location.replace('retim.html'); return true;
    }
    if (pg === 'doktor-siparis') { location.replace('retim.html'); return true; }
    if (ADMIN_PAGES[pg]) { location.replace('retim.html'); return true; }
    if (pg === 'stok' && !p.can_manage_stock) { location.replace('retim.html'); return true; }
    // Finans/Ciro: varsayılan kapalı, "Finans yetkisi" kutusuyla açılır (25 Eylül 2026 —
    // sahibi kutuyu gerçekten işlevli olsun istedi, önceki sabit kapalı kural kaldırıldı).
    if ((pg === 'finans' || pg === 'ciro') && !p.can_view_finance) { location.replace('retim.html'); return true; }
    if (pg === 'doktorlar' && !p.can_view_doctors) { location.replace('retim.html'); return true; }
    // Siparişler + Yeni İş Oluştur: resepsiyonun işi (can_manage_orders).
    if ((pg === 'siparisler' || pg === 'yeni-giri-i') && !p.can_manage_orders) { location.replace('retim.html'); return true; }
    // Fiyat Listesi: sahibinin kuralı (24 Eylül 2026) — fiyatları yalnız
    // yönetici/işveren görür, hiçbir personel izniyle açılamaz.
    if (pg === 'fiyat-listesi') { location.replace('retim.html'); return true; }
    // Aday Havuzu: doktor kazanım süreci — 24 Eylül 2026.
    if (pg === 'aday-havuzu' && !p.can_manage_prospects) { location.replace('retim.html'); return true; }
    return false;
  }

  function hideUi(p) {
    // Alt menü sekmeleri
    var TABS = {
      // 26 Eylül 2026: Stok özelliği herkesten (yönetici dahil) kapalı
      // (zk-guard.js'teki koşulsuz yönlendirme) — sekme de artık hep gizli.
      'Stok': false,
      'Finans': !!p.can_view_finance, // 25 Eylül 2026: "Finans yetkisi" kutusuna bağlı.
      'Laboratuvarlar': false,
      'Ekip': false,
      'Doktorlar': !!p.can_view_doctors
    };
    var tabs = document.querySelectorAll('[data-fv-tab]');
    var gorunen = 0;
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i].getAttribute('data-fv-tab');
      if (t in TABS && !TABS[t]) tabs[i].style.display = 'none';
      else gorunen++;
    }

    // 25 Eylül 2026, sahibinin kuralı: sıradan teknisyen ana ekranda "bugünkü
    // görünüm" istatistik şeridini ve tamamlanan/teslimat bilgisini görmez —
    // yalnız kendi teslim alınacak işleri + yetkili odaların arı kovanı
    // (üretim panosu). Resepsiyon Sorumlusu bunun dışında: onun işi durum/
    // teslimat takibi olduğu için istatistik şeridini ve tamamlananı görür.
    if (p.position !== 'Resepsiyon Sorumlusu') {
      // "Bugünün görünümü" başlığı dahil tüm bölüm (yalnız kart ızgarası değil).
      var deck = document.getElementById('today-overview-section') || document.querySelector('.zk-stats-deck');
      if (deck) deck.style.display = 'none';
      var completedTab = document.getElementById('board-tab-completed') || document.getElementById('tab-completed');
      if (completedTab) completedTab.style.display = 'none';
      var weekly = document.getElementById('weekly-distribution');
      if (weekly) {
        var weeklySection = weekly.closest('section');
        if (weeklySection) weeklySection.style.display = 'none';
      }
    }
    /* 2026-09-19: sekme gizlenince alt menu sola KAYIYORDU. Bazi ekranlarda
       menu "grid-cols-6" ile sabit alti sutun; display:none olan sekme
       izgaradan tamamen cikinca kalanlar ilk sutunlara doluyor ve sagda bos
       sutun kaliyordu. Sutun sayisini gorunen sekmeye esitliyoruz. */
    if (gorunen && gorunen !== tabs.length) {
      var kap = document.querySelector('[data-fv-tabbar]');
      if (kap) {
        // Izgara ya nav'in kendisinde ya da icindeki sarmalayicida.
        var izgara = kap.querySelector('.zk-tabbar-inner') ||
                     (/grid/.test(kap.className) ? kap : kap.querySelector('.grid'));
        if (izgara) izgara.style.gridTemplateColumns = 'repeat(' + gorunen + ', minmax(0, 1fr))';
      }
    }
    // Yönetici sayfalarına götüren kısayollar
    var sel = 'a[href*="laboratuvarlar"],[onclick*="laboratuvarlar"],' +
              'a[href*="ekip"],[onclick*="ekip.html"]';
    // Finans/Ciro: "Finans yetkisi" kutusuna bağlı (25 Eylül 2026).
    if (!p.can_view_finance) sel += ',a[href*="finans"],[onclick*="finans"],a[href*="ciro"],[onclick*="ciro"]';
    if (!p.can_manage_stock) sel += ',a[href*="stok"],[onclick*="stok"]';
    if (!p.can_view_doctors) sel += ',a[href*="doktorlar"],[onclick*="doktorlar"]';
    // Siparişler + Yeni İş Oluştur: can_manage_orders (25 Eylül 2026).
    if (!p.can_manage_orders) sel += ',a[href*="siparisler"],[onclick*="siparisler"],a[href*="yeni-giri-i"],[onclick*="yeni-giri-i"]';
    // Fiyat Listesi: personelden her zaman gizli, izinle açılmaz (24 Eylül 2026).
    sel += ',a[href*="fiyat-listesi"],[onclick*="fiyat-listesi"]';
    if (!p.can_manage_prospects) sel += ',a[href*="aday-havuzu"],[onclick*="aday-havuzu"]';
    var links = document.querySelectorAll(sel);
    for (var k = 0; k < links.length; k++) links[k].style.display = 'none';
  }

  window.ZkGuardCore = { PUBLIC: PUBLIC, page: page, enforce: enforce, hideUi: hideUi };
})();
