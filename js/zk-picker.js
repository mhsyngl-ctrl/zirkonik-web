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

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function closeSheet() {
    if (overlay) { overlay.remove(); overlay = null; }
  }

  function openSheet(titleText, bodyHtml) {
    closeSheet();
    overlay = document.createElement('div');
    overlay.className = 'zk-picker-overlay';
    overlay.innerHTML =
      '<div class="zk-picker-backdrop"></div>' +
      '<div class="zk-picker-sheet">' +
        '<div class="zk-picker-grab"></div>' +
        '<p class="zk-picker-title">' + esc(titleText) + '</p>' +
        '<div class="zk-picker-body">' + bodyHtml + '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('.zk-picker-backdrop').addEventListener('click', closeSheet);
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

    var ov = openSheet(title, html || '<p class="zk-picker-empty">Seçenek yok.</p>');
    ov.querySelectorAll('.zk-picker-row').forEach(function (row) {
      row.addEventListener('click', function () {
        sel.value = row.getAttribute('data-val');
        sel.dispatchEvent(new Event('change', { bubbles: true }));
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
        b.addEventListener('click', function () {
          viewMonth += Number(b.getAttribute('data-nav'));
          if (viewMonth < 0) { viewMonth = 11; viewYear--; }
          if (viewMonth > 11) { viewMonth = 0; viewYear++; }
          ov.querySelector('.zk-picker-body').innerHTML = calHtml();
          bind(ov);
        });
      });
      ov.querySelectorAll('.zk-cal-day').forEach(function (b) {
        b.addEventListener('click', function () {
          input.value = b.getAttribute('data-date');
          input.dispatchEvent(new Event('change', { bubbles: true }));
          closeSheet();
        });
      });
      var clear = ov.querySelector('.zk-cal-clear');
      if (clear) clear.addEventListener('click', function () {
        input.value = '';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        closeSheet();
      });
    }

    var ov = openSheet(title, calHtml());
    bind(ov);
  }

  // Belge düzeyinde yakala: yerli seçici hiç açılmadan bizimki açılır.
  // (mousedown'da preventDefault, WebKit'in select/tarih çarkını engeller.)
  ['mousedown', 'touchend'].forEach(function (evName) {
    document.addEventListener(evName, function (e) {
      var sel = e.target.closest ? e.target.closest('select') : null;
      if (sel && !sel.disabled) {
        e.preventDefault();
        if (evName === 'mousedown') openSelectSheet(sel);
        return;
      }
      var inp = e.target.closest ? e.target.closest('input[type="date"]') : null;
      if (inp && !inp.disabled && !inp.readOnly) {
        e.preventDefault();
        if (evName === 'mousedown') openCalendarSheet(inp);
      }
    }, true);
  });

  window.ZkPicker = { close: closeSheet };
})();
