/*
 * Zirkonik — Laboratuvarlar arası iş (altyapı siparişi) istemci modülü. 15 Ekim 2026.
 * Plan: docs/altyapi-siparisi-plani.md. Sunucu: migration 20261015230000_lab_lab_altyapi_asama1.sql.
 *
 * Her şey RPC üzerinden gider (başka kuruluşun verisine doğrudan tablo erişimi yok).
 * Modül kuruluşta kapalıysa (organizations.lab_lab_enabled=false) ekranlar hiçbir şey göstermez.
 */
(function (global) {
  'use strict';

  function client() { return global.ZirkonikAuth.client(); }

  function rpc(ad, p) {
    return client().rpc(ad, p || {}).then(function (r) {
      if (r.error) {
        var m = r.error.message || 'Sunucu hatası';
        // PostgREST hata metnindeki teknik ön ekleri at
        m = m.replace(/^P0001:\s*/, '');
        throw new Error(m);
      }
      return r.data;
    });
  }

  function kacis(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Kuruluşta modül açık mı? ZirkonikAuth.me() cevabındaki organizations gömüsünden okunur.
  function acikMi(me) {
    var o = me && me.organizations;
    if (Array.isArray(o)) o = o[0];
    return !!(o && o.lab_lab_enabled);
  }
  function faturaModu(me) {
    var o = me && me.organizations;
    if (Array.isArray(o)) o = o[0];
    return (o && o.lab_lab_billing) || 'faturasiz';
  }

  var DURUM = {
    bekliyor: { metin: 'Cevap bekliyor', sinif: 'bg-secondary text-accent' },
    kabul: { metin: 'Aktif', sinif: 'bg-success/10 text-success' },
    red: { metin: 'Reddedildi', sinif: 'bg-muted text-muted-foreground' },
    durduruldu: { metin: 'Durduruldu', sinif: 'bg-muted text-muted-foreground' },
    gonderildi: { metin: 'Gönderildi, onay bekliyor', sinif: 'bg-secondary text-accent' },
    uretimde: { metin: 'Üretimde', sinif: 'bg-primary/10 text-primary' },
    tamamlandi: { metin: 'Hazır, teslim alınacak', sinif: 'bg-success/10 text-success' },
    teslim_alindi: { metin: 'Teslim alındı', sinif: 'bg-muted text-muted-foreground' },
    iptal: { metin: 'İptal', sinif: 'bg-muted text-muted-foreground' }
  };
  function durumEtiket(d) { return DURUM[d] || { metin: d || '—', sinif: 'bg-muted text-muted-foreground' }; }
  function rozet(d) { var e = durumEtiket(d); return '<span class="rounded-full ' + e.sinif + ' px-2 py-0.5 text-[10px] font-bold">' + kacis(e.metin) + '</span>'; }
  function tarih(iso) { return iso ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : ''; }
  function saat(iso) { return iso ? new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''; }

  global.ZKOrtak = {
    kacis: kacis, acikMi: acikMi, faturaModu: faturaModu, durumEtiket: durumEtiket, rozet: rozet, tarih: tarih, saat: saat,
    // Ortaklık
    liste: function (labId) { return rpc('zk_ortak_listesi', { p_lab: labId }); },
    bilgi: function (kod) { return rpc('zk_ortak_lab_bilgi', { p_code: kod }).then(function (d) { return Array.isArray(d) ? d[0] || null : d; }); },
    istek: function (kod, labId, not) { return rpc('zk_ortak_istek', { p_code: kod, p_my_lab: labId, p_note: not || null }); },
    cevap: function (id, kabul) { return rpc('zk_ortak_cevap', { p_id: id, p_kabul: !!kabul }); },
    kodYenile: function (labId) { return rpc('zk_ortak_kod_yenile', { p_lab: labId }); },   // 16 Ekim 2026: davet kodunu yenile (yönetici)
    durdur: function (id) { return rpc('zk_ortak_durdur', { p_id: id }); },
    grup: function (fromLab, toLab, acik) { return rpc('zk_grup_ortaklik', { p_from_lab: fromLab, p_to_lab: toLab, p_acik: !!acik }); },
    // Altyapı siparişi
    fiyatlar: function (myLab, targetLab) { return rpc('zk_ortak_fiyat_listesi', { p_my_lab: myLab, p_target_lab: targetLab }); },
    altyapiVer: function (jobId, targetLab, kalemler, not) { return rpc('zk_altyapi_siparisi_ver', { p_job: jobId, p_target_lab: targetLab, p_kalemler: kalemler, p_note: not || null }); },
    durum: function (jobId) { return rpc('zk_altyapi_durum', { p_job: jobId }).then(function (d) { return Array.isArray(d) ? d : []; }); },
    teslimAl: function (id) { return rpc('zk_altyapi_teslim_al', { p_sub: id }); },
    // Alıcı tarafı: bu iş kimin altyapı siparişi (Aşama 2 SQL'i henüz yoksa null).
    kaynak: function (jobId) { return rpc('zk_altyapi_kaynak', { p_job: jobId }).catch(function () { return null; }); },
    iptal: function (id) { return rpc('zk_altyapi_iptal', { p_sub: id }); },

    // İş detayındaki altyapı kartı için satır HTML'i. yetki: { teslim: bool, iptal: bool }
    altyapiSatirHtml: function (s, yetki) {
      var asamalar = (s.stages || []).map(function (a) {
        var bitti = !!a.exited_at;
        return '<span class="rounded-full ' + (bitti ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary') + ' px-2 py-0.5 text-[10px] font-bold">' +
          kacis(a.room) + (bitti ? ' ✓' : '') + '</span>';
      }).join(' ');
      var alt = [];
      if (s.child_job_number) alt.push('karşı iş no ' + s.child_job_number);
      if (s.current_room && s.status === 'uretimde') alt.push('şu an: ' + s.current_room);
      if (s.child_delivery) alt.push('teslim ' + tarih(s.child_delivery));
      alt.push('gönderildi ' + tarih(s.created_at));
      if (s.completed_at) alt.push('hazır ' + tarih(s.completed_at));
      if (s.received_at) alt.push('teslim alındı ' + tarih(s.received_at));
      var dugmeler = '';
      if (s.status === 'tamamlandi' && yetki.teslim) dugmeler += '<button type="button" data-ortak-eylem="teslim" data-ortak-id="' + s.id + '" class="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-theme bg-primary text-xs font-bold text-primary-foreground"><iconify-icon icon="lucide:package-check" class="text-sm"></iconify-icon>Teslim aldım</button>';
      if (s.status === 'gonderildi' && yetki.iptal) dugmeler += '<button type="button" data-ortak-eylem="iptal" data-ortak-id="' + s.id + '" class="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-theme border border-border bg-background text-xs font-bold text-destructive">Geri çek</button>';
      return '<div class="rounded-theme border border-border bg-background px-3 py-2.5">' +
        '<div class="flex items-start justify-between gap-2">' +
          '<div class="min-w-0"><p class="truncate text-sm font-bold">' + kacis(s.child_lab) + (s.child_org ? ' <span class="font-normal text-muted-foreground">· ' + kacis(s.child_org) + '</span>' : '') + '</p>' +
          '<p class="mt-0.5 text-[11px] text-muted-foreground">' + kacis(alt.join(' · ')) + '</p></div>' + rozet(s.status) +
        '</div>' +
        (asamalar ? '<div class="mt-2 flex flex-wrap gap-1">' + asamalar + '</div>' : '') +
        (s.note ? '<p class="mt-2 text-[11px] text-muted-foreground">Not: ' + kacis(s.note) + '</p>' : '') +
        (dugmeler ? '<div class="mt-2.5 flex gap-2">' + dugmeler + '</div>' : '') +
      '</div>';
    }
  };
})(typeof window !== 'undefined' ? window : this);
