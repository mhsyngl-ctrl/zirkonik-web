/*
 * Zirkonik — YENİ TASARIM: giriş ekranı sol paneli (yalnız bilgisayar genişliği, ≥960px). 13 Kasım 2026.
 * js/zk-yeni.js yalnız giriş sayfasında ve yalnız yeni tasarım bayrağı açıkken yükler.
 *
 * Panel: marka + slogan + ŞEMATİK ÖRNEK arı kovanı (üretim panosundaki istasyon ağı) + "canlı" akış yazısı.
 * Kovan çizimi canlıdaki retim.html kodunun (hexState / renderHive) aynısıdır; tek fark veri kaynağı: gerçek veri yerine sahte örnek işler.
 * Dekoratiftir: tıklanmaz, ekran okuyuculardan gizlidir (aria-hidden), hareket azaltma tercihinde / sekme arka plandayken / panel görünmezken durur.
 * Giriş formuna ve mantığına DOKUNMAZ: sayfaya yalnız bir <aside> eklenir.
 */
(function () {
  'use strict';
  if (document.documentElement.getAttribute('data-tasarim') !== 'yeni') return;
  var wrap = document.querySelector('body > div.h-screen.w-screen');
  if (!wrap || document.querySelector('.zk-y-giris-sol')) return;
  var T = window.__zkYeniT || function (tr) { return tr; };

  // ---------- Örnek veri ----------
  // [id, Türkçe ad, İngilizce ad]
  var IST = [['bek', 'Bekleyen', 'Waiting'], ['cad', 'CAD/CAM', 'CAD/CAM'], ['diz', 'Dizayn', 'Design'], ['ser', 'Seramik', 'Ceramics'],
    ['fir', 'Fırın', 'Furnace'], ['kk', 'Kalite Kontrol', 'Quality Control'], ['bit', 'Bitirme', 'Finishing'], ['tes', 'Teslimat', 'Delivery']];
  var sections = IST.map(function (s) { return { id: 'r-' + s[0], name: T(s[1], s[2]), wait: s[0] === 'bek' }; });
  var SIRA = ['r-bek', 'r-diz', 'r-cad', 'r-ser', 'r-fir', 'r-kk', 'r-bit', 'r-tes'];
  var jobs = [['Z-1043', 'bek'], ['Z-1046', 'bek'], ['Z-1040', 'cad', 1], ['Z-1044', 'cad'], ['Z-1042', 'diz'], ['Z-1041', 'ser'], ['Z-1038', 'fir'], ['Z-1047', 'fir'],
    ['Z-1039', 'kk'], ['Z-1045', 'bit'], ['Z-1037', 'tes', 1]].map(function (j, i) { return { id: 'k' + i, no: j[0], room: 'r-' + j[1], pending: !!j[2] }; });
  var incoming = { 'r-ser': 1, 'r-fir': 2, 'r-cad': 1 };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------- Kovan çizimi (canlı retim.html: hexState / renderHive ile aynı mantık) ----------
  function inSection(j, sec) { return j.room === sec.id || (sec.wait && !j.room); }
  function hexState(idx) {
    var sec = sections[idx];
    var secJobs = jobs.filter(function (j) { return inSection(j, sec); });
    var pendingCount = secJobs.filter(function (j) { return j.pending; }).length;
    var inc = incoming[sec.id] || 0;
    var hot = secJobs.length + inc >= 3;
    var cls = 'zk-hex';
    if (hot) cls += ' zk-hex-hot'; else if (secJobs.length) cls += ' zk-hex-busy'; else cls += ' zk-hex-empty';
    if (pendingCount) cls += ' zk-hex-alert';
    var sub = hot ? T('Destek gerekebilir', 'Support may be needed') : (pendingCount ? T('Teslim bekliyor', 'Awaiting handover') : (secJobs.length ? T('aktif iş', 'active jobs') : T('boş', 'empty')));
    var inner = (inc ? '<span class="zk-hex-in">↓ +' + inc + '</span>' : '') +
      '<span class="zk-hex-name">' + esc(sec.name) + '</span><span class="zk-hex-count">' + secJobs.length + '</span><span class="zk-hex-sub">' + sub + '</span>';
    return { cls: cls, inner: inner };
  }
  var kovan = null, sig = null, sonHex = [];
  function renderHive() {
    if (!kovan) return;
    var rows = [], i = 0, rowLen = 3;
    while (i < sections.length) { var r = []; for (var k = i; k < Math.min(i + rowLen, sections.length); k++) r.push(k); rows.push(r); i += rowLen; rowLen = rowLen === 3 ? 2 : 3; }
    if (sig === 'x' && kovan.querySelector('.zk-hive')) { // yapı aynı: yalnız değişen petekler güncellenir (canlıdaki "tik" animasyonu)
      var btns = kovan.querySelectorAll('.zk-hive .zk-hex');
      for (var b = 0; b < btns.length && b < sections.length; b++) {
        var st = hexState(b);
        if (sonHex[b] !== st.inner) {
          var ic = btns[b].querySelector('.zk-hex-inner');
          if (ic) { ic.innerHTML = st.inner; ic.classList.remove('zk-hex-tik'); void ic.offsetWidth; ic.classList.add('zk-hex-tik'); }
          sonHex[b] = st.inner;
        }
        if (btns[b].getAttribute('class') !== st.cls) btns[b].setAttribute('class', st.cls);
      }
      return;
    }
    kovan.innerHTML = '<div class="zk-hive-deck"><p class="zk-hive-deck-title"><span class="zk-live-dot"></span>' + T('İstasyon ağı', 'Room network') + '</p><div class="zk-hive">' +
      rows.map(function (rowIdxs) {
        return '<div class="zk-hive-row">' + rowIdxs.map(function (idx) { var st = hexState(idx); return '<button type="button" tabindex="-1" class="' + st.cls + '"><span class="zk-hex-inner">' + st.inner + '</span></button>'; }).join('') + '</div>';
      }).join('') + '</div><div class="zk-hive-legend"><span><i class="zk-lg zk-lg-cyan"></i>' + T('Aktif', 'Active') + '</span><span><i class="zk-lg zk-lg-amber"></i>' + T('↓ +N gelen iş', '↓ +N incoming') +
      '</span><span><i class="zk-lg zk-lg-hot"></i>' + T('Yoğun — destek gerekebilir', 'Busy — support may be needed') + '</span></div></div>';
    sig = 'x'; sonHex = []; for (var h = 0; h < sections.length; h++) sonHex[h] = hexState(h).inner;
  }

  // ---------- Panel ----------
  var panel = document.createElement('aside');
  panel.className = 'zk-y-giris-sol'; panel.setAttribute('aria-hidden', 'true'); panel.setAttribute('data-zk-cevirme', '1');
  panel.innerHTML = '<img class="zk-y-giris-logo" src="brand/logo.png" alt="">' +
    '<div class="zk-y-giris-metin"><h2>' + T('Laboratuvarınızın tüm üretimi tek yerde.', 'All of your laboratory\'s production in one place.') + '</h2>' +
    '<p>' + T('Diş laboratuvarı yönetim paneli', 'Dental laboratory management panel') + '</p></div>' +
    '<div class="zk-y-giris-alan" id="zk-y-kovan-alan">' +
    '<div class="zk-y-giris-etiket"><i class="zk-y-giris-nokta"></i>' + T('Canlı örnek · üretim panosundaki istasyon ağı', 'Live sample · the room network on the production board') + '</div>' +
    '<div class="zk-y-giris-sarmal" id="zk-y-kovan-sarmal"><div class="zk-y-giris-kovan" id="zk-y-kovan"></div></div>' +
    '<div class="zk-y-giris-akis"><span id="zk-y-akis"></span></div></div>' +
    '<p class="zk-y-giris-alt">© Zirkonik</p>';
  try { panel.inert = true; } catch (e) {} // dekoratif: klavye odağına ve ekran okuyucuya kapalı (petek düğmeleri ayrıca tabindex=-1)
  wrap.insertBefore(panel, wrap.firstChild);
  kovan = document.getElementById('zk-y-kovan');
  var alan = document.getElementById('zk-y-kovan-alan'), sarmal = document.getElementById('zk-y-kovan-sarmal'), akis = document.getElementById('zk-y-akis');
  akis.textContent = T('Z-1042 Dizayn istasyonunda', 'Z-1042 is in Design');

  // Kovan, sol panelde kalan alana sığacak kadar ölçeklenir (CSS zoom Safari'de güvenilmez: transform + sarmalayıcı).
  function sigdir() {
    if (getComputedStyle(panel).display === 'none') return;                  // dar ekranda panel gizli: ölçülecek bir şey yok
    kovan.style.transform = 'none';
    var h = kovan.offsetHeight, w = kovan.offsetWidth;
    if (!h || !w || !alan.clientHeight) return;
    var z = Math.min(1.25, (alan.clientHeight - 64) / h, alan.clientWidth / w);
    if (z < .34) { alan.classList.add('dar'); sarmal.style.height = '0px'; return; } // çok alçak pencere: kovan gizlenir, kesik görünmez
    alan.classList.remove('dar');
    kovan.style.transform = 'scale(' + z + ')';
    sarmal.style.width = Math.round(w * z) + 'px'; sarmal.style.height = Math.round(h * z) + 'px';
  }
  var bekle = 0;
  function planla() { cancelAnimationFrame(bekle); bekle = requestAnimationFrame(sigdir); }
  window.addEventListener('resize', planla);
  if (window.ResizeObserver) new ResizeObserver(planla).observe(alan);
  document.addEventListener('visibilitychange', planla);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sigdir);
  renderHive(); sigdir(); setTimeout(sigdir, 250); setTimeout(sigdir, 1200);

  // ---------- "Canlı his": işler odalar arasında kendiliğinden ilerler ----------
  // Önce hedef istasyonda "↓ +1" (yolda) görünür, 1,5 sn sonra iş oraya varır. Teslim edilen iş kovandan çıkar, yenisi gelir.
  var yeniNo = 1047, sayac = 100, zaman = null, calisiyor = false;
  function ad(id) { for (var i = 0; i < sections.length; i++) if (sections[i].id === id) return sections[i].name; return ''; }
  function yaz(yazi) { akis.style.opacity = 0; setTimeout(function () { akis.textContent = yazi; akis.style.opacity = 1; }, 220); }
  function gorunur() { var cs = getComputedStyle(panel); return cs.display !== 'none' && !document.hidden; }
  function adim() {
    if (!calisiyor) return;
    if (!gorunur()) { zaman = setTimeout(adim, 1500); return; }
    var j = jobs[Math.floor(Math.random() * jobs.length)], i = j ? SIRA.indexOf(j.room) : -1;
    if (!j) { zaman = setTimeout(adim, 2600); return; }
    if (i < 0 || i === SIRA.length - 1) {
      jobs.splice(jobs.indexOf(j), 1);
      var y = { id: 'k' + (++sayac), no: 'Z-' + (++yeniNo), room: 'r-bek', pending: false }; jobs.push(y); renderHive();
      yaz(T(j.no + ' teslim edildi · ' + y.no + ' yeni iş geldi', j.no + ' delivered · new job ' + y.no + ' received'));
      zaman = setTimeout(adim, 2600); return;
    }
    var hedef = SIRA[i + 1];
    incoming[hedef] = (incoming[hedef] || 0) + 1; renderHive();
    yaz(T(j.no + ' → ' + ad(hedef) + ' istasyonuna yolda', j.no + ' → on its way to ' + ad(hedef)));
    setTimeout(function () {
      incoming[hedef] = Math.max(0, (incoming[hedef] || 1) - 1);            // yoldaki işaret her durumda düşer (hareket durmuşsa bayat "↓ +1" kalmasın)
      if (!calisiyor) { renderHive(); return; }
      j.room = hedef; j.pending = Math.random() < 0.35; renderHive();
      yaz(T(j.no + ' ' + ad(hedef) + ' istasyonunda', j.no + ' is in ' + ad(hedef)));
    }, 1500);
    zaman = setTimeout(adim, 3400);
  }
  function durdur() { calisiyor = false; clearTimeout(zaman); }
  function baslatHareket() {
    if (calisiyor) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    calisiyor = true; zaman = setTimeout(adim, 1800);
  }
  var genis = window.matchMedia ? window.matchMedia('(min-width: 960px)') : null;
  function mq() { if (!genis || genis.matches) { baslatHareket(); planla(); } else durdur(); }
  if (genis) { if (genis.addEventListener) genis.addEventListener('change', mq); else if (genis.addListener) genis.addListener(mq); }
  mq();
})();
