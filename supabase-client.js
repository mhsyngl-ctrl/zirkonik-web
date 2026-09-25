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

  /** Edge Function 2xx dışı döndüğünde supabase-js `error`'ı genel bir
   *  "non-2xx status code" mesajıyla dolduruyor — bizim yazdığımız asıl
   *  Türkçe hata metni yanıt gövdesinde (error.context) kalıyor, açıkça
   *  okunmazsa kullanıcı hiçbir zaman görmüyor (2026-09-10'da doktor
   *  ekstresi gönderiminde fark edildi — muhtemelen tüm fonksiyon çağrıları
   *  bu sorunu paylaşıyordu). functions.invoke() çağrılarını bu sarmalayıcı
   *  içinden geçirmek {data,error} şeklini korur, yalnız error.message'ı
   *  gerçek mesaja çevirir. */
  function unwrapFnResult(promise) {
    return promise.then(function (res) {
      if (!res.error) return res;
      var ctx = res.error.context;
      if (ctx && typeof ctx.json === 'function') {
        return ctx.json().then(function (body) {
          return { data: res.data, error: new Error((body && body.error) || res.error.message) };
        }, function () { return res; });
      }
      return res;
    });
  }

  // Hata günlüğünde görünen uygulama sürümü; Xcode MARKETING_VERSION (2.2) ile elle aynı tutulur.
  var ZK_APP_VERSION = '2.2';

  function client() {
    if (!_client) {
      if (typeof supabase === 'undefined') {
        throw new Error('supabase-js yüklenmedi — CDN script etiketini kontrol et.');
      }
      // "Beni hatırla": varsayılan açık (localStorage — kalıcı oturum).
      // Kapalıysa oturum yalnız sekme ömrünce yaşar (sessionStorage).
      var remember = true;
      try { remember = localStorage.getItem('zk-remember') !== '0'; } catch (e) {}
      // NetGuard (js/net-guard.js): ağ hatasında bant + GET yeniden deneme +
      // istemci hata günlüğü (client_errors). Tüm from/rpc çağrıları bu
      // fetch'ten geçer (24 Eylül 2026).
      var secenekler = { auth: { storage: remember ? window.localStorage : window.sessionStorage } };
      if (window.NetGuard) secenekler.global = { fetch: window.NetGuard.fetch };
      _client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, secenekler);
      if (window.NetGuard) {
        window.NetGuard.configure({
          version: ZK_APP_VERSION,
          rpc: 'log_client_error',
          getClient: function () { return _client; },
          context: function () { return {}; }   // kuruluş sunucuda app_users'tan bulunur
        });
      }
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

    /** Onay e-postasindaki link buraya doner. site_url yanlis ayarliydi
     *  (localhost:3000) ve bu adres izinli listede degildi — onay linki
     *  hicbir yere gitmiyordu, kayit olan kimse e-postasini onaylayamiyordu.
     *  resetPasswordForEmail ile ayni desen: iOS'ta (file://) uygulamaya
     *  donsun, webde giris sayfasina. */
    signUp: function (email, password, meta) {
      var redirect = (window.location.protocol === 'file:')
        ? 'zirkonik://reset-password'
        : (window.location.origin + '/giris.html');
      return client().auth.signUp({
        email: email,
        password: password,
        options: { data: meta || {}, emailRedirectTo: redirect }
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
          .select('*, user_permissions(*), organizations(default_currency, locale, timezone, country)')
          .eq('id', uid)
          .single()
          .then(function (res) {
            if (res.error) throw res.error;
            _meCache = res.data;
            // Kuruluşun bölge ayarı (24 Eylül 2026): varsayılan para birimi ve
            // sayı biçimi buradan; ZirkonikMoney bunu kullanır.
            var org = res.data && res.data.organizations;
            if (org && window.ZirkonikMoney && window.ZirkonikMoney.setRegion) window.ZirkonikMoney.setRegion(org);
            return _meCache;
          });
      });
    },
    // Kuruluş bölge ayarını kaydeder (yalnız yönetici; RLS org_update_admin) ve önbelleği tazeler.
    updateOrgRegion: function (organizationId, fields) {
      var payload = {};
      ['default_currency', 'locale', 'timezone', 'country'].forEach(function (k) { if (fields[k]) payload[k] = fields[k]; });
      return client().from('organizations').update(payload).eq('id', organizationId).select('id').then(function (r) {
        if (!r.error) _meCache = null;
        return r;
      });
    },

    clearMeCache: function () { _meCache = null; },

    /* 2026-09-12: giris.html, sifre-sifirla.html ve profil.html bu fonksiyonu
     * çağırıyordu ama HİÇBİR yerde tanımlı değildi — canlı web sürümünde giriş
     * ya da kayıt hatası olunca hatayı gösterecek satırın KENDİSİ patlıyor,
     * kullanıcı hiçbir mesaj görmüyordu (sessiz başarısızlık).
     * Supabase'in İngilizce/teknik mesajlarını Türkçeleştirir. */
    errorText: function (err) {
      var m = (err && (err.message || err.error_description || err.msg)) || String(err || '');
      var t = m.toLowerCase();
      if (t.indexOf('invalid login credentials') >= 0) return 'E-posta veya şifre hatalı.';
      if (t.indexOf('email not confirmed') >= 0) return 'E-posta adresiniz henüz doğrulanmamış.';
      if (t.indexOf('user already registered') >= 0 || t.indexOf('already been registered') >= 0) return 'Bu e-posta ile zaten bir hesap var.';
      if (t.indexOf('password should be at least') >= 0) return 'Şifre çok kısa — en az 6 karakter olmalı.';
      if (t.indexOf('weak password') >= 0 || t.indexOf('pwned') >= 0) return 'Bu şifre çok yaygın/zayıf, daha güçlü bir şifre seçin.';
      if (t.indexOf('rate limit') >= 0 || t.indexOf('too many requests') >= 0) return 'Çok fazla deneme yapıldı, birkaç dakika sonra tekrar deneyin.';
      if (t.indexOf('user is banned') >= 0 || t.indexOf('banned') >= 0) return 'Bu hesap kapatılmış. Laboratuvar yöneticinizle görüşün.';
      if (t.indexOf('token has expired') >= 0 || t.indexOf('invalid token') >= 0 || t.indexOf('expired') >= 0) return 'Bağlantının süresi dolmuş, yeni bir bağlantı isteyin.';
      if (t.indexOf('failed to fetch') >= 0 || t.indexOf('networkerror') >= 0 || t.indexOf('network') >= 0) return 'İnternet bağlantısı kurulamadı, bağlantınızı kontrol edin.';
      if (t.indexOf('email address is invalid') >= 0 || t.indexOf('invalid email') >= 0) return 'E-posta adresi geçersiz.';
      return m || 'Bilinmeyen bir hata oluştu.';
    }
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
    listDoctors: function (status, opts) {
      var q = client().from('doctors').select('*, laboratories:primary_laboratory_id(name)').order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      // 24 Eylül 2026: aday havuzu/ilk temas/tanıtım yapıldı aşamasındaki adaylar henüz
      // gerçek doktor değil — "Onaylı Doktorlar" listesine karışmasınlar diye burada
      // hariç tutulabiliyor (bkz. aday-havuzu.html). Yeni İş Girişi gibi bir doktor
      // seçtirmesi gereken ekranlar bu filtreyi KULLANMAZ — aksi halde ilk vakayı
      // kaydedip deneme_vakasi'na geçirmenin tek yolu kapanır.
      if (opts && opts.excludeProspects) q = q.not('pipeline_stage', 'in', '(aday_havuzu,ilk_temas,tanitim_yapildi)');
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
    // "Silme" yerine akıllı çıkarma (delete-doctor-account edge function):
    // hiç işi/faturası/tahsilatı yoksa kayıt tamamen silinir; varsa silinemez
    // (jobs/invoices/payments doctors'a ON DELETE kuralı olmadan bağlı) —
    // onun yerine durum 'rejected' olur ve portal hesabı varsa banlanır.
    // Portal hesabını banlamak service_role gerektirdiği için istemciden
    // yapılamaz, edge function şart.
    removeDoctor: function (doctorId) {
      return unwrapFnResult(client().functions.invoke('delete-doctor-account', { body: { doctor_id: doctorId } }));
    },
    restoreDoctor: function (doctorId) {
      return unwrapFnResult(client().functions.invoke('delete-doctor-account', { body: { doctor_id: doctorId, restore: true } }));
    },

    // ---- Doktor kazanım süreci (bölge/temsilci/aşama) — 24 Eylül 2026 ----
    listRegions: function () {
      // 24 Eylül 2026: bölgeler artık serbest yazım değil — kayıtlı ilçe listesinden
      // seçilir (sahibinin isteği). side (avrupa/asya) grup başlığı için sıralanır.
      return client().from('regions').select('*, temsilci:assigned_rep_id(full_name)').order('side', { ascending: false, nullsFirst: true }).order('name');
    },
    createRegion: function (name, assignedRepId) {
      return client().from('regions').insert({ name: name, assigned_rep_id: assignedRepId || null }).select().single();
    },
    updateRegion: function (regionId, fields) {
      return client().from('regions').update(fields).eq('id', regionId);
    },
    deleteRegion: function (regionId) {
      return client().from('regions').delete().eq('id', regionId);
    },
    // Aday/doktor listesi — aşama filtresiyle (aday-havuzu.html Kanban sekmeleri).
    listPipelineDoctors: function (stage) {
      var q = client().from('doctors')
        .select('*, region:region_id(name), temsilci:assigned_rep_id(full_name), activator:activated_by(full_name), laboratories:primary_laboratory_id(name)')
        .order('priority', { ascending: true }).order('next_action_at', { ascending: true, nullsFirst: false });
      if (stage) q = q.eq('pipeline_stage', stage);
      else q = q.neq('pipeline_stage', 'aktif'); // varsayılan görünüm: süreç içindeki + uyuyan/kayıp/beklemede, akıştaki gürültü olmasın diye aktifler hariç
      return q;
    },
    // Yeni aday ekleme: gerçek bir hesap AÇMAZ (user_id=null) — Aşama 1'de doktorun
    // kendisi henüz bilmiyor bile olabilir. status='approved' verilir ki mevcut
    // "onay bekleyen doktor" kuyruğuna (gerçek hesap başvurusu) hiç karışmasın.
    createProspect: function (fields) {
      var payload = Object.assign({ status: 'approved', pipeline_stage: 'aday_havuzu' }, fields);
      return client().from('doctors').insert(payload).select().single();
    },
    updateDoctorPipeline: function (doctorId, fields) {
      return client().from('doctors').update(fields).eq('id', doctorId);
    },
    listDoctorTouches: function (doctorId) {
      return client().from('doctor_touches').select('*, yazan:created_by(full_name)').eq('doctor_id', doctorId).order('created_at', { ascending: false });
    },
    // Doktor kazanım kartında "gönderilen işler" listesi — temsilci başka ekrana
    // gitmeden bu doktora gerçekten iş gelip gelmediğini, kaç iş geldiğini görsün
    // (24 Eylül 2026, sahibinin bulduğu görünürlük boşluğu).
    listDoctorJobsSummary: function (doctorId) {
      return client().from('jobs').select('id, job_number, restoration_type, unit_count, status, created_at')
        .eq('doctor_id', doctorId).order('created_at', { ascending: false }).limit(10);
    },
    addDoctorTouch: function (doctorId, fields) {
      return client().from('doctor_touches').insert(Object.assign({ doctor_id: doctorId }, fields)).select().single();
    },
    // Temsilcinin "bugünkü görevleri": kendine atanmış, tarihi gelmiş/geçmiş adaylar.
    // onlyMine=false (yönetici görünümü, Medicamine adaylar.html'deki isManager mantığıyla
    // aynı): kendine atanmamış olsa da tüm kuruluşun tarihi gelmiş takiplerini görür.
    myTodayTasks: function (userId, onlyMine) {
      var q = client().from('doctors')
        .select('id, full_name, clinic_name, pipeline_stage, next_action_at, next_action_note, priority, temsilci:assigned_rep_id(full_name)')
        .lte('next_action_at', new Date().toISOString())
        .order('next_action_at', { ascending: true });
      if (onlyMine !== false) q = q.eq('assigned_rep_id', userId);
      return q;
    },

    // ---- Personel / Yetki ----
    listStaff: function () {
      return client().from('app_users').select('*, user_permissions(*)').order('created_at');
    },
    updatePermissions: function (userId, perms) {
      // 2026-09-12: UPDATE, satır yoksa hiçbir şey yazmadan "başarılı" dönüyordu
      // ve ekran "kaydedildi" diyordu. user_id birincil anahtar olduğu için
      // upsert satırı yoksa oluşturur. .select() eklendi ki gerçekten yazılan
      // satır geri dönsün, sessiz başarısızlık mümkün olmasın.
      var row = { user_id: userId };
      Object.keys(perms).forEach(function (k) { row[k] = perms[k]; });
      return client().from('user_permissions').upsert(row, { onConflict: 'user_id' }).select();
    },
    // "Silme" yerine akıllı çıkarma (delete-staff-account edge function):
    // hiç geçmişi (iş/kasa/hakediş/stok...) olmayan biri tamamen silinir;
    // geçmişi olan biri Auth'ta gerçekten banlanır + status='rejected' olur
    // (geçmiş kayıtlardaki adı korunur). restore:true ile geri açılır.
    removeStaff: function (userId) {
      return unwrapFnResult(client().functions.invoke('delete-staff-account', { body: { user_id: userId } }));
    },
    restoreStaff: function (userId) {
      return unwrapFnResult(client().functions.invoke('delete-staff-account', { body: { user_id: userId, restore: true } }));
    },
    /** Kilitli bir kullanici bile kendi organizasyonunun durumunu gorebilsin
     *  diye RLS'i atlayan bir RPC (bkz. 20260919195322_deneme_suresi_ve_kilit). */
    myOrgStatus: function () {
      return client().rpc('my_org_status').then(function (r) {
        if (r.error) return r;
        return { data: (r.data && r.data[0]) || null, error: null };
      });
    },

    resetStaffPassword: function (userId, password) {
      return unwrapFnResult(client().functions.invoke('reset-user-password', { body: { user_id: userId, password: password } }));
    },
    approveStaff: function (userId) {
      return client().from('app_users').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', userId);
    },
    rejectStaff: function (userId) {
      return client().from('app_users').update({ status: 'rejected' }).eq('id', userId);
    },

    // ---- İşler ----
    // 25 Eylül 2026, sahibinin kuralı: fiyat yalnız yönetici/işveren.
    // includePrice:false geçilince jobs.price/currency sorgudan HİÇ
    // istenmez — ekranda gizlemek yetmiyordu, ağ cevabında da olmamalı.
    JOB_COLS_NO_PRICE: 'id, organization_id, laboratory_id, job_number, doctor_id, patient_reference, restoration_type, material, shade, teeth_numbers, unit_count, is_priority, requested_delivery_at, current_room_id, assigned_user_id, status, clinical_notes, payment_status, invoice_due_date, created_by, created_at, completed_at, price_item_id, work_form, planned_route, patient_name, clinic_protocol_no, cancelled_at, cancelled_by, cancel_reason, cancel_category',
    listJobs: function (filters) {
      filters = filters || {};
      var cols = filters.includePrice === false ? Data.JOB_COLS_NO_PRICE : '*';
      var q = client().from('jobs').select(cols + ', doctors(full_name, clinic_name), laboratories(name), rooms:current_room_id(name)').order('created_at', { ascending: false });
      if (filters.status) q = q.eq('status', filters.status);
      if (filters.laboratoryId) q = q.eq('laboratory_id', filters.laboratoryId);
      return q;
    },
    getJob: function (jobId, includePrice) {
      var cols = includePrice === false ? Data.JOB_COLS_NO_PRICE : '*';
      return client().from('jobs').select(cols + ', doctors(*), laboratories(name), rooms:current_room_id(name)').eq('id', jobId).single();
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
    // 25 Eylül 2026: Resepsiyon + yönetici hata düzeltebilsin diye — yalnız
    // üretimi etkilemeyen alanlar (RPC'nin kendisi de bunu zorunlu kılar).
    fixJobInfo: function (jobId, fields) {
      return client().rpc('zk_is_bilgi_duzelt', {
        p_job_id: jobId,
        p_patient_name: fields.patient_name,
        p_clinic_protocol_no: fields.clinic_protocol_no,
        p_patient_reference: fields.patient_reference,
        p_requested_delivery_at: fields.requested_delivery_at,
        p_is_priority: fields.is_priority
      });
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

    // ---- Kalemler (job_items) ----
    // Bir siparis birden cok calisma turu icerebilir ve her tur KENDI oda
    // rotasini izler; odalarda dolasan birim artik kalem. jobs.current_room_id
    // ayna olarak guncel tutuluyor (en geride olan aktif kalemin odasi), bu
    // sayede hakedis/stok/bildirim tetikleyicileri bugunku gibi calisiyor.
    ITEM_COLS_NO_PRICE: 'id, job_id, organization_id, price_item_id, restoration_type, teeth, unit_count, planned_route, current_room_id, status, color_index, sort_order, created_at, work_form',
    listJobItems: function (jobId, includePrice) {
      var cols = includePrice === false ? Data.ITEM_COLS_NO_PRICE : '*';
      return client().from('job_items')
        .select(cols + ', rooms:current_room_id(name), price_list_items(name)')
        .eq('job_id', jobId).order('sort_order').order('created_at');
    },
    listActiveItems: function (laboratoryId, includePrice) {
      var cols = includePrice === false ? Data.ITEM_COLS_NO_PRICE : '*';
      var q = client().from('job_items')
        .select(cols + ', jobs!inner(id, job_number, laboratory_id, doctor_id, is_priority, requested_delivery_at, patient_name, clinic_protocol_no, status, doctors(full_name))')
        .eq('status', 'active').eq('jobs.status', 'active');
      if (laboratoryId) q = q.eq('jobs.laboratory_id', laboratoryId);
      return q;
    },
    // 25 Eylül 2026: job_item_select artık oda bazlı (yalnız yetkili olunan
    // oda) — bir önceki odadan gelmekte olan işin YALNIZ numarasını bu RPC
    // verir (tam detay değil), kendi yetkili odaları için.
    gelenIsNumaralari: function (laboratoryId) {
      return client().rpc('zk_gelen_is_numaralari', { p_laboratory_id: laboratoryId });
    },
    createJobItem: function (fields) {
      return client().from('job_items').insert(fields).select().single();
    },
    // Tek RPC: onceki asamayi kapat, yenisini ac, kalemi tasi, aynayi
    // guncelle. Istemciden uc ayri cagri yapilsa yari kalmis hal olusabilirdi.
    advanceJobItem: function (itemId, toRoomId, note) {
      return client().rpc('advance_job_item', {
        p_item_id: itemId, p_to_room_id: toRoomId, p_note: note || null
      });
    },
    confirmJobItemStage: function (itemId, roomId) {
      return client().rpc('confirm_job_item_stage', { p_item_id: itemId, p_room_id: roomId });
    },
    listItemStages: function (itemId) {
      return client().from('job_stage_history')
        .select('*, rooms(name), handler:handled_by(full_name)')
        .eq('job_item_id', itemId).order('entered_at');
    },
    // Yalnız yönetici çağırabilir (cancel_job RPC içinde is_org_admin kontrolü var).
    // Tahsilat işlenmiş veya hakediş ödenmiş işler reddedilir; faturalar ve
    // hakedişler iptal edilir, tüketilen stok geri iade edilir.
    cancelJob: function (jobId, reason, category) {
      return client().rpc('cancel_job', { p_job_id: jobId, p_reason: reason || null, p_category: category || null });
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
    /* Fiyat kalemini TAMAMEN siler. Yalniz laboratuvar sahibi yapabilir
     * (price_items_delete politikasi = is_org_admin).
     *
     * Silme guvenli: kaleme bagli her sey ya SET NULL ya CASCADE —
     *   jobs.price_item_id, job_items.price_item_id, orders.price_item_id
     *     -> SET NULL (isler ve siparisler duruyor, restoration_type metni
     *        kayitta kaldigi icin ne yapildigi kaybolmuyor)
     *   price_overrides, price_item_materials -> CASCADE
     * Yani doktora ozel anlasmali fiyatlar da bu kalemle birlikte gider;
     * cagiran taraf kullaniciyi bu konuda uyarmali. */
    deletePriceItem: function (id) {
      return client().from('price_list_items').delete().eq('id', id);
    },

    // ---- Doktora / lokasyona özel fiyatlar ----
    listPriceOverrides: function () {
      return client().from('price_overrides').select('*');
    },
    // price null/'' ise kapsamdaki özel fiyat silinir (taban listeye dönülür).
    /** Anlasma kalemin genel para biriminden farkli olabilir: genel liste $
     *  olsa da bir doktorla TL uzerinden anlasilabiliyor. currency verilmezse
     *  kalemin kendi para birimi devralinir. */
    setPriceOverride: function (orgId, itemId, doctorId, labId, price, currency) {
      var q = client().from('price_overrides').delete().eq('price_item_id', itemId);
      q = doctorId ? q.eq('doctor_id', doctorId) : q.is('doctor_id', null);
      q = labId ? q.eq('laboratory_id', labId) : q.is('laboratory_id', null);
      return q.then(function (delRes) {
        if (delRes.error) return delRes;
        if (price == null || price === '') return delRes;
        return client().from('price_overrides').insert({
          organization_id: orgId, price_item_id: itemId,
          doctor_id: doctorId || null, laboratory_id: labId || null,
          unit_price: Number(price),
          currency: window.ZirkonikMoney.normalize(currency)
        });
      });
    },
    // Öncelik: doktor+lab > doktor > lab > taban liste fiyatı.
    findPriceOverride: function (item, overrides, doctorId, labId) {
      var best = null, bestScore = -1;
      (overrides || []).forEach(function (o) {
        if (o.price_item_id !== item.id) return;
        if (o.doctor_id && o.doctor_id !== doctorId) return;
        if (o.laboratory_id && o.laboratory_id !== labId) return;
        var score = (o.doctor_id ? 2 : 0) + (o.laboratory_id ? 1 : 0);
        if (score > bestScore) { bestScore = score; best = o; }
      });
      return best;
    },
    resolveUnitPrice: function (item, overrides, doctorId, labId) {
      var best = Data.findPriceOverride(item, overrides, doctorId, labId);
      if (best) return Number(best.unit_price);
      return item.unit_price != null ? Number(item.unit_price) : null;
    },
    /** Tutarla birlikte para birimi de anlasmadan geliyor; yoksa kalemin
     *  genel para birimi gecerli. */
    resolveUnitCurrency: function (item, overrides, doctorId, labId) {
      var best = Data.findPriceOverride(item, overrides, doctorId, labId);
      return window.ZirkonikMoney.normalize(best ? best.currency : item.currency);
    },

    // ---- Doktor siparişleri (dijital çalışma formu) ----
    createDoctorAccount: function (fields) {
      return unwrapFnResult(client().functions.invoke('create-doctor-account', { body: fields }));
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
    // Siparişler. filters: status | notStatus | doctorId | limit+offset (sayfalı, count exact),
    // includePrice (varsayılan true — doktorun kendi sipariş ekranı için).
    // 24 Eylül 2026: personel görünümünde false geçilir — o zaman sorgu
    // unit_price/currency'yi HİÇ İSTEMEZ, ağ cevabında bile bulunmaz
    // (yalnız ekranda gizlemek yetmiyordu, sahibinin kuralı: "hiçbir açık
    // kabul etmiyorum").
    listOrders: function (filters) {
      filters = filters || {};
      var sayfali = filters.limit != null;
      var priceEmbed = filters.includePrice === false ? 'price_list_items(name)' : 'price_list_items(name, unit_price, currency)';
      var q = client().from('orders').select('*, doctors(full_name, clinic_name), ' + priceEmbed, sayfali ? { count: 'exact' } : undefined)
        .order('created_at', { ascending: false }).order('id', { ascending: true });
      if (filters.status) q = q.eq('status', filters.status);
      if (filters.notStatus) q = q.neq('status', filters.notStatus);
      if (filters.doctorId) q = q.eq('doctor_id', filters.doctorId);
      if (sayfali) {
        var limit = Math.max(1, Math.min(filters.limit, 500)), offset = Math.max(0, filters.offset || 0);
        q = q.range(offset, offset + limit - 1);
      }
      return q;
    },
    reviewOrder: function (orderId, fields) {
      return client().from('orders').update(fields).eq('id', orderId).select().single();
    },
    // Onaylama artık SUNUCUDA (approve_order RPC): fiyat hesabı, iş/kalem/
    // fatura oluşturma hep sunucu tarafında — fiyat/anlaşma verisi hiçbir
    // zaman istemciye dönmüyor (24 Eylül 2026, sahibinin kuralı: "hiçbir
    // açık kabul etmiyorum"). Eskiden bu iş client'ta price_list_items'ı
    // doğrudan okuyup jobs/job_items/invoices'a tek tek insert atıyordu —
    // ayrıca can_manage_orders'lı (admin olmayan) personel için jobs
    // tablosunun INSERT RLS'i yalnız is_org_admin olduğundan bu akış hiç
    // ÇALIŞMIYORDU (Resepsiyon "Onayla"ya basınca sessizce/hata ile
    // patlıyordu). RPC SECURITY DEFINER olduğu için bunu da düzeltiyor.
    approveOrder: function (orderId, laboratoryId, requestedDeliveryAt) {
      return client().rpc('approve_order', {
        p_order_id: orderId, p_laboratory_id: laboratoryId,
        p_requested_delivery_at: requestedDeliveryAt || null
      });
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

    // ---- Tedarikçi carileri ----
    listSuppliers: function () {
      return client().from('suppliers').select('*').order('name');
    },
    createSupplier: function (fields) {
      return client().from('suppliers').insert(fields).select().single();
    },
    updateSupplier: function (id, fields) {
      return client().from('suppliers').update(fields).eq('id', id);
    },
    listSupplierInvoices: function (supplierId) {
      var q = client().from('supplier_invoices').select('*').order('issued_at', { ascending: false });
      if (supplierId) q = q.eq('supplier_id', supplierId);
      return q;
    },
    createSupplierInvoice: function (fields) {
      return client().from('supplier_invoices').insert(fields).select().single();
    },
    listSupplierPayments: function (supplierId) {
      var q = client().from('supplier_payments').select('*').order('paid_at', { ascending: false });
      if (supplierId) q = q.eq('supplier_id', supplierId);
      return q;
    },
    createSupplierPayment: function (fields) {
      return client().from('supplier_payments').insert(fields).select().single();
    },

    // ---- Sabit giderler (kira, SGK, elektrik vb. — nakit akışı öngörüsüne
    // otomatik yansır; sadece yönetici görür/yönetir) ----
    listRecurringExpenses: function () {
      return client().from('recurring_expenses').select('*').order('is_active', { ascending: false }).order('name');
    },
    createRecurringExpense: function (fields) {
      return client().from('recurring_expenses').insert(fields).select().single();
    },
    updateRecurringExpense: function (id, fields) {
      return client().from('recurring_expenses').update(fields).eq('id', id);
    },
    deleteRecurringExpense: function (id) {
      return client().from('recurring_expenses').delete().eq('id', id);
    },

    // ---- Ürün reçetesi (fiyat kalemi ↔ malzemeler; 1 diş = çok malzeme) ----
    listPriceItemMaterials: function (itemId) {
      return client().from('price_item_materials').select('*, materials(name, unit)').eq('price_item_id', itemId);
    },
    setPriceItemMaterials: function (orgId, itemId, rows) {
      // Reçete bütün olarak değiştirilir: eskiyi sil, yeniyi yaz.
      return client().from('price_item_materials').delete().eq('price_item_id', itemId).then(function (delRes) {
        if (delRes.error) return delRes;
        if (!rows.length) return { data: null, error: null };
        return client().from('price_item_materials').insert(rows.map(function (r) {
          return {
            organization_id: orgId, price_item_id: itemId,
            material_id: r.material_id, qty_per_unit: r.qty_per_unit,
            room_id: r.room_id || null
          };
        }));
      });
    },

    // ---- Finans ----
    listInvoices: function (filters) {
      filters = filters || {};
      // 2026-09-12: tahsilat acilir menusunde yalniz doktor adi vardi; ayni
      // doktorun birden fazla bekleyen faturasi varsa hangisi oldugu
      // anlasilmiyordu. Is numarasi da getiriliyor.
      var q = client().from('invoices').select('*, doctors(full_name, clinic_name), jobs(job_number)').order('issued_at', { ascending: false });
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

    // ---- Kasa teslimi (personel -> yönetici, tüm yöntemler) ----
    /** Bu kullanıcının henüz bir teslime dahil edilmemiş tahsilatları
     *  (nakit + kart + EFT/havale — hepsi teslim/onay listesinde görünür). */
    listMyPendingCash: function (userId) {
      return client().from('payments').select('id, amount, currency, doctor_id, method, received_at, doctors(full_name)')
        .eq('received_by', userId).is('handover_id', null)
        .order('received_at', { ascending: false });
    },
    /** Bir teslim fisi tek para birimindedir; cagiran taraf secimi para
     *  birimine gore ayirip her biri icin ayri cagirir. */
    createCashHandover: function (organizationId, staffId, paymentIds, amount, note, currency) {
      return client().from('cash_handovers').insert({
        organization_id: organizationId, staff_id: staffId, amount: amount,
        currency: window.ZirkonikMoney.normalize(currency), note: note || null
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
    // Sadece yönetici geri alabilir (RPC içinde kontrol edilir) — dahil
    // edilen ödemeler tekrar bekleyen listesine döner.
    undoCashHandover: function (handoverId) {
      return client().rpc('undo_cash_handover', { p_handover_id: handoverId });
    },

    // ---- İş/Ciro performansı (yönetici) — Medicamine'deki "paket satışları"
    // + "haftalık/aylık performans" karşılığı. Serbest dönem gezinme
    // (offset) destekler. jobs.price zaten ciro.html'in labCiro()
    // fonksiyonunda da "iş başına ciro" olarak kullanılıyor — aynı kaynağı
    // tekrar kullanıyoruz. Farklı para birimleri TOPLANMAZ (ZirkonikMoney
    // ilkesi); dönüşte her para birimi ayrı satırda durur, grafik en çok
    // geçen para birimine göre çizilir. Bir önceki dönem (aynı uzunlukta,
    // hemen bir öncesi — geçen yıl DEĞİL, "hafta"da geçen hafta, "ay"da
    // geçen ay) de birlikte döner; grafikte soluk tonla karşılaştırma için
    // (kullanıcı isteği, 22 Eylül 2026). doctorId opsiyonel: verilmezse RLS
    // çağıranı kendi işleriyle sınırlar (doktor kendi ekranında); işveren
    // belirli bir doktorun profilinde bakarken doctorId açıkça verilir
    // (kullanıcı isteği: "bendeki doktor profilinde de olacaktır").
    getJobPerformancePeriod: function (period, offset, doctorId) {
      var c = client();
      var now = new Date();
      function mapRowsShared(rows) {
        return (rows || []).map(function (j) {
          return {
            id: j.id, price: Number(j.price) || 0, currency: window.ZirkonikMoney.normalize(j.currency),
            date: j.created_at, doctorName: (j.doctors && j.doctors.full_name) || '—',
            category: (j.price_list_items && j.price_list_items.category) || 'Diğer'
          };
        });
      }
      var SELECT_SHARED = 'id, price, currency, created_at, price_item_id, doctor_id, price_list_items(category, name), doctors(full_name)';
      // "Tümü" (doktorun cari panelindeki dönem seçiciyle aynı) — tarih
      // sınırı yok, karşılaştırılacak "önceki dönem" de yok.
      if (period === 'all') {
        var allQ = c.from('jobs').select(SELECT_SHARED).neq('status', 'cancelled');
        if (doctorId) allQ = allQ.eq('doctor_id', doctorId);
        return allQ.then(function (res) {
          return { rows: mapRowsShared(res.data), prevRows: [], rangeStart: new Date(0), rangeEnd: now, label: 'Tüm zamanlar', prevRangeStart: new Date(0), prevLabel: '' };
        });
      }
      function computeRange(off) {
        var rangeStart, rangeEnd, label;
        if (period === 'week') {
          var jsDay = now.getDay();
          var mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
          rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset + off * 7);
          rangeEnd = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate() + 7);
          var rangeLast = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate() + 6);
          label = rangeStart.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) + ' – ' + rangeLast.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
        } else if (period === 'year') {
          var y = now.getFullYear() + off;
          rangeStart = new Date(y, 0, 1);
          rangeEnd = new Date(y + 1, 0, 1);
          label = String(y);
        } else {
          rangeStart = new Date(now.getFullYear(), now.getMonth() + off, 1);
          rangeEnd = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 1);
          label = rangeStart.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
        }
        return { rangeStart: rangeStart, rangeEnd: rangeEnd, label: label };
      }
      var cur = computeRange(offset);
      var prev = computeRange(offset - 1);
      var curQ = c.from('jobs').select(SELECT_SHARED).neq('status', 'cancelled')
        .gte('created_at', cur.rangeStart.toISOString()).lt('created_at', cur.rangeEnd.toISOString());
      var prevQ = c.from('jobs').select(SELECT_SHARED).neq('status', 'cancelled')
        .gte('created_at', prev.rangeStart.toISOString()).lt('created_at', prev.rangeEnd.toISOString());
      if (doctorId) { curQ = curQ.eq('doctor_id', doctorId); prevQ = prevQ.eq('doctor_id', doctorId); }
      return Promise.all([curQ, prevQ]).then(function (res) {
        return {
          rows: mapRowsShared(res[0].data), prevRows: mapRowsShared(res[1].data),
          rangeStart: cur.rangeStart, rangeEnd: cur.rangeEnd, label: cur.label,
          prevRangeStart: prev.rangeStart, prevLabel: prev.label
        };
      });
    },

    // ---- Nakit akışı öngörüsü (yönetici) ----
    // Medicamine'deki karşılığından farklı olarak burada "gelir" tarafında
    // vadeli bir kalem yok (doktor tahsilatının vade tarihi tutulmuyor) —
    // o yüzden bu, önümüzdeki 6 ay için BİLİNEN GİDERLERİN öngörüsü:
    // personel sabit maaşları (her ay, app_users.monthly_salary where
    // compensation_type='maas') + tedarikçi fatura vadeleri (supplier_invoices
    // .due_date — GERÇEK vade verisi, uydurulmadı). Doktorlardan bekleyen
    // tahsilat (vadesiz) ayrı, tek bir bilgi satırı olarak dönüyor — Medicamine'deki
    // "Alacaklarım" ile aynı mantık. Para birimleri TOPLANMAZ (22 Eylül 2026).
    getCashFlowForecast: function () {
      var c = client();
      var HORIZON = 6;
      var now = new Date();
      function monthKeyOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
      function addMonthsToKey(key, n) {
        var p = key.split('-');
        return monthKeyOf(new Date(Number(p[0]), Number(p[1]) - 1 + n, 1));
      }
      function monthLabel(key) {
        var p = key.split('-');
        return new Date(Number(p[0]), Number(p[1]) - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
      }
      var currentKey = monthKeyOf(now);
      var horizonKeys = [];
      for (var h = 0; h < HORIZON; h++) horizonKeys.push(addMonthsToKey(currentKey, h));
      var horizonEndKey = horizonKeys[horizonKeys.length - 1];
      var hp = horizonEndKey.split('-');
      var horizonEndDate = new Date(Number(hp[0]), Number(hp[1]), 0);
      var horizonEndStr = horizonEndDate.getFullYear() + '-' + String(horizonEndDate.getMonth() + 1).padStart(2, '0') + '-' + String(horizonEndDate.getDate()).padStart(2, '0');
      var todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

      var staffQ = c.from('app_users').select('monthly_salary, salary_currency, compensation_type').eq('status', 'approved').eq('compensation_type', 'maas');
      // status='paid' olan fatura zaten ödenmiş — gelecek gider tahminine
      // dahil edilmemeli (teknik inceleme bulgusu, 22 Eylül 2026).
      var supInvQ = c.from('supplier_invoices').select('amount, currency, due_date, status').not('due_date', 'is', null).lte('due_date', horizonEndStr).neq('status', 'paid');
      var supPayQ = c.from('supplier_payments').select('amount, currency');
      var docInvQ = c.from('invoices').select('id, amount, currency, due_date, doctor_id').neq('status', 'cancelled');
      var docPayQ = c.from('payments').select('invoice_id, amount, currency, doctor_id');
      // Kira/SGK/elektrik vb. sabit giderler — kullanıcı isteği, 22 Eylül 2026.
      var recurQ = c.from('recurring_expenses').select('name, amount, currency, frequency, due_date').eq('is_active', true);

      return Promise.all([staffQ, supInvQ, supPayQ, docInvQ, docPayQ, recurQ]).then(function (res) {
        var buckets = {};
        horizonKeys.forEach(function (k) { buckets[k] = { key: k, label: monthLabel(k), staffExpense: {}, supplierExpense: {}, fixedExpense: {}, incomeAmount: {} }; });

        var staffMonthlyTotals = {};
        (res[0].data || []).forEach(function (u) {
          var amt = Number(u.monthly_salary) || 0;
          if (!amt) return;
          var cur = window.ZirkonikMoney.normalize(u.salary_currency);
          staffMonthlyTotals[cur] = (staffMonthlyTotals[cur] || 0) + amt;
        });
        horizonKeys.forEach(function (k) { buckets[k].staffExpense = staffMonthlyTotals; });

        (res[1].data || []).forEach(function (inv) {
          var amt = Number(inv.amount) || 0;
          if (!amt) return;
          var cur = window.ZirkonikMoney.normalize(inv.currency);
          var dueKey = inv.due_date < todayStr ? currentKey : inv.due_date.slice(0, 7);
          if (!buckets[dueKey]) return;
          buckets[dueKey].supplierExpense[cur] = (buckets[dueKey].supplierExpense[cur] || 0) + amt;
        });

        // Sabit gider projeksiyonu: aylık = her ufuk ayına düz yansır (maaş
        // gibi), yıllık = due_date'in ay'ı eşleşen ufuk ayına, tek seferlik =
        // due_date'in ayına (geçmişse mevcut aya, tedarikçi faturasındaki
        // "vadesi geçmiş → bu ay" kuralıyla tutarlı). end_date varsa o aydan
        // sonrasına yansımıyor — kullanıcı isteği: "tekrarlar için bitiş
        // tarihi", 23 Eylül 2026.
        var fixedMonthlyTotals = {};
        (res[5].data || []).forEach(function (r) {
          var amt = Number(r.amount) || 0;
          if (!amt || !r.due_date) return;
          var cur = window.ZirkonikMoney.normalize(r.currency);
          var endKey = r.end_date ? r.end_date.slice(0, 7) : null;
          if (r.frequency === 'monthly') {
            if (endKey && endKey < currentKey) return;
            horizonKeys.forEach(function (k) {
              if (endKey && k > endKey) return;
              buckets[k].fixedExpense[cur] = (buckets[k].fixedExpense[cur] || 0) + amt;
            });
            fixedMonthlyTotals[cur] = (fixedMonthlyTotals[cur] || 0) + amt;
          } else if (r.frequency === 'yearly') {
            var dueMonthNum = Number(r.due_date.slice(5, 7));
            horizonKeys.forEach(function (k) {
              if (endKey && k > endKey) return;
              if (Number(k.split('-')[1]) === dueMonthNum) buckets[k].fixedExpense[cur] = (buckets[k].fixedExpense[cur] || 0) + amt;
            });
          } else {
            var targetKey = r.due_date < todayStr ? currentKey : r.due_date.slice(0, 7);
            if (buckets[targetKey]) buckets[targetKey].fixedExpense[cur] = (buckets[targetKey].fixedExpense[cur] || 0) + amt;
          }
        });

        var supplierPaidTotal = window.ZirkonikMoney.groupTotals(res[2].data || [], 'amount', 'currency');
        var supplierInvoicedTotal = window.ZirkonikMoney.groupTotals(res[1].data || [], 'amount', 'currency');

        // Doktor bekleyen tahsilat: fatura - ödeme, doktor+para birimi bazında, pozitifse borç.
        var docBalance = {};
        (res[3].data || []).forEach(function (inv) {
          var cur = window.ZirkonikMoney.normalize(inv.currency);
          var key = inv.doctor_id + '|' + cur;
          docBalance[key] = (docBalance[key] || 0) + (Number(inv.amount) || 0);
        });
        (res[4].data || []).forEach(function (pay) {
          var cur = window.ZirkonikMoney.normalize(pay.currency);
          var key = pay.doctor_id + '|' + cur;
          docBalance[key] = (docBalance[key] || 0) - (Number(pay.amount) || 0);
        });
        var pendingCollection = {};
        Object.keys(docBalance).forEach(function (key) {
          var cur = key.split('|')[1];
          var v = docBalance[key];
          if (v > 0) pendingCollection[cur] = (pendingCollection[cur] || 0) + v;
        });

        // Beklenen gelir: vadesi olan ve bakiyesi kalan doktor faturaları,
        // tedarikçi gideriyle aynı mantıkla vade ayına (geçmişse mevcut aya)
        // yansır. Vadesiz faturalar yukarıdaki toplam bekleyen tahsilata
        // dahil ama aylara dağıtılamadığı için buraya girmiyor — kullanıcı
        // isteği: "gelecek geliri de görelim", 23 Eylül 2026.
        var paidByInvoice = {};
        (res[4].data || []).forEach(function (pay) {
          if (!pay.invoice_id) return;
          paidByInvoice[pay.invoice_id] = (paidByInvoice[pay.invoice_id] || 0) + (Number(pay.amount) || 0);
        });
        var incomeDueTotal = {};
        (res[3].data || []).forEach(function (inv) {
          if (!inv.due_date) return;
          var remaining = (Number(inv.amount) || 0) - (paidByInvoice[inv.id] || 0);
          if (remaining <= 0) return;
          var cur = window.ZirkonikMoney.normalize(inv.currency);
          var dueKey = inv.due_date < todayStr ? currentKey : inv.due_date.slice(0, 7);
          incomeDueTotal[cur] = (incomeDueTotal[cur] || 0) + remaining;
          if (!buckets[dueKey]) return;
          buckets[dueKey].incomeAmount[cur] = (buckets[dueKey].incomeAmount[cur] || 0) + remaining;
        });

        var months = horizonKeys.map(function (k) {
          var b = buckets[k];
          var totalExpense = {};
          Object.keys(b.staffExpense).forEach(function (cur) { totalExpense[cur] = (totalExpense[cur] || 0) + b.staffExpense[cur]; });
          Object.keys(b.supplierExpense).forEach(function (cur) { totalExpense[cur] = (totalExpense[cur] || 0) + b.supplierExpense[cur]; });
          Object.keys(b.fixedExpense).forEach(function (cur) { totalExpense[cur] = (totalExpense[cur] || 0) + b.fixedExpense[cur]; });
          var net = {};
          Object.keys(totalExpense).forEach(function (cur) { net[cur] = (b.incomeAmount[cur] || 0) - totalExpense[cur]; });
          Object.keys(b.incomeAmount).forEach(function (cur) { if (!(cur in net)) net[cur] = b.incomeAmount[cur]; });
          return { key: k, label: b.label, staffExpense: b.staffExpense, supplierExpense: b.supplierExpense, fixedExpense: b.fixedExpense, incomeAmount: b.incomeAmount, totalExpense: totalExpense, net: net };
        });

        return {
          months: months,
          staffMonthlyTotals: staffMonthlyTotals,
          supplierInvoicedTotal: supplierInvoicedTotal,
          supplierPaidTotal: supplierPaidTotal,
          pendingCollection: pendingCollection,
          fixedMonthlyTotals: fixedMonthlyTotals,
          incomeDueTotal: incomeDueTotal
        };
      });
    },

    // ---- Oda doluluğu / iş yükü (yönetici) ----
    // Üretim panosundaki "Destek gerekebilir" uyarısı anlık bir eşik
    // (aynı anda 3+ iş) — geçmişe dönük trend tutmuyor. Burada onun yerine
    // job_stage_history'den (bir iş o odaya ne zaman girdi) dönem başına
    // HANGİ ODANIN NE KADAR İŞ İŞLEDİĞİ (throughput) çıkarılıyor — hangi
    // odanın en yoğun olduğunu geçmiş dönemlerle karşılaştırmalı gösterir
    // (kullanıcı isteği: "randevu doluluğu" karşılığı, 22 Eylül 2026).
    getRoomThroughput: function (fromIso, toIso) {
      var c = client();
      return Promise.all([
        c.from('job_stage_history').select('room_id, job_id').not('room_id', 'is', null)
          .gte('entered_at', fromIso).lt('entered_at', toIso),
        c.from('rooms').select('id, name, sort_order').order('sort_order', { ascending: true })
      ]).then(function (res) {
        var stages = res[0].data || [];
        var nameById = {};
        (res[1].data || []).forEach(function (r) { nameById[r.id] = r.name; });
        var byRoom = {};
        stages.forEach(function (s) {
          var r = byRoom[s.room_id] || (byRoom[s.room_id] = { roomId: s.room_id, name: nameById[s.room_id] || '—', jobIds: {}, stageCount: 0 });
          r.jobIds[s.job_id] = true;
          r.stageCount++;
        });
        var rows = Object.keys(byRoom).map(function (rid) {
          var r = byRoom[rid];
          return { roomId: rid, name: r.name, jobCount: Object.keys(r.jobIds).length, stageCount: r.stageCount };
        });
        rows.sort(function (a, b) { return b.jobCount - a.jobCount; });
        return rows;
      });
    },

    // ---- Ekip performansı (yönetici) ----
    // staff_earnings tablosu şu an hiç dolmuyor (0 satır, muhtemelen henüz
    // bağlanmamış bir özellik) — o yüzden gerçek, canlı veri olan
    // job_stage_history üzerinden kuruldu: bir personel bir odayı teslim
    // aldığında (confirmed_by/confirmed_at) gerçekten o aşamayı tamamlamış
    // sayılır. Dönem: [fromIso, toIso) — confirmed_at bazlı (kullanıcı
    // isteği: Medicamine'deki ekip performans tablosu, 22 Eylül 2026).
    getTeamPerformance: function (fromIso, toIso) {
      var c = client();
      return Promise.all([
        c.from('job_stage_history').select('confirmed_by, job_id').not('confirmed_by', 'is', null)
          .gte('confirmed_at', fromIso).lt('confirmed_at', toIso),
        c.from('app_users').select('id, full_name').neq('role', 'doktor')
      ]).then(function (res) {
        var stages = res[0].data || [];
        var nameById = {};
        (res[1].data || []).forEach(function (u) { nameById[u.id] = u.full_name; });
        var byUser = {};
        stages.forEach(function (s) {
          var u = byUser[s.confirmed_by] || (byUser[s.confirmed_by] = { userId: s.confirmed_by, name: nameById[s.confirmed_by] || '—', stageCount: 0, jobIds: {} });
          u.stageCount++;
          u.jobIds[s.job_id] = true;
        });
        var rows = Object.keys(byUser).map(function (uid) {
          var u = byUser[uid];
          return { userId: uid, name: u.name, stageCount: u.stageCount, jobCount: Object.keys(u.jobIds).length };
        });
        rows.sort(function (a, b) { return b.stageCount - a.stageCount; });
        return rows;
      });
    },

    listStaffEarnings: function (period) {
      var q = client().from('staff_earnings').select('*, app_users(full_name)').order('period', { ascending: false });
      if (period) q = q.eq('period', period);
      return q;
    },

    /** Girisli kullanicinin kendi hakedisleri (profil.html).
     *  2026-09-19: profil.html bunu cagiriyordu ama HICBIR yerde tanimli
     *  degildi — cagri bir .then() icinde oldugu icin sessizce reddediliyor,
     *  personel profilinde ucret modeli, hakedisler ve is istatistiklerinin
     *  TAMAMI gorunmuyordu. */
    listMyEarnings: function () {
      return client().auth.getUser().then(function (r) {
        var uid = r.data && r.data.user ? r.data.user.id : null;
        if (!uid) return { data: [] };
        return client().from('staff_earnings')
          .select('*, jobs(job_number, restoration_type)')
          .eq('user_id', uid)
          .order('period', { ascending: false });
      });
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
    // ---- Organizasyon verilerini sıfırla (iş/finans geçmişi; kurulum kalır) ----
    resetOrganizationData: function (organizationId) {
      return client().rpc('reset_organization_data', { p_organization_id: organizationId });
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
      return unwrapFnResult(client().functions.invoke('create-staff-account', { body: fields }));
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
      return unwrapFnResult(client().functions.invoke('send-job-slip', {
        body: { job_id: jobId, attachment_base64: attachmentBase64, attachment_filename: attachmentFilename }
      }));
    }
  };

  window.ZirkonikAuth = Auth;
  window.ZirkonikData = Data;

  // ---- Para birimi ----
  // Fiyat listesi kalem basina '$', '₺' veya '€' tasiyor; bu secim artik is,
  // fatura ve odeme kaydina da yaziliyor (migration
  // 20260919170000_para_birimi_is_fatura_odeme). Onceden her sayfa kendi
  // icinde sabit TRY bicimlendiricisi tanimliyordu, bu yuzden '$' secilmis
  // kalemler bile ekranda "₺" gorunuyordu. Artik tek kaynak burasi.
  //
  // Farkli para birimleri TOPLANMAZ. Kur kullanmiyoruz ki gecmis toplamlar
  // kur degistikce kaymasin; karisik listelerde her para birimi kendi
  // toplamiyla yan yana gosterilir ("$3.200 · ₺12.400").
  var CURRENCY_CODES = { '$': 'USD', '₺': 'TRY', '€': 'EUR' };
  // Varsayılan para birimi ve sayı biçimi kuruluş ayarından gelir
  // (organizations.default_currency / locale; ZirkonikAuth.me() yükleyince
  // setRegion çağrılır). Yüklenene kadar eski sabit: '$', tr-TR.
  var DEFAULT_CURRENCY = '$';
  var REGION_LOCALE = 'tr-TR';

  function normalizeCurrency(sym) {
    return CURRENCY_CODES[sym] ? sym : DEFAULT_CURRENCY;
  }

  var Money = {
    SYMBOLS: ['$', '₺', '€'],
    get DEFAULT() { return DEFAULT_CURRENCY; },
    get LOCALE() { return REGION_LOCALE; },
    setRegion: function (org) {
      if (!org) return;
      if (org.default_currency && CURRENCY_CODES[org.default_currency]) DEFAULT_CURRENCY = org.default_currency;
      if (org.locale) REGION_LOCALE = org.locale;
    },
    normalize: normalizeCurrency,

    /** Tek tutari kendi para biriminde bicimlendirir. */
    format: function (amount, currency, fractionDigits) {
      var sym = normalizeCurrency(currency);
      return new Intl.NumberFormat(REGION_LOCALE, {
        style: 'currency',
        currency: CURRENCY_CODES[sym],
        maximumFractionDigits: fractionDigits == null ? 0 : fractionDigits,
        minimumFractionDigits: 0
      }).format(Number(amount) || 0);
    },

    /** Kayitlari para birimine gore toplar -> { '$': 1200, '₺': 300 } */
    groupTotals: function (rows, amountKey, currencyKey) {
      var out = {};
      (rows || []).forEach(function (r) {
        var sym = normalizeCurrency(r[currencyKey || 'currency']);
        out[sym] = (out[sym] || 0) + (Number(r[amountKey || 'amount']) || 0);
      });
      return out;
    },

    /** { '$': 1200, '₺': 300 } -> "$1.200 · ₺300"
     *  Hic kayit yoksa varsayilan para biriminde sifir doner ki ekran bos
     *  kalmasin. */
    formatTotals: function (totals, fractionDigits) {
      var keys = Object.keys(totals || {}).filter(function (k) { return totals[k]; });
      if (!keys.length) return Money.format(0, DEFAULT_CURRENCY, fractionDigits);
      keys.sort(function (a, b) { return Money.SYMBOLS.indexOf(a) - Money.SYMBOLS.indexOf(b); });
      return keys.map(function (k) { return Money.format(totals[k], k, fractionDigits); }).join(' · ');
    },

    /** Kayit listesini dogrudan "toplam metni"ne cevirir. */
    totalText: function (rows, amountKey, currencyKey, fractionDigits) {
      return Money.formatTotals(Money.groupTotals(rows, amountKey, currencyKey), fractionDigits);
    }
  };

  window.ZirkonikMoney = Money;

  // ---- Cihaz push token kaydı ----
  // Oturum açıksa token bu kullanıcıya kaydedilir (device_tokens); push
  // gönderimi platforma göre APNs/FCM'e ayrılır (bkz. backend/edge-functions/send-push).
  function zkUpsertPushToken(tok, platform) {
    if (!tok) return;
    try {
      client().auth.getSession().then(function (r) {
        var s = r.data && r.data.session;
        if (!s || !s.user) return;
        client().from('device_tokens').upsert({
          token: tok,
          user_id: s.user.id,
          platform: platform,
          updated_at: new Date().toISOString()
        }).then(function () {});
      });
    } catch (e) {}
  }

  // iOS: native kabuk token'ı window.zkNativePushToken'a yazar ve
  // 'zk-push-token' olayını atar (bkz. iOS/Zirkonik/ZirkonikApp.swift).
  function zkRegisterPushToken() {
    zkUpsertPushToken(window.zkNativePushToken, 'ios');
  }
  window.addEventListener('zk-push-token', zkRegisterPushToken);
  setTimeout(zkRegisterPushToken, 2500);

  // Android (Capacitor): @capacitor/push-notifications — native bridge
  // window.Capacitor.Plugins.PushNotifications'ı otomatik sağlar (npm
  // paketinin kendi JS'ini import etmeye gerek yok — cap sync ile native
  // tarafta kayıtlı her resmi eklenti böyle görünür). İzin isteyip kaydolur;
  // token 'registration' olayıyla gelir.
  (function () {
    var C = window.Capacitor;
    if (!C || !C.isNativePlatform || !C.isNativePlatform() || !C.getPlatform || C.getPlatform() !== 'android') return;
    var PN = C.Plugins && C.Plugins.PushNotifications;
    if (!PN) return;
    PN.addListener('registration', function (token) {
      zkUpsertPushToken(token && token.value, 'android');
    });
    PN.addListener('registrationError', function () {});
    PN.requestPermissions().then(function (res) {
      if (res && res.receive === 'granted') PN.register();
    }).catch(function () {});
  })();
})();
