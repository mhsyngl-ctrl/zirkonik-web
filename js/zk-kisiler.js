/* Kişi adları (H: hasta · Dr. doktor · Dt. teknisyen) — iş kartı NEREDE varsa laboratuvar ayarıyla gelir.
   10 Kasım 2026 (sahibinin kararı): ayar (laboratories.show_people_on_job_cards) yalnız İşler sayfasında değil, iş kartının çıktığı her yerde geçerli.
   Kullanım (sayfa): <script src="js/zk-kisiler.js"> → sayfa açılışında bir kez ZKKisiler.hazir(yenidenCiz);
   kart çizerken: ZKKisiler.kartSatirlari(is) → ayar açıksa '<p>…</p>' satırları, kapalıysa ''; ZKKisiler.acik(is.laboratory_id).
   Teknisyen adı iş satırıyla AYNI sorguda gelir: iş seçimine `zk_son_teknisyen` eklenir (SQL 20261110120000; hesaplanan sütun, ayar kapalıysa ya da erişim yoksa boş döner) — gecikmesiz ve odadan bağımsız.
   'select *': sütun SQL'den önce istenmesin (yoksa ayar kapalı sayılır). Ayar geç gelirse hazir(fn) kartları yeniden çizdirir (İşler'deki "ad çıkmadı" hatası). */
(function (g) {
  'use strict';
  var ayar = {};            // laboratuvar kimliği → ayar açık mı
  var hazirMi = false, istendi = false, bekleyen = [];
  var KES = 'display:inline-block;max-width:min(100%,22rem);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // Adın içinde zaten "Dr."/"Dt." varsa ("Uzman Diş Hekimi Dr. Çınar…") ikinci kez eklenmez.
  function unvanli(unvan, ad) { return /(^|\s)(dr|dt)\.?(\s|$)/i.test(ad) ? ad : unvan + ' ' + ad; }
  function istemci() { return g.ZirkonikAuth && g.ZirkonikAuth.client ? g.ZirkonikAuth.client() : null; }

  function yukle() {
    if (istendi) return;
    var c = istemci();
    if (!c) return;
    istendi = true;
    c.from('laboratories').select('*').then(function (r) {
      (r.data || []).forEach(function (l) { ayar[l.id] = l.show_people_on_job_cards === true; });
      bitir();
    }, bitir);
  }
  function bitir() {
    hazirMi = true;
    var b = bekleyen; bekleyen = [];
    b.forEach(function (f) { try { f(); } catch (e) { /* kart çizimi sayfanın işi; burada sessiz */ } });
  }

  g.ZKKisiler = {
    /* Sayfa açılışında BİR KEZ: ayarlar gelince yenidenCiz çağrılır (zaten geldiyse çağrılmaz; çizimler acik() ile doğru okur). */
    hazir: function (yenidenCiz) {
      if (hazirMi) return;
      if (yenidenCiz) bekleyen.push(yenidenCiz);
      yukle();
    },
    acik: function (laboratuvarId) { return hazirMi && !!laboratuvarId && ayar[laboratuvarId] === true; },
    unvanli: unvanli,
    /* Kartın kişi satırları (ayar açıksa): 1) H: hasta (kalın)  2) Dr. doktor · Dt. teknisyen. İş: { laboratory_id, patient_name, zk_son_teknisyen, doctors:{full_name, kind} }. */
    kartSatirlari: function (j) {
      if (!j || !g.ZKKisiler.acik(j.laboratory_id)) return '';
      var cikti = '';
      if (j.patient_name) cikti += '<p class="mt-0.5 text-[11px] text-muted-foreground"><span style="' + KES + '">H: <b class="font-bold text-card-foreground">' + esc(j.patient_name) + '</b></span></p>';
      var e = [];
      if (j.doctors && j.doctors.full_name) {
        var ad = (j.doctors.kind === 'laborator' && g.ZirkonikData && g.ZirkonikData.musteriAdi) ? g.ZirkonikData.musteriAdi(j.doctors) : unvanli('Dr.', j.doctors.full_name);
        e.push('<span style="' + KES + '">' + esc(ad) + '</span>');
      }
      if (j.zk_son_teknisyen) e.push('<span style="' + KES + '">' + esc(unvanli('Dt.', j.zk_son_teknisyen)) + '</span>');
      if (e.length) cikti += '<p class="mt-0.5 text-[11px] text-muted-foreground" style="display:flex;flex-wrap:wrap;align-items:baseline;column-gap:14px;row-gap:1px">' + e.join('') + '</p>';
      return cikti;
    }
  };
})(window);
