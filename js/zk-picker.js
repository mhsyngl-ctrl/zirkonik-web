/*
 * Zirkonik — özel seçici bileşeni.
 * iOS'un yerleşik <select> çarkı ve tarih tekerleği yerine uygulamanın
 * kendi alt-sayfa (bottom sheet) listesi ve takvimi açılır.
 *
 * Kullanım: sayfaya ekle, başka bir şey gerekmez —
 *   <script src="js/zk-picker.js"></script>
 * Belge düzeyinde dinlediği için sonradan JS ile eklenen select/tarih
 * alanlarını da otomatik yakalar. Seçim yapılınca elemanın value'su
 * güncellenir ve 'change' event'i tetiklenir (mevcut kodlar değişmeden çalışır).
 */
(function () {
  'use strict';

  var AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  var GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

  var overlay = null;
  // Hayalet tıklama koruması. Dokunmatik ekranda touchend'den sonra tarayıcı
  // AYNI noktaya sentetik bir 'click' daha yollar; alt-sayfa o arada açıldığı
  // için bu tıklama yeni açılan listeye düşer ve rastgele bir satır seçilirdi.
  //
  // 2026-09-19: koruma "açılıştan sonraki 400 ms boyunca HİÇBİR tıklamayı
  // kabul etme" şeklindeydi. Kullanıcı listeyi ezberleyip hızlandığında
  // (3-4-5. kalemde) gerçek seçimi de yutuyordu: seçiyorsun, hiçbir şey
  // olmuyor, kutu boş kalıyor. Artık ZAMANA DEĞİL KONUMA bakıyor — hayalet
  // tıklama açılış dokunuşuyla aynı noktadadır, gerçek seçim başka noktada.
  var sonNokta = null;   // { t, x, y }
  var GHOST_MS = 700;    // konum da tuttugu icin pencere genis olabilir
  var GHOST_PX = 24;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Masaustu: fare var ve ekran genis. Orada alt-sayfa yanlis duruyor —
   * form 840 px'lik ortalanmis bir sutunda, liste ise ekranin tamamina
   * yayilip sola kayiyor. Bu genislikte liste alanin ALTINDA acilmali. */
  function masaustuMu() {
    return window.matchMedia &&
      window.matchMedia('(min-width: 640px) and (hover: hover) and (pointer: fine)').matches;
  }

  var konumlaFn = null;
  function closeSheet() {
    if (konumlaFn) {
      window.removeEventListener('resize', konumlaFn);
      window.removeEventListener('scroll', konumlaFn, true);
      konumlaFn = null;
    }
    if (overlay) { overlay.remove(); overlay = null; }
  }

  /* Listeyi tetikleyen alanin altina yerlestirir. Asagida yer yoksa alanin
   * ustune tasar; iki yana da ekran disina tasmaz. */
  function alanaYerlestir(sheet, anchor) {
    var r = anchor.getBoundingClientRect();
    var bosluk = 6, kenar = 12;
    var genislik = Math.max(r.width, 260);
    genislik = Math.min(genislik, window.innerWidth - 2 * kenar);

    var altta = window.innerHeight - r.bottom - bosluk - kenar;
    var ustte = r.top - bosluk - kenar;
    var yukariAc = altta < 200 && ustte > altta;
    var yukseklik = Math.min(yukariAc ? ustte : altta, window.innerHeight * 0.6);

    var sol = Math.min(Math.max(r.left, kenar), window.innerWidth - genislik - kenar);
    sheet.style.width = genislik + 'px';
    sheet.style.left = sol + 'px';
    sheet.style.maxHeight = Math.max(yukseklik, 160) + 'px';
    if (yukariAc) {
      sheet.style.top = 'auto';
      sheet.style.bottom = (window.innerHeight - r.top + bosluk) + 'px';
    } else {
      sheet.style.bottom = 'auto';
      sheet.style.top = (r.bottom + bosluk) + 'px';
    }
  }

  function openSheet(titleText, bodyHtml, anchor) {
    closeSheet();
    overlay = document.createElement('div');
    overlay.className = 'zk-picker-overlay';
    // 2026-09-12: Liste uzun olunca kullanici sikisip kaliyordu — alt-sayfa
    // ekranin cogunu kapatiyor, arka plana dokunacak yer kalmiyor ve liste
    // kaymazsa cikis yolu hic yok. Basliga her zaman gorunen bir Kapat
    // dugmesi konuldu: kaydirma ne olursa olsun cikis garanti.
    overlay.innerHTML =
      '<div class="zk-picker-backdrop"></div>' +
      '<div class="zk-picker-sheet">' +
        '<div class="zk-picker-grab"></div>' +
        '<div class="zk-picker-head">' +
          '<p class="zk-picker-title">' + esc(titleText) + '</p>' +
          '<button type="button" class="zk-picker-close" aria-label="Kapat">✕</button>' +
        '</div>' +
        '<div class="zk-picker-body">' + bodyHtml + '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    if (anchor && masaustuMu()) {
      var sheet = overlay.querySelector('.zk-picker-sheet');
      overlay.classList.add('zk-picker-anchored');
      alanaYerlestir(sheet, anchor);
      // Sayfa kayar ya da pencere boyu degisirse liste alandan kopmasin.
      konumlaFn = function () { if (overlay) alanaYerlestir(sheet, anchor); };
      window.addEventListener('resize', konumlaFn);
      window.addEventListener('scroll', konumlaFn, true);
    }

    overlay.querySelector('.zk-picker-backdrop').addEventListener('click', function (e) {
      if (!isGhost(e)) closeSheet();
    });
    overlay.querySelector('.zk-picker-close').addEventListener('click', function (e) {
      if (!isGhost(e)) closeSheet();
    });

    return overlay;
  }

  // ---- Liste seçici (select yerine) ----
  function openSelectSheet(sel) {
    var title = '';
    var lbl = sel.closest('label');
    if (lbl) {
      var span = lbl.querySelector('span');
      if (span) title = span.textContent.replace(/\*\s*$/, '').trim();
    }
    if (!title) title = 'Seçin';

    var html = '';
    function optionRow(opt) {
      if (opt.disabled) return '';
      var on = sel.value === opt.value && opt.value !== '';
      return '<button type="button" class="zk-picker-row' + (on ? ' zk-picker-row-on' : '') + '" data-val="' + esc(opt.value) + '">' +
        '<span class="zk-picker-row-label">' + esc(opt.textContent) + '</span>' +
        (on ? '<span class="zk-picker-check">✓</span>' : '') +
        '</button>';
    }
    Array.prototype.forEach.call(sel.children, function (child) {
      if (child.tagName === 'OPTGROUP') {
        html += '<p class="zk-picker-group">' + esc(child.label) + '</p>';
        Array.prototype.forEach.call(child.children, function (o) { html += optionRow(o); });
      } else if (child.tagName === 'OPTION') {
        // Boş value'lu "Seçin" placeholder satırını listede gösterme.
        if (child.value === '' && sel.value !== '') return;
        html += optionRow(child);
      }
    });

    var ov = openSheet(title, html || '<p class="zk-picker-empty">Seçenek yok.</p>', sel);
    ov.querySelectorAll('.zk-picker-row').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (isGhost(e)) return;
        sel.value = row.getAttribute('data-val');
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        // Alt-sayfa kapandiktan sonra ayni noktaya gelen sentetik tiklama
        // altta kalan baska bir alani acmasin.
        noktaIsaretle(e);
        closeSheet();
      });
    });
  }

  // ---- Takvim (input type=date yerine) ----
  function openCalendarSheet(input) {
    var title = 'Tarih seçin';
    var lbl = input.closest('label');
    if (lbl) {
      var span = lbl.querySelector('span');
      if (span) title = span.textContent.replace(/\*\s*$/, '').trim();
    }

    var today = new Date(); today.setHours(0, 0, 0, 0);
    var current = input.value ? new Date(input.value + 'T00:00:00') : new Date(today);
    var viewYear = current.getFullYear();
    var viewMonth = current.getMonth();

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function iso(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }

    function calHtml() {
      var first = new Date(viewYear, viewMonth, 1);
      var startDow = (first.getDay() + 6) % 7; // Pzt=0
      var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      var cells = '';
      for (var b = 0; b < startDow; b++) cells += '<span class="zk-cal-cell"></span>';
      for (var d = 1; d <= daysInMonth; d++) {
        var dIso = iso(viewYear, viewMonth, d);
        var cls = 'zk-cal-cell zk-cal-day';
        if (input.value === dIso) cls += ' zk-cal-sel';
        else if (dIso === iso(today.getFullYear(), today.getMonth(), today.getDate())) cls += ' zk-cal-today';
        cells += '<button type="button" class="' + cls + '" data-date="' + dIso + '">' + d + '</button>';
      }
      return '<div class="zk-cal-head">' +
        '<button type="button" class="zk-cal-nav" data-nav="-1">‹</button>' +
        '<p class="zk-cal-month">' + AYLAR[viewMonth] + ' ' + viewYear + '</p>' +
        '<button type="button" class="zk-cal-nav" data-nav="1">›</button></div>' +
        '<div class="zk-cal-grid">' + GUNLER.map(function (g) { return '<span class="zk-cal-cell zk-cal-dow">' + g + '</span>'; }).join('') + cells + '</div>' +
        '<button type="button" class="zk-cal-clear">Tarihi temizle</button>';
    }

    function bind(ov) {
      ov.querySelectorAll('.zk-cal-nav').forEach(function (b) {
        b.addEventListener('click', function (e) {
          if (isGhost(e)) return;
          viewMonth += Number(b.getAttribute('data-nav'));
          if (viewMonth < 0) { viewMonth = 11; viewYear--; }
          if (viewMonth > 11) { viewMonth = 0; viewYear++; }
          ov.querySelector('.zk-picker-body').innerHTML = calHtml();
          bind(ov);
        });
      });
      ov.querySelectorAll('.zk-cal-day').forEach(function (b) {
        b.addEventListener('click', function (e) {
          if (isGhost(e)) return;
          input.value = b.getAttribute('data-date');
          input.dispatchEvent(new Event('change', { bubbles: true }));
          noktaIsaretle(e);
          closeSheet();
        });
      });
      var clear = ov.querySelector('.zk-cal-clear');
      if (clear) clear.addEventListener('click', function (e) {
        if (isGhost(e)) return;
        input.value = '';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        closeSheet();
      });
    }

    var ov = openSheet(title, calHtml(), input);
    bind(ov);
  }

  // ---- Dokunma/tıklama yakalama ----
  // ÖNEMLİ: iOS'ta touchend'de preventDefault çağrılınca WebKit ardından
  // gelen mousedown/click olaylarını hiç üretmez. Eskiden sayfayı yalnızca
  // mousedown açtığı için iPhone'da ne yerleşik çark ne de bizim alt-sayfamız
  // açılıyordu (seçimler tıklanamaz görünüyordu). Artık dokunmayı touchend'in
  // kendisi açıyor; mousedown/click masaüstü ve yedek yol olarak duruyor.
  var touchStart = null;

  function pickerTarget(e) {
    var t = e.target;
    if (!t || !t.closest) return null;
    var sel = t.closest('select');
    if (sel && !sel.disabled) return sel;
    var inp = t.closest('input[type="date"]');
    if (inp && !inp.disabled && !inp.readOnly) return inp;
    return null;
  }

  function openFor(el) {
    if (el.tagName === 'SELECT') openSelectSheet(el);
    else openCalendarSheet(el);
  }

  // Alt-sayfa açıldıktan hemen sonra gelen "hayalet" tıklamanın listeden
  // rastgele bir satır seçmesini / sayfayı kapatmasını engelle.
  /* Olay hayalet mi? Yalnizca (a) son etkilesimden hemen sonra geldiyse VE
   * (b) tam ayni noktadaysa. Koordinatsiz olaylar (klavye, programatik)
   * hicbir zaman hayalet sayilmaz — aksi halde gercek secim yutulur. */
  function isGhost(e) {
    if (!sonNokta) return false;
    if (Date.now() - sonNokta.t >= GHOST_MS) return false;
    if (!e || typeof e.clientX !== 'number') return false;
    if (e.clientX === 0 && e.clientY === 0) return false;   // sentetik/koordinatsiz
    return Math.abs(e.clientX - sonNokta.x) <= GHOST_PX &&
           Math.abs(e.clientY - sonNokta.y) <= GHOST_PX;
  }
  function noktaIsaretle(e) {
    var t = e && e.changedTouches && e.changedTouches[0];
    if (t) { sonNokta = { t: Date.now(), x: t.clientX, y: t.clientY }; return; }
    sonNokta = (e && typeof e.clientX === 'number')
      ? { t: Date.now(), x: e.clientX, y: e.clientY }
      : null;
  }

  document.addEventListener('touchstart', function (e) {
    touchStart = (e.touches && e.touches.length === 1)
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY, el: pickerTarget(e) }
      : null;
  }, true);

  document.addEventListener('touchend', function (e) {
    var start = touchStart;
    touchStart = null;
    if (!start || !start.el || pickerTarget(e) !== start.el) return;
    var t = e.changedTouches && e.changedTouches[0];
    // Parmak kaydıysa bu bir sayfa kaydırmasıdır, seçim değil.
    if (t && (Math.abs(t.clientX - start.x) > 10 || Math.abs(t.clientY - start.y) > 10)) return;
    e.preventDefault(); // yerleşik iOS çarkı açılmasın
    if (overlay) return;
    noktaIsaretle(e);
    openFor(start.el);
  }, { capture: true, passive: false });

  document.addEventListener('mousedown', function (e) {
    var el = pickerTarget(e);
    if (!el) return;
    e.preventDefault();
    if (overlay || isGhost(e)) return;
    noktaIsaretle(e);
    openFor(el);
  }, true);

  // Yedek yol: mousedown hiç gelmeyen ortamlarda (bazı WebView'ler) tıklama.
  document.addEventListener('click', function (e) {
    var el = pickerTarget(e);
    if (!el) return;
    e.preventDefault();
    if (overlay || isGhost(e)) return;
    noktaIsaretle(e);
    openFor(el);
  }, true);

  window.ZkPicker = { close: closeSheet };
})();
