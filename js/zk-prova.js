/*
 * Zirkonik — Prova turları (29 Ekim 2026). Lab provayı doktora gönderir; doktor onaylar ya da değişiklik ister.
 * Veri: job_prova_turlari (yalnız okuma) + zk_prova_gonder / zk_prova_yanitla işlemleri (supabase/migrations/20261029140000_prova_turlari.sql).
 * Tablo canlıda henüz yoksa (SQL çalışmadan yayınlanan ekran kuralı) kart hiç görünmez, sayfa etkilenmez.
 *
 * ZKProva.ciz(el, { jobId, rol: 'lab' | 'doktor', aktif: bool, istek: bool }) → Promise
 * istek: işte "Prova" istendi (formdaki Prova/Final işareti) — henüz tur yoksa laboratuvara hatırlatma gösterilir.
 */
(function (global) {
  'use strict';
  function client() { return global.ZirkonikAuth.client(); }
  function kacis(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tarih(t) { return t ? new Date(t).toLocaleDateString('tr-TR') + ' ' + new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''; }
  function bildir(m) { if (typeof global.zkToast === 'function') global.zkToast(m); }
  var SONUC = {
    bekliyor: ['Doktor yanıtı bekleniyor', 'bg-secondary text-accent'],
    onay: ['Onaylandı', 'bg-secondary text-secondary-foreground'],
    degisiklik: ['Değişiklik istendi', 'bg-secondary text-destructive']
  };

  function turHtml(t) {
    var s = SONUC[t.sonuc] || SONUC.bekliyor;
    return '<div class="rounded-theme border border-border bg-background px-3 py-2.5">' +
      '<div class="flex items-center justify-between gap-2"><p class="text-sm font-bold">' + t.tur_no + '. prova</p>' +
      '<span class="rounded-full px-2 py-0.5 text-[10px] font-bold ' + s[1] + '">' + s[0] + '</span></div>' +
      '<p class="mt-0.5 text-[11px] text-muted-foreground">Gönderildi · ' + kacis(tarih(t.gonderildi_at)) + (t.yanit_at ? ' · Yanıt · ' + kacis(tarih(t.yanit_at)) : '') + '</p>' +
      (t.gonderen_notu ? '<p class="mt-1.5 text-xs"><span class="font-bold">Laboratuvar notu:</span> ' + kacis(t.gonderen_notu) + '</p>' : '') +
      (t.doktor_notu ? '<p class="mt-1 text-xs"><span class="font-bold">Doktor notu:</span> ' + kacis(t.doktor_notu) + '</p>' : '') +
      '</div>';
  }

  function ciz(el, o) {
    if (!el || !o || !o.jobId) return Promise.resolve();
    return client().from('job_prova_turlari')
      .select('id, tur_no, gonderildi_at, sonuc, gonderen_notu, doktor_notu, yanit_at')
      .eq('job_id', o.jobId).order('tur_no', { ascending: true }).then(function (r) {
        if (r.error) { el.innerHTML = ''; return; } // tablo yok / yetki yok: kart görünmez
        var turlar = r.data || [];
        var bekleyen = turlar.filter(function (t) { return t.sonuc === 'bekliyor'; })[0] || null;
        var doktor = o.rol === 'doktor';
        if (!turlar.length && (doktor || !o.aktif)) { el.innerHTML = ''; return; }
        var h = '<section class="rounded-theme border border-border bg-card p-4">' +
          '<div class="flex items-center justify-between"><div>' +
          '<p class="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Prova turları</p>' +
          '<h2 class="mt-1 font-heading text-base font-bold">' + (turlar.length ? turlar.length + ' tur' : 'Henüz prova yok') + '</h2></div>' +
          '<iconify-icon icon="lucide:repeat-2" class="text-xl text-primary"></iconify-icon></div>' +
          '<div class="mt-3 space-y-2">' + turlar.slice().reverse().map(turHtml).join('') + '</div>';
        if (!doktor && o.aktif && o.istek && !turlar.length) h += '<p class="mt-3 rounded-theme border border-border bg-background px-3 py-2 text-xs font-semibold text-accent">Bu iş için prova istendi. Hazır olunca "Provayı doktora gönder" deyin.</p>';
        if (!doktor && o.aktif && !bekleyen) {
          h += '<div class="mt-3"><textarea id="prova-not" rows="2" maxlength="500" placeholder="Doktora not (isteğe bağlı)" class="w-full rounded-theme border border-border bg-background px-3 py-2 text-sm"></textarea>' +
            '<button type="button" id="prova-gonder" class="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-theme bg-primary text-xs font-bold text-primary-foreground"><iconify-icon icon="lucide:send" class="text-sm"></iconify-icon>Provayı doktora gönder</button></div>';
        }
        if (doktor && bekleyen) {
          h += '<div class="mt-3"><textarea id="prova-not" rows="2" maxlength="1000" placeholder="Değişiklik isterseniz kısa bir not yazın" class="w-full rounded-theme border border-border bg-background px-3 py-2 text-sm"></textarea>' +
            '<div class="mt-2 flex gap-2">' +
            '<button type="button" id="prova-degisiklik" class="flex h-11 flex-1 items-center justify-center rounded-theme border border-border bg-background text-xs font-bold text-primary">Değişiklik istiyorum</button>' +
            '<button type="button" id="prova-onay" class="flex h-11 flex-1 items-center justify-center rounded-theme bg-primary text-xs font-bold text-primary-foreground">Prova onaylandı</button></div></div>';
        }
        if (!doktor && bekleyen) h += '<p class="mt-3 text-xs text-muted-foreground">Doktorun yanıtı bekleniyor. Yanıt gelince bildirim alırsınız.</p>';
        h += '</section>';
        el.innerHTML = h;
        var yenile = function () { return ciz(el, o).then(function () { if (typeof o.degisti === 'function') o.degisti(); }); };
        var notu = function () { var n = document.getElementById('prova-not'); return n ? n.value : ''; };
        var gonder = document.getElementById('prova-gonder');
        if (gonder) gonder.addEventListener('click', function () {
          var bitir = global.ZKHiz.mesgul(gonder, 'Gönderiliyor…');
          client().rpc('zk_prova_gonder', { p_job: o.jobId, p_not: notu() || null }).then(function (x) {
            if (x.error) { bitir(); bildir('Gönderilemedi: ' + x.error.message); return; }
            bitir(false); bildir('Prova doktora gönderildi.'); yenile();
          }, function (e) { bitir(); bildir('Gönderilemedi: ' + ((e && e.message) || e)); });
        });
        [['prova-onay', 'onay'], ['prova-degisiklik', 'degisiklik']].forEach(function (p) {
          var b = document.getElementById(p[0]);
          if (!b || !bekleyen) return;
          b.addEventListener('click', function () {
            if (p[1] === 'degisiklik' && !notu().trim()) { bildir('Değişiklik için kısa bir not yazın.'); return; }
            var bitir = global.ZKHiz.mesgul(b, 'Kaydediliyor…');
            client().rpc('zk_prova_yanitla', { p_tur: bekleyen.id, p_sonuc: p[1], p_not: notu() || null }).then(function (x) {
              if (x.error) { bitir(); bildir('Olmadı: ' + x.error.message); return; }
              bitir(false); bildir(p[1] === 'onay' ? 'Prova onaylandı.' : 'Değişiklik isteği iletildi.'); yenile();
            }, function (e) { bitir(); bildir('Olmadı: ' + ((e && e.message) || e)); });
          });
        });
      }, function () { el.innerHTML = ''; });
  }

  global.ZKProva = { ciz: ciz };
})(typeof window !== 'undefined' ? window : this);
