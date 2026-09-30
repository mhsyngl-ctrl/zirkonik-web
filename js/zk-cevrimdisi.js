/* Zirkonik — çevrimdışı çalışma (30 Eylül 2026, sahibinin isteği).
 *
 * İki parça:
 *  1. OKUMA ÖNBELLEĞİ DEPOSU: NetGuard'ın fetch sarmalayıcısı, sunucudan gelen her
 *     başarılı okuma cevabını (GET/HEAD ve salt okunur RPC'ler) buraya yazar; internet
 *     yokken ya da sunucu 6 sn cevap vermezken aynı isteğe buradaki son cevabı verir.
 *     Sayfalar bunu bilmez — kendi sorgularını atar, cevap "son görülen veri" olur ve
 *     ekranın üstünde turuncu bant çıkar. Depo IndexedDB (yoksa bellek); anahtar
 *     kullanıcı kimliğiyle başlar, başka kullanıcının verisi görünmez. 7 günden eski
 *     kayıtlar açılışta silinir.
 *  2. BEKLEYEN İŞLEM KUYRUĞU (ZKKuyruk): internet yokken yapılan seçili yazmalar
 *     (oda ilerletme, teslim alma, temas kaydı, görev tamamlama) cihazda sıraya girer;
 *     ekran hemen güncellenir, internet gelince sırayla sunucuya (zk_kuyruk_isle RPC)
 *     gönderilir. Her işlemin cihazda üretilmiş kimliği vardır: sunucu aynı kimliği
 *     ikinci kez görürse yok sayar (çift kayıt olmaz). Sunucu bir işlemi reddederse
 *     "gönderilemeyenler" listesine düşer ve alt kenardaki çip bunu gösterir; kullanıcı
 *     tekrar dener ya da vazgeçer. Sessiz kayıp yok.
 *
 * Para, silme, iptal, sipariş onayı ve fiyat işlemleri bilerek kuyruğa GİRMEZ
 * (CLAUDE.md hız kuralı: önce onay, sonra sunucu, sonra ekran).
 *
 * Yükleme sırası: supabase-client.js ve zk-hiz.js'den SONRA, sayfanın kendi
 * kodundan ÖNCE (NetGuard'a depo ilk sorgudan önce takılmalı).
 */
(function (global) {
  'use strict';

  var DB_AD = 'zk_cevrimdisi', STORE = 'get', ESKI_MS = 7 * 24 * 3600 * 1000;
  var bellek = {};
  var dbSozu = null;

  function dbAc() {
    if (dbSozu) return dbSozu;
    dbSozu = new Promise(function (res) {
      try {
        if (!global.indexedDB) { res(null); return; }
        var istek = global.indexedDB.open(DB_AD, 1);
        istek.onupgradeneeded = function () {
          var d = istek.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
        };
        istek.onsuccess = function () { res(istek.result); };
        istek.onerror = function () { res(null); };
        istek.onblocked = function () { res(null); };
      } catch (e) { res(null); }
    });
    return dbSozu;
  }
  function depoOku(key) {
    return dbAc().then(function (d) {
      if (!d) return bellek[key] || null;
      return new Promise(function (res) {
        try {
          var r = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
          r.onsuccess = function () { res(r.result || null); };
          r.onerror = function () { res(null); };
        } catch (e) { res(null); }
      });
    });
  }
  function depoYaz(key, deger) {
    // Tek bir dev cevap (ör. 1000 satırlık liste) depoyu şişirmesin: 1 MB üstü yazılmaz.
    if (deger && deger.b && deger.b.length > 1000000) return Promise.resolve(false);
    return dbAc().then(function (d) {
      if (!d) { bellek[key] = deger; return true; }
      return new Promise(function (res) {
        try {
          var r = d.transaction(STORE, 'readwrite').objectStore(STORE).put(deger, key);
          r.onsuccess = function () { res(true); };
          r.onerror = function () { res(false); };
        } catch (e) { res(false); }
      });
    });
  }
  function depoTemizle() {
    var esik = Date.now() - ESKI_MS;
    return dbAc().then(function (d) {
      if (!d) { Object.keys(bellek).forEach(function (k) { if (!bellek[k] || bellek[k].t < esik) delete bellek[k]; }); return; }
      try {
        var st = d.transaction(STORE, 'readwrite').objectStore(STORE);
        var c = st.openCursor();
        c.onsuccess = function () {
          var cur = c.result;
          if (!cur) return;
          if (!cur.value || !cur.value.t || cur.value.t < esik) cur.delete();
          cur.continue();
        };
      } catch (e) {}
    });
  }
  function depoBosalt() {
    bellek = {};
    return dbAc().then(function (d) {
      if (!d) return;
      try { d.transaction(STORE, 'readwrite').objectStore(STORE).clear(); } catch (e) {}
    });
  }

  var depo = { oku: depoOku, yaz: depoYaz, temizle: depoTemizle, bosalt: depoBosalt };
  if (global.NetGuard && typeof global.NetGuard.configure === 'function') {
    global.NetGuard.configure({ cache: depo });
  }
  setTimeout(function () { try { depo.temizle(); } catch (e) {} }, 5000);

  // ---------------------------------------------------------------------------
  // Bekleyen işlem kuyruğu
  // ---------------------------------------------------------------------------
  function sahip() {
    try { return global.localStorage.getItem('zk_cache_owner') || 'x'; } catch (e) { return 'x'; }
  }
  function K_KUYRUK() { return 'zk_kuyruk_' + sahip(); }
  function K_HATA() { return 'zk_kuyruk_hata_' + sahip(); }
  function listeOku(k) {
    try { var v = JSON.parse(global.localStorage.getItem(k)); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function listeYaz(k, arr) {
    try { global.localStorage.setItem(k, JSON.stringify(arr)); } catch (e) {}
  }
  function kimlik() {
    try { if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID(); } catch (e) {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function agHatasiMi(err) {
    try { if (global.NetGuard && global.NetGuard.isNetworkError) return global.NetGuard.isNetworkError(err); } catch (e) {}
    return global.navigator && global.navigator.onLine === false;
  }
  function cevrimdisiMi() {
    if (global.__zkCevrimdisiZorla) return true;
    if (global.navigator && global.navigator.onLine === false) return true;
    try { var d = global.NetGuard && global.NetGuard.durum && global.NetGuard.durum(); if (d && d.offline) return true; } catch (e) {}
    return false;
  }

  function ekle(tur, veri, ozet, opId) {
    var kuyruk = listeOku(K_KUYRUK());
    var op = { op_id: opId || kimlik(), tur: tur, veri: veri || {}, ozet: ozet || tur, t: Date.now() };
    kuyruk.push(op);
    listeYaz(K_KUYRUK(), kuyruk);
    cipCiz();
    if (!cevrimdisiMi()) setTimeout(function () { bosalt(); }, 100);
    return op;
  }

  var bosaltiliyor = null;
  function bosalt() {
    if (bosaltiliyor) return bosaltiliyor;
    var kuyruk = listeOku(K_KUYRUK());
    if (!kuyruk.length) { cipCiz(); return Promise.resolve({ gonderilen: 0, hatali: 0 }); }
    if (cevrimdisiMi()) { cipCiz(); return Promise.resolve({ gonderilen: 0, hatali: 0, cevrimdisi: true }); }
    var istemci = null;
    try { istemci = global.ZirkonikAuth && global.ZirkonikAuth.client(); } catch (e) {}
    if (!istemci || typeof istemci.rpc !== 'function') return Promise.resolve({ gonderilen: 0, hatali: 0 });

    var gonderilen = 0, hatali = 0, durdu = false;
    function sirayla(i) {
      var simdiki = listeOku(K_KUYRUK());
      if (i >= simdiki.length || durdu) return Promise.resolve();
      var op = simdiki[i];
      return Promise.resolve().then(function () {
        return istemci.rpc('zk_kuyruk_isle', { p_op_id: op.op_id, p_tur: op.tur, p_veri: op.veri });
      }).then(function (r) {
        if (r && r.error) {
          if (agHatasiMi(r.error)) { durdu = true; return; }
          // Sunucu reddetti: kuyruktan çıkar, "gönderilemeyenler"e koy.
          var h = listeOku(K_HATA());
          h.push(Object.assign({}, op, { hata: r.error.message || String(r.error), ht: Date.now() }));
          listeYaz(K_HATA(), h);
          hatali++;
        } else {
          gonderilen++;
        }
        var kalan = listeOku(K_KUYRUK()).filter(function (x) { return x.op_id !== op.op_id; });
        listeYaz(K_KUYRUK(), kalan);
        return sirayla(i);   // aynı indeks: liste kısaldı
      }, function (err) {
        if (agHatasiMi(err)) { durdu = true; return; }
        var h = listeOku(K_HATA());
        h.push(Object.assign({}, op, { hata: (err && err.message) || String(err), ht: Date.now() }));
        listeYaz(K_HATA(), h);
        hatali++;
        listeYaz(K_KUYRUK(), listeOku(K_KUYRUK()).filter(function (x) { return x.op_id !== op.op_id; }));
        return sirayla(i);
      });
    }
    bosaltiliyor = sirayla(0).then(function () {
      bosaltiliyor = null;
      cipCiz();
      if (gonderilen) {
        toast(gonderilen + ' bekleyen işlem gönderildi.');
        try { global.dispatchEvent(new global.CustomEvent('zk-kuyruk-bosaldi', { detail: { gonderilen: gonderilen, hatali: hatali } })); } catch (e) {}
      }
      if (hatali) toast(hatali + ' işlem sunucu tarafından reddedildi — alttaki çipe dokun.', 'error');
      return { gonderilen: gonderilen, hatali: hatali };
    }, function () { bosaltiliyor = null; cipCiz(); return { gonderilen: gonderilen, hatali: hatali }; });
    return bosaltiliyor;
  }

  function tekrarDene(opId) {
    var h = listeOku(K_HATA());
    var op = h.filter(function (x) { return x.op_id === opId; })[0];
    if (!op) return;
    listeYaz(K_HATA(), h.filter(function (x) { return x.op_id !== opId; }));
    var k = listeOku(K_KUYRUK());
    k.push({ op_id: op.op_id, tur: op.tur, veri: op.veri, ozet: op.ozet, t: op.t });
    listeYaz(K_KUYRUK(), k);
    cipCiz();
    bosalt();
  }
  function vazgec(opId) {
    listeYaz(K_HATA(), listeOku(K_HATA()).filter(function (x) { return x.op_id !== opId; }));
    listeYaz(K_KUYRUK(), listeOku(K_KUYRUK()).filter(function (x) { return x.op_id !== opId; }));
    cipCiz();
  }

  function toast(msg, kind) {
    try { if (global.ZKHiz && global.ZKHiz.toast) { global.ZKHiz.toast(msg, kind); return; } } catch (e) {}
    try { console.log('[zk-cevrimdisi] ' + msg); } catch (e) {}
  }

  // ---- Çip ve liste ----
  function el(id) { try { return global.document.getElementById(id); } catch (e) { return null; } }
  function zamanMetni(t) {
    try { return new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  }
  function cipCiz() {
    var d = global.document;
    if (!d || !d.body) return;
    var bekleyen = listeOku(K_KUYRUK()).length, hata = listeOku(K_HATA()).length;
    var cip = el('zk-kuyruk-cip');
    if (!bekleyen && !hata) { if (cip) cip.style.display = 'none'; return; }
    if (!cip) {
      cip = d.createElement('button');
      cip.id = 'zk-kuyruk-cip';
      cip.type = 'button';
      cip.style.cssText = 'position:fixed;left:16px;bottom:calc(env(safe-area-inset-bottom,0px) + 72px);z-index:9998;padding:8px 12px;border:0;border-radius:999px;color:#fff;font:700 12px/1.2 -apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.2);cursor:pointer;max-width:calc(100% - 32px)';
      cip.onclick = function () { listeGoster(); };
      d.body.appendChild(cip);
    }
    cip.style.display = 'block';
    if (hata) {
      cip.style.background = '#B42318';
      cip.textContent = hata + ' işlem gönderilemedi' + (bekleyen ? ' · ' + bekleyen + ' bekliyor' : '') + ' — göster';
    } else {
      cip.style.background = '#B54708';
      cip.textContent = bekleyen + ' işlem internet bekliyor';
    }
  }
  function kacir(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function listeGoster() {
    var d = global.document;
    var eski = el('zk-kuyruk-liste');
    if (eski) eski.parentNode.removeChild(eski);
    var bekleyen = listeOku(K_KUYRUK()), hata = listeOku(K_HATA());
    var kap = d.createElement('div');
    kap.id = 'zk-kuyruk-liste';
    kap.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center';
    var satirlar = '';
    hata.forEach(function (op) {
      satirlar += '<div style="padding:10px 0;border-bottom:1px solid #eee"><div style="font-weight:700;font-size:13px">' + kacir(op.ozet) + '</div>' +
        '<div style="font-size:12px;color:#B42318;margin-top:2px">' + kacir(op.hata) + '</div>' +
        '<div style="font-size:11px;color:#666;margin-top:2px">' + zamanMetni(op.t) + '</div>' +
        '<div style="display:flex;gap:8px;margin-top:8px"><button type="button" data-tekrar="' + kacir(op.op_id) + '" style="flex:1;padding:8px;border-radius:10px;border:0;background:#111;color:#fff;font-weight:700">Tekrar dene</button>' +
        '<button type="button" data-vazgec="' + kacir(op.op_id) + '" style="flex:1;padding:8px;border-radius:10px;border:1px solid #ccc;background:#fff;font-weight:700">Vazgeç</button></div></div>';
    });
    bekleyen.forEach(function (op) {
      satirlar += '<div style="padding:10px 0;border-bottom:1px solid #eee"><div style="font-weight:700;font-size:13px">' + kacir(op.ozet) + '</div>' +
        '<div style="font-size:12px;color:#B54708;margin-top:2px">İnternet gelince gönderilecek · ' + zamanMetni(op.t) + '</div>' +
        '<div style="margin-top:8px"><button type="button" data-vazgec="' + kacir(op.op_id) + '" style="padding:6px 12px;border-radius:10px;border:1px solid #ccc;background:#fff;font-weight:700;font-size:12px">Vazgeç</button></div></div>';
    });
    if (!satirlar) satirlar = '<p style="font-size:13px;color:#666">Bekleyen işlem yok.</p>';
    kap.innerHTML = '<div style="width:100%;max-width:520px;max-height:80vh;overflow:auto;background:#fff;color:#111;border-radius:16px 16px 0 0;padding:16px 16px calc(env(safe-area-inset-bottom,0px) + 16px);font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong style="font-size:15px">Bekleyen işlemler</strong>' +
      '<button type="button" id="zk-kuyruk-kapat" style="border:0;background:transparent;font-size:14px;font-weight:700;padding:6px">Kapat</button></div>' +
      satirlar +
      (bekleyen.length ? '<button type="button" id="zk-kuyruk-gonder" style="width:100%;margin-top:12px;padding:10px;border-radius:12px;border:0;background:#111;color:#fff;font-weight:700">Şimdi göndermeyi dene</button>' : '') +
      '</div>';
    kap.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t === kap || (t && t.id === 'zk-kuyruk-kapat')) { kap.parentNode.removeChild(kap); return; }
      if (t && t.id === 'zk-kuyruk-gonder') { kap.parentNode.removeChild(kap); bosalt(); return; }
      var tekrar = t && t.getAttribute && t.getAttribute('data-tekrar');
      var vaz = t && t.getAttribute && t.getAttribute('data-vazgec');
      if (tekrar) { kap.parentNode.removeChild(kap); tekrarDene(tekrar); }
      else if (vaz) { kap.parentNode.removeChild(kap); vazgec(vaz); }
    });
    d.body.appendChild(kap);
  }

  // ---- Tetikleyiciler: açılış, sekmeye dönüş, bağlantı gelişi ----
  try {
    if (global.document && global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', function () { cipCiz(); setTimeout(bosalt, 1500); });
    } else {
      setTimeout(function () { cipCiz(); bosalt(); }, 1500);
    }
    global.document.addEventListener('visibilitychange', function () {
      if (global.document.visibilityState === 'visible') bosalt();
    });
    global.addEventListener('online', function () { setTimeout(bosalt, 300); });
    // Kuyruk boşalınca sayfa verisini tazele (sayfa zkRefresh tanımladıysa).
    global.addEventListener('zk-kuyruk-bosaldi', function () {
      try { if (global.ZkYenile) global.ZkYenile.tazele('kuyruk'); } catch (e) {}
    });
  } catch (e) {}

  global.ZKKuyruk = {
    ekle: ekle, bosalt: bosalt, tekrarDene: tekrarDene, vazgec: vazgec, kimlik: kimlik,
    cevrimdisiMi: cevrimdisiMi,
    bekleyenler: function () { return listeOku(K_KUYRUK()); },
    hatalilar: function () { return listeOku(K_HATA()); },
    goster: listeGoster,
    depo: depo
  };
  global.ZKCevrimdisi = { depo: depo, kuyruk: global.ZKKuyruk };
})(typeof window !== 'undefined' ? window : globalThis);
