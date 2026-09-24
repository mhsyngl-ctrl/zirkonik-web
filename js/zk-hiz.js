/* Zirkonik — hız hissi yardımcıları (24 Eylül 2026, sahibinin kuralı).
 * Medicamine ui-kit.js'teki optimistic/cachedLoad/handoff kalıbının Zirkonik
 * karşılığı. Sayfalar veri katmanını doğrudan çağırdığı için burada yalnız
 * ekran tarafı var:
 *  - toast(msg, kind): alt kenarda kısa uyarı; alert gibi akışı kesmez.
 *  - optimistic({apply, request, revert, label}): ekran önce değişir, sunucu
 *    arkadan; hata olursa revert + kırmızı uyarı. Para/silme/geri alınamaz
 *    işlemler bunu KULLANMAZ.
 *  - handoff/takeHandoff: liste kartından detaya kayıt taşıma (sessionStorage,
 *    5 dk geçerli, bir kez okunur).
 *  - cachePeek/cachePut: önbellekten anında göster, arkadan tazele
 *    (localStorage, kullanıcıya göre ayrılır; kullanıcı değişince temizlenir).
 */
(function (global) {
  'use strict';

  function toast(message, kind) {
    var el = document.getElementById('zk-hiz-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'zk-hiz-toast';
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 88px);transform:translateX(-50%);z-index:9999;max-width:calc(100% - 32px);padding:10px 16px;border-radius:12px;font-size:13px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.18);transition:opacity .2s;pointer-events:none;opacity:0;';
      document.body.appendChild(el);
    }
    el.style.background = kind === 'error' ? 'var(--color-destructive, #B42318)' : 'var(--color-foreground, #1F2937)';
    el.style.color = '#fff';
    el.textContent = message;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.opacity = '0'; }, kind === 'error' ? 4500 : 2500);
  }

  function optimistic(opts) {
    try { if (opts.apply) opts.apply(); } catch (e) { /* ekran hatası isteği engellemesin */ }
    return Promise.resolve().then(function () { return opts.request(); }).then(function (res) {
      if (res && res.error) throw res.error;
      return res || {};
    }).catch(function (err) {
      try { if (opts.revert) opts.revert(err); } catch (e) {}
      var msg = (err && err.message) ? err.message : String(err || '');
      toast((opts.label || 'Kaydedilemedi') + (msg ? ': ' + msg : ''), 'error');
      return { error: err || { message: msg } };
    });
  }

  function handoff(key, record) {
    try { global.sessionStorage.setItem('zk_handoff_' + key, JSON.stringify({ t: Date.now(), r: record })); } catch (e) {}
  }
  function takeHandoff(key, maxAgeMs) {
    try {
      var raw = global.sessionStorage.getItem('zk_handoff_' + key);
      if (!raw) return null;
      global.sessionStorage.removeItem('zk_handoff_' + key);
      var o = JSON.parse(raw);
      if (!o || !o.r || Date.now() - o.t > (maxAgeMs || 300000)) return null;
      return o.r;
    } catch (e) { return null; }
  }

  // Önbellek sahibi: aynı cihazda başka kullanıcı girerse eskisinin verisi
  // görünmesin diye anahtar kullanıcı kimliğiyle başlar; kimlik değişince
  // tüm zk_cache_* girdileri silinir.
  var OWNER_KEY = 'zk_cache_owner';
  function owner() { try { return global.localStorage.getItem(OWNER_KEY) || 'x'; } catch (e) { return 'x'; } }
  function setOwner(id) {
    try {
      var eski = global.localStorage.getItem(OWNER_KEY);
      if (eski && eski !== id) clearAll();
      global.localStorage.setItem(OWNER_KEY, id);
    } catch (e) {}
  }
  function clearAll() {
    try {
      var keys = [];
      for (var i = 0; i < global.localStorage.length; i++) { var k = global.localStorage.key(i); if (k && k.indexOf('zk_cache_') === 0) keys.push(k); }
      keys.forEach(function (k) { global.localStorage.removeItem(k); });
    } catch (e) {}
  }
  function cachePeek(key) {
    try {
      var raw = global.localStorage.getItem('zk_cache_' + owner() + '_' + key);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return o && o.d !== undefined ? o.d : null;
    } catch (e) { return null; }
  }
  function cachePut(key, data) {
    try { global.localStorage.setItem('zk_cache_' + owner() + '_' + key, JSON.stringify({ t: Date.now(), d: data })); } catch (e) {}
  }

  // Kullanıcı kimliği belli olunca önbellek sahibini güncelle (ilk çizim
  // eski sahibin anahtarıyla okunur; sahip değiştiyse o anda temizlenir).
  if (global.ZirkonikAuth && typeof global.ZirkonikAuth.me === 'function') {
    try {
      global.ZirkonikAuth.me().then(function (me) { if (me && me.id) setOwner(String(me.id)); }).catch(function () {});
    } catch (e) {}
  }

  global.ZKHiz = { toast: toast, optimistic: optimistic, handoff: handoff, takeHandoff: takeHandoff, cachePeek: cachePeek, cachePut: cachePut, clearCache: clearAll, setOwner: setOwner };
})(window);
