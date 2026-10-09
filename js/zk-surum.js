/*
 * Zirkonik — eski sürümde açık kalan sekmeyi yeniler.
 *
 * Sorun (9 Ekim 2026): bir sekme/sayfa günlerce açık kalınca eski kodla çalışmaya devam
 * ediyordu; düzeltilmiş hatalar (ör. tarih aralığı, "Tümünü okundu yap") o cihazda hâlâ
 * çıkıyordu (hata günlüğünde sürüm 2.3, güncel 2.9).
 *
 * Çalışma: açılışta sunucudaki /surum.json okunur (yayın damgası; GitHub akışı her yayında
 * yazar). Sayfa tekrar görünür olunca damga değiştiyse:
 *   - ekran GÜVENLİYSE (dolu giriş alanı yok, odakta yazı alanı yok, açık pencere yok)
 *     sayfa BİR KEZ yeniden yüklenir;
 *   - değilse alta "Yeni sürüm var — Yenile" şeridi çıkar, kullanıcı kendi karar verir.
 * Kullanıcının yazdığı hiçbir şey kendiliğinden silinmez.
 * iOS/Android uygulama içinde (file:, capacitor:) hiçbir şey yapmaz: sayfalar pakette gömülü.
 */
(function () {
  'use strict';
  if (/^(file|capacitor|ionic):$/.test(location.protocol)) return;

  var ARALIK_MS = 120000;   // en sık 2 dakikada bir kontrol
  var ilk = null, sonKontrol = 0, calisiyor = false;

  function damgaAl() {
    return fetch('/surum.json?_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.s ? String(j.s) : null; })
      .catch(function () { return null; });
  }

  function guvenliMi() {
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) return false;
    var alanlar = document.querySelectorAll('textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])');
    for (var i = 0; i < alanlar.length; i++) { if (alanlar[i].value) return false; }
    var acik = document.querySelectorAll('[id$="-sheet"]:not(.hidden)');
    for (var j = 0; j < acik.length; j++) { if (acik[j].offsetParent !== null) return false; }
    return true;
  }

  function serit() {
    if (document.getElementById('zk-surum-serit')) return;
    var d = document.createElement('div');
    d.id = 'zk-surum-serit';
    d.setAttribute('role', 'status');
    d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 84px);z-index:99999;background:#16191F;color:#fff;border-radius:12px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;font:600 13px/1.3 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)';
    d.innerHTML = '<span>Yeni sürüm var.</span><button type="button" style="background:#fff;color:#16191F;border:0;border-radius:8px;padding:6px 12px;font:700 13px system-ui,sans-serif">Yenile</button>';
    d.querySelector('button').addEventListener('click', function () { location.reload(); });
    document.body.appendChild(d);
  }

  function kontrol() {
    if (calisiyor || ilk === null) return;
    if (Date.now() - sonKontrol < ARALIK_MS) return;
    sonKontrol = Date.now(); calisiyor = true;
    damgaAl().then(function (s) {
      calisiyor = false;
      if (!s || s === ilk) return;
      var anahtar = 'zk_surum_yuklendi';
      var onceki = null; try { onceki = sessionStorage.getItem(anahtar); } catch (e) {}
      if (guvenliMi() && onceki !== s) {
        try { sessionStorage.setItem(anahtar, s); } catch (e) {}
        location.reload();
      } else {
        serit();
      }
    });
  }

  damgaAl().then(function (s) { ilk = s; sonKontrol = Date.now(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') kontrol(); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) { sonKontrol = 0; kontrol(); } });
})();
