/*
 * Zirkonik — iş kartında "3B dosya var" simgesi (29 Ekim 2026).
 * Kartlar <span data-zk-is="<iş kimliği>"></span> yer tutucusu koyar; bu dosya sayfayı izler,
 * yeni yer tutucuları toplu sorar (tek sorgu) ve dosyası olan işlere Zirkonik amblemini yazar.
 * Hata olursa simge çıkmaz, sayfa etkilenmez.
 */
(function () {
  'use strict';
  var bilinen = {}; // iş kimliği → true (dosya var) | false (yok)
  var bekle = null;

  function isaretle(el, var_) {
    el.setAttribute('data-zk-is-tamam', '1');
    if (var_) el.innerHTML = '<img src="logo-dis.png" alt="3B dosya var" title="Bu işte 3B dosya var" class="inline-block h-4 w-auto align-middle" style="height:16px;width:auto">';
  }

  function tara() {
    bekle = null;
    var yer = document.querySelectorAll('[data-zk-is]:not([data-zk-is-tamam])');
    var sorulacak = [];
    for (var i = 0; i < yer.length; i++) {
      var id = yer[i].getAttribute('data-zk-is');
      if (id in bilinen) isaretle(yer[i], bilinen[id]);
      else if (sorulacak.indexOf(id) < 0) sorulacak.push(id);
    }
    if (!sorulacak.length || !window.ZirkonikAuth || !ZirkonikAuth.client) return;
    var parcalar = [];
    for (var p = 0; p < sorulacak.length; p += 50) parcalar.push(sorulacak.slice(p, p + 50));
    parcalar.forEach(function (ids) {
      ZirkonikAuth.client().from('job_files').select('job_id').in('job_id', ids).not('uploaded_at', 'is', null).then(function (r) {
        if (r.error) return;
        ids.forEach(function (id) { bilinen[id] = false; });
        (r.data || []).forEach(function (x) { bilinen[x.job_id] = true; });
        zamanla();
      }, function () {});
    });
  }

  function zamanla() { if (!bekle) bekle = setTimeout(tara, 150); }

  function basla() {
    zamanla();
    new MutationObserver(zamanla).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) basla(); else document.addEventListener('DOMContentLoaded', basla);
})();
