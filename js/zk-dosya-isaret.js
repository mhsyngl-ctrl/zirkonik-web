/*
 * Zirkonik — iş kartında "3B dosya var" logosu ve "N. prova" rozeti (29 Ekim 2026).
 * Kartlar <span data-zk-is="<iş kimliği>"></span> yer tutucusu koyar; bu dosya sayfayı izler,
 * yeni yer tutucuları toplu sorar (iş başına değil, 50'şerli sorgu) ve simgeleri yazar.
 * Hata olursa (tablo yok, çevrimdışı) simge çıkmaz, sayfa etkilenmez.
 */
(function () {
  'use strict';
  var bilinen = {}; // iş kimliği → { logo: bool, prova: { n, bek } | null, istek: bool }
  var bekle = null;

  function isaretle(el, b) {
    el.setAttribute('data-zk-is-tamam', '1');
    var h = '';
    if (b && b.logo) h += '<img src="logo-dis.png" alt="3B dosya var" title="Bu işte 3B dosya var" class="inline-block h-4 w-auto align-middle" style="height:16px;width:auto">';
    if (b && !b.prova && b.istek) h += ' <span class="ml-1 rounded-full bg-secondary px-1.5 py-0.5 align-middle text-[10px] font-bold text-accent" title="Forma prova istendi, henüz doktora gönderilmedi">Prova bekleniyor</span>';
    if (b && b.prova) h += ' <span class="ml-1 rounded-full bg-secondary px-1.5 py-0.5 align-middle text-[10px] font-bold ' + (b.prova.bek ? 'text-accent' : 'text-muted-foreground') + '" title="Prova turları">' + b.prova.n + '. prova' + (b.prova.bek ? ' · doktorda' : '') + '</span>';
    el.innerHTML = h;
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
    for (var p = 0; p < sorulacak.length; p += 50) sor(sorulacak.slice(p, p + 50));
  }

  function sor(ids) {
    var c = ZirkonikAuth.client();
    var dosya = c.from('job_files').select('job_id').in('job_id', ids).not('uploaded_at', 'is', null).then(function (r) { return r.error ? null : (r.data || []); }, function () { return null; });
    var prova = c.from('job_prova_turlari').select('job_id, tur_no, sonuc').in('job_id', ids).then(function (r) { return r.error ? null : (r.data || []); }, function () { return null; });
    var istek = c.from('job_items').select('job_id, prova:work_form->>prova_final').in('job_id', ids).then(function (r) { return r.error ? null : (r.data || []); }, function () { return null; });
    Promise.all([dosya, prova, istek]).then(function (s) {
      if (s[0] === null && s[1] === null) return; // ikisi de başarısız: bir sonraki taramada yeniden denenir
      ids.forEach(function (id) { bilinen[id] = { logo: false, prova: null, istek: false }; });
      (s[2] || []).forEach(function (x) { if (x.prova === 'Prova' && bilinen[x.job_id]) bilinen[x.job_id].istek = true; });
      (s[0] || []).forEach(function (x) { bilinen[x.job_id].logo = true; });
      (s[1] || []).forEach(function (x) {
        var b = bilinen[x.job_id]; if (!b) return;
        if (!b.prova) b.prova = { n: 0, bek: false };
        if (x.tur_no > b.prova.n) b.prova.n = x.tur_no;
        if (x.sonuc === 'bekliyor') b.prova.bek = true;
      });
      zamanla();
    });
  }

  function zamanla() { if (!bekle) bekle = setTimeout(tara, 150); }

  function basla() {
    zamanla();
    new MutationObserver(zamanla).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) basla(); else document.addEventListener('DOMContentLoaded', basla);
})();
