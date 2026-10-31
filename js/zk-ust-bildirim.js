/* 31 Ekim 2026 (4.3): Finans, Laboratuvarlar, Ekip, Doktorlar üst barındaki zil rozeti (native ile aynı).
   Üretim sayfası aynı işi kendi zkLoadNotifBadge'iyle yapar. pageshow: sayfa ilk açılışta ve geri dönüşte (önbellekten) çalışır. */
(function () {
  function yukle() {
    var badge = document.getElementById('notif-badge');
    if (!badge || !window.ZirkonikData || !ZirkonikData.unreadNotifCount) return;
    ZirkonikData.unreadNotifCount().then(function (r) {
      var c = (r && r.count) || 0;
      badge.textContent = c > 99 ? '99+' : String(c);
      badge.hidden = !c;
    }).catch(function () {});
  }
  window.addEventListener('pageshow', yukle);
})();
