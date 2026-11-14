/*
 * Zirkonik — YENİ TASARIM katmanı (kabuk). 13 Kasım 2026.
 *
 * BAYRAK KAPALIYKEN BU DOSYA HİÇBİR ŞEY YAPMAZ: sayfa canlıdakiyle birebir aynı kalır.
 * Açma/kapama: adrese ?tasarim=yeni  /  ?tasarim=eski ekle (tercih bu cihazda saklanır).
 * Tek bir yerden (zk-yeni.css + bu dosya) bütün sayfalara giydirilir; sayfaların HTML'i, kimlikleri,
 * işleyicileri ve veri çağrıları DEĞİŞMEZ (tamlik-testi bunu doğrular).
 *
 * İçerik: (1) bayrak, (2) bilgisayarda sol menü, (3) giriş ekranı sol paneli (js/zk-yeni-giris.js'i yükler).
 * Menüde hangi sayfaların görüneceği, canlı bekçinin (js/zk-guard-core.js enforce/hideUi) sayfa erişim
 * kurallarının KOPYASIDIR — kural değişirse ikisi birlikte değişmeli; yeni-menu-uyum.mjs bunu her rol için gerçek
 * bekçiyle karşılaştırır.
 * Metinler: canlı çeviri motoruna (js/dil/motor.js) dokunulmaz; bu dosyanın metinleri T(tr, en) ile iki dilli yazılır ve
 * [data-zk-cevirme] ile motordan korunur ("Açık" gibi sözlükte başka anlamı olan sözcükler yanlış çevrilmesin).
 */
(function () {
  'use strict';
  var KEY = 'zk-tasarim';
  var H = document.documentElement;

  function oku() {
    var v = null;
    try { v = localStorage.getItem(KEY); } catch (e) {}
    if (!v) { try { var m = /(?:^|;)zk-tasarim=(\w+)/.exec(window.name || ''); v = m && m[1]; } catch (e) {} }
    return v;
  }
  // window.name yalnız localStorage yazılamıyorsa (depolama kapalı) YEDEK olarak kullanılır: normal tarayıcıda hiçbir şey yazılmaz (window.name sekme başka siteye gitse bile korunabilir).
  function yaz(v) {
    try { localStorage.setItem(KEY, v); return; } catch (e) {}
    try { window.name = (window.name || '').replace(/(?:^|;)zk-tasarim=\w+/, '') + ';zk-tasarim=' + v; } catch (e) {}
  }
  var q = /[?&]tasarim=(yeni|eski)\b/.exec(location.search);
  if (q) yaz(q[1]);
  if ((q ? q[1] : oku()) !== 'yeni') return; // BAYRAK KAPALI: hiçbir şey yapma
  H.setAttribute('data-tasarim', 'yeni');

  function sayfa() { return (location.pathname.split('/').pop() || 'index.html').toLowerCase().replace('.html', '') || 'index'; }
  H.setAttribute('data-sayfa', sayfa());
  /** İki dilli metin: İngilizce seçiliyse en, değilse tr. (zk-dil.js bu dosyadan SONRA yüklenir; çağrı anında ZkDil hazırdır.) */
  function T(tr, en) { return window.ZkDil && window.ZkDil.en ? en : tr; }
  window.__zkYeniT = T; // giriş modülü de kullanır

  // ---------- Tema: Açık (VARSAYILAN) / Koyu / Otomatik (cihazın ayarına uyar) ----------
  // Canlıdaki js/zk-tema.js data-theme="light"ı koşulsuz yazar; bu dosya ondan SONRA yüklenir ve (yalnız yeni tasarımda) tercihe göre geçersiz kılar.
  var TEMA_KEY = 'zk-tema';
  function temaOku() {
    var v = null;
    try { v = localStorage.getItem(TEMA_KEY); } catch (e) {}
    if (!v) { try { var m = /(?:^|;)zk-tema=(\w+)/.exec(window.name || ''); v = m && m[1]; } catch (e) {} }
    return v === 'koyu' || v === 'otomatik' ? v : 'acik';
  }
  function temaYaz(v) {
    try { localStorage.setItem(TEMA_KEY, v); return; } catch (e) {}   // window.name yalnız yedek (yukarıdaki yaz() ile aynı kural)
    try { window.name = (window.name || '').replace(/(?:^|;)zk-tema=\w+/, '') + ';zk-tema=' + v; } catch (e) {}
  }
  var mqKoyu = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function temaEtkin(v) { return v === 'koyu' || (v === 'otomatik' && mqKoyu && mqKoyu.matches) ? 'dark' : 'light'; }
  function temaUygula() {
    var t = temaEtkin(temaOku());
    H.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', t === 'dark' ? '#0F131A' : '#FFFFFF');
  }
  temaUygula(); // <head>'te, ilk boyamadan önce: açılışta yanlış renk parlamaz
  if (mqKoyu) { var mqDegisti = function () { if (temaOku() === 'otomatik') temaUygula(); }; if (mqKoyu.addEventListener) mqKoyu.addEventListener('change', mqDegisti); else if (mqKoyu.addListener) mqKoyu.addListener(mqDegisti); }
  window.addEventListener('storage', function (e) { if (e.key === TEMA_KEY) { temaUygula(); temaKartiDurum(); } });
  // Geri/ileri tuşuyla önbellekten (bfcache) dönen sayfada betikler yeniden çalışmaz: tercih bu arada değiştiyse (başka sayfada tema ya da ?tasarim=eski) burada da güncellenir.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    if (oku() !== 'yeni') { location.reload(); return; }   // tasarım kapatılmış: sayfayı eski haliyle baştan aç
    temaUygula(); temaKartiDurum(); kur();
  });

  // Profil › Görünüm kartı (dil kartının hemen altına eklenir; sayfanın kendi HTML'ine dokunulmaz)
  var TEMA_SEC = [['acik', 'Açık', 'Light', 'lucide:sun'], ['koyu', 'Koyu', 'Dark', 'lucide:moon'], ['otomatik', 'Otomatik', 'Automatic', 'lucide:smartphone']];
  var DUGME_PASIF = 'flex h-11 items-center justify-center gap-1.5 rounded-theme border border-border bg-input text-sm font-bold';
  var DUGME_AKTIF = 'flex h-11 items-center justify-center gap-1.5 rounded-theme border border-primary bg-primary text-sm font-bold text-primary-foreground';
  function temaKartiDurum() {
    var kart = document.getElementById('zk-y-tema'); if (!kart) return;
    var su = temaOku();
    var d = kart.querySelectorAll('button[data-tema]');
    for (var i = 0; i < d.length; i++) { var a = d[i].getAttribute('data-tema') === su; d[i].className = a ? DUGME_AKTIF : DUGME_PASIF; d[i].setAttribute('aria-pressed', a ? 'true' : 'false'); }
  }
  function temaKarti() {
    if (sayfa() !== 'profil' || document.getElementById('zk-y-tema')) return;
    var dil = document.getElementById('pf-dil'); if (!dil || !dil.parentNode) return;
    var k = document.createElement('section');
    k.id = 'zk-y-tema'; k.className = 'mt-5 rounded-theme border border-border bg-card p-4'; k.setAttribute('data-zk-cevirme', '1');
    k.innerHTML = '<p class="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">' + T('Görünüm', 'Appearance') + '</p>' +
      '<div class="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="' + T('Görünüm', 'Appearance') + '">' +
      TEMA_SEC.map(function (s) { return '<button type="button" data-tema="' + s[0] + '" class="' + DUGME_PASIF + '"><iconify-icon icon="' + s[3] + '"></iconify-icon><span>' + T(s[1], s[2]) + '</span></button>'; }).join('') + '</div>' +
      '<p class="mt-2 text-[11px] leading-4 text-muted-foreground">' + T('Açık görünüm varsayılandır. «Otomatik», telefonun veya bilgisayarın ayarına uyar. Seçim bu cihazda saklanır.',
        'Light is the default. “Automatic” follows your device setting. Your choice is saved on this device.') + '</p>';
    dil.parentNode.insertBefore(k, dil.nextSibling);
    k.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-tema]') : null; if (!b) return;
      temaYaz(b.getAttribute('data-tema')); temaUygula(); temaKartiDurum();
    });
    temaKartiDurum();
  }

  // ---------- Sol menü (yalnız bilgisayar genişliğinde görünür; telefonda canlıdaki alt çubuk kalır) ----------
  // [sayfa, tr, en, ikon, bölüm]
  var BOLUM = { calisma: ['Çalışma alanı', 'Workspace'], yonetim: ['Yönetim', 'Management'], hesap: ['Hesap', 'Account'] };
  var MENU = [
    ['retim', 'Üretim', 'Production', 'lucide:kanban', 'calisma'],
    ['isler', 'İşler', 'Jobs', 'lucide:clipboard-list', 'calisma'],
    ['siparisler', 'Siparişler', 'Orders', 'lucide:inbox', 'calisma'],
    ['doktorlar', 'Doktorlar', 'Doctors', 'lucide:stethoscope', 'calisma'],
    ['aday-havuzu', 'Doktor Havuzu', 'Doctor Pool', 'lucide:user-plus', 'calisma'],
    ['finans', 'Finans', 'Finance', 'lucide:chart-no-axes-combined', 'yonetim'],
    ['fiyat-listesi', 'Fiyat listesi', 'Price list', 'lucide:receipt-text', 'yonetim'],
    ['ekip', 'Ekip', 'Team', 'lucide:users-round', 'yonetim'],
    ['laboratuvarlar', 'Laboratuvarlar', 'Laboratories', 'lucide:building-2', 'yonetim'],
    ['kilavuz', 'Kılavuz', 'Guide', 'lucide:book-open', 'hesap'],
    ['bildirimler', 'Bildirimler', 'Notifications', 'lucide:bell', 'hesap'],
    ['profil', 'Ayarlar', 'Settings', 'lucide:circle-user-round', 'hesap'] // sayfanın kendi başlığı "Ayarlar" (profil.html); menü adı ona uyar
  ];
  // Menünün çıktığı sayfalar: personel/yönetici sayfaları. Giriş, yasal sayfalar, doktor portalı, 3B görüntüleyici HARİÇ.
  var KABUKLU = { retim: 1, isler: 1, detay: 1, 'yeni-giri-i': 1, siparisler: 1, doktorlar: 1, finans: 1, ciro: 1, 'fiyat-listesi': 1, ekip: 1, laboratuvarlar: 1,
    'aday-havuzu': 1, 'personel-hesap': 1, 'rol-ve-yetki-detay': 1, profil: 1, bildirimler: 1, izinlerim: 1, 'prova-istatistik': 1, kilavuz: 1 };
  // Alt sayfalarda menüde hangi öğe "bulunduğun yer" olarak işaretlenir.
  var ANA = { detay: 'isler', 'yeni-giri-i': 'isler', ciro: 'finans', 'prova-istatistik': 'retim', 'personel-hesap': 'ekip', 'rol-ve-yetki-detay': 'ekip', izinlerim: 'profil' };

  // ZkGuardCore.enforce'un (js/zk-guard-core.js) "bu rol bu sayfayı açabilir mi" kısmının kopyası. Yönlendirme yok, yalnız evet/hayır.
  var ADMIN = { ekip: 1, laboratuvarlar: 1, 'rol-ve-yetki-detay': 1, 'personel-hesap': 1 };
  var LIDER_KAPALI = { finans: 1, ciro: 1, 'fiyat-listesi': 1, 'personel-hesap': 1, 'aday-havuzu': 1, 'doktor-siparis': 1 };
  var MUH_ACIK = { detay: 1, finans: 1, ciro: 1, 'fiyat-listesi': 1, doktorlar: 1, ekip: 1, 'personel-hesap': 1, 'rol-ve-yetki-detay': 1, profil: 1, bildirimler: 1, izinlerim: 1, kilavuz: 1, onay: 1 };
  var RESEPSIYON = { retim: 1, isler: 1, detay: 1, siparisler: 1, doktorlar: 1, 'yeni-giri-i': 1, profil: 1, bildirimler: 1, izinlerim: 1, kilavuz: 1, '3b-goster': 1 };
  var ADAY_DAR = { 'aday-havuzu': 1, profil: 1, bildirimler: 1, izinlerim: 1, kilavuz: 1 };
  function crmKapali(p) { return !!(p && p.plan && p.plan !== 'plus' && p.plan !== 'tek'); }
  function izinli(pg, p) {
    if (p.role === 'doktor') return false;
    if (pg === 'aday-havuzu' && crmKapali(p)) return false;
    if (p.role !== 'personel') return true; // yönetici: serbest
    if (p.position === 'Lider Teknisyen') return !LIDER_KAPALI[pg];
    if (p.position === 'Muhasebeci') return !!MUH_ACIK[pg];
    if (p.position === 'Satış Pazarlama Sorumlusu' && !crmKapali(p) && !ADAY_DAR[pg]) return false;
    if (p.position === 'Resepsiyon Sorumlusu' && !RESEPSIYON[pg]) return false;
    if (ADMIN[pg]) return false;
    if ((pg === 'finans' || pg === 'ciro') && !p.can_view_finance) return false;
    if (pg === 'doktorlar' && !p.can_view_doctors) return false;
    if ((pg === 'siparisler' || pg === 'yeni-giri-i') && !p.can_manage_orders) return false;
    if (pg === 'fiyat-listesi' && !p.can_view_prices) return false;
    if (pg === 'aday-havuzu' && !p.can_manage_prospects) return false;
    return true;
  }
  function snapshot() { try { return JSON.parse(localStorage.getItem('zk-guard') || 'null'); } catch (e) { return null; } }

  function kapat() {
    var a = document.querySelector('.zk-y-kenar'); if (a && a.parentNode) a.parentNode.removeChild(a);
    H.removeAttribute('data-kabuk');
  }
  /** Kurulumda beklenmedik bir hata olursa menü yarım kalmasın ve 248 px'lik BOŞ şerit kalmasın: menüyü kaldırıp canlıdaki alt çubuğa dön. */
  function kur() { try { kurIc(); } catch (e) { kapat(); } }
  function kurIc() {
    if (!document.body || !KABUKLU[sayfa()]) return;
    var p = snapshot();
    if (!p || !p.role || p.role === 'doktor') { kapat(); return; } // rol bilinmiyorsa canlıdaki alt çubuk kalır
    var dil = T('tr', 'en');
    // Giriş formunun yazdığı ilk yetki özeti 'plan' alanını TAŞIMAZ (giris.html); canlı bekçi bunu "kısıt yok" sayar. Menüde ise kapalı paketin (Kurumsal) ölü "Doktor Havuzu" bağlantısı
    // girişten sonraki ilk sayfada birkaç saniye görünmesin diye plan belli olana dek paket-bağımlı öğe (CRM) gizlenir; tam özet gelince menü yeniden kurulur.
    var planYok = !('plan' in p);
    var imza = JSON.stringify([p.role, p.position, p.plan, planYok, p.can_view_finance, p.can_view_doctors, p.can_manage_orders, p.can_view_prices, p.can_manage_prospects, sayfa(), dil]);
    var eski = document.querySelector('.zk-y-kenar');
    if (eski && eski.getAttribute('data-imza') === imza) return;
    if (eski) eski.parentNode.removeChild(eski);
    var aktif = ANA[sayfa()] || sayfa();
    var tek = p.plan === 'tek';
    // Klavye kullanıcısı için "ana içeriğe geç" bağlantısı (menü DOM'da içerikten önce gelir). Sayfadaki <main>'e yalnız id/tabindex EKLENİR (var olan kimlik korunur).
    // Menü gövde oluşur oluşmaz kurulabilir (erkenMenu): o an <main> henüz yoksa bağlantı atlaEkle() ile sonradan eklenir.
    var h = '', mn = document.querySelector('main');
    if (mn) {
      if (!mn.id) mn.id = 'zk-y-icerik';
      if (mn.getAttribute('tabindex') === null) mn.setAttribute('tabindex', '-1');
      h += '<a class="zk-y-atla" href="#' + mn.id + '">' + T('Ana içeriğe geç', 'Skip to main content') + '</a>';
    }
    h += '<a class="zk-y-marka" href="retim.html" aria-label="Zirkonik"><img src="brand/mark.png" alt="" width="37" height="40"><span>Zirkonik</span></a>';
    if (izinli('yeni-giri-i', p)) h += '<a class="zk-y-yeni" href="yeni-giri-i.html"><iconify-icon icon="lucide:plus"></iconify-icon><span>' + T('Yeni iş', 'New job') + '</span></a>';
    var bolum = '';
    for (var i = 0; i < MENU.length; i++) {
      var m = MENU[i]; if (!izinli(m[0], p)) continue;
      if (m[0] === 'aday-havuzu' && planYok) continue;
      if (m[4] !== bolum) { bolum = m[4]; h += '<p class="zk-y-baslik">' + T(BOLUM[bolum][0], BOLUM[bolum][1]) + '</p>'; }
      var ad = T(m[1], m[2]);
      // Zirkonik Tek: doktor yok, müşteriler laboratuvar. Canlı bekçinin paketUi'si sekmeyi "Müşteriler", aday havuzu başlığını "Laboratuvar Havuzu" (data-zk-tek-metin) yapar; menü de aynı adları taşır.
      if (m[0] === 'doktorlar' && tek) ad = T('Müşteriler', 'Customers');
      if (m[0] === 'aday-havuzu' && tek) ad = T('Laboratuvar Havuzu', 'Laboratory Pool');
      h += '<a class="zk-y-menu" href="' + m[0] + '.html" data-zk-y="' + m[0] + '"' + (m[0] === aktif ? ' aria-current="page"' : '') + '><iconify-icon icon="' + m[3] + '"></iconify-icon><span>' + ad + '</span></a>';
    }
    var el = document.createElement('nav'); // landmark: menü <nav> (önceden <aside>)
    el.className = 'zk-y-kenar'; el.setAttribute('lang', dil); el.setAttribute('aria-label', T('Ana menü', 'Main menu')); el.setAttribute('data-imza', imza); el.setAttribute('data-zk-cevirme', '1'); el.innerHTML = h;
    document.body.insertBefore(el, document.body.firstChild);
    H.setAttribute('data-kabuk', 'aktif');
  }

  // ---------- Alt pencereler (id'si "-sheet" ile biten paneller): klavye / ekran okuyucu erişilebilirliği ----------
  // Denetimde bulundu: pencere açılınca odak pencereye geçmiyor, Esc kapatmıyor, role="dialog" yok, Tab arka plana kaçıyor. Sayfaların kendi açma/kapama kodu DEĞİŞMEZ:
  // açılış/kapanış 'hidden' sınıfından izlenir; Esc, pencerenin kendi karartma katmanını (onclick'li .absolute.inset-0) tıklatır = kullanıcının dışarı dokunmasıyla aynı yol.
  function pencereErisim() {
    var onceki = null;
    function pencereler() { return document.querySelectorAll('[id$="-sheet"]'); }
    function acik() { var l = pencereler(); for (var i = l.length - 1; i >= 0; i--) { if (!l[i].classList.contains('hidden')) return l[i]; } return null; }
    function panel(sh) { var c = sh.children; for (var i = c.length - 1; i >= 0; i--) { if (/\bbottom-0\b/.test(c[i].className || '')) return c[i]; } return sh.lastElementChild || sh; }
    function odaklanabilirler(p) {
      var l = p.querySelectorAll('a[href],button,input,select,textarea,[tabindex]'), o = [];
      for (var i = 0; i < l.length; i++) { var e = l[i]; if (e.disabled || e.type === 'hidden' || e.getAttribute('tabindex') === '-1') continue; if (e.getClientRects().length) o.push(e); }
      return o;
    }
    function isaretle(sh) {
      var p = panel(sh); if (!p) return;
      if (!p.getAttribute('role')) p.setAttribute('role', 'dialog');
      p.setAttribute('aria-modal', 'true');
      var b = p.querySelector('p.font-heading, h1, h2, h3'); if (b && !p.getAttribute('aria-label') && !p.getAttribute('aria-labelledby')) p.setAttribute('aria-label', (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80));
    }
    function acildi(sh) {
      isaretle(sh);
      onceki = document.activeElement && document.activeElement !== document.body ? document.activeElement : onceki;
      setTimeout(function () { // sayfanın kendi odaklaması (varsa) önce çalışır; yoksa ilk alana
        if (sh.classList.contains('hidden')) return;
        var p = panel(sh); if (p.contains(document.activeElement)) return;
        var o = odaklanabilirler(p); if (o.length) o[0].focus(); else { p.setAttribute('tabindex', '-1'); p.focus(); }
      }, 80);
    }
    function kapandi() { var e = onceki; onceki = null; if (e && e.focus && document.contains(e)) { try { e.focus(); } catch (x) {} } }
    var mo = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i], t = m.target; if (!t.id || !/-sheet$/.test(t.id)) continue;
        var eskiGizli = (m.oldValue || '').split(/\s+/).indexOf('hidden') >= 0, simdiGizli = t.classList.contains('hidden');
        if (eskiGizli && !simdiGizli) acildi(t); else if (!eskiGizli && simdiGizli) kapandi();
      }
    });
    var l = pencereler(); for (var i = 0; i < l.length; i++) { mo.observe(l[i], { attributes: true, attributeFilter: ['class'], attributeOldValue: true }); isaretle(l[i]); }
    var tk = document.getElementById('zk-toast'); if (tk) { tk.setAttribute('role', 'status'); tk.setAttribute('aria-live', 'polite'); }   // bildirim kutusu ekran okuyucuya duyurulur
    document.addEventListener('keydown', function (ev) {
      var sh = acik(); if (!sh) return;
      if (ev.key === 'Escape') {
        var k = sh.querySelector(':scope > .absolute.inset-0[onclick]');
        if (k) { ev.preventDefault(); k.click(); }
      } else if (ev.key === 'Tab') {
        var p = panel(sh), o = odaklanabilirler(p); if (!o.length) return;
        var a = document.activeElement;
        if (!p.contains(a)) { ev.preventDefault(); o[0].focus(); }
        else if (ev.shiftKey && a === o[0]) { ev.preventDefault(); o[o.length - 1].focus(); }
        else if (!ev.shiftKey && a === o[o.length - 1]) { ev.preventDefault(); o[0].focus(); }
      }
    });
  }

  // ---------- Giriş ekranı: sol panel (marka + şematik örnek arı kovanı) ----------
  function betikYukle(src) { var s = document.createElement('script'); s.src = src; s.async = true; document.head.appendChild(s); }

  function atlaEkle() {
    var k = document.querySelector('.zk-y-kenar'); if (!k || k.querySelector('.zk-y-atla')) return;
    var mn = document.querySelector('main'); if (!mn) return;
    if (!mn.id) mn.id = 'zk-y-icerik';
    if (mn.getAttribute('tabindex') === null) mn.setAttribute('tabindex', '-1');
    var a = document.createElement('a'); a.className = 'zk-y-atla'; a.href = '#' + mn.id; a.textContent = T('Ana içeriğe geç', 'Skip to main content');
    k.insertBefore(a, k.firstChild);
  }
  // Menü, sayfa sonundaki ağır betikleri (≈220 KB supabase-js) beklemeden gövde oluşur oluşmaz kurulur: önceden DOMContentLoaded'a kadar yavaş bağlantıda ~1,5 sn 248 px'lik BOŞ şerit kalıyordu.
  function erkenMenu() {
    if (!KABUKLU[sayfa()]) return;
    function dene() { if (document.body) { kur(); return true; } return false; }
    if (dene()) return;
    var mo = new MutationObserver(function () { if (dene()) mo.disconnect(); });
    mo.observe(H, { childList: true });
  }

  // Menü yeri ERKEN ayrılır (<head>'te, ilk boyamadan önce): yetki anlık görüntüsü biliniyorsa içerik menü DOM'a eklenmeden önce sağa kayık boyanır; menü sonradan gelince içerik zıplamaz.
  // Menü kurulamazsa kapat() bu işareti geri alır.
  try { var ilk = snapshot(); if (ilk && (ilk.role === 'yonetici' || ilk.role === 'personel') && KABUKLU[sayfa()]) H.setAttribute('data-kabuk', 'aktif'); } catch (e) {}

  function baslat() {
    temaUygula();                                  // meta theme-color artık mevcut
    // Sayfa dili: canlıda 13 Türkçe sayfa <html lang="en"> taşır; CSS büyük harf dönüşümü Türkçe "i"yi noktasız "I" yapar (YÖNETIM, LIDER) ve ekran okuyucu Türkçeyi İngilizce okur.
    // Yeni tasarım açıkken sayfa dili gerçek arayüz diline eşitlenir (İngilizcede zk-dil.js zaten 'en' yazar).
    H.setAttribute('lang', T('tr', 'en'));
    temaKarti(); setTimeout(temaKarti, 700);       // yalnız Profil'de
    kur(); atlaEkle();
    // Yetki anlık görüntüsü ilk girişte/yenilemede sonradan yazılabilir (js/zk-guard.js): birkaç kez yeniden bak; yavaş bağlantıda
    // anlık görüntü (plan alanı dahil: girişte yazılan ilk özet plan taşımaz) gelene dek (en çok ~30 sn) 1,5 sn'de bir dene.
    setTimeout(kur, 700); setTimeout(kur, 2000); setTimeout(kur, 5000);
    setInterval(function () { if (!document.hidden) kur(); }, 8000); // yetki/paket sonradan değişirse (sekme açıkken) menü bayat kalmasın; imza aynıysa hiçbir şey yapmaz
    var n = 0, t = setInterval(function () { var s = snapshot(); if (s && 'plan' in s) { clearInterval(t); kur(); } else { if (s) kur(); if (++n > 20) clearInterval(t); } }, 1500);
    if (sayfa() === 'giris') betikYukle('js/zk-yeni-giris.js');
    try { pencereErisim(); } catch (e) {}   // erişilebilirlik katmanı hata verirse sayfa etkilenmez
  }
  try { erkenMenu(); } catch (e) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', baslat); else baslat();
})();
