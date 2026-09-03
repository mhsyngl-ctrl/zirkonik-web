/*
 * Zirkonik — merkezi Supabase yardımcı modülü
 *
 * Kullanım (her korumalı sayfanın <head> kısmında, bu sırayla):
 *
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="supabase-config.js"></script>
 *   <script src="supabase-client.js"></script>
 *   <script>ZirkonikAuth.requireAuth();</script>
 */
(function () {
  'use strict';

  var _client = null;
  var _meCache = null;

  function client() {
    if (!_client) {
      if (typeof supabase === 'undefined') {
        throw new Error('supabase-js yüklenmedi — CDN script etiketini kontrol et.');
      }
      // "Beni hatırla": varsayılan açık (localStorage — kalıcı oturum).
      // Kapalıysa oturum yalnız sekme ömrünce yaşar (sessionStorage).
      var remember = true;
      try { remember = localStorage.getItem('zk-remember') !== '0'; } catch (e) {}
      _client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { storage: remember ? window.localStorage : window.sessionStorage }
      });
    }
    return _client;
  }

  var Auth = {
    client: client,

    /** Giriş formundaki "Beni hatırla" kutusundan çağrılır — tercihi
     *  kaydeder ve istemciyi doğru depolamayla yeniden kurdurur. */
    setRemember: function (flag) {
      try { localStorage.setItem('zk-remember', flag ? '1' : '0'); } catch (e) {}
      _client = null;
      _meCache = null;
    },

    signUp: function (email, password, meta) {
      return client().auth.signUp({
        email: email,
        password: password,
        options: { data: meta || {} }
      });
    },

    signIn: function (email, password) {
      return client().auth.signInWithPassword({ email: email, password: password });
    },

    /** "Şifremi unuttum" — sıfırlama linkini e-postayla gönderir. Link
     *  zirkonik://reset-password'a düşer (bkz. iOS ContentView.swift
     *  onOpenURL + Info.plist CFBundleURLTypes); bu redirect URL'in
     *  Supabase panelinde Authentication > URL Configuration altında
     *  izinli listede olması gerekir. */
    resetPasswordForEmail: function (email) {
      // iOS uygulamasında (file://) özel şema deep-link'i, web'de sitenin
      // kendi sifre-sifirla sayfası kullanılır. Her iki adres de Supabase
      // panelinde Redirect URLs izin listesinde olmalı.
      var redirect = (window.location.protocol === 'file:')
        ? 'zirkonik://reset-password'
        : (window.location.origin + '/sifre-sifirla.html');
      return client().auth.resetPasswordForEmail(email, { redirectTo: redirect });
    },

    /** sifre-sifirla.html'in e-posta linkinden gelen token'larla oturumu
     *  kurması için. */
    setSession: function (accessToken, refreshToken) {
      return client().auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    },

    updateMyPassword: function (password) {
      return client().auth.updateUser({ password: password });
    },

    signOut: function () {
      _meCache = null;
      try { localStorage.removeItem('zk-guard'); } catch (e) {}
      return client().auth.signOut().then(function () {
        window.location.href = 'giris.html';
      });
    },

    getSession: function () {
      return client().auth.getSession().then(function (r) {
        return r.data ? r.data.session : null;
      });
    },

    requireAuth: function () {
      return Auth.getSession().then(function (session) {
        if (!session) {
          window.location.href = 'giris.html';
          return null;
        }
        return session;
      });
    },

    /** Girişli kullanıcının app_users satırı + izinleri (cache'lenir). */
    me: function () {
      if (_meCache) return Promise.resolve(_meCache);
      return client().auth.getUser().then(function (r) {
        var uid = r.data && r.data.user ? r.data.user.id : null;
        if (!uid) return null;
        return client()
          .from('app_users')
          .select('*, user_permissions(*)')
          .eq('id', uid)
          .single()
          .then(function (res) {
            if (res.error) throw res.error;
            _meCache = res.data;
            return _meCache;
          });
      });
    },

    clearMeCache: function () { _meCache = null; }
  };

  var Data = {
    // ---- Laboratuvarlar / Odalar ----
    listLabs: function () {
      return client().from('laboratories').select('*').order('created_at');
    },
    updateLab: function (labId, fields) {
      return client().from('laboratories').update(fields).eq('id', labId);
    },
    createLab: function (orgId, name, city, address, phone, email) {
      // Not: .select() burada bilerek insert'ten ayrı — has_lab_access()
      // kendi laboratories tablosuna JOIN attığı için aynı komut içindeki
      // INSERT...RETURNING yeni satırı göremiyor (Postgres RLS + SECURITY
      // DEFINER snapshot sınırı). İki ayrı istek bunu aşıyor.
      return client().from('laboratories').insert({ organization_id: orgId, name: name, city: city, address: address, phone: phone || null, email: email || null }).then(function (insRes) {
        if (insRes.error) return insRes;
        return client().from('laboratories').select().eq('organization_id', orgId).eq('name', name).order('created_at', { ascending: false }).limit(1).single();
      });
    },
    listRooms: function (labId) {
      return client().from('rooms').select('*').eq('laboratory_id', labId).order('sort_order');
    },
    createRoom: function (labId, name, sortOrder, opts) {
      opts = opts || {};
      return client().from('rooms').insert({
        laboratory_id: labId, name: name, sort_order: sortOrder,
        is_quality_control: !!opts.isQualityControl, is_delivery: !!opts.isDelivery
      }).select().single();
    },
    updateRoom: function (roomId, fields) {
      return client().from('rooms').update(fields).eq('id', roomId).select().single();
    },

    // ---- Doktorlar ----
    listDoctors: function (status) {
      var q = client().from('doctors').select('*, laboratories:primary_laboratory_id(name)').order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      return q;
    },
    approveDoctor: function (doctorId) {
      return client().from('doctors').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', doctorId);
    },
    rejectDoctor: function (doctorId) {
      return client().from('doctors').update({ status: 'rejected' }).eq('id', doctorId);
    },
    createDoctor: function (fields) {
      return client().from('doctors').insert(fields).select().single();
    },
    updateDoctor: function (doctorId, fields) {
      return client().from('doctors').update(fields).eq('id', doctorId);
    },

    // ---- Personel / Yetki ----
    listStaff: function () {
      return client().from('app_users').select('*, user_permissions(*)').order('created_at');
    },
    updatePermissions: function (userId, perms) {
      return client().from('user_permissions').update(perms).eq('user_id', userId);
    },
    approveStaff: function (userId) {
      return client().from('app_users').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', userId);
    },
    rejectStaff: function (userId) {
      return client().from('app_users').update({ status: 'rejected' }).eq('id', userId);
    },

    // ---- İşler ----
    listJobs: function (filters) {
      filters = filters || {};
      var q = client().from('jobs').select('*, doctors(full_name, clinic_name), laboratories(name), rooms:current_room_id(name)').order('created_at', { ascending: false });
      if (filters.status) q = q.eq('status', filters.status);
      if (filters.laboratoryId) q = q.eq('laboratory_id', filters.laboratoryId);
      return q;
    },
    getJob: function (jobId) {
      return client().from('jobs').select('*, doctors(*), laboratories(name), rooms:current_room_id(name)').eq('id', jobId).single();
    },
    nextJobNumber: function (labId) {
      return client().from('jobs').select('job_number', { count: 'exact', head: true }).eq('laboratory_id', labId).then(function (r) {
        var n = (r.count || 0) + 1;
        return 'DY-' + (2000 + n);
      });
    },
    createJob: function (fields) {
      return client().from('jobs').insert(fields).select().single();
    },
    // "İş teslimi" iki taraflı: bu, işi bir sonraki odaya İTER (handled_by
    // burada set edilmez — teslim alan oda confirmJobStage() ile kendi
    // teslim aldığını onaylayana kadar boş kalır). Eski odanın kaydı
    // onaylanmamışsa (confirmed_at null) jobs.update guard_job_field_updates
    // tetikleyicisi tarafından reddedilir — tek taraflı ilerletme olmaz.
    advanceJobStage: function (jobId, fromRoomId, toRoomId, note) {
      var closePrev = fromRoomId
        ? client().from('job_stage_history').update({ exited_at: new Date().toISOString() })
            .eq('job_id', jobId).eq('room_id', fromRoomId).is('exited_at', null)
        : Promise.resolve();
      return Promise.resolve(closePrev).then(function () {
        return client().from('job_stage_history').insert({
          job_id: jobId, room_id: toRoomId, note: note || null
        });
      }).then(function () {
        return client().from('jobs').update({ current_room_id: toRoomId }).eq('id', jobId);
      });
    },
    // Teslim alan odanın sorumlusu bunu çağırarak "teslim aldım" der —
    // handled_by/confirmed_by/confirmed_at burada set edilir. Bundan sonra
    // iş bir sonraki odaya ilerletilebilir hale gelir.
    confirmJobStage: function (jobId, roomId, userId) {
      return client().from('job_stage_history').update({
        handled_by: userId, confirmed_by: userId, confirmed_at: new Date().toISOString()
      }).eq('job_id', jobId).eq('room_id', roomId).is('exited_at', null).select().single();
    },
    completeJob: function (jobId) {
      return client().from('jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', jobId);
    },

    // ---- Fiyat listesi ----
    listPriceItems: function (includeInactive) {
      var q = client().from('price_list_items').select('*').order('sort_order').order('name');
      if (!includeInactive) q = q.eq('is_active', true);
      return q;
    },
    createPriceItem: function (fields) {
      return client().from('price_list_items').insert(fields).select().single();
    },
    updatePriceItem: function (id, fields) {
      return client().from('price_list_items').update(fields).eq('id', id).select().single();
    },

    // ---- Doktora / lokasyona özel fiyatlar ----
    listPriceOverrides: function () {
      return client().from('price_overrides').select('*');
    },
    // price null/'' ise kapsamdaki özel fiyat silinir (taban listeye dönülür).
    setPriceOverride: function (orgId, itemId, doctorId, labId, price) {
      var q = client().from('price_overrides').delete().eq('price_item_id', itemId);
      q = doctorId ? q.eq('doctor_id', doctorId) : q.is('doctor_id', null);
      q = labId ? q.eq('laboratory_id', labId) : q.is('laboratory_id', null);
      return q.then(function (delRes) {
        if (delRes.error) return delRes;
        if (price == null || price === '') return delRes;
        return client().from('price_overrides').insert({
          organization_id: orgId, price_item_id: itemId,
          doctor_id: doctorId || null, laboratory_id: labId || null,
          unit_price: Number(price)
        });
      });
    },
    // Öncelik: doktor+lab > doktor > lab > taban liste fiyatı.
    resolveUnitPrice: function (item, overrides, doctorId, labId) {
      var best = null, bestScore = -1;
      (overrides || []).forEach(function (o) {
        if (o.price_item_id !== item.id) return;
        if (o.doctor_id && o.doctor_id !== doctorId) return;
        if (o.laboratory_id && o.laboratory_id !== labId) return;
        var score = (o.doctor_id ? 2 : 0) + (o.laboratory_id ? 1 : 0);
        if (score > bestScore) { bestScore = score; best = o; }
      });
      if (best) return Number(best.unit_price);
      return item.unit_price != null ? Number(item.unit_price) : null;
    },

    // ---- Doktor siparişleri (dijital çalışma formu) ----
    createDoctorAccount: function (fields) {
      return client().functions.invoke('create-doctor-account', { body: fields });
    },
    myDoctorRecord: function () {
      return client().auth.getUser().then(function (r) {
        var uid = r.data && r.data.user ? r.data.user.id : null;
        if (!uid) return { data: null };
        return client().from('doctors').select('*').eq('user_id', uid).limit(1).maybeSingle();
      });
    },
    createOrder: function (fields) {
      return client().from('orders').insert(fields).select().single();
    },
    listOrders: function (filters) {
      filters = filters || {};
      var q = client().from('orders').select('*, doctors(full_name, clinic_name), price_list_items(name, unit_price, currency)').order('created_at', { ascending: false });
      if (filters.status) q = q.eq('status', filters.status);
      if (filters.doctorId) q = q.eq('doctor_id', filters.doctorId);
      return q;
    },
    reviewOrder: function (orderId, fields) {
      return client().from('orders').update(fields).eq('id', orderId).select().single();
    },

    // ---- Malzeme / Stok ----
    listMaterials: function () {
      return client().from('materials').select('*').order('name');
    },
    listStock: function (labId) {
      return client().from('material_stock').select('*, materials(*)').eq('laboratory_id', labId);
    },
    listStockTransactions: function (labId, limit) {
      return client().from('stock_transactions').select('*, materials(name, unit)').eq('laboratory_id', labId)
        .order('created_at', { ascending: false }).limit(limit || 20);
    },
    createStockTransaction: function (fields) {
      return client().from('stock_transactions').insert(fields).select().single();
    },
    createMaterial: function (fields) {
      return client().from('materials').insert(fields).select().single();
    },

    // ---- Finans ----
    listInvoices: function (filters) {
      filters = filters || {};
      var q = client().from('invoices').select('*, doctors(full_name, clinic_name)').order('issued_at', { ascending: false });
      if (filters.status) q = q.eq('status', filters.status);
      return q;
    },
    createInvoice: function (fields) {
      return client().from('invoices').insert(fields).select().single();
    },
    listPayments: function (doctorId) {
      var q = client().from('payments').select('*').order('received_at', { ascending: false });
      if (doctorId) q = q.eq('doctor_id', doctorId);
      return q;
    },
    recordPayment: function (fields) {
      return client().from('payments').insert(fields).select().single();
    },

    // ---- Kasa teslimi (personel -> yönetici, nakit) ----
    /** Bu kullanıcının henüz bir teslime dahil edilmemiş nakit tahsilatları. */
    listMyPendingCash: function (userId) {
      return client().from('payments').select('id, amount, doctor_id, received_at, doctors(full_name)')
        .eq('received_by', userId).eq('method', 'nakit').is('handover_id', null)
        .order('received_at', { ascending: false });
    },
    createCashHandover: function (organizationId, staffId, paymentIds, amount, note) {
      return client().from('cash_handovers').insert({
        organization_id: organizationId, staff_id: staffId, amount: amount, note: note || null
      }).select().single().then(function (res) {
        if (res.error) return res;
        return client().from('payments').update({ handover_id: res.data.id }).in('id', paymentIds).then(function (updRes) {
          if (updRes.error) return updRes;
          return res;
        });
      });
    },
    listCashHandovers: function (status) {
      var q = client().from('cash_handovers').select('*, app_users:staff_id(full_name), confirmed:confirmed_by(full_name)').order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      return q;
    },
    confirmCashHandover: function (handoverId, confirmedByUserId) {
      return client().from('cash_handovers').update({
        status: 'confirmed', confirmed_by: confirmedByUserId, confirmed_at: new Date().toISOString()
      }).eq('id', handoverId);
    },

    listStaffEarnings: function (period) {
      var q = client().from('staff_earnings').select('*, app_users(full_name)').order('period', { ascending: false });
      if (period) q = q.eq('period', period);
      return q;
    },

    // ---- Personel iş/diş özeti (çalışan+işveren profil görünümü) ----
    // Bir işi birden fazla oda/personel işleyebildiği için job_stage_history
    // üzerinden aynı job_id birden fazla kez gelebilir — diş sayısını
    // job bazında bir kez saymak için tekilleştiriyoruz.
    getStaffJobStats: function (userId) {
      return client().from('job_stage_history')
        .select('job_id, jobs!inner(unit_count, status)')
        .eq('handled_by', userId)
        .eq('jobs.status', 'completed')
        .then(function (r) {
          if (r.error) return r;
          var seen = {};
          var teeth = 0;
          (r.data || []).forEach(function (row) {
            if (seen[row.job_id]) return;
            seen[row.job_id] = true;
            teeth += Number((row.jobs && row.jobs.unit_count) || 0);
          });
          return { data: { jobCount: Object.keys(seen).length, teethCount: teeth } };
        });
    },

    // ---- Hesap silme ----
    deleteMyAccount: function () {
      return client().rpc('delete_my_account');
    },

    // ---- Personel hesabı + laboratuvar/oda erişimi ----
    // Yönetici e-posta+şifreyi kendisi belirleyip hesabı doğrudan açar
    // (create-staff-account edge function, service_role ile auth.users +
    // app_users + user_permissions + user_lab_access/user_room_access'i
    // tek seferde oluşturur — client'ın bu tabloları INSERT etme izni yok).
    // ---- İzin talepleri ----
    annualLeaveSummary: function (userId) {
      // İK prosedürü: İş Kanunu md.53 (hesap DB fonksiyonunda; kendisi + yönetici)
      return client().rpc('calc_annual_leave_days', { p_user_id: userId });
    },
    myLeaveRequests: function () {
      return client().auth.getUser().then(function (r) {
        var uid = r.data && r.data.user ? r.data.user.id : null;
        return client().from('leave_requests').select('*').eq('user_id', uid).order('created_at', { ascending: false });
      });
    },
    createLeaveRequest: function (fields) {
      return client().from('leave_requests').insert(fields);
    },
    cancelLeaveRequest: function (id) {
      return client().from('leave_requests').delete().eq('id', id).eq('status', 'pending');
    },
    listLeaveRequests: function (status) {
      var q = client().from('leave_requests').select('*, app_users!leave_requests_user_id_fkey(full_name, position)').order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      return q;
    },
    decideLeaveRequest: function (id, status, deciderId, note) {
      return client().from('leave_requests').update({
        status: status, decided_by: deciderId,
        decided_at: new Date().toISOString(), decision_note: note || null
      }).eq('id', id);
    },

    // ---- Bildirimler (kayıtları DB tetikleyicileri yazar, istemci okur) ----
    listNotifications: function () {
      return client().from('notifications').select('*').order('created_at', { ascending: false }).limit(100);
    },
    unreadNotifCount: function () {
      return client().from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
    },
    markAllNotifsRead: function () {
      return client().from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
    },

    createStaffAccount: function (fields) {
      return client().functions.invoke('create-staff-account', { body: fields });
    },
    listUserLabAccess: function (userId) {
      return client().from('user_lab_access').select('laboratory_id').eq('user_id', userId);
    },
    listUserRoomAccess: function (userId) {
      return client().from('user_room_access').select('room_id').eq('user_id', userId);
    },
    setUserLabAccess: function (userId, labIds) {
      return client().from('user_lab_access').delete().eq('user_id', userId).then(function () {
        if (!labIds.length) return { data: [] };
        return client().from('user_lab_access').insert(labIds.map(function (id) { return { user_id: userId, laboratory_id: id }; }));
      });
    },
    setUserRoomAccess: function (userId, roomIds) {
      return client().from('user_room_access').delete().eq('user_id', userId).then(function () {
        if (!roomIds.length) return { data: [] };
        return client().from('user_room_access').insert(roomIds.map(function (id) { return { user_id: userId, room_id: id }; }));
      });
    },

    // ---- İş fişi (yazdır/paylaş + doktora e-posta) ----
    sendJobSlip: function (jobId, attachmentBase64, attachmentFilename) {
      return client().functions.invoke('send-job-slip', {
        body: { job_id: jobId, attachment_base64: attachmentBase64, attachment_filename: attachmentFilename }
      });
    }
  };

  window.ZirkonikAuth = Auth;
  window.ZirkonikData = Data;

  // ---- APNs cihaz token kaydı ----
  // Native kabuk token'ı window.zkNativePushToken'a yazar ve 'zk-push-token'
  // olayını atar (bkz. iOS/Zirkonik/ZirkonikApp.swift). Oturum açıksa token
  // bu kullanıcıya kaydedilir; push bildirimleri bu tabloya göre gönderilir.
  function zkRegisterPushToken() {
    var tok = window.zkNativePushToken;
    if (!tok) return;
    try {
      client().auth.getSession().then(function (r) {
        var s = r.data && r.data.session;
        if (!s || !s.user) return;
        client().from('device_tokens').upsert({
          token: tok,
          user_id: s.user.id,
          platform: 'ios',
          updated_at: new Date().toISOString()
        }).then(function () {});
      });
    } catch (e) {}
  }
  window.addEventListener('zk-push-token', zkRegisterPushToken);
  setTimeout(zkRegisterPushToken, 2500);
})();
