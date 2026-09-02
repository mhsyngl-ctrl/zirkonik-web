/*
 * Zirkonik — dijital çalışma formu bileşeni (kağıt formun birebir dijitali).
 * Kullanım:
 *   ZkWorkForm.render(document.getElementById('wf-container'));
 *   var data = ZkWorkForm.getData();   // work_form jsonb için
 *   ZkWorkForm.onTeethChange = function(teeth) { ... };
 */
(function () {
  'use strict';

  var UPPER = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
  var LOWER = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

  var selected = {};
  var container = null;

  // Kullanıcının sağladığı React ToothChart tasarımından uyarlanan
  // geometri: 440x560 tek SVG, yarım elips çeneler, kesikli çeyrek
  // çizgileri, FDI numaraları normal vektör boyunca dışarıda.
  var CW = 440, CH = 560, RX = 140, RY = 170;
  var UPPER_C = { x: 220, y: 248 };
  var LOWER_C = { x: 220, y: 312 };

  function toothType(n) {
    var p = n % 10;
    if (p <= 2) return 'incisor';
    if (p === 3) return 'canine';
    if (p <= 5) return 'premolar';
    return 'molar';
  }

  function layoutArch(numbers, center, mirror) {
    return numbers.map(function (n, i) {
      var t = Math.PI + ((i + 0.5) * Math.PI) / 16;
      var sgn = mirror ? -1 : 1;
      var x = center.x + RX * Math.cos(t);
      var y = center.y + sgn * RY * Math.sin(t);
      var nx = Math.cos(t) / RX;
      var ny = (sgn * Math.sin(t)) / RY;
      var len = Math.sqrt(nx * nx + ny * ny);
      nx /= len; ny /= len;
      var rot = (Math.atan2(ny, nx) * 180) / Math.PI + 90;
      return { n: n, x: x, y: y, nx: nx, ny: ny, rot: rot, type: toothType(n), pos: n % 10 };
    });
  }

  function toothShapeSvg(type, pos, n) {
    var fiss = ' fill="none" stroke="#94a3b8" stroke-width="1.2" stroke-linecap="round" data-fissure="' + n + '" style="pointer-events:none"';
    if (type === 'incisor') {
      return '<rect x="-9" y="-13" width="18" height="26" rx="7"></rect>' +
        '<path d="M-5 6 Q0 9 5 6"' + fiss + '></path>';
    }
    if (type === 'canine') {
      return '<path d="M-9 4 L-9 -6 Q-9 -14 0 -15 Q9 -14 9 -6 L9 4 Q9 13 0 14 Q-9 13 -9 4 Z"></path>' +
        '<path d="M0 -6 L0 6"' + fiss + '></path>';
    }
    if (type === 'premolar') {
      return '<rect x="-11" y="-12" width="22" height="24" rx="9"></rect>' +
        '<path d="M-6 0 L6 0 M0 -4 L0 4"' + fiss + '></path>';
    }
    var w = pos === 8 ? 26 : 28, h = pos === 8 ? 28 : 30;
    return '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="9"></rect>' +
      '<path d="M' + (-w / 2 + 6) + ' 0 L' + (w / 2 - 6) + ' 0 M-5 -6 L-5 6 M5 -6 L5 6"' + fiss + '></path>';
  }

  function chartSvg() {
    var teeth = layoutArch(UPPER, UPPER_C, false).concat(layoutArch(LOWER, LOWER_C, true));
    var gum = 'fill="none" stroke="#f3a5b1" stroke-width="58" stroke-linecap="round"';

    var body =
      // Damak (üst) + dişeti bantları
      '<path d="M80 ' + UPPER_C.y + ' A' + RX + ' ' + RY + ' 0 0 1 360 ' + UPPER_C.y + ' Z" fill="#f7c4cc"></path>' +
      '<path d="M80 ' + UPPER_C.y + ' A' + RX + ' ' + RY + ' 0 0 1 360 ' + UPPER_C.y + '" ' + gum + '></path>' +
      '<path d="M80 ' + LOWER_C.y + ' A' + RX + ' ' + RY + ' 0 0 0 360 ' + LOWER_C.y + '" ' + gum + '></path>' +
      // Kesikli çeyrek çizgileri
      '<line x1="' + (CW / 2) + '" y1="20" x2="' + (CW / 2) + '" y2="' + (CH - 20) + '" stroke="#94a3b8" stroke-dasharray="4 4"></line>' +
      '<line x1="20" y1="' + (CH / 2) + '" x2="' + (CW - 20) + '" y2="' + (CH / 2) + '" stroke="#94a3b8" stroke-dasharray="4 4"></line>' +
      // Çeyrek etiketleri
      '<g fill="#64748b" font-size="13" font-weight="600">' +
      '<text x="22" y="110">Üst sağ</text>' +
      '<text x="' + (CW - 22) + '" y="110" text-anchor="end">Üst sol</text>' +
      '<text x="22" y="' + (CH - 96) + '">Alt sağ</text>' +
      '<text x="' + (CW - 22) + '" y="' + (CH - 96) + '" text-anchor="end">Alt sol</text></g>';

    body += teeth.map(function (t) {
      var lx = t.x + t.nx * 36, ly = t.y + t.ny * 36;
      return '<g data-tooth="' + t.n + '" role="checkbox" aria-checked="false" aria-label="Diş ' + t.n + '" tabindex="0" style="cursor:pointer;outline:none">' +
        '<g data-crown="' + t.n + '" transform="translate(' + t.x.toFixed(1) + ' ' + t.y.toFixed(1) + ') rotate(' + t.rot.toFixed(1) + ')"' +
          ' fill="#FFFFFF" stroke="#94a3b8" stroke-width="1.5">' +
          toothShapeSvg(t.type, t.pos, t.n) +
        '</g>' +
        '<text data-num="' + t.n + '" x="' + lx.toFixed(1) + '" y="' + (ly + 5).toFixed(1) + '" text-anchor="middle"' +
          ' font-size="14" font-weight="600" fill="var(--color-foreground)" font-family="inherit">' + t.n + '</text>' +
        '<circle cx="' + t.x.toFixed(1) + '" cy="' + t.y.toFixed(1) + '" r="17" fill="transparent"></circle>' +
        '</g>';
    }).join('');

    return '<svg viewBox="0 0 ' + CW + ' ' + CH + '" role="group" aria-label="Diş şeması"' +
      ' style="width:100%;max-width:440px;height:auto;display:block;margin:0 auto;touch-action:manipulation;user-select:none;-webkit-user-select:none;">' +
      body + '</svg>';
  }

  function radioRow(name, opts) {
    return '<div class="flex flex-wrap gap-1.5">' + opts.map(function (o) {
      return '<button type="button" data-radio="' + name + '" data-value="' + o + '" class="zk-opt rounded-lg border border-border bg-input px-3 py-2 text-xs font-semibold">' + o + '</button>';
    }).join('') + '</div>';
  }

  function checkRow(name, opts) {
    return '<div class="flex flex-wrap gap-1.5">' + opts.map(function (o) {
      return '<button type="button" data-check="' + name + '" data-value="' + o + '" class="zk-opt rounded-lg border border-border bg-input px-3 py-2 text-xs font-semibold">' + o + '</button>';
    }).join('') + '</div>';
  }

  var ZkWorkForm = {
    onTeethChange: null,

    render: function (el) {
      container = el;
      selected = {};
      el.innerHTML =
        '<div class="rounded-theme border border-border bg-card p-4">' +
          '<p class="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Diş yerleşimi</p>' +
          '<div class="mt-2">' + chartSvg() + '</div>' +
          '<p class="mt-3 text-xs text-muted-foreground">Seçilen diş: <span id="zk-wf-count" class="font-bold text-foreground">0</span> · <span id="zk-wf-teeth-list"></span></p>' +
        '</div>' +

        '<div class="mt-4 rounded-theme border border-border bg-card p-4 space-y-4">' +
          '<p class="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Klinik talepler</p>' +
          '<div><span class="mb-1.5 block text-xs font-bold">Renk / Shade (VITA)</span>' +
            radioRow('renk', ['A1','A2','A3','A3.5','A4','B1','B2','B3','B4','C1','C2','C3','C4','D2','D3','D4','BL1','BL2','BL3']) +
            '<input id="zk-wf-renk" type="text" class="mt-1.5 h-11 w-full rounded-theme border border-border bg-input px-3.5 text-sm" placeholder="Diğer renk (özel)"></div>' +
          '<div><span class="mb-1.5 block text-xs font-bold">Gingiva</span>' + radioRow('gingiva', ['Var', 'Yok']) + '</div>' +
          '<div><span class="mb-1.5 block text-xs font-bold">DVO (Oklüzal yükseklik)</span>' + radioRow('dvo', ['+0,5 mm', '-0,5 mm', '+1,0 mm', 'Korunsun']) + '</div>' +
          '<div><span class="mb-1.5 block text-xs font-bold">Prova / Final</span>' + radioRow('prova_final', ['Prova', 'Final']) + '</div>' +
          '<div><span class="mb-1.5 block text-xs font-bold">Diş boyu</span>' + radioRow('dis_boyu', ['Uzun (daha uzun)', 'Kısa (daha kısa)', 'Aynı kalsın']) + '</div>' +
          '<div><span class="mb-1.5 block text-xs font-bold">Gönderilen materyaller</span>' + checkRow('materyaller', ['Alçı Model', 'Dijital Model (STL)', 'Fotoğraf']) +
            '<input id="zk-wf-materyal-diger" type="text" class="mt-1.5 h-11 w-full rounded-theme border border-border bg-input px-3.5 text-sm" placeholder="Diğer materyal"></div>' +
          '<div><span class="mb-1.5 block text-xs font-bold">Gülüş tasarımı / diş formu</span>' + radioRow('gulus', ['Hollywood', 'Natural', 'Oval', 'Dominant', 'Mature', 'Youthful']) +
            '<input id="zk-wf-gulus-diger" type="text" class="mt-1.5 h-11 w-full rounded-theme border border-border bg-input px-3.5 text-sm" placeholder="Diğer (fotoğraf eki açıklaması)"></div>' +
          '<label class="block"><span class="mb-1.5 block text-xs font-bold">Özel istek / açıklama</span>' +
            '<textarea id="zk-wf-ozel" rows="3" class="w-full rounded-theme border border-border bg-input px-3.5 py-2.5 text-sm" placeholder="Laboratuvara not..."></textarea></label>' +
        '</div>';

      function toggleTooth(group) {
        var n = group.getAttribute('data-tooth');
        var crown = el.querySelector('[data-crown="' + n + '"]');
        var num = el.querySelector('[data-num="' + n + '"]');
        var fis = el.querySelector('[data-fissure="' + n + '"]');
        if (selected[n]) {
          delete selected[n];
          group.classList.remove('zk-sel');
          group.setAttribute('aria-checked', 'false');
          crown.setAttribute('fill', '#FFFFFF');
          crown.setAttribute('stroke', '#94a3b8');
          num.setAttribute('fill', 'var(--color-foreground)');
          if (fis) fis.setAttribute('stroke', '#94a3b8');
        } else {
          selected[n] = true;
          group.classList.add('zk-sel');
          group.setAttribute('aria-checked', 'true');
          crown.setAttribute('fill', 'var(--color-primary)');
          crown.setAttribute('stroke', 'var(--color-primary)');
          num.setAttribute('fill', 'var(--color-primary)');
          if (fis) fis.setAttribute('stroke', 'rgba(255,255,255,0.75)');
        }
        var teeth = ZkWorkForm.getTeeth();
        document.getElementById('zk-wf-count').textContent = teeth.length;
        var listEl = document.getElementById('zk-wf-teeth-list');
        if (listEl) listEl.textContent = teeth.join(', ');
        // iOS uygulamasında diş seçiminde hafif dokunsal titreşim (web'de sessizce atlanır).
        try {
          if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.nativeHaptic) {
            window.webkit.messageHandlers.nativeHaptic.postMessage('light');
          }
        } catch (e) {}
        if (typeof ZkWorkForm.onTeethChange === 'function') ZkWorkForm.onTeethChange(teeth);
      }

      el.addEventListener('keydown', function (e) {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        var t = e.target.closest ? e.target.closest('[data-tooth]') : null;
        if (t) { e.preventDefault(); toggleTooth(t); }
      });

      el.addEventListener('click', function (e) {
        var t = e.target.closest('[data-tooth]');
        if (t) {
          toggleTooth(t);
          return;
        }
        var r = e.target.closest('[data-radio]');
        if (r) {
          var group = r.getAttribute('data-radio');
          var already = r.classList.contains('bg-primary');
          el.querySelectorAll('[data-radio="' + group + '"]').forEach(function (b) {
            b.classList.remove('bg-primary', 'text-primary-foreground', 'border-primary');
            b.classList.add('bg-input');
          });
          if (!already) { r.classList.remove('bg-input'); r.classList.add('bg-primary', 'text-primary-foreground', 'border-primary'); }
          return;
        }
        var c = e.target.closest('[data-check]');
        if (c) {
          if (c.classList.contains('bg-primary')) { c.classList.remove('bg-primary', 'text-primary-foreground', 'border-primary'); c.classList.add('bg-input'); }
          else { c.classList.remove('bg-input'); c.classList.add('bg-primary', 'text-primary-foreground', 'border-primary'); }
        }
      });
    },

    getTeeth: function () {
      return Object.keys(selected).map(Number).sort(function (a, b) { return a - b; });
    },

    getData: function () {
      function radioVal(name) {
        var b = container.querySelector('[data-radio="' + name + '"].bg-primary');
        return b ? b.getAttribute('data-value') : null;
      }
      function checkVals(name) {
        return Array.prototype.map.call(
          container.querySelectorAll('[data-check="' + name + '"].bg-primary'),
          function (b) { return b.getAttribute('data-value'); }
        );
      }
      var materyaller = checkVals('materyaller');
      var matDiger = document.getElementById('zk-wf-materyal-diger').value.trim();
      if (matDiger) materyaller.push(matDiger);
      return {
        teeth: ZkWorkForm.getTeeth(),
        renk: radioVal('renk') || document.getElementById('zk-wf-renk').value.trim() || null,
        gingiva: radioVal('gingiva'),
        dvo: radioVal('dvo'),
        prova_final: radioVal('prova_final'),
        dis_boyu: radioVal('dis_boyu'),
        materyaller: materyaller,
        gulus: radioVal('gulus') || (document.getElementById('zk-wf-gulus-diger').value.trim() || null),
        ozel_istek: document.getElementById('zk-wf-ozel').value.trim() || null
      };
    }
  };

  window.ZkWorkForm = ZkWorkForm;
})();
