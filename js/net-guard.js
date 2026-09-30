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
(function (global) {
  var cfg = {
    version: '',
    rpc: 'log_client_error',
    getClient: null,
    context: function () { return {}; },
    t: function (s) { return s; },
    cache: null
  };
  var state = { offline: false, failed: false, cached: false, banner: null, sent: {}, queue: [], count: 0, reconnected: false };
  var MAX_PER_SESSION = 30;
  var YAVAS_MS = 6000;
  // Yan etkisi olmayan RPC'ler: cevapları önbelleğe alınabilir.
  var OKUNUR_RPC = ['zk_finans_ozet', 'zk_doktor_cari', 'has_room_access', 'zk_gelen_is_numaralari', 'zk_calisma_turleri_listele', 'my_org_status', 'calc_annual_leave_days'];

  function t(s) { try { return cfg.t(s) || s; } catch (e) { return s; } }
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
  function isNetworkError(err) {
    if (navigator.onLine === false) return true;
    if (!err) return false;
    var m = String((err && (err.message || err.details)) || err);
    if (/Failed to fetch|NetworkError|Load failed|network request failed|connection appears to be offline|ERR_INTERNET|ERR_NETWORK|ERR_CONNECTION|fetch failed|AbortError.*timeout|timed out/i.test(m)) return true;
    return err.name === 'TypeError' && /fetch/i.test(m);
  }
  function fail(err) {
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
    if (!cfg.cache || !url || url.indexOf('/rest/v1/') < 0) return null;
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
      var key = cacheKey(method, urlOf(input), init, input);
      var attempt = 0;
      function run() {
        return baseFetch(input, init).then(function (res) {
          ok();
          if (key && res && res.ok) cacheWrite(key, res);
          return res;
        }, function (err) {
          var net = isNetworkError(err);
          var iptal = !!(init && init.signal && init.signal.aborted);
          if (net && retriable && !iptal && attempt < 2 && navigator.onLine !== false) {
            attempt++;
            return new Promise(function (r) { setTimeout(r, attempt === 1 ? 700 : 2000); }).then(run);
          }
          if (net && !iptal && key) {
            return cacheRead(key).then(function (e) {
              if (e) { cachedShow(e, false); return cachedResponse(e); }
              fail(err);
              throw err;
            });
          }
          if (net && !iptal) fail(err);
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

  // ---- Hata günlüğü ----
  function report(kind, message, stack, extra) {
    try {
      if (!message) return;
      message = String(message).slice(0, 500);
      if (/log_client_error|netguard/i.test(message)) return;   // kendi hatamızla döngüye girmeyelim
      if (isNetworkError({ message: message })) return;          // ağ hataları banda düşer, günlüğe değil
      var key = kind + '|' + message;
      if (state.sent[key] || state.count >= MAX_PER_SESSION) return;
      state.sent[key] = true;
      state.count++;
      state.queue.push({ kind: kind, message: message, stack: stack ? String(stack).slice(0, 3000) : null, extra: extra || null });
      flush();
    } catch (e) {}
  }
  function flush() {
    var sb = safe(cfg.getClient);
    if (!sb || typeof sb.rpc !== 'function') return;
    while (state.queue.length) {
      var it = state.queue.shift();
      var ctx = safe(cfg.context) || {};
      var params = {};
      for (var k in ctx) if (Object.prototype.hasOwnProperty.call(ctx, k)) params[k] = ctx[k];
      params.p_page = (global.location && global.location.pathname ? global.location.pathname.split('/').pop() : '') || '';
      params.p_kind = it.kind;
      params.p_message = it.message;
      params.p_stack = it.stack;
      params.p_app_version = cfg.version || null;
      params.p_platform = (navigator.userAgent || '').slice(0, 200);
      params.p_extra = it.extra;
      try {
        sb.rpc(cfg.rpc, params).then(function () {}, function () {});
      } catch (e) {}
    }
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
      flush();
    },
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
