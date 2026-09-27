/* Erken yetki koruması — <head>'in EN BAŞINA, hiçbir CSS/gövde içeriğinden
 * önce yüklenir (js/zk-guard-core.js'ten hemen sonra).
 *
 * 28 Eylül 2026, sahibinin bildirdiği hata: sayfanın görünür HTML'i
 * (kartlar, sekmeler) gövdenin başından itibaren yazılıyor, yetki bekçisi
 * (js/zk-guard.js) ise gövdenin EN ALTINDA (Supabase kütüphanesinden hemen
 * önce) yükleniyordu. Tarayıcı yukarıdan aşağı okuyup boyadığı için, bekçi
 * çalışana kadar TÜM içerik (yetkisi olmayanlar dahil) bir an görünüyordu —
 * özellikle web'de (dosyalar ağdan iniyor, native'de cihazda hazır) bu süre
 * gözle görülür oluyordu ("1 saniyeliğine gelip gidiyor").
 *
 * Çözüm: önbellekteki (localStorage) son bilinen role bakıp — sayfa bu role
 * hiç kapalıysa gövde hiç yazılmadan yönlendirir; bazı bölümleri kapalıysa
 * gövdeyi (görünürlük) gizli tutar. Sayfanın en altındaki, o bölümlerin
 * ardından gelen küçük bir betik (bkz. her sayfadaki "erken koruma aç"
 * satırı) gerçek gizlemeyi uygulayıp görünürlüğü geri açar — ağ isteği
 * beklemeden, yalnız o sayfanın kendi statik HTML'i okunur okunmaz.
 *
 * Önbellek yoksa (ilk açılış, nadir) hiçbir şey yapılmaz — bugünkü
 * davranışa (aşağıdaki asıl zk-guard.js taze veriyle çözer) düşülür.
 */
(function () {
  if (!window.ZkGuardCore) return;
  var page = ZkGuardCore.page();
  if (ZkGuardCore.PUBLIC[page]) return;
  var cached = null;
  try { cached = JSON.parse(localStorage.getItem('zk-guard') || 'null'); } catch (e) {}
  if (!cached) return;
  if (ZkGuardCore.enforce(cached.role, cached)) return; // yönlendirme başladı, gövde hiç boyanmayacak
  if (cached.role !== 'personel') return; // yönetici: gizlenecek bir şey yok
  document.documentElement.style.visibility = 'hidden';
  window.__zkErkenGizliP = cached;
})();
