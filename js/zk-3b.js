/*
 * Zirkonik — 3B dosyalar (STL tarama + exocad HTML tasarım). 15 Ekim 2026.
 *
 * Sahibinin kuralları (sunucu da zorlar, migration 20261015190000_3b_dosyalar.sql):
 *  - STL'i doktor (siparişinde) ya da laboratuvar (iş açarken) yükler.
 *  - HTML'i işin bulunduğu 3B odasının yetkilisi yükler; "Doktora gönder" denince
 *    doktora bildirim gider ve doktor HTML'i görebilir.
 *  - Kaydetmeden önce yükleyen dosyayı kaldırır; kaydettikten sonra yalnız
 *    yönetici/işveren siler. Doktor hiç silemez.
 *
 * Akış (yukle): STL ise işçide sıkıştır (ZKM1) → job_files satırı yaz → dosyaları
 * Storage'a yükle (XHR, ilerleme çubuğu) → zk_3b_yukleme_tamam RPC. Bir adım
 * patlarsa satır ve yüklenen parçalar geri alınır.
 *
 * Dosya indirme cihazda saklanır (IndexedDB "zk3b", en fazla ~300 MB): aynı
 * dosya ikinci kez inmez. Görüntüleyici: 3b-goster.html?dosya=<id>.
 */
(function (global) {
  'use strict';

  var KOVA = 'is-dosyalari';
  var SINIR = 50 * 1024 * 1024;
  var ONBELLEK_SINIR = 300 * 1024 * 1024;

  function client() { return global.ZirkonikAuth.client(); }
  function url() { return global.SUPABASE_URL; }
  function anon() { return global.SUPABASE_ANON_KEY; }

  function kimlik() {
    try { if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID(); } catch (e) {}
    var s = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
    return s.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }

  function boyut(b) {
    b = Number(b) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
    return (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
  }

  function kacis(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function uzanti(ad) { var m = /\.([a-z0-9]+)$/i.exec(ad || ''); return m ? m[1].toLowerCase() : ''; }

  // Dosya türü denetimi — sunucuya gitmeden önce.
  function dogrula(file, tur) {
    if (!file) return 'Dosya seçilmedi.';
    if (file.size > SINIR) return 'Dosya 50 MB sınırını aşıyor (' + boyut(file.size) + ').';
    if (file.size === 0) return 'Dosya boş.';
    var u = uzanti(file.name);
    if (tur === 'stl' && u !== 'stl') return 'STL dosyası seçin (.stl).';
    if (tur === 'html' && u !== 'html' && u !== 'htm') return 'exocad HTML dosyası seçin (.html).';
    return null;
  }

  function erisimJetonu() {
    return client().auth.getSession().then(function (r) {
      var s = r && r.data ? r.data.session : null;
      if (!s || !s.access_token) throw new Error('Oturum bulunamadı, yeniden giriş yapın.');
      return s.access_token;
    });
  }

  // ---- İşçi (Web Worker) ----
  var isci = null, isciSayac = 0, isciBekleyen = {};
  function isciAl() {
    if (isci) return isci;
    isci = new Worker('js/zk-3b-isci.js');
    isci.onmessage = function (e) {
      var m = e.data || {};
      var b = isciBekleyen[m.id];
      if (!b) return;
      delete isciBekleyen[m.id];
      if (m.ok) b.res(m); else b.rej(new Error(m.hata || 'İşçi hatası'));
    };
    isci.onerror = function (e) {
      var hata = new Error('3B işçisi çalışmadı: ' + ((e && e.message) || 'bilinmeyen'));
      Object.keys(isciBekleyen).forEach(function (k) { isciBekleyen[k].rej(hata); });
      isciBekleyen = {};
      try { isci.terminate(); } catch (x) {}
      isci = null;
    };
    return isci;
  }
  function isciCalistir(tur, buffer) {
    return new Promise(function (res, rej) {
      var id = ++isciSayac;
      isciBekleyen[id] = { res: res, rej: rej };
      try { isciAl().postMessage({ id: id, tur: tur, buffer: buffer }, [buffer]); }
      catch (e) { delete isciBekleyen[id]; rej(e); }
    });
  }
  function isciKapat() { if (isci) { try { isci.terminate(); } catch (e) {} isci = null; isciBekleyen = {}; } }

  function dosyaOku(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(r.error || new Error('Dosya okunamadı')); };
      r.readAsArrayBuffer(file);
    });
  }

  // ---- Storage: XHR ile yükleme/indirme (ilerleme için; net-guard fetch'i sarar, XHR'ı değil) ----
  function xhrYukle(yol, veri, jeton, ilerleme) {
    return new Promise(function (res, rej) {
      var x = new XMLHttpRequest();
      x.open('POST', url() + '/storage/v1/object/' + KOVA + '/' + yol.split('/').map(encodeURIComponent).join('/'));
      x.setRequestHeader('Authorization', 'Bearer ' + jeton);
      x.setRequestHeader('apikey', anon());
      x.setRequestHeader('Content-Type', 'application/octet-stream');
      x.setRequestHeader('x-upsert', 'false');
      x.setRequestHeader('cache-control', '31536000');
      x.timeout = 10 * 60 * 1000;
      if (x.upload && ilerleme) x.upload.onprogress = function (e) { if (e.lengthComputable) ilerleme(e.loaded / e.total); };
      x.onload = function () {
        if (x.status >= 200 && x.status < 300) { res(); return; }
        var mesaj = 'Depolama ' + x.status;
        try { var j = JSON.parse(x.responseText); mesaj = j.message || j.error || mesaj; } catch (e) {}
        if (x.status === 403) mesaj = 'Yükleme yetkisi yok (' + mesaj + ')';
        rej(new Error(mesaj));
      };
      x.onerror = function () { rej(new Error('Bağlantı: dosya yüklenemedi. İnterneti kontrol edin.')); };
      x.ontimeout = function () { rej(new Error('Yükleme 10 dakikada bitmedi.')); };
      x.send(veri);
    });
  }

  function xhrIndir(yol, jeton, ilerleme) {
    return new Promise(function (res, rej) {
      var x = new XMLHttpRequest();
      x.open('GET', url() + '/storage/v1/object/authenticated/' + KOVA + '/' + yol.split('/').map(encodeURIComponent).join('/'));
      x.setRequestHeader('Authorization', 'Bearer ' + jeton);
      x.setRequestHeader('apikey', anon());
      x.responseType = 'arraybuffer';
      x.timeout = 10 * 60 * 1000;
      if (ilerleme) x.onprogress = function (e) { if (e.lengthComputable) ilerleme(e.loaded / e.total, e.loaded); else ilerleme(null, e.loaded); };
      x.onload = function () {
        if (x.status >= 200 && x.status < 300) { res(x.response); return; }
        rej(new Error(x.status === 404 ? 'Dosya depoda bulunamadı.' : (x.status === 403 ? 'Bu dosyayı görme yetkiniz yok.' : 'Depolama ' + x.status)));
      };
      x.onerror = function () { rej(new Error('Bağlantı: dosya indirilemedi.')); };
      x.ontimeout = function () { rej(new Error('İndirme 10 dakikada bitmedi.')); };
      x.send();
    });
  }

  // ---- Cihaz önbelleği (IndexedDB) ----
  var dbSoz = null;
  function dbAc() {
    if (dbSoz) return dbSoz;
    dbSoz = new Promise(function (res) {
      try {
        if (!global.indexedDB) { res(null); return; }
        var istek = global.indexedDB.open('zk3b', 1);
        istek.onupgradeneeded = function () {
          var db = istek.result;
          if (!db.objectStoreNames.contains('dosyalar')) db.createObjectStore('dosyalar');
        };
        istek.onsuccess = function () { res(istek.result); };
        istek.onerror = function () { res(null); };
        istek.onblocked = function () { res(null); };
      } catch (e) { res(null); }
    });
    return dbSoz;
  }
  function onbellekOku(anahtar) {
    return dbAc().then(function (db) {
      if (!db) return null;
      return new Promise(function (res) {
        try {
          var tx = db.transaction('dosyalar', 'readwrite');
          var st = tx.objectStore('dosyalar');
          var g = st.get(anahtar);
          g.onsuccess = function () {
            var v = g.result;
            if (v && v.buf) { try { v.t = Date.now(); st.put(v, anahtar); } catch (e) {} res(v.buf); }
            else res(null);
          };
          g.onerror = function () { res(null); };
        } catch (e) { res(null); }
      });
    });
  }
  function onbellekYaz(anahtar, buf) {
    return dbAc().then(function (db) {
      if (!db) return;
      return new Promise(function (res) {
        try {
          var tx = db.transaction('dosyalar', 'readwrite');
          var st = tx.objectStore('dosyalar');
          st.put({ buf: buf, t: Date.now(), n: buf.byteLength }, anahtar);
          // Sınır aşıldıysa en eski kullanılanları at.
          var hepsi = [];
          var c = st.openCursor();
          c.onsuccess = function () {
            var cur = c.result;
            if (cur) { hepsi.push({ k: cur.key, t: cur.value.t || 0, n: cur.value.n || 0 }); cur.continue(); return; }
            var toplam = hepsi.reduce(function (s, x) { return s + x.n; }, 0);
            hepsi.sort(function (a, b) { return a.t - b.t; });
            for (var i = 0; i < hepsi.length && toplam > ONBELLEK_SINIR; i++) {
              if (hepsi[i].k === anahtar) continue;
              try { st.delete(hepsi[i].k); } catch (e) {}
              toplam -= hepsi[i].n;
            }
          };
          tx.oncomplete = function () { res(); };
          tx.onerror = function () { res(); };
          tx.onabort = function () { res(); };
        } catch (e) { res(); }
      });
    });
  }
  function onbellekSil(anahtarlar) {
    return dbAc().then(function (db) {
      if (!db) return;
      try {
        var st = db.transaction('dosyalar', 'readwrite').objectStore('dosyalar');
        anahtarlar.forEach(function (k) { try { st.delete(k); } catch (e) {} });
      } catch (e) {}
    });
  }

  // ---- Veri ----
  function listele(filtre) {
    var q = client().from('job_files').select('*').not('uploaded_at', 'is', null).order('created_at');
    if (filtre.jobId) q = q.eq('job_id', filtre.jobId);
    else if (filtre.orderId) q = q.eq('order_id', filtre.orderId);
    return q.then(function (r) { return r.error ? Promise.reject(r.error) : (r.data || []); });
  }

  function getir(id) {
    return client().from('job_files').select('*, jobs(job_number, patient_name, clinic_protocol_no)').eq('id', id).maybeSingle()
      .then(function (r) { return r.error ? Promise.reject(r.error) : r.data; });
  }

  /*
   * yukle({ file, tur:'stl'|'html', jobId | orderId, orgId, rol:'doktor'|'laboratuvar', durum(metin, oran) })
   * → Promise<job_files satırı>
   */
  function yukle(o) {
    var hata = dogrula(o.file, o.tur);
    if (hata) return Promise.reject(new Error(hata));
    if (!o.jobId && !o.orderId) return Promise.reject(new Error('İş ya da sipariş kimliği yok.'));
    if (!o.orgId) return Promise.reject(new Error('Kuruluş kimliği yok.'));
    var durum = o.durum || function () {};
    var id = kimlik();
    var klasor = o.orgId + '/' + (o.jobId || o.orderId) + '/';
    var yol = klasor + id + '.' + (o.tur === 'stl' ? 'stl' : 'html');
    var sikYol = o.tur === 'stl' ? klasor + id + '.zkm1' : null;
    var satirYazildi = false, yuklenen = [];
    var sik = null, meta = {};
    var jeton;

    return erisimJetonu().then(function (j) {
      jeton = j;
      return client().auth.getUser ? Promise.resolve() : Promise.resolve();
    }).then(function () {
      durum('Dosya okunuyor…', null);
      return dosyaOku(o.file);
    }).then(function (buf) {
      if (o.tur !== 'stl') return buf;
      durum('Model küçültülüyor…', null);
      var kopya = buf.slice(0);
      return isciCalistir('stl-sikistir', kopya).then(function (m) {
        sik = m.zkm1; meta = { nokta: m.nokta, ucgen: m.ucgen, kutu: m.kutu };
        return buf;
      }, function (e) {
        // Sıkıştırma olmadı: ham STL yine de yüklenir, görüntüleyici hamı okur.
        sikYol = null; sik = null;
        if (global.console) console.warn('STL sıkıştırma başarısız: ' + e.message);
        return buf;
      });
    }).then(function (buf) {
      return client().from('job_files').insert({
        id: id,
        organization_id: o.orgId,
        job_id: o.jobId || null,
        order_id: o.orderId || null,
        kind: o.tur,
        file_name: String(o.file.name || 'dosya').slice(0, 200),
        size_bytes: o.file.size,
        storage_path: yol,
        compressed_path: sikYol,
        uploaded_by: o.userId,
        uploaded_role: o.rol
      }).select().single().then(function (r) {
        if (r.error) throw new Error(r.error.code === '42501' ? 'Bu dosyayı yükleme yetkiniz yok.' : r.error.message);
        satirYazildi = true;
        durum('Yükleniyor… 0%', 0);
        var toplam = buf.byteLength + (sik ? sik.byteLength : 0), bitenHam = 0;
        function oran(parca, p) { var y = (bitenHam + parca * p) / toplam; durum('Yükleniyor… ' + Math.round(y * 100) + '%', y); }
        return xhrYukle(yol, buf, jeton, function (p) { oran(buf.byteLength, p); }).then(function () {
          yuklenen.push(yol); bitenHam = buf.byteLength;
          if (!sik) return;
          return xhrYukle(sikYol, sik, jeton, function (p) { oran(sik.byteLength, p); }).then(function () { yuklenen.push(sikYol); });
        });
      });
    }).then(function () {
      durum('Kaydediliyor…', 1);
      return client().rpc('zk_3b_yukleme_tamam', {
        p_file: id,
        p_compressed_bytes: sik ? sik.byteLength : null,
        p_triangle_count: meta.ucgen || null
      }).then(function (r) {
        if (r.error) throw new Error(r.error.message);
        var satir = Array.isArray(r.data) ? r.data[0] : r.data;
        // Yeni yüklenen dosyayı hemen önbelleğe koy: ilk açılışta tekrar inmesin.
        if (satir && sik && satir.compressed_path) onbellekYaz(satir.id + ':' + satir.compressed_path, sik);
        return satir;
      });
    }).catch(function (err) {
      // Geri alma: yarım kalan satır ve parçalar temizlenir (yetki: uploaded_at boşken yükleyen silebilir).
      var temizlik = Promise.resolve();
      if (yuklenen.length) temizlik = temizlik.then(function () { return client().storage.from(KOVA).remove(yuklenen).then(function () {}, function () {}); });
      if (satirYazildi) temizlik = temizlik.then(function () { return client().from('job_files').delete().eq('id', id).then(function () {}, function () {}); });
      return temizlik.then(function () { throw err; });
    });
  }

  // Dosya içeriğini getirir (önce cihaz önbelleği). STL için küçültülmüş sürüm tercih edilir.
  function indir(satir, ilerleme, hamIste) {
    var yol = (!hamIste && satir.compressed_path) ? satir.compressed_path : satir.storage_path;
    var anahtar = satir.id + ':' + yol;
    return onbellekOku(anahtar).then(function (buf) {
      if (buf) return { buf: buf, yol: yol, onbellekten: true };
      return erisimJetonu().then(function (j) { return xhrIndir(yol, j, ilerleme); }).then(function (b) {
        return onbellekYaz(anahtar, b).then(function () { return { buf: b, yol: yol, onbellekten: false }; });
      });
    });
  }

  // Yalnız yönetici/işveren (sunucu da zorlar). Önce nesneler, sonra satır.
  function sil(satir) {
    var yollar = [satir.storage_path].concat(satir.compressed_path ? [satir.compressed_path] : []);
    return client().storage.from(KOVA).remove(yollar).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      return client().from('job_files').delete().eq('id', satir.id).select('id');
    }).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      if (!r.data || !r.data.length) throw new Error('Silme yetkiniz yok ya da kayıt zaten silinmiş.');
      return onbellekSil(yollar.map(function (y) { return satir.id + ':' + y; }));
    });
  }

  function doktoraGonder(id) {
    return client().rpc('zk_3b_doktora_gonder', { p_file: id }).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      return Array.isArray(r.data) ? r.data[0] : r.data;
    });
  }

  // İmzalı indirme bağlantısı (WebGL olmayan cihaz / CAD'e aktarma). 5 dakika geçerli.
  function indirmeBaglantisi(satir) {
    return client().storage.from(KOVA).createSignedUrl(satir.storage_path, 300, { download: satir.file_name || true }).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      return r.data.signedUrl;
    });
  }

  function gosterUrl(satir, geri) {
    return '3b-goster.html?dosya=' + encodeURIComponent(satir.id) + (geri ? '&geri=' + encodeURIComponent(geri) : '');
  }

  function webglVar() {
    try {
      var c = document.createElement('canvas');
      return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
    } catch (e) { return false; }
  }

  // ---- Arayüz parçaları ----

  /*
   * Dosya seçici: seçmeden önce "Seç", seçince ad + boyut + "Kaldır" (kaydetmeden önce
   * geri alma). Kaydetme düğmesi sayfanın kendisinde.
   * secici(el, { tur, etiket, degisti(file) }) → { al(), temizle(), kilitle(bool) }
   */
  function secici(el, o) {
    var tur = o.tur, file = null;
    var kabul = tur === 'stl' ? '.stl' : '.html,.htm';
    var inpId = 'zk3b-inp-' + kimlik().slice(0, 8);
    el.innerHTML =
      '<input id="' + inpId + '" type="file" accept="' + kabul + '" class="hidden">' +
      '<div data-rol="bos">' +
        '<label for="' + inpId + '" class="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-theme border border-border bg-background text-xs font-bold text-primary">' +
          '<iconify-icon icon="' + (tur === 'stl' ? 'lucide:box' : 'lucide:file-code') + '" class="text-base"></iconify-icon>' + kacis(o.etiket || (tur === 'stl' ? 'STL dosyası seç' : 'exocad HTML dosyası seç')) +
        '</label>' +
        '<p class="mt-1.5 text-[11px] text-muted-foreground">' + (tur === 'stl' ? 'Tarama / model dosyası (.stl), en fazla 50 MB.' : 'exocad webview çıktısı (.html), en fazla 50 MB.') + '</p>' +
      '</div>' +
      '<div data-rol="dolu" class="hidden flex items-center gap-2.5 rounded-theme border border-border bg-background px-3 py-2.5">' +
        '<iconify-icon icon="' + (tur === 'stl' ? 'lucide:box' : 'lucide:file-code') + '" class="shrink-0 text-lg text-primary"></iconify-icon>' +
        '<div class="min-w-0 flex-1"><p data-rol="ad" class="truncate text-sm font-bold"></p><p data-rol="boyut" class="text-[11px] text-muted-foreground"></p></div>' +
        '<button type="button" data-rol="kaldir" class="shrink-0 text-xs font-bold text-destructive">Kaldır</button>' +
      '</div>' +
      '<p data-rol="hata" class="mt-1.5 hidden text-xs font-semibold text-destructive"></p>';
    var inp = el.querySelector('#' + inpId);
    var bos = el.querySelector('[data-rol="bos"]'), dolu = el.querySelector('[data-rol="dolu"]');
    var hataEl = el.querySelector('[data-rol="hata"]');
    function ciz() {
      bos.classList.toggle('hidden', !!file);
      dolu.classList.toggle('hidden', !file);
      if (file) {
        el.querySelector('[data-rol="ad"]').textContent = file.name;
        el.querySelector('[data-rol="boyut"]').textContent = boyut(file.size) + (tur === 'stl' ? ' · yüklenirken küçültülür' : '');
      }
      if (o.degisti) o.degisti(file);
    }
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      var h = dogrula(f, tur);
      hataEl.classList.toggle('hidden', !h);
      hataEl.textContent = h || '';
      file = h ? null : f;
      if (h) inp.value = '';
      ciz();
    });
    el.querySelector('[data-rol="kaldir"]').addEventListener('click', function () {
      file = null; inp.value = ''; hataEl.classList.add('hidden'); ciz();
    });
    return {
      al: function () { return file; },
      temizle: function () { file = null; inp.value = ''; hataEl.classList.add('hidden'); ciz(); },
      kilitle: function (k) { inp.disabled = !!k; el.querySelector('[data-rol="kaldir"]').disabled = !!k; }
    };
  }

  // İlerleme satırı: durum(metin, oran) ile beslenir.
  function ilerlemeCubugu(el) {
    el.innerHTML = '<p data-rol="metin" class="text-xs font-semibold text-muted-foreground"></p>' +
      '<div style="height:6px;border-radius:999px;background:var(--color-secondary,#e5e7eb);overflow:hidden;margin-top:6px">' +
      '<div data-rol="bar" style="height:100%;width:0;border-radius:999px;background:var(--color-primary,#3D7CDC);transition:width .2s"></div></div>';
    el.classList.remove('hidden');
    var metin = el.querySelector('[data-rol="metin"]'), bar = el.querySelector('[data-rol="bar"]');
    return function (m, oran) {
      metin.textContent = m || '';
      if (oran == null) { bar.style.width = '100%'; bar.style.opacity = '.35'; }
      else { bar.style.opacity = '1'; bar.style.width = Math.round(Math.max(0, Math.min(1, oran)) * 100) + '%'; }
    };
  }

  /*
   * Dosya listesi. yetki: { gonder: bool, sil: bool }. Düğmeler data-3b-eylem ile
   * işaretlenir; sayfa el.addEventListener('click') ile ZK3B.eylem(e) çağırır.
   */
  function listeHtml(satirlar, yetki, geri) {
    if (!satirlar.length) return '';
    return satirlar.map(function (s) {
      var stl = s.kind === 'stl';
      var alt = boyut(s.size_bytes) + (stl && s.triangle_count ? ' · ' + Number(s.triangle_count).toLocaleString('tr-TR') + ' üçgen' : '') +
        ' · ' + (s.uploaded_role === 'doktor' ? 'doktor yükledi' : 'laboratuvar yükledi') +
        (s.uploaded_at ? ' · ' + new Date(s.uploaded_at).toLocaleDateString('tr-TR') : '');
      var rozet = !stl ? (s.sent_to_doctor_at
        ? '<span class="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-secondary-foreground">Doktora gönderildi</span>'
        : '<span class="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-accent">Doktora gönderilmedi</span>') : '';
      var dugmeler = '<a href="' + gosterUrl(s, geri) + '" class="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-theme bg-primary text-xs font-bold text-primary-foreground"><iconify-icon icon="lucide:rotate-3d" class="text-sm"></iconify-icon>3B göster</a>';
      if (!stl && !s.sent_to_doctor_at && yetki.gonder) dugmeler += '<button type="button" data-3b-eylem="gonder" data-3b-id="' + s.id + '" class="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-theme border border-border bg-background text-xs font-bold text-primary"><iconify-icon icon="lucide:send" class="text-sm"></iconify-icon>Doktora gönder</button>';
      if (yetki.sil) dugmeler += '<button type="button" data-3b-eylem="sil" data-3b-id="' + s.id + '" aria-label="Sil" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-theme border border-border bg-background text-destructive"><iconify-icon icon="lucide:trash-2" class="text-sm"></iconify-icon></button>';
      return '<div class="rounded-theme border border-border bg-background px-3 py-2.5">' +
        '<div class="flex items-center gap-2.5">' +
          '<iconify-icon icon="' + (stl ? 'lucide:box' : 'lucide:file-code') + '" class="shrink-0 text-lg text-primary"></iconify-icon>' +
          '<div class="min-w-0 flex-1"><p class="truncate text-sm font-bold">' + kacis(stl ? 'STL tarama' : 'exocad tasarım') + ' <span class="font-normal text-muted-foreground">· ' + kacis(s.file_name) + '</span></p>' +
          '<p class="mt-0.5 text-[11px] text-muted-foreground">' + kacis(alt) + '</p></div>' + rozet +
        '</div>' +
        '<div class="mt-2.5 flex gap-2">' + dugmeler + '</div>' +
      '</div>';
    }).join('');
  }

  global.ZK3B = {
    KOVA: KOVA, SINIR: SINIR,
    boyut: boyut, dogrula: dogrula, webglVar: webglVar,
    yukle: yukle, indir: indir, sil: sil, doktoraGonder: doktoraGonder, indirmeBaglantisi: indirmeBaglantisi,
    listele: listele, getir: getir, gosterUrl: gosterUrl,
    isciCalistir: isciCalistir, isciKapat: isciKapat,
    secici: secici, ilerlemeCubugu: ilerlemeCubugu, listeHtml: listeHtml
  };
})(typeof window !== 'undefined' ? window : this);
