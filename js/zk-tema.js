/*
 * Zirkonik — koyu / açık tema.
 *
 * Renk jetonları her sayfanın kendi <style> bloğunda tanımlı. Açık palet
 * css/zk-utils.css içinde :root[data-theme="light"] altında duruyor; attribute
 * seçici daha yüksek özgüllükte olduğu için sayfa içi :root'u eziyor ve 19
 * sayfanın tamamı tek yerden dönüyor.
 *
 * Bu dosya yalnızca tercihi saklar ve <html data-theme> değerini yazar.
 * FOUC (açılışta bir an koyu görünmesi) olmasın diye <head> içinde, CSS'ten
 * sonra ve body'den ÖNCE yüklenmeli.
 */
(function () {
  'use strict';

  var ANAHTAR = 'zk-tema';

  function oku() {
    try { return localStorage.getItem(ANAHTAR); } catch (e) { return null; }
  }
  function yaz(v) {
    try { localStorage.setItem(ANAHTAR, v); } catch (e) {}
  }

  function uygula(tema) {
    document.documentElement.setAttribute('data-theme', tema);
    // iOS durum çubuğu ve tarayıcı arayüzü de temaya uysun.
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', tema === 'light' ? '#F5F7FA' : '#0E1013');
  }

  var mevcut = oku() || 'dark';
  uygula(mevcut);

  function degistir(tema) {
    mevcut = (tema === 'light' || tema === 'dark') ? tema : (mevcut === 'light' ? 'dark' : 'light');
    yaz(mevcut);
    uygula(mevcut);
    return mevcut;
  }

  /* Sayfaya bir düğme konmadıysa sağ üstte yüzen küçük bir anahtar çıkar;
     böylece her ekranda tek dokunuşla denenebiliyor. */
  function dugmeKur() {
    if (document.getElementById('zk-tema-btn')) return;
    if (document.querySelector('[data-zk-tema]')) return;   // sayfa kendi düğmesini koymuş
    var b = document.createElement('button');
    b.id = 'zk-tema-btn';
    b.type = 'button';
    b.setAttribute('aria-label', 'Koyu / açık tema');
    b.title = 'Koyu / açık tema';
    b.textContent = mevcut === 'light' ? '☾' : '☀';
    b.addEventListener('click', function () {
      b.textContent = degistir() === 'light' ? '☾' : '☀';
    });
    document.body.appendChild(b);
  }

  if (document.body) dugmeKur();
  else document.addEventListener('DOMContentLoaded', dugmeKur);

  // Sayfalar kendi düğmelerini bağlamak isterse:
  //   <button data-zk-tema onclick="ZkTema.degistir()">
  window.ZkTema = { degistir: degistir, mevcut: function () { return mevcut; } };
})();
