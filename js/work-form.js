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

  // Diş tipi başına elle çizilmiş anatomik kron path'leri (yerel koordinat,
  // -y = kesici/oklüzal uç dışa bakar). Radyal olarak uzun, parlak kronlar;
  // azılarda dikey dalgalı fissür çizgisi.
  function toothShape(n) {
    var pos = n % 10;
    if (pos <= 2) { // kesici: uzun, kürek formlu
      return {
        path: 'M-9,-16 Q0,-18 9,-16 L7.4,10.5 Q6,15 0,15 Q-6,15 -7.4,10.5 Z',
        fissure: ''
      };
    }
    if (pos === 3) { // kanin: uzun, ucu sivri
      return {
        path: 'M0,-17.5 Q7,-13 9,-5 L7.2,10.5 Q5.8,15 0,15 Q-5.8,15 -7.2,10.5 L-9,-5 Q-7,-13 0,-17.5 Z',
        fissure: ''
      };
    }
    if (pos <= 5) { // küçük azı: oval, kısa fissürlü
      return {
        path: 'M0,-14 Q10.5,-14 10.5,0 Q10.5,14 0,14 Q-10.5,14 -10.5,0 Q-10.5,-14 0,-14 Z',
        fissure: 'M-1,-6 q2.5,3 0,6 q-2.5,3 0,6'
      };
    }
    // büyük azı: geniş, dikey dalgalı fissürlü
    return {
      path: 'M-10,-13.5 Q-12.5,-13.5 -12.5,-10 L-12.5,10 Q-12.5,13.5 -10,13.5 L10,13.5 Q12.5,13.5 12.5,10 L12.5,-10 Q12.5,-13.5 10,-13.5 Z',
      fissure: 'M-1,-8 q3,4 0,8 q-3,4 0,8 M-6,-2 q3,2.5 5,1 M6,3 q-3,-2.5 -5,-1'
    };
  }

  // Referans şema oranlarında at nalı çene: dar-uzun süperelips kavis,
  // dişler bitişik dizilir, üst çenede dolgulu damak, altta içi boş bant.
  function archSvg(nums, isUpper) {
    var W = 340, RX = 88, RY = 130, EXP = 1;
    var cx = 170;
    var cy = isUpper ? 162 : 80;
    var vh = isUpper ? 246 : 248;
    var sgn = isUpper ? -1 : 1;
    var svgId = isUpper ? 'u' : 'l';
    function pt(thDeg, scale) {
      var th = thDeg * Math.PI / 180;
      var c = Math.cos(th), si = Math.sin(th);
      var xx = RX * (scale || 1) * (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), EXP);
      var yy = RY * (scale || 1) * (si < 0 ? -1 : 1) * Math.pow(Math.abs(si), EXP);
      return { x: cx + xx, y: cy + sgn * yy };
    }
    function fmt(p) { return p.x.toFixed(1) + ' ' + p.y.toFixed(1); }

    var SWEEP_A = 206, SWEEP_B = -26;
    var pts = [];
    for (var i = 0; i < 16; i++) {
      var thDeg = SWEEP_A - (i + 0.5) * ((SWEEP_A - SWEEP_B) / 16);
      var p = pt(thDeg);
      p.n = nums[i];
      pts.push(p);
    }
    var center = 'M' + pts.map(fmt).join(' L ');
    var densePts = [];
    for (var d = SWEEP_A; d >= SWEEP_B; d -= 6) densePts.push(fmt(pt(d)));
    var denseLine = 'M' + densePts.join(' L ');

    var backdrop;
    if (isUpper) {
      // İçi dolu damak: bant + iç dolgu açık pembe, ortada koyu damak kubesi.
      var palPts = [];
      for (var d2 = 190; d2 >= -10; d2 -= 8) palPts.push(fmt(pt(d2, 0.52)));
      var dipOuter = pt(90, 0.1); dipOuter = (cx) + ' ' + (cy + RY * 0.34).toFixed(1);
      var firstDense = fmt(pt(SWEEP_A));
      backdrop =
        '<path d="' + denseLine + ' Q ' + dipOuter + ' ' + firstDense + ' Z" fill="#F0C9C6"></path>' +
        '<path d="' + denseLine + '" fill="none" stroke="#F0C9C6" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"></path>' +
        '<path d="M' + palPts.join(' L ') + ' Z" fill="#E2A39F" stroke="#E2A39F" stroke-width="16" stroke-linejoin="round"></path>';
    } else {
      backdrop =
        '<path d="' + denseLine + '" fill="none" stroke="#F0C9C6" stroke-width="42" stroke-linecap="round" stroke-linejoin="round"></path>';
    }

    var teeth = pts.map(function (p) {
      var dx = p.x - cx, dy = p.y - cy;
      var len = Math.sqrt(dx * dx + dy * dy);
      var a = Math.atan2(dy, dx) * 180 / Math.PI;
      var s = toothShape(p.n);
      var nx = p.x + dx / len * 30;
      var ny = p.y + dy / len * 30;
      var fissure = s.fissure
        ? '<path d="' + s.fissure + '" fill="none" stroke="#B9C6CB" stroke-width="1.2" stroke-linecap="round" data-fissure="' + p.n + '"></path>'
        : '';
      return '<g data-tooth="' + p.n + '">' +
        '<g transform="translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ') rotate(' + (a - 90).toFixed(1) + ')">' +
          '<path data-crown="' + p.n + '" d="' + s.path + '"' +
            ' fill="url(#zkTG' + svgId + ')" stroke="#AFC0C6" stroke-width="1.3"></path>' + fissure +
        '</g>' +
        '<text data-num="' + p.n + '" x="' + nx.toFixed(1) + '" y="' + ny.toFixed(1) + '" text-anchor="middle" dominant-baseline="central"' +
          ' font-size="13" font-weight="700" fill="var(--color-foreground)" font-family="inherit">' + p.n + '</text>' +
        '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="16" fill="transparent"></circle>' +
        '</g>';
    }).join('');

    return '<svg viewBox="0 0 ' + W + ' ' + vh + '" style="width:100%;height:auto;display:block;touch-action:manipulation;">' +
      '<defs><linearGradient id="zkTG' + svgId + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#FFFFFF"></stop><stop offset="1" stop-color="#E7EDEF"></stop></linearGradient></defs>' +
      backdrop + teeth + '</svg>';
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
          '<p class="mt-2 mb-1.5 text-center text-[11px] font-bold text-muted-foreground">ÜST ÇENE</p>' +
          archSvg(UPPER, true) +
          '<p class="mt-3 mb-1.5 text-center text-[11px] font-bold text-muted-foreground">ALT ÇENE</p>' +
          archSvg(LOWER, false) +
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

      el.addEventListener('click', function (e) {
        var t = e.target.closest('[data-tooth]');
        if (t) {
          var n = t.getAttribute('data-tooth');
          var crown = el.querySelector('[data-crown="' + n + '"]');
          var num = el.querySelector('[data-num="' + n + '"]');
          var fis = el.querySelector('[data-fissure="' + n + '"]');
          if (selected[n]) {
            delete selected[n];
            crown.setAttribute('fill', 'var(--color-input)');
            crown.setAttribute('stroke', 'var(--color-border)');
            num.setAttribute('fill', 'var(--color-foreground)');
            if (fis) fis.setAttribute('stroke', 'var(--color-border)');
          } else {
            selected[n] = true;
            crown.setAttribute('fill', 'var(--color-primary)');
            crown.setAttribute('stroke', 'var(--color-primary)');
            num.setAttribute('fill', 'var(--color-primary)');
            if (fis) fis.setAttribute('stroke', 'rgba(255,255,255,0.75)');
          }
          var teeth = ZkWorkForm.getTeeth();
          document.getElementById('zk-wf-count').textContent = teeth.length;
          var listEl = document.getElementById('zk-wf-teeth-list');
          if (listEl) listEl.textContent = teeth.join(', ');
          if (typeof ZkWorkForm.onTeethChange === 'function') ZkWorkForm.onTeethChange(teeth);
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
