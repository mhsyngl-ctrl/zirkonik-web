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
(function (global) {
  var cfg = {
    version: '',
    rpc: 'log_client_error',
    getClient: null,
    context: function () { return {}; },
    t: function (s) { return s; }
  };
  var state = { offline: false, failed: false, banner: null, sent: {}, queue: [], count: 0, reconnected: false };
  var MAX_PER_SESSION = 30;

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
  function show(text, btnText) {
    var el = banner();
    el.querySelector('#netguard-msg').textContent = text;
    el.querySelector('#netguard-retry').textContent = btnText || t('Tekrar dene');
    el.style.display = 'block';
  }
  function hide() { if (state.banner) state.banner.style.display = 'none'; }
  function retry() { global.location.reload(); }

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
      state.failed = false;
      state.offline = false;
      hide();
    }
  }

  global.addEventListener('offline', function () {
    state.offline = true;
    show(t('İnternet bağlantısı yok.'));
  });
  global.addEventListener('online', function () {
    state.offline = false;
    if (!state.failed) { hide(); return; }
    if (formDolu()) {
      show(t('Bağlantı geri geldi.'), t('Yenile'));
    } else {
      show(t('Bağlantı geri geldi, yenileniyor…'), t('Yenile'));
      setTimeout(retry, 700);
    }
  });

  // ---- fetch sarmalayıcı: GET'lerde 2 yeniden deneme, ağ hatasında bant ----
  function wrapFetch(baseFetch) {
    return function (input, init) {
      var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var retriable = method === 'GET' || method === 'HEAD';
      var attempt = 0;
      function run() {
        return baseFetch(input, init).then(function (res) {
          ok();
          return res;
        }, function (err) {
          var net = isNetworkError(err);
          var iptal = !!(init && init.signal && init.signal.aborted);
          if (net && retriable && !iptal && attempt < 2 && navigator.onLine !== false) {
            attempt++;
            return new Promise(function (r) { setTimeout(r, attempt === 1 ? 700 : 2000); }).then(run);
          }
          if (net && !iptal) fail(err);
          throw err;
        });
      }
      return run();
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
    report: report,
    fail: fail,
    ok: ok,
    hide: hide,
    isNetworkError: isNetworkError
  };
})(window);
