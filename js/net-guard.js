// NetGuard — ağ hatası bandı, yeniden deneme ve istemci hata günlüğü (24 Eylül 2026).
// Her sayfada supabase-config.js'den hemen sonra yüklenir; supabase-client.js
// istemciyi bu dosyanın fetch sarmalayıcısıyla kurar ve configure() ile
// günlük yazıcısını bağlar. Bağımlılığı yoktur; sayfa yüklenmeden önce çalışır.
//
// Ne yapar:
//  1. Ağ hatası (sunucuya ulaşılamıyor / internet yok) → ekranın üstünde kırmızı bant
//     ve "Tekrar dene" düğmesi. GET istekleri 2 kez kendiliğinden yeniden denenir.
//  2. Bağlantı geri gelince: sayfada yazılmış bir form yoksa sayfa kendiliğinden
//     yenilenir; varsa bant "Bağlantı geri geldi — Yenile" der.
//  3. Yakalanmamış JS hataları ve reddedilen promise'ler sunucudaki hata günlüğüne
//     yazılır (RPC adı configure ile verilir). Ağ hataları günlüğe YAZILMAZ (banda düşer),
//     aynı hata oturumda bir kez yazılır, oturum başına en fazla 30 kayıt.
//  4. (30 Eylül 2026) Çevrimdışı okuma: configure({cache}) ile bir depo takılırsa
//     (js/zk-cevrimdisi.js) başarılı okuma cevapları (GET/HEAD + salt okunur RPC'ler)
//     depoya yazılır; internet yokken ya da sunucu YAVAS_MS içinde cevap vermezken
//     aynı isteğe depodaki son cevap verilir ve turuncu "son görülen veriler" bandı
//     çıkar. Bağlantı geri gelince önce bekleyen işlem kuyruğu (ZKKuyruk) gönderilir,
//     sonra sayfa yenilenir.
//  5. (5 Ekim 2026, Medicamine'deki "ölü buton" dersi) Süre sınırı: veri ve giriş
//     istekleri (/rest/v1/, /auth/v1/) en fazla SURE_MS bekler. Zayıf ağda ya da
//     wifi↔mobil geçişinde iOS ölü bağlantıdaki isteği süresiz bekletebiliyor; bu
//     istek oturum kilidini tutuyorsa sonraki tüm istekler de sıraya giriyor ve
//     butonlar uygulama kapatılana kadar kilitli kalıyordu. Dosya yükleme
//     (/storage/v1/) ve edge function'lar (/functions/v1/) muaf: uzun sürebilirler.
//     İnternet hiç yokken veri isteği denenmeden anında hatayla döner. Veri
//     isteklerinin ağ hataları code='ABORT_ERR' ile döner: supabase-js (postgrest)
//     okumaları kendi içinde 3 kez daha deniyordu (1+2+4 sn); bu kodu görünce
//     denemez (biz zaten 2 kez denedik). Hata metni Türkçedir.
//  6. (5 Ekim 2026) Acil kapatma anahtarları: sunucudaki app_flags tablosu
//     (cevrimdisi_okuma, cevrimdisi_kuyruk, istek_sure_siniri). Bir anahtar kapalıysa o
//     parça eski davranışa döner. Son bilinen değerler cihazda durur (internet yokken de
//     geçerli); her sayfa açılışında arkadan sunucudan tazelenir.
//  7. (5 Ekim 2026) Zaman aşımı ve sıraya alma olayları da hata günlüğüne yazılır
//     ('zaman_asimi', 'kuyruk'). Bunlar tam da bağlantı kötüyken oluştuğu için cihazda
//     bekletilir (localStorage) ve bağlantı gelince gönderilir; olayın gerçek saati extra.t.
//  8. (5 Ekim 2026) Son adımlar: her günlük kaydına hatadan önceki son 12 adım eklenir
//     (açılan sayfa, dokunulan düğme, ağ hatası). KİŞİSEL VERİ YOK: düğmenin yazısı değil
//     yalnız kimliği (id) ya da çağırdığı fonksiyonun adı yazılır; adreslerden sorgu atılır.
//     Hata günlüğünü yalnız platform sahibi görür (client_errors RLS, is_platform_admin).
(function (global) {
  var cfg = {
    version: '',
    rpc: 'log_client_error',
    getClient: null,
    context: function () { return {}; },
    t: function (s) { return s; },
    cache: null,
    sureMs: 0   // 0 → SURE_MS; testler configure({sureMs}) ile kısaltır
  };
  var state = { offline: false, failed: false, cached: false, banner: null, sent: {}, queue: [], count: 0, reconnected: false };
  var MAX_PER_SESSION = 30;
  var YAVAS_MS = 6000;
  var SURE_MS = 20000;
  // Yan etkisi olmayan RPC'ler: cevapları önbelleğe alınabilir.
  var OKUNUR_RPC = ['zk_finans_ozet', 'zk_doktor_cari', 'has_room_access', 'zk_gelen_is_numaralari', 'zk_calisma_turleri_listele', 'my_org_status', 'calc_annual_leave_days'];

  function t(s) { try { return cfg.t(s) || s; } catch (e) { return s; } }

  // ---- Acil kapatma anahtarları ----
  var ANAHTAR_DEPO = 'zk_anahtarlar';
  var anahtarlar = {};
  try { anahtarlar = JSON.parse(global.localStorage.getItem(ANAHTAR_DEPO) || '{}') || {}; } catch (e) {}
  // Bilinmeyen ya da hiç okunamamış anahtar = açık (tablo yoksa her şey eskisi gibi çalışır).
  // 6 Ekim 2026, sahibinin kararı: internetsiz çalışma (son görülen veri + bekleyen işlem
  // kuyruğu) YALNIZ telefon uygulamasında. Tarayıcıdaki web sitesinde (https + gerçek alan
  // adı, ör. app.zirkonik.com) kapalı: istekler doğrudan sunucuya gider, internet yoksa
  // bant uyarır. iOS kabuğu file://, Android https://localhost, yerel testler localhost'tur.
  function webSitesiMi() {
    try {
      var l = global.location;
      if (!l || (l.protocol !== 'http:' && l.protocol !== 'https:')) return false;
      var h = String(l.hostname || '').toLowerCase();
      return !(h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '');
    } catch (e) { return false; }
  }
  function acikMi(ad) {
    if ((ad === 'cevrimdisi_okuma' || ad === 'cevrimdisi_kuyruk') && webSitesiMi()) return false;
    return anahtarlar[ad] !== false;
  }
  function anahtarlariTazele() {
    var sb = safe(cfg.getClient);
    if (!sb || typeof sb.from !== 'function' || navigator.onLine === false) return Promise.resolve(anahtarlar);
    return Promise.resolve(sb.from('app_flags').select('key, enabled')).then(function (r) {
      if (!r || r.error || !Array.isArray(r.data)) return anahtarlar;   // hata: son bilinenler kalır
      var yeni = {};
      r.data.forEach(function (x) { if (x && x.key) yeni[x.key] = x.enabled !== false; });
      anahtarlar = yeni;
      try { global.localStorage.setItem(ANAHTAR_DEPO, JSON.stringify(yeni)); } catch (e) {}
      return anahtarlar;
    }, function () { return anahtarlar; });
  }
  function safe(fn) { try { return fn ? fn() : null; } catch (e) { return null; } }

  // ---- Bant ----
  function banner() {
    if (state.banner) return state.banner;
    var el = document.createElement('div');
    el.id = 'netguard-banner';
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;display:none;padding:calc(env(safe-area-inset-top,0px) + 10px) 16px 10px;background:#B42318;color:#fff;font:600 13px/1.35 -apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.25)';
    var msg = document.createElement('span');
    msg.id = 'netguard-msg';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'netguard-retry';
    btn.style.cssText = 'margin-left:12px;padding:6px 12px;border:1px solid rgba(255,255,255,.75);border-radius:999px;background:transparent;color:#fff;font:700 12px/1 inherit;cursor:pointer';
    btn.onclick = function () { retry(); };
    el.appendChild(msg);
    el.appendChild(btn);
    (document.body || document.documentElement).appendChild(el);
    state.banner = el;
    return el;
  }
  function show(text, btnText, renk) {
    var el = banner();
    el.querySelector('#netguard-msg').textContent = text;
    el.querySelector('#netguard-retry').textContent = btnText || t('Tekrar dene');
    el.style.background = renk || '#B42318';
    el.style.display = 'block';
  }
  function hide() { if (state.banner) state.banner.style.display = 'none'; }
  function retry() { global.location.reload(); }
  function yasMetni(t0) {
    var dk = Math.round((Date.now() - (t0 || Date.now())) / 60000);
    if (dk < 1) return t('az önce');
    if (dk < 60) return dk + ' ' + t('dk önce');
    var sa = Math.round(dk / 60);
    if (sa < 48) return sa + ' ' + t('saat önce');
    return Math.round(sa / 24) + ' ' + t('gün önce');
  }
  // Önbellekten cevap verildi: turuncu bant. failed=true kalır ki bağlantı gelince
  // sayfa yenilensin (son görülen veri gerçek veriyle değişsin).
  function cachedShow(entry, yavas) {
    state.failed = true;
    state.cached = true;
    var kaynak = yavas ? t('Bağlantı yavaş — son görülen veriler gösteriliyor') : t('Çevrimdışı — son görülen veriler gösteriliyor');
    show(kaynak + ' (' + yasMetni(entry && entry.t) + ')', t('Tekrar dene'), '#B54708');
  }

  // Sayfada kullanıcının yazdığı bir şey var mı? Varsa kendiliğinden yenilemeyiz.
  function formDolu() {
    try {
      var alanlar = document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([readonly]), textarea');
      for (var i = 0; i < alanlar.length; i++) {
        if (alanlar[i].value && alanlar[i].value !== alanlar[i].defaultValue) return true;
      }
    } catch (e) {}
    return false;
  }

  // ---- Sınıflandırma ----
  // Bizim ürettiğimiz bağlantı hataları (bilerek çevrilmez: AG_MESAJ bunları tanır).
  // supabase-js mesajı "<ad>: <mesaj>" diye birleştirir ("Bağlantı: İnternet
  // bağlantısı yok."); sayfalar bunu olduğu gibi gösterir.
  var AG_MESAJ = /İnternet bağlantısı yok|Sunucu \d+ saniye içinde cevap vermedi|Sunucuya ulaşılamadı\./;
  function agHatasi(mesaj, kaynak) {
    var e = new Error(mesaj);
    e.name = 'Bağlantı';
    e.code = 'ABORT_ERR';   // supabase-js bu kodu görünce yeniden denemez
    e.zkAg = true;
    if (kaynak) e.cause = kaynak;
    return e;
  }
  function sureliMi(url) { return /\/(rest|auth)\/v1\//.test(url); }
  function isNetworkError(err) {
    if (navigator.onLine === false) return true;
    if (!err) return false;
    if (err.zkAg) return true;
    var m = String((err && (err.message || err.details)) || err);
    if (AG_MESAJ.test(m)) return true;
    if (/Failed to fetch|NetworkError|Load failed|network request failed|connection appears to be offline|ERR_INTERNET|ERR_NETWORK|ERR_CONNECTION|fetch failed|AbortError.*timeout|timed out/i.test(m)) return true;
    return err.name === 'TypeError' && /fetch/i.test(m);
  }
  function fail(err) {
    if (!state.failed) adim('ağ hatası' + (navigator.onLine === false ? ' (internet yok)' : ''));
    state.failed = true;
    show(navigator.onLine === false ? t('İnternet bağlantısı yok.') : t('Sunucuya ulaşılamıyor. Bağlantını kontrol et.'));
  }
  function ok() {
    if ((state.failed || state.offline) && navigator.onLine !== false) {
      var eskiCached = state.cached;
      state.failed = false;
      state.offline = false;
      state.cached = false;
      hide();
      if (state.gunlukBekliyor) setTimeout(flush, 0);
      // "Yavaş bağlantı" bandıyla eski veri gösterilmişken sunucu sonunda cevap verdi:
      // sayfa verisini yumuşakça tazele (sayfa yeniden YÜKLENMEZ, form kaybolmaz).
      if (eskiCached) setTimeout(function () { try { if (global.ZkYenile) global.ZkYenile.tazele('baglanti'); } catch (e) {} }, 300);
    }
  }

  global.addEventListener('offline', function () {
    state.offline = true;
    show(t('İnternet bağlantısı yok.'));
  });
  global.addEventListener('online', function () {
    state.offline = false;
    // Önce internet yokken sıraya giren işlemler gitsin, sonra sayfa yenilensin.
    var kuyruk = null;
    try { kuyruk = global.ZKKuyruk ? global.ZKKuyruk.bosalt() : null; } catch (e) {}
    Promise.resolve(kuyruk).catch(function () {}).then(function () {
      if (!state.failed) { hide(); return; }
      if (formDolu()) {
        show(t('Bağlantı geri geldi.'), t('Yenile'));
      } else {
        show(t('Bağlantı geri geldi, yenileniyor…'), t('Yenile'));
        setTimeout(retry, 700);
      }
    });
  });

  // ---- Önbellek anahtarı: kullanıcı (JWT sub) + yöntem + adres (+ RPC gövdesi) ----
  function urlOf(input) { return typeof input === 'string' ? input : ((input && input.url) || ''); }
  function headerOf(init, input, ad) {
    try {
      var h = init && init.headers;
      if (h) {
        if (typeof h.get === 'function') return h.get(ad);
        for (var k in h) if (Object.prototype.hasOwnProperty.call(h, k) && k.toLowerCase() === ad) return h[k];
      }
      if (input && input.headers && typeof input.headers.get === 'function') return input.headers.get(ad);
    } catch (e) {}
    return null;
  }
  function jwtSub(init, input) {
    try {
      var a = headerOf(init, input, 'authorization') || '';
      var jwt = a.split(' ')[1];
      if (!jwt) return 'anon';
      var b = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var j = JSON.parse(atob(b));
      return j.sub || 'anon';
    } catch (e) { return 'anon'; }
  }
  function cacheKey(method, url, init, input) {
    if (!cfg.cache || !url || url.indexOf('/rest/v1/') < 0 || !acikMi('cevrimdisi_okuma')) return null;
    if (method === 'GET' || method === 'HEAD') return jwtSub(init, input) + '|' + method + '|' + url;
    if (method === 'POST') {
      var m = /\/rest\/v1\/rpc\/([a-z0-9_]+)/i.exec(url);
      if (m && OKUNUR_RPC.indexOf(m[1]) >= 0) {
        var body = init && init.body;
        return jwtSub(init, input) + '|RPC|' + url + '|' + (typeof body === 'string' ? body : '');
      }
    }
    return null;
  }
  function cachedResponse(e) {
    var h = { 'x-zk-onbellek': '1' };
    if (e.ct) h['content-type'] = e.ct;
    if (e.cr) h['content-range'] = e.cr;
    return new Response(e.b || '', { status: e.s || 200, headers: h });
  }
  function cacheRead(key) {
    try { return Promise.resolve(cfg.cache.oku(key)).catch(function () { return null; }); } catch (e) { return Promise.resolve(null); }
  }
  function cacheWrite(key, res) {
    try {
      res.clone().text().then(function (b) {
        cfg.cache.yaz(key, { s: res.status, ct: res.headers.get('content-type'), cr: res.headers.get('content-range'), b: b, t: Date.now() });
      }, function () {});
    } catch (e) {}
  }

  // ---- fetch sarmalayıcı: GET'lerde 2 yeniden deneme, ağ hatasında bant ya da önbellek ----
  function wrapFetch(baseFetch) {
    return function (input, init) {
      var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var retriable = method === 'GET' || method === 'HEAD';
      var url = urlOf(input);
      var sureli = sureliMi(url);
      var veri = url.indexOf('/rest/v1/') >= 0;
      var key = cacheKey(method, url, init, input);
      var attempt = 0;
      // Tek deneme: süre sınırlı (veri/giriş istekleri). Süre dolunca istek iptal
      // edilir ve "Sunucu N saniye içinde cevap vermedi" hatası döner.
      function tekDeneme() {
        if (!sureli || !acikMi('istek_sure_siniri')) return baseFetch(input, init);
        // "(istek gönderilmedi)" işareti önemli: finans.html bunu görünce para işlemini
        // güvenle tekrar denetir. Gönderildikten sonra kopan istek bu metni ALMAZ.
        if (navigator.onLine === false) return Promise.reject(agHatasi('İnternet bağlantısı yok (istek gönderilmedi).'));
        var ac = typeof AbortController === 'function' ? new AbortController() : null;
        var dis = init && init.signal;
        if (ac && dis) {
          if (dis.aborted) ac.abort();
          else if (dis.addEventListener) dis.addEventListener('abort', function () { ac.abort(); });
        }
        var init2 = init;
        if (ac) {
          init2 = {};
          if (init) for (var k in init) if (Object.prototype.hasOwnProperty.call(init, k)) init2[k] = init[k];
          init2.signal = ac.signal;
        }
        var sure = cfg.sureMs || SURE_MS;
        return new Promise(function (resolve, reject) {
          var bitti = false;
          var z = setTimeout(function () {
            if (bitti) return;
            bitti = true;
            try { if (ac) ac.abort(); } catch (e) {}
            var sn = Math.round(sure / 1000);
            var e = agHatasi('Sunucu ' + sn + ' saniye içinde cevap vermedi. Bağlantını kontrol edip tekrar dene.');
            e.zkSure = true;
            // Günlük: hangi istek takıldı (günlük isteğinin kendisi hariç — döngü olmasın).
            var yol = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
            if (yol.indexOf('/rpc/' + cfg.rpc) < 0 && !(dis && dis.aborted)) report('zaman_asimi', method + ' ' + yol + ' — ' + sn + ' sn içinde cevap yok', null, { sn: sn });
            reject(e);
          }, sure);
          baseFetch(input, init2).then(function (r) {
            if (bitti) return;
            bitti = true; clearTimeout(z); resolve(r);
          }, function (err) {
            if (bitti) return;
            bitti = true; clearTimeout(z); reject(err);
          });
        });
      }
      // Veri isteğinin son ağ hatası: supabase-js tekrar denemesin, mesaj Türkçe olsun.
      function sonHata(err) {
        if (!veri || !err || err.zkAg || !acikMi('istek_sure_siniri')) return err;
        // İstek gönderilmiş olabilir: bağlantı arada kopmuş olsa da "gönderilmedi" denmez.
        return agHatasi('Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.', err);
      }
      function run() {
        return tekDeneme().then(function (res) {
          ok();
          if (key && res && res.ok) cacheWrite(key, res);
          return res;
        }, function (err) {
          var net = isNetworkError(err);
          var iptal = !!(init && init.signal && init.signal.aborted);
          // Süre dolduysa yeniden denemeyiz: 3 × 20 sn beklemek "ölü buton"un ta kendisi.
          if (net && retriable && !iptal && !(err && err.zkSure) && attempt < 2 && navigator.onLine !== false) {
            attempt++;
            return new Promise(function (r) { setTimeout(r, attempt === 1 ? 700 : 2000); }).then(run);
          }
          if (net && !iptal && key) {
            return cacheRead(key).then(function (e) {
              if (e) { cachedShow(e, false); return cachedResponse(e); }
              fail(err);
              throw sonHata(err);
            });
          }
          if (net && !iptal) { fail(err); throw sonHata(err); }
          throw err;
        });
      }
      var ag = run();
      if (!key) return ag;
      // Yavaş bağlantı: YAVAS_MS içinde cevap yoksa ve önbellekte varsa onu ver;
      // ağ isteği arkada sürer, gelince önbelleği tazeler ve ok() sayfayı yumuşak yeniler.
      return new Promise(function (resolve, reject) {
        var bitti = false;
        var zamanlayici = setTimeout(function () {
          if (bitti) return;
          cacheRead(key).then(function (e) {
            if (bitti || !e) return;
            bitti = true;
            cachedShow(e, true);
            resolve(cachedResponse(e));
          });
        }, YAVAS_MS);
        ag.then(function (res) {
          clearTimeout(zamanlayici);
          if (!bitti) { bitti = true; resolve(res); }
        }, function (err) {
          clearTimeout(zamanlayici);
          if (!bitti) { bitti = true; reject(err); }
        });
      });
    };
  }
  var wrapped = wrapFetch(function (a, b) { return global.fetch(a, b); });

  // ---- Son adımlar ----
  var ADIM_DEPO = 'zk_son_adimlar', ADIM_MAX = 12;
  function adimlar() { try { var v = JSON.parse(global.sessionStorage.getItem(ADIM_DEPO) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function adim(metin) {
    try {
      var d = new Date();
      var saat = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
      var l = adimlar();
      l.push(saat + ' ' + String(metin).slice(0, 80));
      global.sessionStorage.setItem(ADIM_DEPO, JSON.stringify(l.slice(-ADIM_MAX)));
    } catch (e) {}
  }
  // Düğmenin kişisel veri taşımayan adı: id > onclick fonksiyonu > bağlantının sayfası > etiket.
  function dugmeAdi(el) {
    if (el.id) return '#' + el.id;
    var oc = el.getAttribute && el.getAttribute('onclick');
    var m = oc && /^\s*([A-Za-z_$][\w$.]*)\s*\(/.exec(oc);
    if (m) return m[1] + '()';
    var href = el.getAttribute && el.getAttribute('href');
    if (href && href.charAt(0) !== '#' && !/^(javascript|mailto|tel):/i.test(href)) return '→ ' + href.split('?')[0].split('#')[0];
    var ebeveyn = el.parentElement && el.parentElement.id ? ' in #' + el.parentElement.id : '';
    return (el.tagName || 'öğe').toLowerCase() + ebeveyn;
  }
  try {
    adim('sayfa ' + ((global.location && global.location.pathname ? global.location.pathname.split('/').pop() : '') || ''));
    global.document.addEventListener('click', function (ev) {
      try {
        var el = ev.target && ev.target.closest ? ev.target.closest('button, a, [onclick], [role=button]') : null;
        if (el) adim('dokun ' + dugmeAdi(el));
      } catch (e) {}
    }, true);
  } catch (e) {}

  // ---- Hata günlüğü ----
  // Ağla ilgili türler bağlantı kötüyken oluşur: cihazda bekletilir, sırayla gönderilir.
  var AG_TURLERI = { zaman_asimi: 1, kuyruk: 1 };
  var GUNLUK_DEPO = 'zk_gunluk_bekleyen', GUNLUK_MAX = 40;
  function bekleyenOku() { try { var v = JSON.parse(global.localStorage.getItem(GUNLUK_DEPO) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function bekleyenYaz(l) {
    try {
      if (l.length) global.localStorage.setItem(GUNLUK_DEPO, JSON.stringify(l.slice(-GUNLUK_MAX)));
      else global.localStorage.removeItem(GUNLUK_DEPO);
    } catch (e) {}
    state.gunlukBekliyor = l.length > 0;
  }
  state.gunlukBekliyor = bekleyenOku().length > 0;
  var gunlukGonderiliyor = false;
  function sayfaAdi() { return (global.location && global.location.pathname ? global.location.pathname.split('/').pop() : '') || ''; }

  // tekrarli: aynı mesaj oturumda birden çok kez yazılabilir (ör. her kuyruk gönderimi).
  function report(kind, message, stack, extra, tekrarli) {
    try {
      if (!message) return;
      message = String(message).slice(0, 500);
      if (/log_client_error|netguard/i.test(message)) return;   // kendi hatamızla döngüye girmeyelim
      // Tarayıcının sayfa geçişi animasyonu (View Transition) sayfa değişirken kendini iptal edince
      // verdiği zararsız uyarılar: kullanıcıyı etkilemez, günlüğü doldurmasın (6 Ekim 2026).
      if (/Skipping view transition|Transition was aborted because of invalid state|^Script error\.?$/i.test(message)) return;
      // Ağ hataları banda düşer, günlüğe değil — zaman aşımı/kuyruk kayıtları hariç.
      if (!AG_TURLERI[kind] && isNetworkError({ message: message })) return;
      var key = kind + '|' + message;
      if ((state.sent[key] && !tekrarli) || state.count >= MAX_PER_SESSION) return;
      state.sent[key] = true;
      state.count++;
      var ek = {};
      if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) ek[k] = extra[k];
      ek.t = new Date().toISOString();
      var son = adimlar();
      if (son.length) ek.adimlar = son;
      var it = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), kind: kind, message: message, stack: stack ? String(stack).slice(0, 3000) : null, extra: ek, page: sayfaAdi() };
      if (AG_TURLERI[kind]) { var l = bekleyenOku(); l.push(it); bekleyenYaz(l); }
      else state.queue.push(it);
      flush();
    } catch (e) {}
  }
  function paramlar(it) {
    var ctx = safe(cfg.context) || {};
    var params = {};
    for (var k in ctx) if (Object.prototype.hasOwnProperty.call(ctx, k)) params[k] = ctx[k];
    params.p_page = it.page || sayfaAdi();
    params.p_kind = it.kind;
    params.p_message = it.message;
    params.p_stack = it.stack;
    params.p_app_version = cfg.version || null;
    params.p_platform = (navigator.userAgent || '').slice(0, 200);
    params.p_extra = it.extra;
    return params;
  }
  function flush() {
    var sb = safe(cfg.getClient);
    if (!sb || typeof sb.rpc !== 'function') return;
    while (state.queue.length) {
      var it = state.queue.shift();
      try { sb.rpc(cfg.rpc, paramlar(it)).then(function () {}, function () {}); } catch (e) {}
    }
    // Bekletilenler: birer birer; bağlantı yine yoksa listede kalır.
    if (gunlukGonderiliyor || !state.gunlukBekliyor || navigator.onLine === false) return;
    var ilk = bekleyenOku()[0];
    if (!ilk) { bekleyenYaz([]); return; }
    gunlukGonderiliyor = true;
    Promise.resolve().then(function () { return sb.rpc(cfg.rpc, paramlar(ilk)); }).then(function (r) {
      gunlukGonderiliyor = false;
      if (r && r.error && isNetworkError(r.error)) return;
      // Gitti (ya da sunucu reddetti — tekrar denemenin anlamı yok): listeden çık, sıradakine geç.
      bekleyenYaz(bekleyenOku().filter(function (x) { return x.id !== ilk.id; }));
      flush();
    }, function () { gunlukGonderiliyor = false; });
  }

  global.addEventListener('error', function (ev) {
    var hedef = ev && ev.target;
    if (hedef && hedef !== global && hedef.tagName && /^(SCRIPT|IMG|LINK|AUDIO|VIDEO)$/.test(hedef.tagName)) {
      if (navigator.onLine === false) fail();
      return;   // kaynak yükleme hatası; JS hatası değil
    }
    var err = ev && ev.error;
    report('js', (err && err.message) || (ev && ev.message), err && err.stack,
      { line: ev && ev.lineno, col: ev && ev.colno, src: ev && ev.filename ? String(ev.filename).split('/').pop() : null });
  }, true);
  global.addEventListener('unhandledrejection', function (ev) {
    var r = ev && ev.reason;
    if (isNetworkError(r)) { fail(r); return; }
    var msg = (r && (r.message || r.details)) || String(r);
    report('promise', msg, r && r.stack, r && (r.code || r.hint) ? { code: r.code || null, hint: r.hint || null } : null);
  });

  global.NetGuard = {
    configure: function (o) {
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) cfg[k] = o[k];
      if (o && o.getClient) setTimeout(anahtarlariTazele, 0);
      flush();
    },
    acikMi: acikMi,
    adim: adim,
    adimlar: adimlar,
    anahtarlariTazele: anahtarlariTazele,
    fetch: function (input, init) { return wrapped(input, init); },
    wrapFetch: wrapFetch,
    report: report,
    fail: fail,
    ok: ok,
    hide: hide,
    isNetworkError: isNetworkError,
    durum: function () { return { offline: state.offline, failed: state.failed, cached: state.cached }; }
  };
})(window);
